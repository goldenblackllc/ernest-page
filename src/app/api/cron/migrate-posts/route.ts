import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-time migration: backfill `public_post` on legacy posts that only have
 * top-level letter/title/pseudonym/response fields.
 *
 * Safe to run multiple times — it skips posts that already have public_post.
 *
 * DELETE THIS FILE after running it once successfully.
 */
export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const postsSnap = await db.collection('posts').get();
        let migrated = 0;
        let skipped = 0;

        const BATCH_SIZE = 500; // Firestore batch limit
        let batch = db.batch();
        let batchCount = 0;

        for (const doc of postsSnap.docs) {
            const data = doc.data();

            // Skip if public_post already exists
            if (data.public_post) {
                skipped++;
                continue;
            }

            // Only migrate if there's at least a letter or tension to migrate
            const letter = data.letter || data.tension;
            if (!letter) {
                skipped++;
                continue;
            }

            batch.update(doc.ref, {
                public_post: {
                    title: data.title || null,
                    pseudonym: data.pseudonym || null,
                    letter: letter,
                    response: data.response || data.counsel || null,
                    imagen_url: data.imagen_url || null,
                },
            });

            migrated++;
            batchCount++;

            if (batchCount >= BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        // Commit remaining
        if (batchCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({
            success: true,
            migrated,
            skipped,
            total: postsSnap.size,
        });
    } catch (error: any) {
        console.error('Migration error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
