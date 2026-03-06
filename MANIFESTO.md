# Project Overview: Earnest Page

## 1. Core Vision: "Mainstream Social Media for Self-Actualization"
**Earnest Page is designed to feel like Instagram or TikTok, but built to function like a Character Editor for Reality.**
*   **The Aesthetic:** "Mainstream Social" UI/UX. It uses the familiar visual language of top-tier apps (Insta/TikTok/Twitter) to ensure immediate adoption and intuitive use.
*   **The Hook:** It leverages the same powerful dopamine loops and frictionless interactions of addictive social media, but redirects them toward **Self-Correction** and **Growth** rather than distraction.
*   **The Ethical North Star:** Our metric for success is NOT "Time on App," but "User Empowerment." We win when the user feels happier, stronger, and more capable *offline*.

## 2. Visual Aesthetic (Strict Adherence)
**North Star:** "Premium Native Mobile Social."
**Design Philosophy:** "Radical Familiarity" — the app must look indistinguishable from Instagram, X (Twitter), or TikTok.
*   **Color Palette:** Monochromatic. Deep blacks (`bg-black`, `bg-zinc-950`), zinc grays for surfaces, `text-zinc-100` through `text-zinc-500` for hierarchy. **No accent colors** — no emerald, no blue, no brand color. High-contrast white on black is the only accent.
*   **Surfaces:** Thin borders (`border-white/10`), not heavy background fills. Cards separated by subtle lines.
*   **Typography:** Sans-serif (Inter/System), bold, tight tracking. `uppercase tracking-widest` for labels. 16px base.
*   **Interactions:** Pill buttons (`rounded-full`), snappy 150-200ms transitions. No sci-fi, no dashboards, no cinematic hero sections.

### Copywriting & Brand Voice: "Executive Dossier"
The app functions as a "Character Editor," but the UI uses commanding, professional language — not therapy or developer jargon.

| **BANNED Terms** | **REQUIRED Terms** |
| :--- | :--- |
| `Code` / `Source Code` | **Values** / **Beliefs** / **Compass** |
| `OS` / `Operating System` | **Core Self** / **Foundation** |
| `Glitch` / `Bug` / `Error` | **Tension** / **Block** / **Signal** |
| `Repair` / `Debug` / `Fix` | **Recast** / **Shift** / **Resolve** |
| `Protocol` / `Algorithm` | **Practice** / **Habit** / **Ritual** |
| `Coach` / `Mentor` / `Life Coach` | **Advisor** / **Partner** / **Analyst** |

## 3. Conceptual Function (The Logic Only)
**Metaphor:** "Character Editor."
*   **Note:** This is purely how the *backend and data* function. The user is "editing their character" (Data), but the UI remains a standard social feed (View).
*   **The Magic:** The "gameplay" is in the text/content, not the buttons.

## 4. The Mechanics (The Toolkit)

### A. Mirror Chat (The Primary Interaction)
The conversational AI interface. Users talk to a simulation of their "Ideal Self" — a character built from their Character Bible.
*   **How it works:** User opens chat via the floating action button → converses with their character → optionally generates a plan → closes chat → system processes it.
*   **Session Modes:** Four engagement tones that control how the AI responds:
    *   **Unfiltered** — Direct, blunt, rejects excuses.
    *   **Strategic Advisor** — Calculated, asks questions first, maps the path forward.
    *   **Tactical Partner** — Speaks as an equal, architects solutions alongside you.
    *   **The Analyst** — Forces clarity by answering questions with questions.
*   **Auto-Publish Toggle:** Users can choose to make the conversation into a public post or keep it private.
*   **Plan Generation:** "Give Me A Plan" button extracts 3-7 actionable directives from the conversation and saves them to the user's `active_todos`.

### B. The Character Bible (The Config File)
The core profile. Stored at `users/{uid}`. It holds the user's "Source Code":
*   **Identity:** Title (archetype), Vision (dream_self), Gender, Age, Key People, What You Love.
*   **Dossier:** AI-maintained consultant-style client file. Updated after every chat session. Contains Profile, Key People, Active Goals, Preferences & Style. Capped at 1200 words.
*   **Compiled Output:** AI-generated character sections and avatar, compiled from the source identity.

### C. The Social Feed ("Dear Earnest" Column)
An anonymous advice column powered by real conversations.
*   **Post Creation:** When a Mirror Chat is closed, a cron job synthesizes the conversation into an anonymous "Dear [Archetype]" post with an AI-generated hero image (via Google Imagen).
*   **Feed Structure:** Chronological (newest first). Three buckets merged: user's own posts, subscribed authors' posts, and new public posts!
*   **Feed Caching:** Module-level in-memory cache prevents re-fetching when navigating between tabs.
*   **Native Ads:** Ecosystem partner ads are interspersed every 3 posts.
*   **Post Features:** Like (anonymous karma system), AI-generated comments, follow authors, delete/toggle privacy on own posts.

### D. Action Directives & Todos (My Daily Plan)
*   **Source:** Generated from Mirror Chat via the "Give Me A Plan" button.
*   **Display:** Bell icon in header shows badge count. Slide-over panel shows checkable todo list.
*   **Storage:** `active_todos` array on the user document, each with `id`, `task`, `completed`, `created_at`.

### E. Active Mission (Header Bar)
*   **Source:** `directives` Firestore collection. Displays currently active directive in the header sub-bar.
*   **Actions:** "REPORT" to submit completion, "SKIP" to cycle through directives.

## 5. Privacy, Anonymity, and Globalization

### A. The "Raw vs. Public" Architecture
Every post has two distinct versions:
1.  **Raw Version (Private):** The actual chat transcript. Contains specific details, names, situations. **NEVER returned to anyone but the author.** Stored as `content_raw`.
2.  **Public Version (Ghost-Written):** AI-synthesized "Dear [Archetype]" letter and response. Anonymized with pseudonyms. Stored as `public_post` with `title`, `pseudonym`, `letter`, `response`.

### B. Likes & Social Metrics
*   **No vanity metrics.** We never display like counts, follower counts, or engagement numbers.
*   **Like state is private.** A user can only see whether *they* have liked a post.

## 6. Technical Architecture
**Stack:**
*   **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS (v4).
*   **UX Pattern:** Content-first feeds, mobile-first design, bottom tab navigation.
*   **Backend:** Firebase (Firestore, Admin SDK). Deployed on Vercel.
*   **AI:**
    *   **Primary:** Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) via Vercel AI SDK — powers Ghost-Writing, Mirror Chat, Plan Generation, Dossier Updates.
    *   **Heavy Reasoning:** Anthropic Claude Opus 4.6 (`claude-opus-4-6`) — used for Mirror Chat conversations.
    *   **Image Generation:** Google Imagen 4.0 — generates hero images for posts.
    *   **Fallback Chain:** Primary model → stable fallback (e.g., Sonnet 4.5) → Gemini 3.1 Pro.

**Data Model:**
*   **`users/{userId}`:** The user document containing `character_bible`, `identity`, `active_todos`, and profile data.
*   **`users/{userId}/active_chats/{sessionId}`:** Live Mirror Chat sessions.
*   **`posts/{postId}`:** Published posts with public/private content, images, likes, comments.
*   **`posts/{postId}/comments/{commentId}`:** AI-generated and personal comments.
*   **`directives/{directiveId}`:** Standalone action directives (Active Mission system).

**Cron Jobs:**
*   **`/api/cron/cleanup-chats`** — Runs every 15 minutes. Processes closed or abandoned chat sessions: generates "Dear Earnest" post, updates user dossier, then deletes the chat.

## 7. Current Implementation Status
*   **Active Core Loop:** Mirror Chat → Plan Generation → Social Post → Dossier Update.
*   **Active Modules:**
    *   **Mirror Chat:** Fully active with 4 session modes, plan generation, auto-publish toggle.
    *   **The Social Feed:** Chronological feed with cached posts, native ads, AI comments, follow system.
    *   **Character Bible:** Identity editing, AI-compiled character sections, avatar generation.
    *   **Dossier System:** Auto-maintained by the cleanup cron after each session.
    *   **Directives:** Bell icon todo list (My Daily Plan) + Active Mission header bar.
*   **Removed Features:** Check-In Engine (replaced by Mirror Chat), Signal/News cron, Telemetry.

## 8. File Map & Agent Quickstart

### How to Run
```bash
npm run dev   # starts Next.js dev server on http://localhost:3000
```
**Required env vars** (in `.env.local`): `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`.

### Key Directories
| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router pages (`page.tsx`, `profile/`, `my-posts/`, `vision/`, `login/`) |
| `src/app/api/` | Server-side API routes |
| `src/components/` | All React components |
| `src/lib/firebase/` | Firebase config (`config.ts` client, `admin.ts` server), `posts.ts`, `chat.ts`, `character.ts` |
| `src/lib/auth/` | `AuthContext.tsx` (React auth provider) |
| `src/lib/ai/` | AI model config (`models.ts`), engagement tones (`engagementTones.ts`) |
| `src/lib/` | Utilities (`feedCache.ts`, `utils/`) |
| `src/types/` | TypeScript type definitions (`character.ts`, `chat.ts`) |
| `src/config/` | App configuration (`ecosystem.ts` — native ad definitions) |
| `.agents/workflows/` | AI agent workflows (`design-system.md`, `git-rules.md`) |

### API Routes
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/mirror` | POST | Send message to Mirror Chat AI |
| `/api/mirror/plan` | POST | Generate action plan from chat session |
| `/api/onboarding/process` | POST | Process onboarding rant into identity |
| `/api/character/compile` | POST | Compile character bible from source code |
| `/api/character/avatar` | POST | Generate character avatar |
| `/api/dossier/update` | POST | Update user dossier |
| `/api/posts/feed` | GET | Fetch chronological feed |
| `/api/posts/mine` | GET | Fetch user's own posts |
| `/api/posts/like` | POST | Anonymous karma like |
| `/api/posts/comment` | POST/GET | AI comment generation |
| `/api/posts/comments` | GET | Fetch comments for a post |
| `/api/upload` | POST | File upload to Firebase Storage |
| `/api/user/region` | POST | Set user region |
| `/api/cron/cleanup-chats` | GET | Cron: process closed chats → posts + dossier |

### Critical Component Files
| File | What it does |
|------|-------------|
| `src/app/page.tsx` | Main page — landing (unauth), onboarding, or dashboard (auth) |
| `src/components/Ledger.tsx` | The feed — fetches, caches, and renders posts |
| `src/components/FeedPostCard.tsx` | Individual post card with public/private flip |
| `src/components/MirrorChat.tsx` | Conversational AI interface with mode selector |
| `src/components/TriagePanel.tsx` | Bottom navigation bar + Mirror Chat FAB |
| `src/components/ProfileView.tsx` | Character profile with accordion bible sections |
| `src/components/DirectivesMenu.tsx` | "My Daily Plan" slide-over todo panel |
| `src/components/ActiveMission.tsx` | Header sub-bar showing current directive |
| `src/components/DashboardHeader.tsx` | Top nav with bell icon + hamburger menu |
| `src/components/Onboarding.tsx` | New user onboarding flow |
| `src/components/DossierView.tsx` | Full dossier viewer modal |
| `src/components/IdentityModal.tsx` | Quick identity edit modal |
| `src/lib/ai/models.ts` | AI model definitions and fallback logic |
| `src/lib/ai/engagementTones.ts` | Chat mode definitions (Unfiltered, Strategic Advisor, etc.) |
| `src/lib/feedCache.ts` | Module-level in-memory feed cache |
| `src/lib/firebase/admin.ts` | Firebase Admin SDK (server-side Firestore + Storage) |
| `src/lib/firebase/character.ts` | Character bible CRUD + real-time subscriptions |
| `src/app/api/cron/cleanup-chats/route.ts` | Cron: synthesizes posts, generates images, updates dossiers |