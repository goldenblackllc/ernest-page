import { GoogleGenAI } from '@google/genai';

let genAIClient: GoogleGenAI | null = null;

export const MODEL_NAME = 'gemini-3.1-flash-image';

/**
 * Returns a configured GoogleGenAI instance.
 * Uses environment variables for API key.
 * Lazy singleton initialization.
 *
 * @returns {GoogleGenAI} The initialized Gemini API client
 */
export function getGenAIClient(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('[BatchImageGen] Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable');
    }
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
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
 * Replicates the prompt construction logic from generateImage.
 *
 * @param {BuildBatchRequestOptions} options Request configuration
 * @returns {any} The formatted request object for batch submission
 */
export function buildBatchRequest(options: BuildBatchRequestOptions): any {
  const { key, prompt, referenceImages = [], referenceMode, aspectRatio = '16:9' } = options;

  let prefixText = '';
  if (referenceImages.length > 0) {
    if (referenceMode === 'face-only') {
      prefixText = 'Use the reference image ONLY to maintain the character\'s face, hair, and ethnic features. Do NOT copy the body type, weight, build, or physique from the reference image — follow the body description in the text prompt below instead. Keep their facial identity consistent but let the scene dictate their physical state.\n\n';
    } else if (referenceMode === 'full') {
      prefixText = 'Use the reference image to maintain the character\'s identity — their face, build, hair, and personal style. Keep their clothing style consistent BUT remove any activity-specific gear (goggles, helmets, sports equipment) that does not fit the scene described below.\n\n';
    }
  }

  let ratioHint = ' 16:9 landscape orientation. Do not generate in landscape or square format.';
  switch (aspectRatio) {
    case '9:16':
      ratioHint = ' 9:16 portrait orientation (1080×1920). Do not generate in landscape or square format.';
      break;
    case '16:9':
      ratioHint = ' 16:9 landscape orientation. Do not generate in landscape or square format.';
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
        mimeType: 'image/jpeg' // default guess, real implementation could inspect buffer
      }
    });
  }

  parts.push({ text: finalPrompt });

  return {
    key,
    request: {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    }
  };
}

/**
 * Submits an inline batch of image generation requests.
 *
 * @param {any[]} requests Array of request objects from buildBatchRequest
 * @returns {Promise<string>} The batch job name
 */
export async function submitImageBatch(requests: any[]): Promise<string> {
  const ai = getGenAIClient();
  try {
    console.log(`[BatchImageGen] Submitting inline batch with ${requests.length} requests`);
    const response = await ai.batches.create({
      model: MODEL_NAME,
      src: requests,
      config: { displayName: `BatchImageGen_${Date.now()}` }
    });
    return response.name!;
  } catch (error) {
    console.error('[BatchImageGen] Failed to submit batch:', error);
    throw error;
  }
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
 * Polls the status of a batch job.
 * If succeeded, parses and returns the results.
 *
 * @param {string} jobName The batch job name
 * @returns {Promise<BatchStatus>} Status and parsed results if available
 */
export async function pollBatchJob(jobName: string): Promise<BatchStatus> {
  const ai = getGenAIClient();
  try {
    const job = await ai.batches.get({ name: jobName });
    
    let results: ParsedBatchResult[] | null = null;
    
    if (job.state === 'JOB_STATE_SUCCEEDED') {
      results = parseBatchResults(job);
    }
    
    return { state: job.state || 'JOB_STATE_PENDING', results };
  } catch (error) {
    console.error(`[BatchImageGen] Error polling batch job ${jobName}:`, error);
    throw error;
  }
}

/**
 * Parses a completed batch job to extract images.
 *
 * @param {any} batchJob The completed batch job object
 * @returns {ParsedBatchResult[]} Array of parsed image results
 */
export function parseBatchResults(batchJob: any): ParsedBatchResult[] {
  const results: ParsedBatchResult[] = [];
  
  if (!batchJob.inlineResponse) {
    console.warn('[BatchImageGen] No inlineResponse found in batch job');
    return results;
  }

  for (const item of batchJob.inlineResponse) {
    const key = item.key;
    let buffer: Buffer | null = null;
    let mimeType: string | null = null;

    try {
      const candidates = item.response?.candidates || [];
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
