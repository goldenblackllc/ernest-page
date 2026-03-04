import { z } from "zod";
import { db, storage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { after } from "next/server";
import { generateWithFallback, SONNET_MODEL } from "@/lib/ai/models";



export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const region = req.headers.get("x-vercel-ip-country-region") || "LOCAL";

    const body = await req.json();
    const uid = body.uid;
    const postId = body.postId;
    const rant = body.rant || "";
    const conversationMessages = body.messages || []; // Mirror Chat conversation
    const counsel = body.counsel;
    const directives = body.directives || [];
    const imageUrl = body.imageUrl;

    // Build combined rant from conversation messages if no direct rant provided
    const combinedRant = rant || conversationMessages
      .filter((m: any) => m.role === 'user')
      .map((m: any) => m.content)
      .join('\n\n');

    if (!uid || !combinedRant) {
      return Response.json(
        {
          error:
            "UID and content are required to generate and save a public post.",
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
      userId: uid,
      authorId: uid,
      region: region,
      type: "checkin",
      rant: combinedRant,
      counsel: counsel,
      ...(conversationMessages.length > 0 && { conversation_messages: conversationMessages }),
      status: "processing",
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

        // Fetch recent posts to avoid repeating the same photo scale
        let recentScales: string[] = [];
        try {
          const recentSnap = await db.collection("posts")
            .where("authorId", "==", uid)
            .orderBy("created_at", "desc")
            .limit(3)
            .get();
          recentScales = recentSnap.docs
            .map(d => d.data().photo_scale)
            .filter(Boolean);
        } catch { /* ignore — index may not exist yet */ }

        const recentScaleHint = recentScales.length > 0
          ? `\nThe user's last ${recentScales.length} post(s) used these photo scales: [${recentScales.join(', ')}]. Do NOT repeat the same scale. Choose a DIFFERENT scale for variety.`
          : '';

        const prompt = `Character A is defined by the following Character Bible:
${JSON.stringify(compiledBible, null, 2)}

Character A runs an elite advice feed on a fast-paced mainstream social media app (like X or Threads). A user just shared the following with them — it could be a win, a struggle, a question, or a reflection.

Their job is to edit this into a compelling, anonymous public post, and respond in character.

What the user shared:
"${combinedRant}"

Output a JSON object with eight keys:
title: A punchy, scroll-stopping social media title (4-8 words). Match the energy of what the user shared. If they're celebrating, the title should feel like a win. If they're struggling, it should feel raw. Examples: 'The Site Went Live Today', 'Finally Breathing After the Storm', 'Software, Survival, and Guilt', 'When the Work Isn't Enough', 'That First Real Victory'. No clickbait or emojis.
pseudonym: A clever 2-3 word sign-off that captures the user's current state (e.g., 'Conflicted Creator', 'Grateful Builder', 'Tired Optimist').
letter: Ghostwrite Character B's rant into a punchy social media submission. FORMATTING RULES: You MUST start exactly with: 'Dear ${archetype},' followed by a double line break (\\n\\n). Write the body of the letter. End with a double line break (\\n\\n) followed by the pseudonym (e.g., '- OVERWHELMED FATHER'). SCRUB ALL PII (names, locations).
response: Respond as Character A would — in their voice, through their worldview. If the user is celebrating, celebrate with them and show them what's next. If they need guidance, guide them. FORMATTING RULES: You MUST end the response with a double line break (\\n\\n) followed exactly by: '- ${archetype}'. Strip away all standard AI formatting like bullet points unless the character would use them.

STEP 3: THE ART DIRECTOR (Image Generation)
You are composing a HERO MOMENT — a single frame that captures the emotional essence of this post. Think like a film director choosing a still frame, NOT a stock photographer. Every image must be Instagram-quality: sharp, high-contrast, saturated, scroll-stopping.

First, read the emotional tone of the post and choose a VIBE — the feeling that should emanate from the image. Examples: luxury, grit, serenity, chaos, warmth, ambition, defiance, tenderness, solitude, celebration.

Then choose a SCALE — the type of shot:
- "macro": Sharp close-up of a specific object or texture. Cinematic lighting, extreme detail. (e.g., steam curling off espresso, cracked leather journal, rain beads on a window)
- "lifestyle": A composed scene or environment that tells a story. Tabletop, room, workspace. (e.g., warm kitchen counter at 6am with morning light, open notebook beside a candle, a styled workspace at golden hour)
- "wide": An aspirational landscape, cityscape, or architectural shot. Expansive, atmospheric. (e.g., rooftop view of a city at dusk, fog rolling through a mountain valley, an empty bridge at dawn)
- "human": Faceless human presence — silhouettes, hands doing something, over-the-shoulder, person walking away, feet on pavement. Deeply emotional and intimate. NEVER show faces. (e.g., hands holding a warm mug by a rain-streaked window, silhouette walking through golden hour light, person from behind looking out over a balcony)
${recentScaleHint}

photo_vibe: One word capturing the emotional tone (e.g., 'grit', 'serenity', 'ambition').
photo_scale: One of "macro", "lifestyle", "wide", or "human".
imagen_prompt: Write a detailed prompt for Google Imagen to create this image. Rules: Highly photorealistic. Cinematic lighting. Instagram-quality sharpness and color. NEVER include visible faces or readable text. Describe the specific scene, lighting, color palette, and mood. Reference the vibe and scale you chose.
unsplash_query: Provide a 1-to-3 word search term to find a real photograph matching this mood on Unsplash.`;

        const result = await generateWithFallback({
          primaryModelId: SONNET_MODEL,
          prompt: prompt,
          schema: z.object({
            title: z.string(),
            pseudonym: z.string(),
            letter: z.string(),
            response: z.string(),
            photo_vibe: z.string(),
            photo_scale: z.enum(["macro", "lifestyle", "wide", "human"]),
            imagen_prompt: z.string(),
            unsplash_query: z.string(),
          }),
        });

        const postData = result.object as {
          title: string;
          pseudonym: string;
          letter: string;
          response: string;
          photo_vibe: string;
          photo_scale: string;
          imagen_prompt: string;
          unsplash_query: string;
        };

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
          photo_vibe: postData.photo_vibe,
          photo_scale: postData.photo_scale,
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
