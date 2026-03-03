import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// Now import AFTER dotenv
const { generateText } = require('ai');
const { anthropic } = require('@ai-sdk/anthropic');

async function main() {
    try {
        const { text } = await generateText({
            model: anthropic('claude-3-7-sonnet-20250219'),
            prompt: 'Say hello!',
        });
        console.log("3.7 works:", text);
    } catch (e: any) {
        console.log("3.7 failed:", e.message);
    }
}
main();
