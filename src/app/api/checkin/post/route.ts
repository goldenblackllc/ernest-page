import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { db, storage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { after } from "next/server";

const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const region = req.headers.get("x-vercel-ip-country-region") || "LOCAL";

    const body = await req.json();
    const uid = body.uid;
    const postId = body.postId;
    const rant = body.rant || "";
    const counsel = body.counsel; // Passed from frontend to save to DB
    const directives = body.directives || [];
    const imageUrl = body.imageUrl;

    if (!uid || !rant) {
      return Response.json(
        {
          error:
            "UID and Rant text are required to generate and save a public post.",
        },
        { status: 400 },
      );
    }

    // 1. Update the user's active directives/todos and region IMMEDIATELY
    // We do this before the LLM generation so the frontend updates instantly without waiting for the post
    const userUpdateData: any = { region: region };

    if (directives.length > 0) {
      userUpdateData.active_todos = directives.map((task: string) => ({
        id: Math.random().toString(36).substring(2, 10),
        task: task,
        completed: false,
        created_at: new Date().toISOString(),
      }));
    }

    await db.collection("users").doc(uid).set(userUpdateData, { merge: true });

    // 2. Create the pending post document immediately for optimistic UI
    const postRef = postId
      ? db.collection("posts").doc(postId)
      : db.collection("posts").doc();
    await postRef.set({
      uid: uid,
      userId: uid, // Including both for backwards compatibility across older Ledger versions
      authorId: uid,
      region: region,
      type: "checkin",
      rant: rant,
      counsel: counsel,
      status: "processing", // Marker for frontend Ledger to show spinner
      created_at: FieldValue.serverTimestamp(),
      is_public: true,
      ...(imageUrl && { imageUrl }),
    });

    // 3. Run the heavy LLM generation in the background using Next.js after()
    after(async () => {
      try {
        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        const compiledBible =
          userData?.character_bible?.compiled_output?.ideal || [];
        const archetype =
          userData?.character_bible?.source_code?.archetype || "Advisor";

        const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible, null, 2)}

Character A runs an elite advice feed on a fast-paced mainstream social media app (like X or Threads). They just received the following raw rant from a user. 

Their job is to edit this rant into a compelling, anonymous public post, and provide their authoritative response. 

The raw rant:
"${rant}"

Output a JSON object with six keys:
title: A punchy, scroll-stopping social media hook (4-8 words). DO NOT write an academic summary or use textbook phrasing like "Navigating X and Y." Create a curiosity gap or highlight the gritty, raw contrast of the user's situation. It should sound like a viral confession or a gripping advice column headline. (e.g., 'Paralyzed by the Trash', 'Success feels like drowning', 'When the work isn't enough', 'Software, Survival, and Guilt'). No clickbait or emojis.
pseudonym: A clever 2-3 word sign-off (e.g., 'Conflicted Creator').
letter: Ghostwrite Character B's rant into a punchy social media submission. FORMATTING RULES: You MUST start exactly with: 'Dear ${archetype},' followed by a double line break (\\n\\n). Write the body of the letter. End with a double line break (\\n\\n) followed by the pseudonym (e.g., '- OVERWHELMED FATHER'). SCRUB ALL PII (names, locations).
response: Synthesize Character A's advice. Write strictly in Character A's exact voice. FORMATTING RULES: You MUST end the response with a double line break (\\n\\n) followed exactly by: '- ${archetype}'. Strip away all standard AI formatting like bullet points unless the character would use them.

STEP 3: THE ART DIRECTOR (Image Generation)
Identify the 'Hero Object' from this conversation (e.g., a bar of soap, a beard brush, a car interior, a cup of coffee). If there is no physical object, pick a texture or environment that represents the mood (e.g., dark marble, a ticking watch, stormy ocean).
imagen_prompt: Write a prompt for Google Imagen 3 to create a high-end, editorial macro-photograph of this object. Crucial Rules: Must be highly photorealistic. Use terms like 'macro shot', 'cinematic lighting', 'editorial photography'. NEVER include humans, faces, or text. Focus entirely on texture, lighting, and objects.
unsplash_query: Provide a 1-to-2 word search term to find a real stock photograph of this object (e.g., 'artisan soap', 'dark marble').`;

        const result = await generateObject({
          model: google("gemini-2.5-pro"),
          prompt: prompt,
          schema: z.object({
            title: z.string(),
            pseudonym: z.string(),
            letter: z.string(),
            response: z.string(),
            imagen_prompt: z.string(),
            unsplash_query: z.string(),
          }),
        });

        const postData = result.object;

        let imagen_url = null;
        let unsplash_url = null;

        // Fetch images in parallel
        try {
          const [imagenRes, unsplashRes] = await Promise.allSettled([
            // Imagen 3 Call
            fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  instances: [{ prompt: postData.imagen_prompt }],
                  parameters: { sampleCount: 1, aspectRatio: "16:9" },
                }),
              },
            ),
            // Unsplash Call
            fetch(
              `https://api.unsplash.com/search/photos?page=1&query=${encodeURIComponent(postData.unsplash_query)}&orientation=landscape`,
              {
                headers: {
                  Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
                },
              },
            ),
          ]);

          if (imagenRes.status === "fulfilled" && imagenRes.value.ok) {
            const data = await imagenRes.value.json();
            if (
              data.predictions &&
              data.predictions[0] &&
              data.predictions[0].bytesBase64Encoded
            ) {
              const base64Data = data.predictions[0].bytesBase64Encoded;
              const buffer = Buffer.from(base64Data, "base64");
              const bucket = storage.bucket();
              const fileName = `post-images/${postRef.id}_imagen.jpg`;
              const file = bucket.file(fileName);

              await file.save(buffer, {
                metadata: { contentType: "image/jpeg" },
                public: true,
              });

              imagen_url = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
            }
          } else if (imagenRes.status === "fulfilled") {
            console.error("Imagen API Error:", await imagenRes.value.text());
          }

          if (unsplashRes.status === "fulfilled" && unsplashRes.value.ok) {
            const data = await unsplashRes.value.json();
            if (data.results && data.results.length > 0) {
              unsplash_url = data.results[0].urls.regular;
            }
          } else if (unsplashRes.status === "fulfilled") {
            console.error(
              "Unsplash API Error:",
              await unsplashRes.value.text(),
            );
          }
        } catch (imgError) {
          console.error("Error fetching images:", imgError);
        }

        // Update the post with the final generated content
        await postRef.update({
          public_post: {
            title: postData.title,
            pseudonym: postData.pseudonym,
            letter: postData.letter,
            response: postData.response,
          },
          imagen_prompt: postData.imagen_prompt,
          unsplash_query: postData.unsplash_query,
          imagen_url: imagen_url,
          unsplash_url: unsplash_url,
          // Legacy fallbacks for uninterrupted rendering
          title: postData.title,
          pseudonym: postData.pseudonym,
          letter: postData.letter,
          response: postData.response,
          status: "completed",
        });
      } catch (bgError) {
        console.error("Background LLM processing failed:", bgError);
        await postRef.update({ status: "failed" });
      }
    });

    // Return success instantly so the client unblocks and iOS Safari doesn't abort
    return Response.json({ success: true, postId: postRef.id });
  } catch (error: any) {
    console.error("Check-In Post API Error:", error);

    if (
      error.name === "AbortError" ||
      (error.message || "").toString().toLowerCase().includes("timeout") ||
      (error.message || "").toString().toLowerCase().includes("504") ||
      (error.message || "").toString().toLowerCase().includes("503")
    ) {
      return Response.json(
        {
          success: false,
          errorType: "TIMEOUT",
          message:
            "The algorithm is currently taking longer than expected. Please try submitting again.",
        },
        { status: 504 },
      );
    }

    return Response.json(
      { error: error.message || "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
