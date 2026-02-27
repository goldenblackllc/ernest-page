import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';

export async function POST(req: Request) {
    try {
        const { uid } = await req.json();

        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const chatRef = db.collection('users').doc(uid).collection('active_chats').doc('mirror');
        const chatSnap = await chatRef.get();

        if (!chatSnap.exists) {
            return NextResponse.json({ success: true, message: 'No active chat to close' });
        }

        const chatData = chatSnap.data();
        const messages = chatData?.messages || [];

        // If the chat is substantial, we "abandon" it immediately by backdating the timestamp
        // so the cron job picks it up on its next run, rather than just deleting it now.
        if (messages.length > 2) {
            await chatRef.set({
                // Set updatedAt to 24 hours ago, guaranteeing the cron job will process it
                updatedAt: Date.now() - (24 * 60 * 60 * 1000)
            }, { merge: true });

            return NextResponse.json({ success: true, message: 'Chat queued for early processing' });
        } else {
            // If the chat is empty or too short, just delete it immediately.
            await chatRef.delete();
            return NextResponse.json({ success: true, message: 'Empty chat deleted' });
        }

    } catch (error: any) {
        console.error("Mirror Close Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
