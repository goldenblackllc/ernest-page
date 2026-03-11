import { db, storage } from '@/lib/firebase/admin';
import { verifyInternalAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        if (!verifyInternalAuth(req)) return unauthorizedResponse();

        const { uid } = await req.json();

        if (!uid) {
            return Response.json({ error: 'Missing uid' }, { status: 400 });
        }

        const rl = checkRateLimit(`avatar:${uid}`, RATE_LIMITS.avatar);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        // Read identity and bible from Firestore
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: 'User not found' }, { status: 404 });
        }

        const data = userDoc.data()!;
        const identity = data.identity;
        const bible = data.character_bible;

        if (!identity) {
            return Response.json({ error: 'No identity found — complete onboarding first' }, { status: 400 });
        }

        const title = identity.title || 'A person of purpose';
        const gender = identity.gender || 'person';
        const age = identity.age || '';
        const ethnicity = identity.ethnicity || '';
        const dreamSelf = identity.dream_self || '';

        // Extract visual cues from the dream self (first ~200 chars for prompt)
        const visualCues = dreamSelf.substring(0, 200);

        // Extract Style & Presence from compiled bible (if available)
        const compiledBible = bible?.compiled_bible || {};
        const styleSection = compiledBible.lifestyle?.['Style & Presence']
            || compiledBible.lifestyle?.['style_and_presence']
            || '';
        // Truncate to keep prompt manageable
        const styleCues = typeof styleSection === 'string'
            ? styleSection.substring(0, 300)
            : typeof styleSection === 'object'
                ? JSON.stringify(styleSection).substring(0, 300)
                : '';

        // Build the portrait prompt
        const ageStr = age ? `${age}-year-old ` : '';
        const ethnicityStr = ethnicity ? `${ethnicity} ` : '';
        const prompt = [
            `Square portrait photograph.`,
            `A ${ageStr}${ethnicityStr}${gender} who embodies "${title}".`,
            visualCues ? `Visual essence: ${visualCues}` : '',
            styleCues ? `Style and appearance: ${styleCues}` : '',
            `Cinematic studio lighting, shallow depth of field, warm tones.`,
            `Instagram-quality sharpness and color saturation.`,
            `Shot from chest up. Natural, confident, relaxed expression.`,
            // Only use the generic fallback when ethnicity is not specified
            !ethnicity ? `Do not default to any racial or ethnic stereotype.` : '',
            !ethnicity ? `Use ambiguous, diverse features unless background is specified.` : '',
            `No text, no watermarks, no logos.`,
        ].filter(Boolean).join(' ');

        console.log(`[Avatar] Generating for ${uid}: "${title}"`);
        console.log(`[Avatar] Prompt: ${prompt}`);

        // Call Imagen 4
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const imagenRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: { sampleCount: 1, aspectRatio: '1:1' },
                }),
            }
        );

        if (!imagenRes.ok) {
            const errText = await imagenRes.text();
            console.error('[Avatar] Imagen API error:', errText);
            return Response.json({ error: 'Image generation failed', detail: errText }, { status: 502 });
        }

        const imagenData = await imagenRes.json();
        if (!imagenData.predictions?.[0]?.bytesBase64Encoded) {
            console.error('[Avatar] No image data in response');
            return Response.json({ error: 'No image returned from Imagen' }, { status: 502 });
        }

        // Upload to Firebase Storage
        const base64Data = imagenData.predictions[0].bytesBase64Encoded;
        const buffer = Buffer.from(base64Data, 'base64');
        const bucket = storage.bucket();
        const fileName = `avatars/${uid}.jpg`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=3600',
            },
            public: true,
        });

        // Cache-bust: append timestamp so browsers/CDN don't serve the old image
        const avatarUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}?v=${Date.now()}`;
        console.log(`[Avatar] Saved: ${avatarUrl}`);

        // Save to Firestore under character_bible.compiled_output.avatar_url
        const currentBible = bible || {};
        await db.collection('users').doc(uid).set({
            character_bible: {
                ...currentBible,
                compiled_output: {
                    ...(currentBible.compiled_output || {}),
                    avatar_url: avatarUrl,
                },
            },
        }, { merge: true });

        return Response.json({ success: true, avatar_url: avatarUrl });

    } catch (error: any) {
        console.error('[Avatar] Error:', error);
        return Response.json({ error: error.message || 'Avatar generation failed' }, { status: 500 });
    }
}
