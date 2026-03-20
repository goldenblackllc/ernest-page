import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

/**
 * POST /api/account/export
 *
 * GDPR Article 20 — Right to Data Portability.
 * Returns all user data in a machine-readable JSON format.
 *
 * Exports: profile, identity, dossier, character bible, posts,
 * active chats, session purchases, subscription history, and daily digest.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const exportData: Record<string, any> = {
            exported_at: new Date().toISOString(),
            user_id: uid,
        };

        // 1. User document (profile, identity, dossier, bible, subscription, etc.)
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const data = userDoc.data()!;
            exportData.profile = {
                identity: data.identity || null,
                preferred_locale: data.preferred_locale || null,
                default_routing: data.defaultRouting || null,
                session_count: data.session_count || 0,
                session_purchases: data.session_purchases || [],
                subscription: data.subscription || null,
                daily_digest: data.daily_digest || null,
                onboarding_completed: data.onboarding_completed || false,
                created_at: data.created_at || null,
            };
            exportData.dossier = data.dossier || null;
            exportData.character_bible = data.character_bible || null;
            exportData.followed_authors = data.followed_authors || [];
        }

        // 2. Posts
        const postsSnap = await db.collection('posts')
            .where('authorId', '==', uid)
            .orderBy('createdAt', 'desc')
            .get();

        exportData.posts = postsSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                type: d.type || 'post',
                title: d.title || null,
                content: d.content || null,
                content_raw: d.content_raw || null,
                counsel: d.counsel || null,
                privacy: d.privacy || null,
                image_url: d.image_url || null,
                created_at: d.createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
            };
        });

        // 3. Active chats (if any)
        const chatsSnap = await db.collection('users').doc(uid)
            .collection('active_chats').get();

        exportData.active_chats = chatsSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                messages: d.messages || [],
                routing: d.routing || null,
                created_at: d.createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
            };
        });

        // Return as downloadable JSON
        return new Response(JSON.stringify(exportData, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="earnest-page-export-${uid.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.json"`,
            },
        });

    } catch (error: any) {
        console.error('[Account Export] Error:', error);
        return Response.json(
            { error: error.message || 'Data export failed.' },
            { status: 500 }
        );
    }
}
