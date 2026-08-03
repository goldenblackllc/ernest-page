import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './lib/firebase/admin.js';

export const sweepExpiredChats = onSchedule(
    {
        schedule: 'every 15 minutes',
        region: 'us-central1',
        timeoutSeconds: 60,
        memory: '256MiB',
    },
    async () => {
        const now = Date.now();
        const timeoutMs = 30 * 60 * 1000; // 30 mins
        let count = 0;

        const usersSnap = await db.collection('users').get();
        
        // Process in batches
        const USER_BATCH_SIZE = 20;
        for (let i = 0; i < usersSnap.docs.length; i += USER_BATCH_SIZE) {
            const batch = usersSnap.docs.slice(i, i + USER_BATCH_SIZE);
            await Promise.all(batch.map(async (userDoc) => {
                const chatsSnap = await userDoc.ref.collection('active_chats').get();
                if (chatsSnap.empty) return;
                
                for (const chatDoc of chatsSnap.docs) {
                    const data = chatDoc.data();
                    
                    if (data.retryAfter && data.retryAfter > now) continue;
                    if (data.processing && data.processingStartedAt && (now - data.processingStartedAt < 10 * 60 * 1000)) continue;
                    
                    const isExpired = data.updatedAt && data.updatedAt <= (now - timeoutMs);
                    const isClosed = data.isClosed === true;
                    
                    // If it's expired and not closed, closing it triggers processChat.
                    // If it's already closed but not processing, we can re-trigger processChat 
                    // by updating a field (e.g., forcing an update).
                    if (isExpired && !isClosed) {
                        await chatDoc.ref.update({ isClosed: true });
                        count++;
                    } else if (isClosed && !data.processing) {
                        // It's closed but processChat hasn't picked it up or failed previously and retry window passed.
                        // We can flip processing to false just to trigger the onDocumentUpdated, 
                        // or add a dummy update to trigger processChat again.
                        await chatDoc.ref.update({ _triggerCron: Date.now() });
                        count++;
                    }
                }
            }));
        }
        
        console.log(`[SweepExpired] Triggered ${count} chats for processing.`);
    }
);
