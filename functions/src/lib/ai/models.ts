import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, streamText, generateText, jsonSchema as createJsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const OPUS_MODEL = 'claude-opus-5'; // Primary — Deep Reasoning Engine (all features)
export const OPUS_FALLBACK = 'claude-opus-4-8'; // Stable Fallback for Opus
export const SONNET_MODEL = 'claude-sonnet-5'; // Lightweight — list management, consolidation
export const BACKUP_MODEL = 'gemini-3.1-pro-preview';

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
function fixSchema(zodSchema: any) {
    const converted: any = zodToJsonSchema(zodSchema, { $refStrategy: 'none' });
    if (!converted.type) converted.type = 'object';
    return createJsonSchema(converted);
}

export async function generateWithFallback(options: any) {
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
    } catch (error: any) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error.message);
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

export async function streamWithFallback(options: any) {
    const primary = options.primaryModelId || OPUS_MODEL;
    const fallback = options.fallbackModelId || OPUS_FALLBACK;
    const { primaryModelId, fallbackModelId, abortSignal, ...aiOptions } = options;

    try {
        console.log(`Attempting stream with primary model (${primary})...`);
        return await streamText({
            ...aiOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary),
            allowSystemInMessages: true,
        });
    } catch (error: any) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error.message);
        return await streamText({
            ...aiOptions,
            abortSignal: AbortSignal.timeout(150_000),
            model: getProviderModel(fallback),
            allowSystemInMessages: true,
        });
    }
}

export async function generateTextWithFallback(options: any) {
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
    } catch (error: any) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error.message);
        return await generateText({
            ...aiOptions,
            abortSignal: AbortSignal.timeout(150_000),
            model: getProviderModel(fallback),
            allowSystemInMessages: true,
        });
    }
}
