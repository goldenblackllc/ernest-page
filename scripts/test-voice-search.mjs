#!/usr/bin/env node
/**
 * Focused test: What is the ElevenLabs website actually filtering by?
 * 
 * The user's expected top 5 (exact order): Mark, Adam, Finn, Hale, Jerry
 * Our API returns extras: Alex, Titan, Josh, Ryan Kurk mixed in.
 * 
 * Hypothesis tests:
 * 1. Maybe the website filters by category=high_quality or professional?
 * 2. Maybe there's a "featured" or "verified" flag?
 * 3. Maybe the website uses a different endpoint entirely?
 * 4. Maybe we need to look at voice metadata more carefully
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) { console.error('❌ ELEVENLABS_API_KEY not set'); process.exit(1); }

const EXPECTED = ['Mark', 'Adam', 'Finn', 'Hale', 'Jerry'];

async function fetchVoices(label, params) {
    const url = `https://api.elevenlabs.io/v1/shared-voices?${new URLSearchParams(params)}`;
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🔍 ${label}`);
    console.log(`   ${url}`);
    
    const res = await fetch(url, { headers: { 'xi-api-key': API_KEY } });
    if (!res.ok) {
        const body = await res.text();
        console.log(`   ❌ HTTP ${res.status}: ${body.slice(0, 200)}`);
        return [];
    }
    
    const data = await res.json();
    const voices = data.voices || [];
    console.log(`   Results: ${voices.length}\n`);
    
    voices.slice(0, 10).forEach((v, i) => {
        const match = EXPECTED.some(n => v.name?.toLowerCase().startsWith(n.toLowerCase()));
        const flag = match ? ' ✅' : ' ❌';
        // Print ALL available fields to find what's different
        const keys = Object.keys(v).filter(k => !['samples', 'preview_url'].includes(k));
        console.log(`   ${(i+1).toString().padStart(2)}. ${v.name}${flag}`);
        console.log(`       voice_id: ${v.voice_id}`);
        console.log(`       category: ${v.category}`);
        console.log(`       use_cases: ${JSON.stringify(v.use_cases)}`);
        console.log(`       labels: ${JSON.stringify(v.labels)}`);
        console.log(`       cloned_by_count: ${v.cloned_by_count?.toLocaleString()}`);
        console.log(`       usage_character_count_1y: ${v.usage_character_count_1y?.toLocaleString()}`);
        // Print any other fields we haven't seen
        const shown = new Set(['name','voice_id','category','use_cases','labels','cloned_by_count','usage_character_count_1y','preview_url','samples']);
        for (const k of keys) {
            if (!shown.has(k)) console.log(`       ${k}: ${JSON.stringify(v[k])}`);
        }
    });
    
    return voices;
}

async function main() {
    console.log('ElevenLabs Voice Search — Detailed Comparison');
    console.log(`Expected top 5 (exact order): ${EXPECTED.join(', ')}\n`);

    // Test A: Our best match so far — no use_cases, cloned_by_count
    // Shows all metadata to find distinguishing patterns
    const voices = await fetchVoices('BEST SO FAR: no use_cases, sort=cloned_by_count', {
        page_size: '20',
        language: 'en',
        sort: 'cloned_by_count',
        gender: 'male',
        age: 'young',
        accent: 'american',
    });

    // Analyze: what differs between expected and unexpected voices?
    console.log(`\n${'═'.repeat(70)}`);
    console.log('ANALYSIS: Expected vs Unexpected voices\n');
    const expected = voices.filter(v => EXPECTED.some(n => v.name?.toLowerCase().startsWith(n.toLowerCase())));
    const unexpected = voices.filter(v => !EXPECTED.some(n => v.name?.toLowerCase().startsWith(n.toLowerCase())));
    
    console.log('Expected voices categories:', expected.map(v => `${v.name}: ${v.category}`).join(', '));
    console.log('Unexpected voices categories:', unexpected.map(v => `${v.name}: ${v.category}`).join(', '));
    
    const expectedUseCases = expected.map(v => `${v.name}: ${JSON.stringify(v.use_cases)}`);
    const unexpectedUseCases = unexpected.map(v => `${v.name}: ${JSON.stringify(v.use_cases)}`);
    console.log('\nExpected use_cases:', expectedUseCases.join(', '));
    console.log('Unexpected use_cases:', unexpectedUseCases.join(', '));

    // Test B: Try with category=professional
    await fetchVoices('category=professional, sort=cloned_by_count', {
        page_size: '10',
        language: 'en',
        sort: 'cloned_by_count',
        category: 'professional',
        gender: 'male',
        age: 'young',
        accent: 'american',
    });

    // Test C: Try with category=high_quality  
    await fetchVoices('category=high_quality, sort=cloned_by_count', {
        page_size: '10',
        language: 'en',
        sort: 'cloned_by_count',
        category: 'high_quality',
        gender: 'male',
        age: 'young',
        accent: 'american',
    });

    // Test D: Try the /v1/voices endpoint (your own + shared library)
    // This is a different endpoint — maybe the website uses this one?
    console.log(`\n${'═'.repeat(70)}`);
    console.log('🔍 ALTERNATIVE ENDPOINT: /v1/voices (library voices)');
    const altRes = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': API_KEY },
    });
    if (altRes.ok) {
        const altData = await altRes.json();
        const allVoices = altData.voices || [];
        const youngMaleAmerican = allVoices.filter(v => {
            const l = v.labels || {};
            return l.gender === 'male' && l.age === 'young' && l.accent === 'american';
        });
        console.log(`   Total voices: ${allVoices.length}, Young male american: ${youngMaleAmerican.length}`);
        youngMaleAmerican.forEach((v, i) => {
            const match = EXPECTED.some(n => v.name?.toLowerCase().startsWith(n.toLowerCase()));
            console.log(`   ${(i+1).toString().padStart(2)}. ${v.name} (${v.voice_id}) — category: ${v.category}${match ? ' ✅' : ''}`);
        });
    }
}

main().catch(console.error);
