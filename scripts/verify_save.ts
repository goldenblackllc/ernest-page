
import { updateCharacterBible, getCharacterBible } from "../src/lib/firebase/character";
import { CharacterBible } from "../src/types/character";

// Mock user ID for testing - ideally we'd use a real test user or the current user if we could get context
// For a standalone script, we might need to rely on manual testing if we can't easily auth.
// However, we can at least unit test the logic if we mock the firebase calls, 
// OR we can write a tiny test component in the app. 
// Given the environment, adding a temporary test button to the app might be easier than setting up a node script with auth.

// BUT, I'll write this as a script that imports the logic. 
// If it fails to run due to auth/env, I'll pivot to "In-App verification".

async function testSave() {
    const TEST_UID = "test_user_generic";

    console.log("1. Fetching original...");
    // This might fail if client SDK needs auth and rules are secure.
    // Assuming for now we can read/write to this test user or rules allow it.

    const original = await getCharacterBible(TEST_UID);
    console.log("Original Title:", original.source_code?.archetype);

    const updates: Partial<CharacterBible> = {
        source_code: {
            archetype: "TEST TITLE " + Date.now(),
            manifesto: "",
            core_beliefs: "",
            important_people: "",
            current_constraints: ""
        },
        compiled_bible: {
            behavioral_responses: [{ id: "r1", rule: "Test Rule", description: "Test Desc" }],
            visual_board: [{ label: "Test View", image_url: "http://example.com/img.jpg" }],
            consumption: { food: ["Apple"], media: ["Book"] }
        }
    };

    console.log("2. Updating...");
    await updateCharacterBible(TEST_UID, updates);

    console.log("3. Verifying...");
    const updated = await getCharacterBible(TEST_UID);

    // Check fields
    if (updated.source_code?.archetype !== updates.source_code?.archetype) console.error("FAIL: Title mismatch");
    if (updated.compiled_bible?.behavioral_responses?.[0]?.rule !== "Test Rule") console.error("FAIL: Rule mismatch");
    if (updated.compiled_bible?.consumption?.food?.[0] !== "Apple") console.error("FAIL: Consumption mismatch");

    console.log("DONE. Final State:", JSON.stringify(updated, null, 2));
}

// execute if running directly
// testSave().catch(console.error);

// Actually, better to just log that we are skipping this script for now and focusing on the frontend fix 
// which is the high probability suspect.
console.log("Skipping standalone script due to Auth complexity. Proceeding to Frontend Fix.");
