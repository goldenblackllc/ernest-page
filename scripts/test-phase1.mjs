/**
 * test-phase1.mjs
 *
 * Tests the Phase 1 "Fact Compiler" on a real user's data from Firestore.
 * Fetches the user doc, assembles the same inputs the Cloud Function would,
 * runs the Phase 1 prompt, and prints the translated output.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-phase1.mjs [uid]
 *
 *   If no UID is provided, uses ADMIN_UID from .env.local.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Config ──────────────────────────────────────────────────────────────────
const uid = process.argv[2] || process.env.ADMIN_UID;
if (!uid) {
    console.error('❌ No UID provided. Pass as argument or set ADMIN_UID in .env.local');
    process.exit(1);
}

const MODEL_ID = 'claude-sonnet-5'; // Same as SONNET_MODEL in production

// ─── Firebase Init ───────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
}
const db = getFirestore();

// ─── Anthropic Init ──────────────────────────────────────────────────────────
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Phase 1 Prompt (same as compileCharacterBible.ts) ───────────────────────
const PHASE1_SYSTEM_PROMPT = `You are a Fact Compiler. Your sole job is to take raw personal data — goals, dreams, desires, physical descriptions, and relationship notes — and rewrite them as present-tense statements of fact about an existing person who is completely loving, integrated, and at peace.

Rules:
- Every output statement must be present tense. "I am," "I have," "I live," "I earn." Never "I want," "I'm working toward," "I dream of," "I'm building."
- Do not invent new details. Only rewrite what is provided.
- Do not editorialize or add emotional color. Just state facts.
- If two inputs overlap or contradict, merge them into one clean statement. Example: want="be financially free" + dream_financial="$3M net worth" → "I have a $3M net worth."
- Physical traits should be stated as natural attributes, not achievements. Example: "be 182 pounds, be strong and fit" + height="6'1" → "I'm six-one, 182 pounds, strong and fit."
- Strip the aspiration, keep the specificity. Every brand, number, place name, and proper noun survives.
- For people: rewrite each person's dynamic from the perspective of someone who is completely loving and at peace. Others may carry friction toward this person, but this person does not carry it back. State the relationship as settled, warm, and clear-eyed — not aspirational, not conflicted.`;

const PHASE1_USER_PROMPT = `Rewrite the following raw inputs as present-tense facts about a real, living person who is fully actualized and at peace.

--- RAW INPUTS ---

Goals & Desires: {WANTS}

Dream Living Situation: {DREAM_LIVING}

Dream Financial Situation: {DREAM_FINANCIAL}

Physical Description: {PHYSICAL_TRAITS}

People:
{IMPORTANT_PEOPLE}

--- OUTPUT FORMAT ---

Rewrite into these sections:

1. "Living Situation" — Where and how this person lives. Present tense.
2. "Financial Reality" — This person's financial standing. Present tense.
3. "Physical Profile" — This person's body, appearance, and physical state. Present tense.
4. "Character Facts" — Everything else from the goals/desires, restated as facts about who this person already is and what they already do. Present tense.
5. "People" — For each person provided, rewrite their entry as a present-tense fact about the relationship, from the perspective of someone who is loving and at peace.`;

const PHASE1_SCHEMA = z.object({
    living_situation: z.string().describe("Where and how this person lives — present tense fact"),
    financial_reality: z.string().describe("This person's financial standing — present tense fact"),
    physical_profile: z.string().describe("Body, appearance, physical state — present tense fact"),
    character_facts: z.string().describe("Everything else restated as present-tense facts about who they are"),
    people: z.array(z.object({
        name: z.string().describe("Person's name"),
        relationship: z.string().describe("Relationship label"),
        description: z.string().describe("Present-tense, loving description of this person and the relationship"),
    })).describe("Each person rewritten as a present-tense, loving relationship fact"),
});

// ─── Age computation (same as production) ────────────────────────────────────
function computeAge(birthdate) {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
    return age;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n━━━ Phase 1 Test — UID: ${uid} ━━━\n`);

    // Fetch user doc
    console.log('1️⃣  Fetching user document...');
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
        console.error('❌ User document not found in Firestore');
        process.exit(1);
    }
    const data = userDoc.data();
    console.log('   ✅ Found user document\n');

    // Assemble raw inputs (same as production)
    const wants = data?.wants || [];
    const allWants = wants.map(w => w.text);
    const wantsString = allWants.length > 0 ? allWants.join(', ') : 'None specified';

    const dreamLiving = data?.dream_living || 'Not specified';
    const dreamFinancial = data?.dream_financial || 'Not specified';

    const unifiedPeople = data?.people || [];
    const peopleString = unifiedPeople.length > 0
        ? unifiedPeople.map(p =>
            `Name: ${p.name}\nRelationship: ${p.relationship}\nWho: ${p.who || 'N/A'}\nDynamic: ${p.dynamic || 'N/A'}`
        ).join('\n\n')
        : 'None';

    const physicalTraits = [];
    if (data.gender) physicalTraits.push(data.gender);
    if (data.birthdate) {
        const age = computeAge(data.birthdate);
        if (age !== null) physicalTraits.push(`${age} years old`);
    }
    if (data.skin_tone) physicalTraits.push(`skin tone: ${data.skin_tone}`);
    if (data.hair_colors?.length) physicalTraits.push(`hair: ${data.hair_colors.join('/')}`);
    if (data.hair_texture) physicalTraits.push(`hair texture: ${data.hair_texture}`);
    if (data.eye_color) physicalTraits.push(`eyes: ${data.eye_color}`);
    if (data.height) physicalTraits.push(`height: ${data.height}`);
    if (data.ethnicity) physicalTraits.push(`ethnicity: ${data.ethnicity}`);
    const physicalTraitsString = physicalTraits.length > 0 ? physicalTraits.join(', ') : 'Not specified';

    // Show raw inputs
    console.log('2️⃣  Raw inputs:');
    console.log(`   Wants: ${wantsString}`);
    console.log(`   Dream Living: ${dreamLiving}`);
    console.log(`   Dream Financial: ${dreamFinancial}`);
    console.log(`   Physical: ${physicalTraitsString}`);
    console.log(`   People: ${unifiedPeople.length} person(s)\n`);

    // Assemble Phase 1 prompt
    const phase1Prompt = PHASE1_USER_PROMPT
        .replace('{WANTS}', wantsString)
        .replace('{DREAM_LIVING}', dreamLiving)
        .replace('{DREAM_FINANCIAL}', dreamFinancial)
        .replace('{PHYSICAL_TRAITS}', physicalTraitsString)
        .replace('{IMPORTANT_PEOPLE}', peopleString);

    // Run Phase 1
    console.log('3️⃣  Running Phase 1 (Fact Compiler)...\n');
    const startTime = Date.now();

    const result = await generateObject({
        model: anthropic(MODEL_ID),
        system: PHASE1_SYSTEM_PROMPT,
        prompt: phase1Prompt,
        schema: PHASE1_SCHEMA,
        maxTokens: 2000,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const phase1 = result.object;

    // Print results
    console.log(`━━━ Phase 1 Output (${elapsed}s) ━━━\n`);

    console.log('📍 LIVING SITUATION:');
    console.log(`   ${phase1.living_situation}\n`);

    console.log('💰 FINANCIAL REALITY:');
    console.log(`   ${phase1.financial_reality}\n`);

    console.log('🏋️ PHYSICAL PROFILE:');
    console.log(`   ${phase1.physical_profile}\n`);

    console.log('📋 CHARACTER FACTS:');
    console.log(`   ${phase1.character_facts}\n`);

    console.log(`👥 PEOPLE (${phase1.people.length}):`);
    for (const p of phase1.people) {
        console.log(`   ${p.name} (${p.relationship}): ${p.description}`);
    }
    console.log('');

    // Token usage
    if (result.usage) {
        console.log(`📊 Tokens: ${result.usage.promptTokens} in → ${result.usage.completionTokens} out`);
    }
}

main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});
