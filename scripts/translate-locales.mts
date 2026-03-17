import fs from 'fs';
import path from 'path';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
});

async function translateJson(sourceObj: any, targetLang: string) {
    console.log(`Translating to ${targetLang}...`);
    
    // Convert to JSON string
    const jsonStr = JSON.stringify(sourceObj, null, 2);
    
    const prompt = `You are an expert translator. Translate the values of the following JSON into ${targetLang}. 
    RULES:
    1. ONLY translate the VALUES, keep the keys exactly the same.
    2. Maintain all interpolation variables wrapped in curly braces (e.g., {name}, {time}).
    3. Return ONLY valid JSON, no markdown formatting out of bounds, no conversational text.
    
    JSON TO TRANSLATE:
    ${jsonStr}`;

    const response = await generateText({
        model: google('gemini-1.5-flash'),
        prompt,
    });

    let text = response.text.trim();
    if (text.startsWith('\`\`\`json')) {
        text = text.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim();
    }
    
    return JSON.parse(text);
}

async function main() {
    const enPath = path.join(process.cwd(), 'src/messages/en.json');
    const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

    const languages = [
        { code: 'es', name: 'Spanish (Español)' },
        { code: 'pt', name: 'Portuguese (Português)' },
        { code: 'fr', name: 'French (Français)' }
    ];

    for (const lang of languages) {
        const outPath = path.join(process.cwd(), `src/messages/${lang.code}.json`);
        if (fs.existsSync(outPath)) {
            console.log(`${lang.code}.json already exists, skipping.`);
            continue;
        }

        try {
            const translated = await translateJson(enData, lang.name);
            fs.writeFileSync(outPath, JSON.stringify(translated, null, 2));
            console.log(`Successfully wrote ${lang.code}.json`);
        } catch (e) {
            console.error(`Failed to translate to ${lang.code}:`, e);
        }
    }
}

main().catch(console.error);
