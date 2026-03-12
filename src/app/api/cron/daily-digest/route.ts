import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Human-friendly category names
const CATEGORY_LABELS: Record<string, string> = {
    Style_and_Presence: 'Style & Presence',
    Daily_Life_and_Habits: 'Daily Life & Habits',
    People_and_Connections: 'People & Connections',
    The_Inner_Mind: 'The Inner Mind',
    Quirks_and_Details: 'Quirks & Details',
    Order_and_Sanctuary: 'Order & Sanctuary',
};

export async function GET(req: Request) {
    // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const usersSnapshot = await db.collection('users').get();
        let cardsGenerated = 0;

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();

            // Only active paid users
            const sub = userData?.subscription;
            const isActive = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();
            if (!isActive) continue;

            // Need a compiled bible
            const compiledBible = userData?.character_bible?.compiled_output?.ideal;
            if (!compiledBible || !Array.isArray(compiledBible) || compiledBible.length === 0) continue;

            // Split each category into subcategories (e.g., "Order & Sanctuary" → "The Home", "The Kitchen", etc.)
            // Subcategories are separated by **Bold Heading:** patterns in the content
            const allSubsections: { title: string; content: string }[] = [];

            for (const entry of compiledBible) {
                if (typeof entry !== 'object' || entry === null) continue;

                // Get the raw content string
                let rawContent = '';
                if (entry.heading && entry.content && typeof entry.content === 'string') {
                    rawContent = entry.content;
                } else {
                    for (const [, value] of Object.entries(entry)) {
                        if (typeof value === 'string' && value.length > 10) {
                            rawContent = value as string;
                            break;
                        }
                    }
                }

                if (!rawContent) continue;

                // Split by **SubHeading:** patterns
                const parts = rawContent.split(/\*\*([^*]+):\*\*/);
                // parts = ["preamble", "The Home", " content...", "The Kitchen", " content...", ...]

                if (parts.length >= 3) {
                    // Skip parts[0] (preamble before first heading)
                    for (let i = 1; i < parts.length; i += 2) {
                        const subTitle = parts[i].trim();
                        const subContent = (parts[i + 1] || '').trim();
                        if (subContent.length > 20) {
                            allSubsections.push({ title: subTitle, content: subContent });
                        }
                    }
                } else if (rawContent.length > 20) {
                    // No subcategories — use the whole block with the category heading
                    const heading = entry.heading || 'Reflection';
                    allSubsections.push({ title: heading, content: rawContent });
                }
            }

            if (allSubsections.length === 0) continue;

            // Pick a random subsection
            const pick = allSubsections[Math.floor(Math.random() * allSubsections.length)];
            const title = pick.title;

            // Generate an image with Imagen
            let imageUrl: string | null = null;
            try {
                // Feed actual content into the prompt so the image represents the text
                const contentSnippet = pick.content.substring(0, 200).replace(/[*#_]/g, '');
                const imagenPrompt = `Create an image inspired by this passage: "${contentSnippet}". Highly photorealistic. Cinematic lighting. Instagram-quality. NEVER include visible faces or readable text. ECOSYSTEM BRAND RULES (apply ONLY when the subject naturally calls for it — do NOT force these into unrelated images): If the image involves coffee, espresso, or a coffee machine, depict a sleek Jura automatic bean-to-cup machine (modern Swiss design, minimalist, silver/black) — NEVER a traditional espresso machine with a portafilter or group head. If the image involves a cup of coffee, always show rich golden-brown crema on top — NEVER flat black coffee or drip coffee.`;

                const imagenRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        instances: [{ prompt: imagenPrompt }],
                        parameters: { sampleCount: 1, aspectRatio: "16:9" }
                    })
                });

                if (imagenRes.ok) {
                    const data = await imagenRes.json();
                    if (data.predictions?.[0]?.bytesBase64Encoded) {
                        const buffer = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
                        const bucket = storage.bucket();
                        const fileName = `digest-images/${uid}_${Date.now()}.jpg`;
                        const file = bucket.file(fileName);

                        await file.save(buffer, {
                            metadata: { contentType: 'image/jpeg' },
                            public: true
                        });

                        imageUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                    }
                } else {
                    console.error('[Daily Digest] Imagen error:', await imagenRes.text());
                }
            } catch (imgErr) {
                console.error('[Daily Digest] Image generation failed:', imgErr);
            }

            const digestCard = {
                title,
                content: pick.content,
                full_content: pick.content,
                image_url: imageUrl,
                date: new Date().toISOString().split('T')[0],
                updated_at: new Date().toISOString(),
            };

            await userDoc.ref.set({
                daily_digest: digestCard,
            }, { merge: true });

            cardsGenerated++;
        }

        return NextResponse.json({
            success: true,
            cardsGenerated,
        });
    } catch (error: any) {
        console.error('[Daily Digest] Cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
