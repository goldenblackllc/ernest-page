import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, generateText, jsonSchema as createJsonSchema, type GenerateObjectResult, type JSONSchema7, type ModelMessage } from 'ai';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const OPUS_MODEL = 'claude-opus-5'; // Primary — Deep Reasoning Engine (all features)
export const OPUS_FALLBACK = 'claude-opus-4-8'; // Stable Fallback for Opus
export const SONNET_MODEL = 'claude-sonnet-5'; // Lightweight — list management, consolidation

// Image generation (Nano Banana 2) — synchronous and Batch API calls
export const IMAGE_MODEL = 'gemini-3.1-flash-image';

// Mirror Chat (chat + plan). Text-only, so Opus 5.5's always-on thinking and
// no-forced-tool-use rules don't apply. Its default effort is 'medium', so
// MIRROR_EFFORT is passed explicitly.
export const MIRROR_MODEL = 'claude-opus-5-5';
export const MIRROR_FALLBACK = 'claude-opus-5';
export const MIRROR_EFFORT = 'high';

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

export async function generateWithFallback<SCHEMA extends z.ZodTypeAny>(
    options: FallbackOptions & { schema: SCHEMA },
): Promise<GenerateObjectResult<z.infer<SCHEMA>>> {
    const primary = options.primaryModelId || OPUS_MODEL;
    const fallback = options.fallbackModelId || OPUS_FALLBACK;
    const { primaryModelId, fallbackModelId, abortSignal, schema, ...aiOptions } = options;
    const fixedSchema = fixSchema(schema);

    // Disable extended thinking for structured output — thinking conflicts
    // with forced tool calls that generateObject uses for schema compliance.
    const providerOptions = {
        ...aiOptions.providerOptions,
        anthropic: {
            ...aiOptions.providerOptions?.anthropic,
            thinking: { type: 'disabled' },
        },
    };

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
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error instanceof Error ? error.message : error);
        return await generateObject({
            ...aiOptions,
            schema: fixedSchema,
            providerOptions,
            abortSignal: AbortSignal.timeout(150_000),
            model: getProviderModel(fallback),
            allowSystemInMessages: true,
        });
    }
}

export async function generateTextWithFallback(options: FallbackOptions) {
    const primary = options.primaryModelId || OPUS_MODEL;
    const fallback = options.fallbackModelId || OPUS_FALLBACK;
    const { primaryModelId, fallbackModelId, abortSignal, ...aiOptions } = options;

    try {
        console.log(`Attempting text generation with primary model (${primary})...`);
        return await generateText({
            ...aiOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary),
            allowSystemInMessages: true,
        });
    } catch (error) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error instanceof Error ? error.message : error);
        return await generateText({
            ...aiOptions,
            abortSignal: AbortSignal.timeout(150_000),
            model: getProviderModel(fallback),
            allowSystemInMessages: true,
        });
    }
}
