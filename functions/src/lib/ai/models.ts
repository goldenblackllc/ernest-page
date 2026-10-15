import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, generateText, jsonSchema as createJsonSchema, type GenerateObjectResult, type JSONSchema7, type ModelMessage } from 'ai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// GEMINI_API_KEY first: it belongs to the earnest-page project (paid tier). In
// functions/.env, GOOGLE_GENERATIVE_AI_API_KEY is from another project whose
// per-minute limit runs out after a few requests.
const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const OPUS_MODEL = 'claude-opus-5-5'; // Primary — Deep Reasoning Engine (all features)
export const SONNET_MODEL = 'claude-sonnet-5'; // Lightweight — list management, consolidation

/**
 * Backup model for live calls only (Mirror chat, support chat), where a user is
 * waiting. Background work has no fallback: it fails and its job retries.
 */
export const LIVE_FALLBACK = 'claude-opus-5';

/**
 * Every Claude call runs at 'high' effort. Opus 5.5 always thinks (it can't be
 * disabled) and defaults to 'medium'. 'max' was tried and thought ~75x longer
 * for the same answer (Phase 1: 28s at high, 9.5 min at max), so don't use it
 * without measuring that high falls short.
 */
export const EFFORT = 'high';

// Image generation (Nano Banana 2.1) — synchronous and Batch API calls
export const IMAGE_MODEL = 'gemini-nano-banana-2.1';

function getProviderModel(modelName: string) {
    if (modelName.includes('gemini')) {
        return google(modelName);
    }
    return anthropic(modelName);
}

/**
 * Convert a Zod schema to a JSON Schema with `type: 'object'` at the top level.
 * claude-opus-5 requires `type` in the tool input_schema; discriminated unions
 * produce schemas without it, causing validation errors.
 */
function fixSchema<SCHEMA extends z.ZodTypeAny>(zodSchema: SCHEMA) {
    const converted = zodToJsonSchema(zodSchema, { $refStrategy: 'none' }) as JSONSchema7;
    if (!converted.type) converted.type = 'object';
    return createJsonSchema<z.infer<SCHEMA>>(converted);
}

type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

/** Options shared by both fallback helpers; the rest is passed through to the AI SDK. */
type FallbackOptions = {
    primaryModelId?: string;
    fallbackModelId?: string;
    abortSignal?: AbortSignal;
    system?: string;
    maxOutputTokens?: number;
    providerOptions?: ProviderOptions;
} & (
    | { prompt: string; messages?: never }
    | { messages: ModelMessage[]; prompt?: never }
);

function withMaxEffort(providerOptions: ProviderOptions): ProviderOptions {
    return {
        ...providerOptions,
        anthropic: { ...providerOptions?.anthropic, effort: EFFORT },
    };
}

/** Generate a structured object. Falls back to `fallbackModelId` only when one is given (live calls). */
export async function generateWithFallback<SCHEMA extends z.ZodTypeAny>(
    options: FallbackOptions & { schema: SCHEMA },
): Promise<GenerateObjectResult<z.infer<SCHEMA>>> {
    const primary = options.primaryModelId || OPUS_MODEL;
    const { primaryModelId, fallbackModelId, abortSignal, schema, ...aiOptions } = options;
    const fixedSchema = fixSchema(schema);
    const providerOptions = withMaxEffort(aiOptions.providerOptions);

    try {
        console.log(`Attempting generation with primary model (${primary})...`);
        return await generateObject({
            ...aiOptions,
            schema: fixedSchema,
            providerOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary),
            allowSystemInMessages: true,
        });
    } catch (error) {
        if (!fallbackModelId) throw error;
        console.warn(`Primary model failed. Falling back to ${fallbackModelId}. Error: `, error instanceof Error ? error.message : error);
        return await generateObject({
            ...aiOptions,
            schema: fixedSchema,
            providerOptions,
            abortSignal: AbortSignal.timeout(150_000),
            model: getProviderModel(fallbackModelId),
            allowSystemInMessages: true,
        });
    }
}

/** Generate text. Falls back to `fallbackModelId` only when one is given (live calls). */
export async function generateTextWithFallback(options: FallbackOptions) {
    const primary = options.primaryModelId || OPUS_MODEL;
    const { primaryModelId, fallbackModelId, abortSignal, ...aiOptions } = options;
    const providerOptions = withMaxEffort(aiOptions.providerOptions);

    try {
        console.log(`Attempting text generation with primary model (${primary})...`);
        return await generateText({
            ...aiOptions,
            providerOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary),
            allowSystemInMessages: true,
        });
    } catch (error) {
        if (!fallbackModelId) throw error;
        console.warn(`Primary model failed. Falling back to ${fallbackModelId}. Error: `, error instanceof Error ? error.message : error);
        return await generateText({
            ...aiOptions,
            providerOptions,
            abortSignal: AbortSignal.timeout(150_000),
            model: getProviderModel(fallbackModelId),
            allowSystemInMessages: true,
        });
    }
}
