import { db } from '../firebase/admin.js';

export interface BatchJobRecord {
    /** Gemini batch job name (e.g. 'batches/abc123') */
    jobName: string;
    /** Current batch state */
    state: 'JOB_STATE_PENDING' | 'JOB_STATE_RUNNING' | 'JOB_STATE_SUCCEEDED' | 'JOB_STATE_FAILED' | 'JOB_STATE_CANCELLED';
    /** When the batch was submitted */
    created_at: number;
    /** Last state update */
    updated_at: number;
    /** Post IDs included in this batch */
    post_ids: string[];
    /** Maps request key → post context */
    prompt_mapping: Record<string, { postId: string; index: number }>;
    /** Error message if failed */
    error: string | null;
}

const COLLECTION_NAME = 'batch_jobs';

/**
 * Sanitizes a job name for use as a Firestore document ID.
 * Replaces '/' with '_'.
 * 
 * @param jobName The original job name (e.g. 'batches/abc123')
 * @returns The sanitized job name
 */
function getDocId(jobName: string): string {
    return jobName.replace(/\//g, '_');
}

/**
 * Creates a new batch job record in Firestore.
 * 
 * @param record The batch job record to save
 */
export async function createBatchRecord(record: BatchJobRecord): Promise<void> {
    try {
        const docId = getDocId(record.jobName);
        await db.collection(COLLECTION_NAME).doc(docId).set(record);
        console.log(`[BatchTracker] Created batch record for job: ${record.jobName}`);
    } catch (error) {
        console.error(`[BatchTracker] Error creating batch record for ${record.jobName}:`, error);
        throw error;
    }
}

/**
 * Retrieves all active (pending or running) batch jobs from Firestore.
 * 
 * @returns Array of active batch job records
 */
export async function getActiveBatchJobs(): Promise<BatchJobRecord[]> {
    try {
        const snapshot = await db.collection(COLLECTION_NAME)
            .where('state', 'in', ['JOB_STATE_PENDING', 'JOB_STATE_RUNNING'])
            .get();
            
        const jobs: BatchJobRecord[] = [];
        snapshot.forEach(doc => {
            jobs.push(doc.data() as BatchJobRecord);
        });
        
        console.log(`[BatchTracker] Found ${jobs.length} active batch jobs`);
        return jobs;
    } catch (error) {
        console.error('[BatchTracker] Error fetching active batch jobs:', error);
        throw error;
    }
}

/**
 * Updates the state of an existing batch job record.
 * 
 * @param jobName The job name to update
 * @param state The new state
 * @param error Optional error message if the state is failed
 */
export async function updateBatchJobState(
    jobName: string, 
    state: BatchJobRecord['state'], 
    error?: string
): Promise<void> {
    try {
        const docId = getDocId(jobName);
        const updateData: Partial<BatchJobRecord> = {
            state,
            updated_at: Date.now()
        };
        
        if (error !== undefined) {
            updateData.error = error;
        }

        await db.collection(COLLECTION_NAME).doc(docId).update(updateData);
        console.log(`[BatchTracker] Updated batch job ${jobName} state to ${state}`);
    } catch (err) {
        console.error(`[BatchTracker] Error updating batch job state for ${jobName}:`, err);
        throw err;
    }
}

/**
 * Deletes a batch job record from Firestore.
 * 
 * @param jobName The job name to delete
 */
export async function deleteBatchRecord(jobName: string): Promise<void> {
    try {
        const docId = getDocId(jobName);
        await db.collection(COLLECTION_NAME).doc(docId).delete();
        console.log(`[BatchTracker] Deleted batch record for job: ${jobName}`);
    } catch (error) {
        console.error(`[BatchTracker] Error deleting batch record for ${jobName}:`, error);
        throw error;
    }
}
