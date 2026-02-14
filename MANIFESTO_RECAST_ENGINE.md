# PROJECT MANIFESTO: THE RECAST ENGINE (Problem Solving Wizard)
**Version:** 2.0 (The "Identity Architect" Update)
**Date:** February 2026

## 1. CORE PHILOSOPHY
**The Distinction:**
We are not building a "Chatbot" or a "Digital Therapist." We are building a **Character Editor for Reality.**
*   **Standard AI:** Solves the symptom (e.g., "Here is how to budget").
*   **This App:** Solves the Source Code (e.g., "You are playing a 'Scarcity Character'. Here is how a 'Wealthy Character' handles this bill.").

**The Logic:**
Problems are not external errors; they are **Feedback Signals** indicating that the user's current "Character Build" (Beliefs/Rules) is incompatible with their desires.
*   **The Goal:** We do not fix the problem. We use the problem to define the **Ideal Character**, then install the software (Thoughts/Rules) required to *be* that character.

---

## 2. THE LOGIC FLOW (The 5-Step Protocol)

### Step 1: The Input (The Rant)
*   **User Action:** Vents raw emotion and situational details.
*   **UX Rule:** Minimum character count (40-50 chars) required to ensure sufficient data.
*   **Internal Triage (Mental Note):** Is this a structural problem (Money/Relationships) or a "Symbolic Death" (Burnout/Transition)? *Current V1 focuses on Structural Problems.*

### Step 2: The Diagnosis (Core Beliefs)
*   **The Challenge:** Users speak in metaphors ("I feel dead") or symptoms ("I am tired").
*   **The Logic:** We use a **Classification Model**, not a Generative Model.
*   **The Master Shadow Menu:** The AI *must* select 3-5 beliefs from this fixed list:
    1.  I am Powerless.
    2.  I am Restricted.
    3.  I am Not Enough.
    4.  I am Unsafe.
    5.  I am Disconnected.
    6.  Life is Hard.
    7.  Life is Scarce.
    8.  Life is Dangerous.
    9.  Life is Unfair.
    10. Life is Joyless.
*   **The Filter:** The AI must ignore physical states (hungry, tired) and decode metaphors ("I am dying" -> "I am Powerless").

### Step 3: The Shift (Identity Pivot)
*   **The Visual:** A side-by-side comparison.
*   **Left Column (Red):** "CURRENT YOU" (The selected Negative Shadows).
*   **Right Column (Green):** "IDEAL YOU" (The Grammatical Positive Opposites).
    *   *Example:* "I am Restricted" -> "I am Resourceful / Free."

### Step 4: The Reframe (New Mindset)
*   **The Goal:** Simulate how the **Ideal Character** would perceive the **Specific Rant**.
*   **The Logic (The Triad):**
    1.  **Input:** The Rant (Context).
    2.  **Lens:** The New Beliefs (The Mindset).
    3.  **Persona:** The Character Bible (The Values/Habits).
*   **Crucial Rule: "The Reality Bridge"**
    *   The AI must acknowledge the *gap* between the Mindset and the Reality.
    *   *Example:* If the user is broke but wants to be an Investor, do NOT suggest spending money. Suggest *resourcefulness*. Ask: "How would a Rich Person handle *being broke* today?"

### Step 5: The Execution (Strategy Selection)
*   **The Goal:** Executable protocols, not motivation.
*   **The Format:** **Imperative Commands.**
    *   *Bad:* "Abundance Activator."
    *   *Good:* "Check Bank Balance Daily."
*   **The User Agency:**
    *   Titles must be short (Verb-led).
    *   Content must be **Editable** by the user. Editing creates ownership.
    *   "Regenerate" allows the user to reroll options they dislike.

### Step 6: The Commit (Finish & Post)
*   **Action:** User clicks "FINISH & POST."
*   **Database Operation (Batch):**
    1.  **Create Post:** Saves the Rant, Beliefs, and Strategies to the feed.
    2.  **Update Character Bible:** Merges the *New Beliefs* and *Strategies* into the user's permanent profile (`users/{userId}/character_bible`).

---

## 3. TECHNICAL ARCHITECTURE

**The Data Structure (The Character Bible)**
Stored at `users/{userId}/character_bible`.
*   `core_beliefs`: String array (Merged over time).
*   `rules`: Object array `{title, description}`.
*   `visual_board`: Image URLs.
*   `role_models`, `habits`, `goals`, etc.

**The Wizard Engine (`useProblemWizard`)**
*   **State Management:** Preserves `rant`, `selectedBeliefs`, `generatedStrategies` across navigation (Back/Next).
*   **Regeneration Logic:** Can regenerate *only* unselected items while keeping the selected ones.
*   **API Calls:** Each step calls a dedicated Server Action (`generateBeliefs`, `generateThoughts`, `generateRules`) that injects the full `CharacterBible` context.

---

## 4. PROMPT ENGINEERING RULES (The "Secret Sauce")

**Rule 1: No Hallucinations in Step 2.**
Strictly constrain Step 2 to the "Master Shadow Menu." Do not allow creative writing.

**Rule 2: The "Robot Test" in Step 5.**
If a robot cannot execute the instruction (e.g., "Be happy"), it is not a rule. It must be binary (e.g., "Smile for 30 seconds").

**Rule 3: The "Reality Bridge" in Step 4/5.**
Always check the Rant for constraints (Money/Time). Do not give delusional advice. Give aspirational advice rooted in current constraints.