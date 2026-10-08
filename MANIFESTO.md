# Project Overview: Earnest Page

## 1. Core Vision: "Mainstream Social Media for Self-Actualization"
**Earnest Page is designed to feel like Instagram or TikTok, but built to function like a Character Editor for Reality.**
*   **The Aesthetic:** "Mainstream Social" UI/UX. It uses the familiar visual language of top-tier apps (Insta/TikTok/Twitter) to ensure immediate adoption and intuitive use.
*   **The Hook:** It leverages the same powerful dopamine loops and frictionless interactions of addictive social media, but redirects them toward **Self-Correction** and **Growth** rather than distraction.
*   **The Ethical North Star:** Our metric for success is NOT "Time on App," but "User Empowerment." We win when the user feels happier, stronger, and more capable *offline*.

## 2. The Philosophical Engine: Reality Rules
The AI does not improvise a worldview. It operates within a strict set of 24 "Universal Laws of Reality" — the physics engine of the character simulation. These rules govern every AI response across Mirror Chat, Ghost-Writing, and Plan Generation.

**Key principles:**
*   All feelings come from beliefs, never from external circumstances. The world provides circumstances; the character provides the meaning.
*   Feelings are messages from a higher self — negative feelings indicate a disempowering belief; positive feelings and excitement mean the character is on the right path.
*   In any given moment, pick the most exciting available choice that can be acted on with integrity. Follow it as far as possible. Surprises happen.
*   Fear is 100% trust in a negative outcome. Frustration is focus on what's unavailable rather than what is. Anger beyond a few seconds becomes self-invalidation.
*   All truths are true for the character who believes them. Two characters can hold opposing truths and both be correct.
*   A character does not think its way into a new feeling; it acts its way there.

**Core Characteristics (every character has these):** Free, secure, powerful, enjoys being alive, unconditionally loved, creates their reality, abundant.

The Reality Rules live in `functions/src/lib/constants/realityRules.ts` (the Mirror and bible compile both run on Cloud Functions).

## 3. Visual Aesthetic (Strict Adherence)
**North Star:** "Premium Native Mobile Social."
**Design Philosophy:** "Radical Familiarity" — the app must look indistinguishable from Instagram, X (Twitter), or TikTok.
*   **Color Palette:** Monochromatic. Deep blacks (`bg-black`, `bg-zinc-950`), zinc grays for surfaces, `text-zinc-100` through `text-zinc-500` for hierarchy. No brand color. Accents are used only to carry meaning: amber for the spoken subtitle word, warnings and the My Life editors; emerald for confirmations, live indicators and following.
*   **Surfaces:** Thin borders (`border-white/10`), not heavy background fills. Cards separated by subtle lines.
*   **Typography:** HK Grotesk (sans-serif), bold, tight tracking. `uppercase tracking-widest` for labels. 16px base.
*   **Interactions:** Pill buttons (`rounded-full`), snappy 150-200ms transitions. No sci-fi, no dashboards, no cinematic hero sections.

### Copywriting & Brand Voice: "Executive Dossier"
The app functions as a "Character Editor," but the UI uses commanding, professional language — not therapy or developer jargon.

Avoid developer and machine words in the UI (code, operating system, bug, debug, fix, protocol, algorithm) and coaching or therapy words (coach, mentor, life coach, therapy).

## 4. Conceptual Function (The Logic Only)
**Metaphor:** "Character Editor."
*   **Note:** This is purely how the *backend and data* function. The user is "editing their character" (Data), but the UI remains a standard social feed (View).
*   **The Magic:** The "gameplay" is in the text/content, not the buttons.

## 5. Authentication
**Phone-only authentication via Twilio Verify.** No emails, no passwords.
*   **Flow:** User enters a phone number on the Landing Page → `/api/auth/send-code` sends an OTP via Twilio (protected by a Cloudflare Turnstile check) → user enters the 6-digit code → `/api/auth/verify-code` validates it and returns a Firebase custom token → client signs in with `signInWithCustomToken`.
*   **Dial Code Detection:** The landing page detects the user's timezone and pre-fills the matching country dial code.
*   **Phone numbers live only in Firebase Auth.** Firestore and posts hold only a salted hash, used for matching.

## 6. The Mechanics (The Toolkit)

### A. Mirror Chat (The Primary Interaction)
The conversational AI interface. Users talk to a simulation of their "Ideal Self", a character built from their Character Bible.
*   **How it works:** User opens chat from the floating action button → converses with their character (replies come from the `mirrorReply` Cloud Function) → optionally generates a plan → closes chat → the `processChat` Cloud Function turns it into a post and updates the dossier.
*   **Session Routing:** Each session is set to Public feed, Private ledger, or Burn on close (deleted with no processing).
*   **Plan Generation:** "Give Me A Plan" extracts 3-7 actionable directives from the conversation and saves them to the user's `active_todos`.
*   **Session Limits:** Up to 5 sessions per day; each session is capped at 2 hours / 30 exchanges. Abandoned sessions are swept every 15 minutes.

### B. The Character Bible (The Config File)
The core profile, stored at `users/{uid}`.
*   **Identity:** Title (archetype), Vision (dream_self), Gender, Age, Key People, What You Love, Wants, Dream. People and interests are edited only by the user.
*   **Dossier:** AI-maintained file of present-tense facts, rewritten after every session. Stable facts plus clearly marked transient to-dos. No commentary or analysis of the user's beliefs.
*   **Compiled Output:** AI-generated character sections and avatar, compiled from the source identity by Cloud Functions (`buildCharacter`, rebuilt automatically after the user edits).

### C. The Social Feed ("Dear Earnest" Column)
An anonymous advice column powered by real conversations.
*   **Post Creation:** When a Mirror Chat closes, `processChat` synthesizes it into an anonymous "Dear [Archetype]" post. Images (one per message), narrated audio and a downloadable video are generated in the background; the post is published once its images and audio exist.
*   **Feed Structure:** Chronological (newest first), merging the user's own posts, followed authors' posts, and new public posts.
*   **Post Features:** Like (private, doubles as a bookmark; liked posts appear on the profile), AI-generated and personal comments, follow authors, delete or change the visibility of your own posts.

### D. Action Directives & Todos (My Daily Plan)
*   **Source:** Generated from Mirror Chat via the "Give Me A Plan" button.
*   **Display:** Bell icon in the header shows a badge count; a slide-over panel shows the checkable list.
*   **Storage:** `active_todos` array on the user document, each with `id`, `task`, `completed`, `created_at`.

### E. Daily Digest (Automated Reflection Card)
*   **Schedule:** The `dailyDigest` Cloud Function runs at 4:00 AM UTC for users active in the last day who have a compiled Character Bible, with retries at about 6 and 8 AM.
*   **Content:** A card built from a section of the user's Character Bible, with images and narration, saved to `users/{uid}.daily_digest` and shown in the feed.

### F. Support Chat
*   **Component:** Floating help button (bottom-right) opens a chat panel backed by `/api/support`.
*   **Rules:** 2-3 sentence responses. No markdown. Never describes Earnest Page as "AI-powered", a "language model" or a "chatbot"; uses "your Ideal Self" or "your character." Never exposes technical details. Redirects personal questions to Mirror Chat.
*   **Rate limited:** 10 messages per 5 minutes per user (or per IP when signed out).

## 7. Security & Privacy

### A. The "Raw vs. Public" Architecture
Every post has two versions:
1.  **Raw Version (Private):** The actual chat transcript, with specific details, names and situations. **Never returned to anyone but the author.** Stored as `content_raw`.
2.  **Public Version (Ghost-Written):** AI-synthesized "Dear [Archetype]" letter and response, anonymized with pseudonyms. Stored as `public_post`.

### B. Likes & Social Metrics
*   **No real popularity metrics.** Likes are anonymous karma: each like adds +1 to a random recent public post by someone else, so a post's like count is not a measure of its popularity. Follower counts are never shown. Comment counts are shown.
*   **Like state is private.** A user can only see whether *they* have liked a post.

### C. Security Vault
A security panel on the user profile for full account deletion.

## 8. Access Model

Earnest Page is **free** for all authenticated users.

| Limit | Value | Rationale |
|---|---|---|
| **Daily sessions** | 5 per day | Encourages users to do the real work between sessions |
| **Session length** | Up to 2 hours / 30 exchanges | Prevents open-ended resource consumption |

### Abuse Prevention
*   **Phone authentication:** One phone number = one account.
*   **AI intent constraint:** The Mirror Chat prompt restricts conversations to personal growth. It will not respond to coding requests or off-topic prompts.
*   **Rate limiting** on AI and auth endpoints.
*   **Acceptable Use Policy:** Prohibits bots, scrapers, and circumvention of platform features.

## 9. Admin & Reporting
*   **Daily Admin Report:** The `dailyReport` Cloud Function emails platform and funnel metrics to the admin at 8:00 AM UTC (Gmail via nodemailer).
*   **New post alerts:** `processChat` emails the admin when a post is created.

## 10. Technical Architecture
*   **Website:** Next.js (App Router), React, TypeScript, Tailwind CSS v4, next-intl (en, es, pt, fr, de). Hosted on Vercel.
*   **Background work:** Firebase Cloud Functions (Firestore triggers, schedules, task queues, callables).
*   **Data:** Firestore and Firebase Storage.
*   **Auth:** Twilio Verify (OTP) → Firebase custom tokens.
*   **AI:** Anthropic Claude for conversation and writing, Google Gemini for images, ElevenLabs for voices. Model ids are in `functions/src/lib/ai/models.ts`.

For the code layout, conventions and commands, see [CLAUDE.md](CLAUDE.md).
