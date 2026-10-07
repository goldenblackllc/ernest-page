---
description: design system and brand voice rules for all UI work
---
# Antigravity Design System & Brand Voice: Earnest Page

## 1. Core Visual Philosophy: "Radical Familiarity"
**The North Star:** The app must look and feel indistinguishable from Tier-1 social apps (Instagram, X, Threads).
**The vibe:** "Invisible UI." The interface is a vessel for content, not a decorative element.

### Visual Rules (Tailwind CSS v4)
*   **Layout:** Mobile-first, single-column feeds. Edge-to-edge content where possible.
*   **Typography:**
    *   **Headings:** HK Grotesk (sans-serif), bold, tight tracking. No monospace/terminal fonts for headers.
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

Avoid developer and machine words in the UI: code, source code, operating system, glitch, bug, error, repair, debug, fix, protocol, algorithm, and code-style decoration such as `// REPAIR`.

## 3. Component Standards
*   **The Feed Card:**
    *   A 16:9 video-style card: the post's images with narrated audio and word-by-word subtitles.
    *   Header overlay: Avatar + Name + Time.
    *   Footer: Like, Comments, Restart, Text view, Share. Authors also get the original chat, delete, and video download.
*   **The Profile:**
    *   Standard profile layout. Avatar, character name and title.
    *   Tabs: "About", "Posts", "Liked".
*   **The Mirror Chat Input:**
    *   Feels like a messaging app composer. Minimalist. Large text input. Focus on the thought.

## 4. Accessibility & Polish
*   Touch targets must be at least 44px.
*   Contrast ratios must meet AA standards (light gray text on black background, not dark gray on black).
