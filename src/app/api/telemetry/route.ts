import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

// Initialize the Google provider
const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY,
});

export const maxDuration = 30;

export async function POST(req: Request) {
    console.log("Telemetry API Called");

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
        console.error("Missing API Key");
        return Response.json({ error: "Server Configuration Error: Missing API Key" }, { status: 500 });
    }

    try {
        const { input, type, broadcast } = await req.json();
        console.log(`Processing: ${type}, Broadcast: ${broadcast}`);

        // Use 'gemini-2.0-flash' (latest experimental) - Reverting to original now that imports fixed
        const model = google('gemini-2.0-flash');

        let narrative = null;

        // 1. Ghostwriter Logic (Parallel execution if broadcast is true)
        if (broadcast) {
            try {
                const ghostPrompt = `
                    Role: Ghostwriter.
                    Goal: Rewrite the input into a high-end, cinematic, cryptic "Micro-Story".
                    Input: "${input}"
                    
                    Constraints:
                    1. Output ONLY valid JSON.
                    2. No conversational filler.
                    3. "title": A short, punchy, abstract title (uppercase).
                    4. "story": The narrative text. No names. Sci-fi/Noir tone. Max 2 sentences.
                    5. "visual_tag": A short visual description of the scene (e.g. "NEON RAIN", "STATIC SCREEN").
                    
                    Expected JSON:
                    {
                        "title": "PROTOCOL 9",
                        "story": "The subject attempted to breach the firewall but lacked the necessary clearance codes.",
                        "visual_tag": "RED GLOW"
                    }
                `;

                const { text } = await generateText({
                    model: model,
                    prompt: ghostPrompt,
                });

                // Extract JSON
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    narrative = JSON.parse(jsonMatch[0]);
                } else {
                    // Fallback if AI fails to JSONify
                    narrative = { title: "TRANSMISSION", story: text, visual_tag: "NO SIGNAL" };
                }

            } catch (ghostError) {
                console.error("Ghostwriter failed:", ghostError);
            }
        }

        // 2. Main Analysis Logic (Blueprint vs Diagnostic)
        let prompt = "";
        const systemInstruction = "Role: Core System Intelligence. Output only valid JSON. Do not use markdown code blocks. Do not explain. Do not acknowledge.";

        if (type === 'blueprint_traits') {
            prompt = `
                ${systemInstruction}
                Goal: You are a Casting Director. Identify 3 specific "Character Traits" the user needs to embody to achieve their desire.
                Input: "${input}"
                
                Expected JSON Structure:
                {
                    "type": "blueprint_traits",
                    "traits": ["Trait 1 (e.g. POLISHED)", "Trait 2 (e.g. RUTHLESS)", "Trait 3"]
                }
                
                Instructions:
                1. Analyze the input to find 3 distinct character attributes.
                2. Avoid generic vague words like "Happy" or "Succesful". Use actor direction like "COMMANDING", "STOIC", "MAGNETIC".
                3. Keep trait names short (1 word preferred).
             `;
        } else if (type === 'blueprint_prompts') {
            // Input expected to start with "DESIRE: ... TRAITS: ..."
            prompt = `
                ${systemInstruction}
                Goal: You are a Casting Director. Give 3 specific "Stage Directions" for the character based on the traits.
                Input Context: "${input}"
                
                Expected JSON Structure:
                {
                    "type": "blueprint_prompts",
                    "prompts": [
                        { "label": "THE LOOK", "question": "Directive on appearance/physical presence..." },
                        { "label": "THE CODE", "question": "Directive on social standards/manners..." },
                        { "label": "THE ROUTINE", "question": "Directive on daily habits/regimen..." }
                    ]
                }
                
                Instructions:
                1. "THE LOOK": Focus on wardrobe, grooming, or posture. (e.g. "Wear a collar even at home.")
                2. "THE CODE": Focus on social interactions and non-negotiables. (e.g. "Speak slower. Never interrupt.")
                3. "THE ROUTINE": Focus on sleep, diet, or media. (e.g. "Wake up at 5am. No phone for 1 hour.")
                4. Tone: Direct, observational, concrete. Show, don't tell.
             `;
        } else {
            // Default to diagnostic
            prompt = `
                ${systemInstruction}
                Goal: Analyze the user's friction and provide a core belief identification.
                Input: "${input}"
                
                Expected JSON Structure:
                {
                    "type": "diagnostic",
                    "analysis": "A single sharp sentence identifying the limiting belief or core emotion.",
                    "frequency": ["Related Emotion 1", "Related Emotion 2"]
                }
             `;
        }

        const { text: responseText } = await generateText({
            model: model,
            prompt: prompt,
        });

        // Robust JSON extraction (find the first '{' and last '}')
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("Invalid JSON Response:", responseText);
            throw new Error("AI returned invalid format");
        }

        const cleanJson = jsonMatch[0];
        const analysisData = JSON.parse(cleanJson);

        // Return both the analysis and the narrative data
        return Response.json({
            ...analysisData,
            narrative // NOW AN OBJECT OR NULL
        });

    } catch (error: any) {
        console.error("Telemetry Error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
