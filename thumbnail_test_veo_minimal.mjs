/**
 * Minimal Veo test — just a prompt, no extras.
 * Matches the Google AI Studio example exactly.
 */

import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';

config({ path: '.env.local' });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
console.log(`Using API key: ${GEMINI_API_KEY?.substring(0, 8)}...`);

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

mkdirSync('./thumbnail_samples_video', { recursive: true });

async function run() {
    console.log('🎬 Minimal Veo test\n');

    const prompt = 'A cinematic 5-second shot of a woman sitting at a desk, closing her laptop, picking up a cup of coffee, and looking thoughtfully out the window. Golden hour lighting. 16:9.';

    console.log('Submitting to veo-3.1-fast-generate-preview...');
    const startTime = Date.now();

    try {
        const operation = await client.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                aspectRatio: '16:9',
                numberOfVideos: 1,
            },
        });

        console.log(`✅ Submitted! Operation: ${operation.name}`);
        console.log('Polling for completion...');

        let result = operation;
        let attempts = 0;
        while (!result.done && attempts < 60) {
            await new Promise(r => setTimeout(r, 10000));
            attempts++;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            if (attempts % 3 === 0) console.log(`   ⏳ ${elapsed}s...`);
            result = await client.operations.get({ name: operation.name });
        }

        if (!result.done) {
            console.error('❌ Timed out');
            return;
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Done in ${elapsed}s`);
        console.log('Response keys:', JSON.stringify(Object.keys(result.response || {})));

        const videos = result.response?.generatedVideos;
        if (!videos?.length) {
            console.log('Full response:', JSON.stringify(result.response, null, 2).substring(0, 1000));
            return;
        }

        const video = videos[0];
        console.log('Video keys:', JSON.stringify(Object.keys(video.video || video)));

        let videoBuffer;
        if (video.video?.uri) {
            console.log('Downloading from URI:', video.video.uri.substring(0, 80));
            const res = await fetch(video.video.uri);
            videoBuffer = Buffer.from(await res.arrayBuffer());
        } else if (video.video?.videoBytes) {
            videoBuffer = Buffer.from(video.video.videoBytes, 'base64');
        }

        if (videoBuffer) {
            writeFileSync('./thumbnail_samples_video/test_minimal.mp4', videoBuffer);
            console.log(`💾 Saved: ./thumbnail_samples_video/test_minimal.mp4 (${(videoBuffer.length / 1024).toFixed(0)}KB)`);
        }

    } catch (err) {
        console.error('❌ Error:', err.message || err);
        if (err.stack) console.error(err.stack.split('\n').slice(0, 3).join('\n'));
    }
}

run();
