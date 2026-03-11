# Project Overview: Earnest Page

## 1. Core Vision: "Mainstream Social Media for Self-Actualization"
**Earnest Page is designed to feel like Instagram or TikTok, but built to function like a Character Editor for Reality.**
*   **The Aesthetic:** "Mainstream Social" UI/UX. It uses the familiar visual language of top-tier apps (Insta/TikTok/Twitter) to ensure immediate adoption and intuitive use.
*   **The Hook:** It leverages the same powerful dopamine loops and frictionless interactions of addictive social media, but redirects them toward **Self-Correction** and **Growth** rather than distraction.
*   **The Ethical North Star:** Our metric for success is NOT "Time on App," but "User Empowerment." We win when the user feels happier, stronger, and more capable *offline*.

## 2. The Philosophical Engine: Reality Rules
The AI does not improvise a worldview. It operates within a strict set of 16 "Universal Laws of Reality" — the physics engine of the character simulation. These rules govern every AI response across Mirror Chat, Ghost-Writing, Monthly Reviews, and Plan Generation.

**Key principles:**
*   All feelings come from beliefs, never from external circumstances. The world provides circumstances; the character provides the meaning.
*   Feelings are messages from a higher self — negative feelings indicate a disempowering belief; positive feelings and excitement mean the character is on the right path.
*   In any given moment, pick the most exciting available choice that can be acted on with integrity. Follow it as far as possible. Surprises happen.
*   Fear is 100% trust in a negative outcome. Frustration is focus on what's unavailable rather than what is. Anger beyond a few seconds becomes self-invalidation.
*   All truths are true for the character who believes them. Two characters can hold opposing truths and both be correct.
*   A character does not think its way into a new feeling; it acts its way there.

**Core Characteristics (every character has these):** Free, secure, powerful, enjoys being alive, unconditionally loved, creates their reality, abundant.

**Master Belief System:** A curated library of 20 belief pairs (negative/positive) used for belief pattern tracking. Categories: Identity ("I am powerless" → "I am in complete control") and Reality ("Life is hard" → "I really enjoy being alive"). These map to the user's emotional patterns and are referenced in dossier updates and monthly reviews.

The Reality Rules and beliefs live in `src/lib/constants/realityRules.ts` and `src/lib/constants/beliefs.ts`.

## 3. Visual Aesthetic (Strict Adherence)
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

## 4. Conceptual Function (The Logic Only)
**Metaphor:** "Character Editor."
*   **Note:** This is purely how the *backend and data* function. The user is "editing their character" (Data), but the UI remains a standard social feed (View).
*   **The Magic:** The "gameplay" is in the text/content, not the buttons.

## 5. Authentication
**Phone-only authentication via Twilio Verify.** No emails, no passwords, no reCAPTCHA.
*   **Flow:** User enters phone number on the Landing Page → `/api/auth/send-code` sends an OTP via Twilio → user enters 6-digit code → `/api/auth/verify-code` validates it and returns a Firebase custom token → client signs in with `signInWithCustomToken`.
*   **Dial Code Detection:** The landing page auto-detects the user's timezone and pre-fills the appropriate country dial code.
*   **Region Sync:** On every login, the `AuthContext` silently calls `/api/user/region` to geo-tag the user's location (used for proximity-based post hiding).
*   **Phone numbers are not stored** in Firestore — only a salted hash for lookup.

## 6. The Mechanics (The Toolkit)

### A. Mirror Chat (The Primary Interaction)
The conversational AI interface. Users talk to a simulation of their "Ideal Self" — a character built from their Character Bible.
*   **How it works:** User opens chat via the floating action button → converses with their character → optionally generates a plan → closes chat → system processes it.
*   **Session Modes:** Four engagement tones that control how the AI responds:
    *   **Unfiltered** — Direct, blunt, rejects excuses. Cuts through self-deception immediately.
    *   **Strategic Advisor** (default) — Calculated, asks targeted questions first, maps the path forward with specific steps and reasoning.
    *   **Tactical Partner** — Speaks as an equal, architects solutions alongside you collaboratively. "What if we..." language.
    *   **The Analyst** — Forces clarity by answering questions with questions. Dissects assumptions. Only provides direct analysis after sustained questioning.
*   **Auto-Publish Toggle:** Users can choose to make the conversation into a public post or keep it private.
*   **Plan Generation:** "Give Me A Plan" button extracts 3-7 actionable directives from the conversation and saves them to the user's `active_todos`.

### B. The Character Bible (The Config File)
The core profile. Stored at `users/{uid}`. It holds the user's "Source Code":
*   **Identity:** Title (archetype), Vision (dream_self), Gender, Age, Key People, What You Love.
*   **Dossier:** AI-maintained consultant-style client file. Updated after every chat session. Contains Profile, Key People, Active Goals, Preferences & Style. Capped at 1200 words.
*   **Compiled Output:** AI-generated character sections and avatar, compiled from the source identity. Sections include Style & Presence, Daily Life & Habits, People & Connections, The Inner Mind, Quirks & Details, Order & Sanctuary.
*   **Belief Patterns:** Tracked across sessions using the Master Belief library. Records which negative beliefs surface and which positive replacements are adopted.

### C. The Social Feed ("Dear Earnest" Column)
An anonymous advice column powered by real conversations.
*   **Post Creation:** When a Mirror Chat is closed, a cron job synthesizes the conversation into an anonymous "Dear [Archetype]" post with an AI-generated hero image (via Google Imagen).
*   **Post Types:** Two types — standard "Dear Earnest" posts (from Mirror Chat) and "Reality Shift" dispatches (from directive completion reports).
*   **Feed Structure:** Chronological (newest first). Three buckets merged: user's own posts, subscribed authors' posts, and new public posts.
*   **Feed Caching:** Module-level in-memory cache prevents re-fetching when navigating between tabs.
*   **Native Ads:** Ecosystem partner ads are interspersed every 3 posts.
*   **Post Features:** Like (anonymous karma system / doubles as bookmark), AI-generated comments, follow authors, delete/toggle privacy on own posts.
*   **Saved Posts:** Liked posts are saved to the user's `liked_posts` array and viewable on a dedicated `/saved` page.

### D. Action Directives & Todos (My Daily Plan)
*   **Source:** Generated from Mirror Chat via the "Give Me A Plan" button.
*   **Display:** Bell icon in header shows badge count. Slide-over panel shows checkable todo list.
*   **Storage:** `active_todos` array on the user document, each with `id`, `task`, `completed`, `created_at`.

### E. Active Mission (Header Bar)
*   **Source:** `directives` Firestore collection. Displays currently active directive in the header sub-bar.
*   **Actions:** "REPORT" to submit completion (triggers Reality Shift post flow), "SKIP" to cycle through directives.

### F. Reality Shift Posts
When a user completes a directive and something unexpected happened as a result:
*   **Flow:** User reports unexpected outcome → AI scrubs all PII (names, locations, companies) → rewrites in first person → publishes as a `post_type: "reality_shift"` post.
*   **Purpose:** Creates a public record of "following excitement with integrity" producing unexpected results — demonstrating the Reality Rules in practice.
*   **Privacy:** Respects user's `default_post_routing` setting. AI anonymization ensures no personal details leak.

### G. Daily Digest (Automated Reflection Card)
*   **Cron:** Runs daily at 6:00 AM (`/api/cron/daily-digest`).
*   **How it works:** Picks a random category from the user's compiled Character Bible → generates an atmospheric Imagen hero image → saves a digest card (`daily_digest`) to the user document.
*   **Display:** Rendered as a `DigestCard` in the feed. Shows the category title, an excerpt of the character section, and the generated image.
*   **Eligibility:** Only active paid subscribers with a compiled Character Bible.

### H. Monthly Character Review
*   **Cron:** Runs on the 1st of each month at 9:00 AM (`/api/cron/monthly-review`).
*   **How it works:** Claude Opus writes a personal letter AS the user's Ideal Self character, reflecting on the past month. It references the dossier, belief patterns, and compiled character to write something specific — not generic.
*   **Format:** Flowing prose (no headers, no bullets). Signed by the character's archetype name. Max 400 words.
*   **Storage:** Appended to `identity.monthly_reviews[]` with `id`, `month`, `content`, `read`, `created_at`.
*   **Eligibility:** Users with 2+ sessions and a compiled bible. One review per calendar month.

### I. Support Chat
*   **Component:** Floating help button (bottom-right corner) opens a chat panel.
*   **Backend:** `/api/support` — AI-powered concierge that answers questions about subscriptions, features, privacy, and how the app works.
*   **Rules:** 2-3 sentence responses. No markdown. Never says "AI" — uses "your Ideal Self" or "your character." Never exposes technical details. Redirects personal questions to Mirror Chat.
*   **Rate limited:** 10 messages per 5 minutes per user (or per IP for unauthenticated users).

## 7. Security & Privacy

### A. The "Raw vs. Public" Architecture
Every post has two distinct versions:
1.  **Raw Version (Private):** The actual chat transcript. Contains specific details, names, situations. **NEVER returned to anyone but the author.** Stored as `content_raw`.
2.  **Public Version (Ghost-Written):** AI-synthesized "Dear [Archetype]" letter and response. Anonymized with pseudonyms. Stored as `public_post` with `title`, `pseudonym`, `letter`, `response`.

### B. Likes & Social Metrics
*   **No vanity metrics.** We never display like counts, follower counts, or engagement numbers.
*   **Like state is private.** A user can only see whether *they* have liked a post.

### C. Security Vault
A dedicated security panel accessible from the user profile:
*   **Account deletion** — Full account removal
*   **Contact Firewall** — Users can add "targets" (contacts to block/protect against) by name and phone number, or bulk import from contact files (CSV/VCF drag-and-drop). Hashed and stored server-side.
*   **Geolocation controls** — View/manage location settings

### D. Proximity Privacy
Posts from users near the reader's location are hidden by default. Geo-coordinates are stored on user documents (`home_lat`, `home_lng`) and on posts, enabling proximity-based filtering.

## 8. Monetization

### A. Subscription Tiers
Two plans, processed via **Stripe**:
*   **The Proving Ground** — 30-day subscription
*   **The Long Game** — Annual subscription
*   7-day refund window. After cancellation, access continues until the paid period ends.

### B. Payment Flow
*   **`Tollbooth.tsx`** — Paywall/pricing page shown before accessing core features. Displays plan options with Stripe Elements integration.
*   **`CheckoutForm.tsx`** — Stripe payment form (card input).
*   **`/api/create-payment-intent`** — Creates a Stripe PaymentIntent server-side.
*   **`/api/subscribe`** — Activates subscription after successful payment.
*   **`/api/webhooks`** — Stripe webhook handler for payment events.
*   **`/api/subscription`** — Subscription status and management.
*   **`/api/admin/grant-subscription`** — Admin tool to manually grant subscriptions.

### C. Subscription Management
*   **`SubscriptionView.tsx`** — Displays current plan, status, and termination option.
*   **Subscription data** stored on user document: `subscription.status`, `subscription.subscribedUntil`, `subscription.subscribedAt`, `subscription.canceledAt`.

## 9. Admin & Reporting

### A. Daily Admin Report
*   **Cron:** Runs daily at 8:00 AM (`/api/cron/daily-report`).
*   **Delivers via Gmail** (nodemailer) to the admin email.
*   **Metrics:** Total users, new signups (24h), active subscriptions, new payments (24h), cancellations (24h), active sessions (24h), posts created (24h).

## 10. Technical Architecture
**Stack:**
*   **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS (v4).
*   **UX Pattern:** Content-first feeds, mobile-first design, bottom tab navigation.
*   **Backend:** Firebase (Firestore, Admin SDK). Deployed on Vercel.
*   **Auth:** Twilio Verify (OTP) → Firebase Custom Tokens.
*   **Payments:** Stripe (PaymentIntents, webhooks).
*   **AI:**
    *   **Heavy Reasoning:** Anthropic Claude Opus 4.6 (`claude-opus-4-6`) — powers Mirror Chat conversations and Monthly Reviews.
    *   **Creative Writing:** Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) — powers Ghost-Writing, Plan Generation, Dossier Updates, Support Chat, Reality Shift PII scrubbing.
    *   **Image Generation:** Google Imagen 4.0 — generates hero images for posts and daily digest cards.
    *   **Fallback Chain:** Primary model → stable fallback (Opus 4.5 or Sonnet 4.5) → Gemini 3.1 Pro.
*   **Email:** Nodemailer + Gmail (admin reports).

**Infrastructure:**
*   **Rate Limiting:** In-memory rate limiter (`src/lib/rateLimit.ts`) — protects Support Chat and other endpoints.
*   **Geolocation:** IP-based geo-tagging (`src/lib/geolocation.ts`) for proximity privacy.
*   **Server Auth:** Internal auth verification (`src/lib/auth/serverAuth.ts`) for cron jobs and admin routes.
*   **Feed Caching:** Module-level in-memory cache (`src/lib/feedCache.ts`).

**Data Model:**
*   **`users/{userId}`:** The user document containing `character_bible`, `identity` (with `dossier`, `belief_patterns`, `monthly_reviews`, `session_count`), `active_todos`, `subscription`, `liked_posts`, `default_post_routing`, `home_lat`/`home_lng`, `daily_digest`, and profile data.
*   **`users/{userId}/active_chats/{sessionId}`:** Live Mirror Chat sessions.
*   **`posts/{postId}`:** Published posts with public/private content, images, likes, comments, `post_type` (`dear_earnest` or `reality_shift`), geo coords.
*   **`posts/{postId}/comments/{commentId}`:** AI-generated and personal comments.
*   **`directives/{directiveId}`:** Standalone action directives (Active Mission system).
*   **`definitions/{definitionId}`:** Identity anchor definitions (the "I AM..." header statement).

**Cron Jobs:**

| Cron | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/cleanup-chats` | Every 15 minutes | Process closed/abandoned chat sessions → generate "Dear Earnest" post, update dossier, delete chat |
| `/api/cron/daily-digest` | 6:00 AM daily | Generate a daily reflection card from a random Character Bible section with Imagen hero image |
| `/api/cron/daily-report` | 8:00 AM daily | Email admin with platform metrics (signups, subscriptions, sessions, posts) |
| `/api/cron/monthly-review` | 9:00 AM on 1st of month | Generate personal letter from character to user reflecting on the past month |

## 11. Current Implementation Status
*   **Active Core Loop:** Mirror Chat → Plan Generation → Social Post → Dossier Update.
*   **Active Modules:**
    *   **Mirror Chat:** Fully active with 4 session modes, plan generation, auto-publish toggle.
    *   **The Social Feed:** Chronological feed with cached posts, native ads, AI comments, follow system, two post types.
    *   **Character Bible:** Identity editing, AI-compiled character sections, avatar generation.
    *   **Dossier System:** Auto-maintained by the cleanup cron after each session.
    *   **Directives:** Bell icon todo list (My Daily Plan) + Active Mission header bar + Reality Shift completion reports.
    *   **Daily Digest:** Automated daily reflection cards with generated imagery.
    *   **Monthly Reviews:** Character-authored personal letters on the 1st of each month.
    *   **Support Chat:** AI-powered floating concierge for platform questions.
    *   **Security Vault:** Account management, contact firewall, location controls.
    *   **Payments:** Stripe integration with two subscription tiers.
    *   **Admin Reports:** Daily email metrics to admin.
    *   **Landing Page:** Full marketing + Twilio OTP auth flow.
    *   **Legal Pages:** Privacy policy, Terms of Service, Acceptable Use policy, Press page.
*   **Removed/Inactive Features:** Check-In Engine (replaced by Mirror Chat), Signal/News cron, Telemetry.

## 12. File Map & Agent Quickstart

### How to Run
```bash
npm run dev   # starts Next.js dev server on http://localhost:3000
```
**Required env vars** (in `.env.local`): `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `GMAIL_APP_PASSWORD`, `ADMIN_EMAIL`.

### Key Directories
| Directory | Purpose |
|-----------|---------| 
| `src/app/` | Next.js App Router pages (`page.tsx`, `profile/`, `my-posts/`, `saved/`, `subscription/`, `vision/`, `privacy/`, `terms/`, `press/`, `acceptable-use/`) |
| `src/app/api/` | Server-side API routes |
| `src/components/` | All React components |
| `src/components/auth/` | Auth components (`OTPLogin.tsx`) |
| `src/components/ui/` | Shared UI primitives (`Dialog`, `Button`) |
| `src/lib/firebase/` | Firebase config (`config.ts` client, `admin.ts` server), `posts.ts`, `chat.ts`, `character.ts`, `schema.ts` |
| `src/lib/auth/` | `AuthContext.tsx` (React auth provider), `serverAuth.ts` (server-side auth verification) |
| `src/lib/ai/` | AI model config (`models.ts`), engagement tones (`engagementTones.ts`) |
| `src/lib/constants/` | Reality Rules (`realityRules.ts`), Master Beliefs (`beliefs.ts`), Emotions (`emotions.ts`) |
| `src/lib/security/` | Contact firewall logic (`contactFirewall.ts`), server-side hashing (`serverHash.ts`) |
| `src/lib/` | Utilities (`feedCache.ts`, `rateLimit.ts`, `geolocation.ts`, `regionFlag.ts`, `utils/`) |
| `src/types/` | TypeScript type definitions (`character.ts`, `chat.ts`) |
| `src/config/` | App configuration (`ecosystem.ts` — native ad definitions) |
| `.agents/workflows/` | AI agent workflows (`design-system.md`, `git-rules.md`) |

### API Routes
| Route | Method | Purpose |
|-------|--------|---------| 
| `/api/auth/send-code` | POST | Send OTP via Twilio Verify |
| `/api/auth/verify-code` | POST | Verify OTP, return Firebase custom token |
| `/api/mirror` | POST | Send message to Mirror Chat AI |
| `/api/mirror/plan` | POST | Generate action plan from chat session |
| `/api/onboarding/process` | POST | Process onboarding rant into identity |
| `/api/character/compile` | POST | Compile character bible from source code |
| `/api/character/avatar` | POST | Generate character avatar |
| `/api/dossier/update` | POST | Update user dossier |
| `/api/posts/feed` | GET | Fetch chronological feed |
| `/api/posts/mine` | GET | Fetch user's own posts |
| `/api/posts/saved` | GET | Fetch user's liked/saved posts |
| `/api/posts/like` | POST | Anonymous karma like (also saves to user's liked_posts) |
| `/api/posts/comment` | POST/GET | AI comment generation |
| `/api/posts/comments` | GET | Fetch comments for a post |
| `/api/posts/reality-shift` | POST | Create Reality Shift dispatch from directive completion |
| `/api/support` | POST | AI-powered support concierge |
| `/api/upload` | POST | File upload to Firebase Storage |
| `/api/user/region` | POST | Set user region via geo-detection |
| `/api/create-payment-intent` | POST | Create Stripe PaymentIntent |
| `/api/subscribe` | POST | Activate subscription |
| `/api/subscription` | GET/POST | Subscription status and management |
| `/api/webhooks` | POST | Stripe webhook handler |
| `/api/admin/grant-subscription` | POST | Admin: manually grant subscription |
| `/api/account` | DELETE | Account deletion |
| `/api/cron/cleanup-chats` | GET | Cron: process closed chats → posts + dossier |
| `/api/cron/daily-digest` | GET | Cron: generate daily reflection cards |
| `/api/cron/daily-report` | GET | Cron: email admin metrics report |
| `/api/cron/monthly-review` | GET | Cron: generate monthly character review letters |

### Critical Component Files
| File | What it does |
|------|-------------|
| `src/app/page.tsx` | Main page — landing (unauth), onboarding, or dashboard (auth) |
| `src/components/LandingPage.tsx` | Full marketing page + Twilio OTP phone auth flow |
| `src/components/Ledger.tsx` | The feed — fetches, caches, and renders posts |
| `src/components/FeedPostCard.tsx` | Individual post card with public/private flip |
| `src/components/DigestCard.tsx` | Daily reflection card rendered in feed |
| `src/components/MirrorChat.tsx` | Conversational AI interface with mode selector |
| `src/components/TriagePanel.tsx` | Bottom navigation bar + Mirror Chat FAB |
| `src/components/ProfileView.tsx` | Character profile with accordion bible sections |
| `src/components/DirectivesMenu.tsx` | "My Daily Plan" slide-over todo panel |
| `src/components/ActiveMission.tsx` | Header sub-bar showing current directive |
| `src/components/DashboardHeader.tsx` | Top nav with bell icon + hamburger menu |
| `src/components/Onboarding.tsx` | New user onboarding flow |
| `src/components/DossierView.tsx` | Full dossier viewer modal |
| `src/components/IdentityModal.tsx` | Quick identity edit modal |
| `src/components/IdentityAnchor.tsx` | "I AM..." header statement (taps to edit via definitions collection) |
| `src/components/IdentityForm.tsx` | Identity field editor |
| `src/components/VisionForm.tsx` | Vision/dream self editor |
| `src/components/RolodexModal.tsx` | Key people management modal |
| `src/components/ActionSelectionModal.tsx` | "What are your choices?" modal — list options, pick most exciting |
| `src/components/ControlDeck.tsx` | Quick-action grid (Identity, Take Action, I Want) |
| `src/components/Tollbooth.tsx` | Paywall/pricing page with Stripe Elements |
| `src/components/CheckoutForm.tsx` | Stripe card payment form |
| `src/components/SubscriptionView.tsx` | Subscription status and termination |
| `src/components/SecurityVault.tsx` | Security panel (account deletion, contact firewall, location) |
| `src/components/ContactFirewall.tsx` | Contact blocking/import with drag-and-drop |
| `src/components/SupportChat.tsx` | Floating AI support concierge |
| `src/components/FollowAuthorModal.tsx` | Author follow confirmation dialog |
| `src/components/FeedAdCard.tsx` | Native ecosystem partner ad card |
| `src/components/LockedScreen.tsx` | Active assignment lock screen (report completion to unlock) |
| `src/components/CharacterReview.tsx` | Character review display |
| `src/components/StreamInput.tsx` / `StreamList.tsx` | Stream input and list components |
| `src/lib/ai/models.ts` | AI model definitions and fallback logic |
| `src/lib/ai/engagementTones.ts` | Chat mode definitions (Unfiltered, Strategic Advisor, etc.) |
| `src/lib/constants/realityRules.ts` | The 16 Universal Laws of Reality (philosophical engine) |
| `src/lib/constants/beliefs.ts` | Master belief pairs for pattern tracking |
| `src/lib/feedCache.ts` | Module-level in-memory feed cache |
| `src/lib/rateLimit.ts` | In-memory rate limiter |
| `src/lib/geolocation.ts` | IP-based geolocation for proximity privacy |
| `src/lib/firebase/admin.ts` | Firebase Admin SDK (server-side Firestore + Storage) |
| `src/lib/firebase/character.ts` | Character bible CRUD + real-time subscriptions |
| `src/lib/security/contactFirewall.ts` | Contact file parsing and firewall logic |
| `src/app/api/cron/cleanup-chats/route.ts` | Cron: synthesizes posts, generates images, updates dossiers |
| `src/app/api/cron/daily-digest/route.ts` | Cron: daily reflection cards with Imagen |
| `src/app/api/cron/daily-report/route.ts` | Cron: admin metrics email |
| `src/app/api/cron/monthly-review/route.ts` | Cron: monthly character letters via Claude Opus |