import { anthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, streamText, generateText } from 'ai';

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

export const OPUS_MODEL = 'claude-opus-4-6'; // Heavy Reasoning Engine
export const OPUS_FALLBACK = 'claude-opus-4-5'; // Stable Fallback for Opus
export const SONNET_MODEL = 'claude-sonnet-4-6'; // Creative Writing Engine
export const BACKUP_MODEL = 'gemini-3.1-pro-preview';

function getProviderModel(modelName: string) {
    if (modelName.includes('gemini')) {
        return google(modelName);
    }
    return anthropic(modelName);
}

export async function generateWithFallback(options: any) {
    const primary = options.primaryModelId || SONNET_MODEL;
    const fallback = options.fallbackModelId || BACKUP_MODEL;
    const { primaryModelId, fallbackModelId, abortSignal, ...aiOptions } = options;

    try {
        console.log(`Attempting generation with primary model (${primary})...`);
        return await generateObject({
            ...aiOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary)
        });
    } catch (error: any) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error.message);
        return await generateObject({
            ...aiOptions,
            abortSignal: AbortSignal.timeout(120000),
            model: getProviderModel(fallback)
        });
    }
}

export async function streamWithFallback(options: any) {
    const primary = options.primaryModelId || SONNET_MODEL;
    const fallback = options.fallbackModelId || BACKUP_MODEL;
    const { primaryModelId, fallbackModelId, abortSignal, ...aiOptions } = options;

    try {
        console.log(`Attempting stream with primary model (${primary})...`);
        return await streamText({
            ...aiOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary)
        });
    } catch (error: any) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error.message);
        return await streamText({
            ...aiOptions,
            abortSignal: AbortSignal.timeout(120000),
            model: getProviderModel(fallback)
        });
    }
}

export async function generateTextWithFallback(options: any) {
    const primary = options.primaryModelId || SONNET_MODEL;
    const fallback = options.fallbackModelId || BACKUP_MODEL;
    const { primaryModelId, fallbackModelId, abortSignal, ...aiOptions } = options;

    try {
        console.log(`Attempting text generation with primary model (${primary})...`);
        return await generateText({
            ...aiOptions,
            ...(abortSignal && { abortSignal }),
            model: getProviderModel(primary)
        });
    } catch (error: any) {
        console.warn(`Primary model failed. Falling back to ${fallback}. Error: `, error.message);
        return await generateText({
            ...aiOptions,
            abortSignal: AbortSignal.timeout(120000),
            model: getProviderModel(fallback)
        });
    }
}
