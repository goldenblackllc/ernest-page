/**
 * Batch image generation using the Gemini Batch API.
 *
 * Uses raw fetch with the API key in the query string (unlike generateImage.ts,
 * which uses the @google/genai SDK) so requests route through AI Studio's quota
 * system instead of the Cloud project's quota system.
 *
 * Cost savings: Batch API is billed at 50% of standard generateContent rates.
 */

import { IMAGE_MODEL } from './models.js';
import { buildImageRequestParts, type ImageAspectRatio, type ReferenceMode } from './generateImage.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Returns the configured Gemini API key.
 */
function getApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('[BatchImageGen] Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable');
    }
    return apiKey;
}

export interface BuildBatchRequestOptions {
    key: string;
    prompt: string;
    referenceImages?: Buffer[];
    referenceMode?: ReferenceMode;
    aspectRatio?: ImageAspectRatio;
}

/**
 * Builds a single GenerateContentRequest object for batch processing,
 * with the same prompt construction as generateImage.ts.
 *
 * @param {BuildBatchRequestOptions} options Request configuration
 * @returns The formatted request object for batch submission
 */
export function buildBatchRequest(options: BuildBatchRequestOptions): { key: string; request: any } {
    const { key, prompt, referenceImages, referenceMode, aspectRatio } = options;
    const parts = buildImageRequestParts({ prompt, aspectRatio, referenceImages, referenceMode });

    return {
        key,
        request: {
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        },
    };
}

export interface ParsedBatchResult {
    key: string;
    buffer: Buffer | null;
    mimeType: string | null;
}

export interface BatchStatus {
    state: string;
    results: ParsedBatchResult[] | null;
}

/**
 * Submits an inline batch of image generation requests using raw fetch.
 * Routes through AI Studio quota (API key in query string) rather than
 * Cloud project quota.
 *
 * @param requests Array of request objects from buildBatchRequest
 * @returns The batch job name (e.g. 'batches/abc123')
 */
export async function submitImageBatch(requests: Array<{ key: string; request: any }>): Promise<string> {
    const apiKey = getApiKey();

    console.log(`[BatchImageGen] Submitting inline batch with ${requests.length} requests`);

    // Format requests for the REST API
    const formattedRequests = requests.map(r => ({
        request: r.request,
        metadata: { key: r.key },
    }));

    const res = await fetch(
        `${API_BASE}/models/${IMAGE_MODEL}:batchGenerateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch: {
                    display_name: `BatchImageGen_${Date.now()}`,
                    input_config: {
                        requests: {
                            requests: formattedRequests,
                        },
                    },
                },
            }),
        }
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => '(unreadable)');
        console.error(`[BatchImageGen] Batch submission error ${res.status}:`, errText.slice(0, 1000));

        if (res.status === 429) {
            const error = new Error('Batch submission quota exhausted');
            (error as any).isQuotaError = true;
            throw error;
        }
        throw new Error(`Batch submission failed with status ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();

    // The response is a long-running operation. Extract the batch job name.
    const jobName: string = data.name || data.metadata?.name;
    if (!jobName) {
        console.error('[BatchImageGen] No job name in batch response:', JSON.stringify(data).slice(0, 500));
        throw new Error('Batch submission did not return a job name');
    }

    console.log(`[BatchImageGen] Batch job created: ${jobName}`);
    return jobName;
}

/**
 * Polls the status of a batch job using raw fetch.
 *
 * The Gemini Batch API returns:
 *   - `done: true/false` at the top level (most reliable signal)
 *   - `metadata.state` with `BATCH_STATE_*` prefix (e.g. BATCH_STATE_SUCCEEDED)
 *
 * We normalize these to JOB_STATE_* for our internal tracker.
 *
 * @param jobName The batch job name
 * @returns Status and parsed results if available
 */
export async function pollBatchJob(jobName: string): Promise<BatchStatus> {
    const apiKey = getApiKey();

    const res = await fetch(
        `${API_BASE}/${jobName}?key=${apiKey}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => '(unreadable)');
        console.error(`[BatchImageGen] Error polling batch job ${jobName}: ${res.status}`, errText.slice(0, 500));
        throw new Error(`Poll failed with status ${res.status}`);
    }

    const data = await res.json();

    // Map the API's BATCH_STATE_* to our internal JOB_STATE_* format
    const rawState: string = data.metadata?.state || data.state || '';
    const state = normalizeBatchState(rawState, data.done);

    let results: ParsedBatchResult[] | null = null;

    if (state === 'JOB_STATE_SUCCEEDED') {
        results = parseBatchResults(data);
    }

    return { state, results };
}

/**
 * Normalize Gemini Batch API state strings to our internal JOB_STATE_* format.
 * The API uses BATCH_STATE_* prefix (e.g. BATCH_STATE_SUCCEEDED), and also
 * provides a top-level `done` boolean which is the most reliable signal.
 */
function normalizeBatchState(rawState: string, done?: boolean): string {
    // If the API says done=true, it's succeeded (unless state says failed/cancelled)
    if (done === true) {
        if (rawState.includes('FAILED')) return 'JOB_STATE_FAILED';
        if (rawState.includes('CANCELLED')) return 'JOB_STATE_CANCELLED';
        return 'JOB_STATE_SUCCEEDED';
    }

    // Map BATCH_STATE_* → JOB_STATE_*
    if (rawState.includes('SUCCEEDED')) return 'JOB_STATE_SUCCEEDED';
    if (rawState.includes('FAILED')) return 'JOB_STATE_FAILED';
    if (rawState.includes('CANCELLED')) return 'JOB_STATE_CANCELLED';
    if (rawState.includes('RUNNING')) return 'JOB_STATE_RUNNING';

    return 'JOB_STATE_PENDING';
}

/**
 * Parses a completed batch job to extract images.
 *
 * The Gemini Batch API nests results at:
 *   data.metadata.output.inlinedResponses.inlinedResponses[]
 * Each item has:
 *   - .metadata.key — the request key we submitted
 *   - .response.candidates[0].content.parts[] — the generated content
 *
 * @param batchJob The completed batch job response
 * @returns Array of parsed image results
 */
function parseBatchResults(batchJob: any): ParsedBatchResult[] {
    const results: ParsedBatchResult[] = [];

    // The actual API nests results at metadata.output.inlinedResponses.inlinedResponses
    const responses =
        batchJob.metadata?.output?.inlinedResponses?.inlinedResponses  // actual API path
        || batchJob.response?.inlinedResponses?.inlinedResponses       // alternative nesting
        || batchJob.response?.inlineResponse                           // legacy fallback
        || batchJob.inlineResponse
        || batchJob.response?.responses
        || batchJob.responses
        || [];

    if (!responses || responses.length === 0) {
        console.warn('[BatchImageGen] No responses found in batch job. Keys:', Object.keys(batchJob),
            'metadata keys:', batchJob.metadata ? Object.keys(batchJob.metadata) : 'none');
        return results;
    }

    console.log(`[BatchImageGen] Parsing ${responses.length} batch results`);

    for (const item of responses) {
        const key = item.metadata?.key || item.key || '';
        let buffer: Buffer | null = null;
        let mimeType: string | null = null;

        try {
            const response = item.response || item;
            const candidates = response?.candidates || [];
            if (candidates.length > 0) {
                const parts = candidates[0].content?.parts || [];
                const imagePart = parts.find((p: any) => p.inlineData && p.inlineData.mimeType?.startsWith('image/'));

                if (imagePart) {
                    buffer = Buffer.from(imagePart.inlineData.data, 'base64');
                    mimeType = imagePart.inlineData.mimeType;
                }
            }

            if (!buffer) {
                // Log why this particular result has no image
                const textPart = (item.response?.candidates?.[0]?.content?.parts || []).find((p: any) => p.text);
                if (textPart) {
                    console.warn(`[BatchImageGen] Result for key "${key}" returned text instead of image (safety filter?):`, textPart.text?.slice(0, 200));
                } else {
                    console.warn(`[BatchImageGen] Result for key "${key}" has no image data`);
                }
            }
        } catch (err) {
            console.error(`[BatchImageGen] Failed to parse result for key ${key}:`, err);
        }

        results.push({ key, buffer, mimeType });
    }

    return results;
}
