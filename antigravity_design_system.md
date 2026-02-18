# Antigravity Design System & Brand Voice: Earnest Page

## 1. Core Visual Philosophy: "Radical Familiarity"
**The North Star:** The app must look and feel indistinguishable from Tier-1 social apps (Instagram, X, Threads).
**The vibe:** "Invisible UI." The interface is a vessel for content, not a decorative element.

### Visual Rules (Tailwind CSS v4)
*   **Layout:** Mobile-first, single-column feeds. Edge-to-edge content where possible.
*   **Typography:**
    *   **Headings:** Sans-serif, bold, tight tracking (Inter or System UI). No monospace/terminal fonts for headers.
    *   **Body:** High legibility, standard leading (relaxed).
    *   **Sizing:** 16px base size. Avoid tiny "dashboard" text.
*   **Colors & Surfaces:**
    *   **Background:** Deep Black (`bg-black`) or very dark Zinc (`bg-zinc-950`).
    *   **Cards:** Subtle separation. Use thin borders (`border-white/10`) rather than heavy background colors.
    *   **Glass:** Use `backdrop-blur-md` sparingly for overlays (nav bars, modals), not for everything.
*   **Interactions:**
    *   Buttons: Pill-shaped (`rounded-full`) or soft rectangles (`rounded-xl`).
    *   Animations: Snappy (150ms-200ms ease-out). No "sci-fi" scanning effects.

## 2. Copywriting & Metaphor Shift (Strict Enforcement)
The app functions as a "Character Editor," but we DO NOT use "Developer/Machine" language in the UI.

| **BANNED (Developer/Machine Terms)** | **REQUIRED (Human/Growth Terms)** |
| :--- | :--- |
| `Code` / `Source Code` | **Values** / **Beliefs** / **Compass** |
| `OS` / `Operating System` | **Core Self** / **Foundation** |
| `Glitch` / `Bug` / `Error` | **Tension** / **Block** / **Signal** |
| `Repair` / `Debug` / `Fix` | **Recast** / **Shift** / **Resolve** |
| `Protocol` / `Algorithm` | **Practice** / **Habit** / **Ritual** |
| `// REPAIR` (Syntax decoration) | **Recast** (Clean text) |

## 3. Component Standards
*   **The Feed Card:**
    *   Looks like a Tweet or Insta post.
    *   Header: Avatar + Name + Time.
    *   Body: The Content.
    *   Footer: Action interactions (Recast, Align, Share).
*   **The "Character Bible" (Profile):**
    *   Standard "Profile" layout. Avatar centered or left. Stats (Actions Taken, Recasts).
    *   Tabs: "Posts", "Values" (was Code), "Vision" (was Visual Board).
*   **The Input (Recast Engine):**
    *   Feels like "Compose Tweet" or "Create Story."
    *   Minimalist. Large text input. Focus on the thought.

## 4. Accessibility & Polish
*   Touch targets must be at least 44px.
*   Contrast ratios must meet AA standards (light gray text on black background, not dark gray on black).