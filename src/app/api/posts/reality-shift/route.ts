import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { generateTextWithFallback, SONNET_MODEL, SONNET_FALLBACK } from "@/lib/ai/models";

export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        // 1. Authenticate
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const idToken = authHeader.split("Bearer ")[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(idToken);
            uid = decoded.uid;
        } catch {
            return Response.json({ error: "Invalid token" }, { status: 401 });
        }

        const { directiveTitle, unexpectedYield } = await req.json();

        if (!directiveTitle || !unexpectedYield?.trim()) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 2. Get user profile for pseudonym and privacy setting
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data() || {};
        const pseudonym = userData?.identity?.title || "Anonymous";
        const defaultRouting = userData?.default_post_routing || "public";
        const isPublic = defaultRouting === "public";

        // 3. AI-rewrite to scrub PII and frame as a "dispatch"
        const result = await generateTextWithFallback({
            primaryModelId: SONNET_MODEL,
            fallbackModelId: SONNET_FALLBACK,
            system: `You are a privacy filter for Earnest Page. You receive a user's report of something unexpected that happened after completing a task. Your ONLY job is to anonymize it by removing personally identifiable information.

RULES:
- Replace real names with generic terms: "a friend," "a family member," "a colleague," "their partner."
- Replace specific locations, companies, or addresses with generic descriptions.
- Output ONLY the unexpected thing that happened. Do NOT narrate the task they completed — that context is shown separately.
- Preserve the user's own words and voice as much as possible. Do not rewrite for style.
- Do not add narrative framing like "While doing X, they..." — just state what happened.
- Write in third person.
- Match the user's length. If they wrote one line, output one line.
- Do NOT invent or embellish any details the user did not provide.

FORMAT:
Output ONLY the cleaned text. No quotes, no formatting, no preamble.`,
            messages: [
                {
                    role: "user",
                    content: `DIRECTIVE COMPLETED: "${directiveTitle}"
USER'S REPORT OF WHAT HAPPENED: "${unexpectedYield}"

Rewrite this into an anonymized Reality Shift dispatch.`,
                },
            ],
            abortSignal: AbortSignal.timeout(15000),
        });

        const rewrittenContent = result.text?.trim();

        if (!rewrittenContent) {
            return Response.json({ error: "AI generation failed" }, { status: 500 });
        }

        // 4. Create the post
        const postData: Record<string, any> = {
            uid,
            authorId: uid,
            author: pseudonym,
            post_type: "reality_shift",
            directive_title: directiveTitle,
            unexpected_yield: rewrittenContent,
            is_public: isPublic,
            created_at: FieldValue.serverTimestamp(),
            likes: 0,
            likedBy: [],
            comments: 0,
        };

        // Add geo fields if available
        if (userData.home_lat != null && userData.home_lng != null) {
            postData.lat = userData.home_lat;
            postData.lng = userData.home_lng;
        }

        const docRef = await db.collection("posts").add(postData);

        return Response.json({ success: true, postId: docRef.id });
    } catch (error: any) {
        console.error("Reality Shift API Error:", error);
        return Response.json(
            { error: error.message || "An unexpected error occurred." },
            { status: 500 }
        );
    }
}
