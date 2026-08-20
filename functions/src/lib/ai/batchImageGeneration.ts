/**
 * Batch image generation using the Gemini Batch API.
 *
 * Uses raw fetch (matching generateImage.ts) rather than the @google/genai SDK
 * to ensure requests route through AI Studio's quota system (API key auth)
 * instead of the Cloud project's quota system.
 *
 * Cost savings: Batch API is billed at 50% of standard generateContent rates.
 */

const MODEL_NAME = 'gemini-3.1-flash-image';

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
    referenceMode?: 'full' | 'face-only';
    aspectRatio?: string;
}

/**
 * Builds a single GenerateContentRequest object for batch processing.
 * Replicates the prompt construction logic from generateImage.ts.
 *
 * @param {BuildBatchRequestOptions} options Request configuration
 * @returns The formatted request object for batch submission
 */
export function buildBatchRequest(options: BuildBatchRequestOptions): { key: string; request: any } {
    const { key, prompt, referenceImages = [], referenceMode, aspectRatio = '16:9' } = options;

    let prefixText = '';
    if (referenceImages.length > 0) {
        if (referenceMode === 'face-only') {
            prefixText = 'Use the reference image ONLY to maintain the character\'s face, hair, and ethnic features. Do NOT copy the body type, weight, build, or physique from the reference image — follow the body description in the text prompt below instead. Keep their facial identity consistent but let the scene dictate their physical state.\n\n';
        } else if (referenceMode === 'full') {
            prefixText = 'Use the reference image to maintain the character\'s identity — their face, build, hair, and personal style. Keep their clothing style consistent BUT remove any activity-specific gear (goggles, helmets, sports equipment) that does not fit the scene described below.\n\n';
        }
    }

    let ratioHint = ' 16:9 landscape orientation. Do not generate in portrait or square format.';
    switch (aspectRatio) {
        case '9:16':
            ratioHint = ' 9:16 portrait orientation (1080×1920). Do not generate in landscape or square format.';
            break;
        case '4:3':
            ratioHint = ' 4:3 landscape orientation.';
            break;
        case '3:4':
            ratioHint = ' 3:4 portrait orientation.';
            break;
        case '4:5':
            ratioHint = ' 4:5 portrait orientation (1080×1350). Do not generate in landscape or square format.';
            break;
    }

    const finalPrompt = prefixText + prompt + ratioHint;

    const parts: any[] = [];

    for (const img of referenceImages) {
        parts.push({
            inlineData: {
                data: img.toString('base64'),
                mimeType: 'image/jpeg',
            },
        });
    }

    parts.push({ text: finalPrompt });

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
        `${API_BASE}/models/${MODEL_NAME}:batchGenerateContent?key=${apiKey}`,
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
    const state: string = data.state || data.metadata?.state || 'JOB_STATE_PENDING';

    let results: ParsedBatchResult[] | null = null;

    if (state === 'JOB_STATE_SUCCEEDED') {
        results = parseBatchResults(data);
    }

    return { state, results };
}

/**
 * Parses a completed batch job to extract images.
 *
 * @param batchJob The completed batch job response
 * @returns Array of parsed image results
 */
export function parseBatchResults(batchJob: any): ParsedBatchResult[] {
    const results: ParsedBatchResult[] = [];

    // Results may be in different locations depending on the response format
    const responses = batchJob.response?.inlineResponse
        || batchJob.inlineResponse
        || batchJob.response?.responses
        || batchJob.responses
        || [];

    if (!responses || responses.length === 0) {
        console.warn('[BatchImageGen] No responses found in batch job:', JSON.stringify(batchJob).slice(0, 500));
        return results;
    }

    for (const item of responses) {
        const key = item.key || item.metadata?.key || '';
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
        } catch (err) {
            console.error(`[BatchImageGen] Failed to parse result for key ${key}:`, err);
        }

        results.push({ key, buffer, mimeType });
    }

    return results;
}
