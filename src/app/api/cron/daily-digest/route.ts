import { NextResponse } from 'next/server';
import { db, storage } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

        // Build list of eligible users with their digest data
        const eligibleUsers: { uid: string; title: string; content: string; ref: FirebaseFirestore.DocumentReference }[] = [];

        for (const userDoc of usersSnapshot.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();

            // Eligible: active subscribers OR users who had a session in the last 30 days
            const sub = userData?.subscription;
            const isSubscriber = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();

            let hadRecentSession = false;
            if (!isSubscriber) {
                const purchases = userData?.session_purchases || [];
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                hadRecentSession = purchases.some((p: any) =>
                    p.purchasedAt && new Date(p.purchasedAt).getTime() > thirtyDaysAgo
                );
            }

            if (!isSubscriber && !hadRecentSession) continue;

            // Need a compiled bible
            const compiledBible = userData?.character_bible?.compiled_output?.ideal;
            if (!compiledBible || !Array.isArray(compiledBible) || compiledBible.length === 0) continue;

            // Split each category into subcategories
            const allSubsections: { title: string; content: string }[] = [];

            for (const entry of compiledBible) {
                if (typeof entry !== 'object' || entry === null) continue;

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

                const parts = rawContent.split(/\*\*([^*]+):\*\*/);

                if (parts.length >= 3) {
                    for (let i = 1; i < parts.length; i += 2) {
                        const subTitle = parts[i].trim();
                        const subContent = (parts[i + 1] || '').trim();
                        if (subContent.length > 20) {
                            allSubsections.push({ title: subTitle, content: subContent });
                        }
                    }
                } else if (rawContent.length > 20) {
                    const heading = entry.heading || 'Reflection';
                    allSubsections.push({ title: heading, content: rawContent });
                }
            }

            if (allSubsections.length === 0) continue;

            // Pick a random subsection
            const pick = allSubsections[Math.floor(Math.random() * allSubsections.length)];
            eligibleUsers.push({ uid, title: pick.title, content: pick.content, ref: userDoc.ref });
        }

        // ─── BATCH PROCESSING: generate images in parallel groups of 5 ───
        const BATCH_SIZE = 5;

        for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
            const batch = eligibleUsers.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
                batch.map(user => generateDigestCard(user))
            );
            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) cardsGenerated++;
                else if (result.status === 'rejected') console.error('[Daily Digest] Batch error:', result.reason);
            }
        }

        return NextResponse.json({
            success: true,
            cardsGenerated,
            eligible: eligibleUsers.length,
        });
    } catch (error: any) {
        console.error('[Daily Digest] Cron error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ─── Generate a single digest card (image + write) ───────────────────────────
async function generateDigestCard(user: {
    uid: string;
    title: string;
    content: string;
    ref: FirebaseFirestore.DocumentReference;
}): Promise<boolean> {
    let imageUrl: string | null = null;

    try {
        const contentSnippet = user.content.substring(0, 200).replace(/[*#_]/g, '');
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
                const fileName = `digest-images/${user.uid}_${Date.now()}.jpg`;
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
        title: user.title,
        content: user.content,
        full_content: user.content,
        image_url: imageUrl,
        date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
    };

    await user.ref.set({ daily_digest: digestCard }, { merge: true });
    return true;
}
