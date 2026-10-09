# Earnest Page

People talk with their "ideal self", an AI character built from their own Character Bible. Finished conversations become anonymous "Dear Earnest" posts in a social feed. Product vision, voice and design rules are in [MANIFESTO.md](MANIFESTO.md). Read it before changing prompts or UI copy.

## Two codebases, one repo

| | Website | Cloud Functions |
|---|---|---|
| Path | `src/` | `functions/src/` (separate package, own `package.json`) |
| Runs on | Vercel (Next.js 16 App Router) | Firebase Cloud Functions (Node 22, `us-central1`) |
| Does | Pages, auth, reads, quick replies (support chat, TTS, voice search) | Everything slow or in the background: Mirror chat replies, post generation, images, audio, video, bibles, avatars, digests, admin email |
| Entry | `src/app/` | `functions/src/index.ts` |

Rules:
- **New heavy or background work goes in `functions/`.** Vercel times out and drops work after the response is sent.
- **The AI/post pipeline exists only in `functions/src/lib/`.** The website imports the few shared files through the `@functions/*` alias (`@functions/lib/ai/models`, `@functions/lib/getPostText`, `@functions/lib/access/sessionAccess`). Never copy them into `src/lib`.
- **Every package a shared file imports must also be in the root `package.json`.** Vercel installs only the root packages. Locally those imports silently resolve from `functions/node_modules`, so a missing one only fails on Vercel. To check, build with `functions/node_modules` moved aside.
- `firebase/admin.ts` is deliberately separate per side: the website uses a service-account key, Functions use default credentials.
- Don't rename or remove an exported Cloud Function without checking callers. Deployed names are URLs. For example, `src/app/api/onboarding/process` calls `compileCharacterBible` by URL.
- Model ids live in `functions/src/lib/ai/models.ts`. Change them there only.

## Where things are

**Website (`src/`)**
- `app/[locale]/`: pages. `app/api/`: route handlers. `proxy.ts`: locale routing and security headers (Next 16's renamed middleware).
- `components/`: UI.
  - Mirror chat: `components/mirror/` plus `hooks/useMirrorSession`, `useCharacterTTS` and `useVisualViewport`.
  - Feed post card: `components/feed/` plus `hooks/useFeedAudio` and `usePostComments`. The `Post` type is in `types/post.ts`.
  - Profile editors: `components/mylife/`.
- `context/`: React providers (`AuthContext`, `AudioMuteContext`). `hooks/`: custom hooks.
- `lib/auth/`: `serverAuth.ts` (`verifyAuth` for API routes) and `authFetch.ts` (client fetch with the ID token).
- Payments: `lib/payments/` (Stripe client, product catalog, webhook handling), `lib/access/accessStore.ts` (Firestore transactions for starting sessions, credits and refunds), routes in `app/api/payments/`, UI in `components/payments/` (purchase panel, Profile → Sessions tab).
- `lib/posts/`: post serializers and timestamp helpers. `lib/firebase/`: client `config.ts` and server `admin.ts`.
- `messages/{en,es,pt,fr,de}.json`: translations (next-intl). All five must have the same keys; `node scripts/check-locales.js` verifies this.

**Functions (`functions/src/`)**
- One file per deployed function group (`processChat.ts`, `mirror.ts`, `processPostImages.ts`, …), all exported from `index.ts`.
- `lib/ai/`: prompts, model calls, image/TTS generation. `lib/posts.ts`: `savePostImages` (the one place that decides when a post is published). `lib/bible.ts`, `lib/email/adminEmail.ts`, `lib/firebase/storage.ts`, `lib/config/region.ts`: shared helpers.
- `lib/constants/realityRules.ts`: the philosophical rules every character follows.
- `lib/access/sessionAccess.ts`: the one session access rule (free sessions, credits, membership, daily/turn/time limits, refund rules). Pure, no imports; shared with the website.

## Conventions

- API routes: authenticate with `verifyAuth` from `src/lib/auth/serverAuth.ts`, reply with `Response.json`, return errors as `{ error }`, and never send raw `error.message` on a 500. Rate-limit anything that calls AI (`src/lib/rateLimit.ts`).
- Client calls to our API go through `authFetch(user, url, init)`.
- A post's author is `uid || authorId` (older posts have only one). In functions use `getPostAuthorId`.
- Firestore field names are snake_case (`created_at`, `is_public`, `message_images`).
- Post images:
  - `message_images` holds one slot per message, with `null` gaps until each image is generated.
  - `imagen_urls` lists the images that exist so far.
  - `imagen_url` is the cover (first) image.

  All three are written by `savePostImages`. About 70 older posts have only `imagen_url(s)`, so readers must fall back to them.
- No UI string is hardcoded. Add it to all five locale files.

## Sessions and payments

Model and reasons are in MANIFESTO.md §8. In code:
- **One rule, `functions/src/lib/access/sessionAccess.ts`.** `/api/check-session-access` reports it, `/api/consume-session` applies it (with the first message), and `mirrorReply`/`mirrorPlan` refuse a session that has no grant or is past its turn, time or size limits. Change limits and refund rules there only.
- **Where the state lives.** `users/{uid}.access` (credits, free sessions, daily count, membership), `users/{uid}/credit_lots/{paymentIntentId}`, `users/{uid}/paid_sessions/{sessionId}`, and `active_chats/{sessionId}.access` (how the session was paid for). Only the server writes them; `firestore.rules` blocks the client.
- **Stripe, in-house only.** Payment Element in our own UI; no Checkout or Customer Portal. Credits are granted and memberships updated only by the webhook (`/api/payments/webhook`). Prices are in `src/lib/payments/catalog.ts`; the membership price is created in Stripe on first use by lookup key.
- Env (`.env.local`, and Vercel for production): `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Locally, `stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to localhost:3000/api/payments/webhook` prints the webhook secret.

## The dossier and character data

The dossier (rewritten after each session in `functions/src/processChat.ts`) holds present-tense facts only: stable facts plus clearly marked transient to-dos. No commentary or analysis of the user's beliefs. Sessions must never edit the user's people list or interests; only the user does that. Prompts never call sessions "therapy".

## Commands

```bash
npm run dev                         # website on http://localhost:3000
npm run typecheck                   # tsc for src/ (also checks imported functions code)
npm test                            # vitest
npm run lint                        # eslint
npm run build --prefix functions    # compile Cloud Functions
node scripts/find-dead-code.mjs     # unreachable files, unused exports, unused translation namespaces
```

Website env vars are in `.env.local`; function secrets are in `functions/.env`.

## Tests and CI

- Vitest runs every `*.test.ts(x)` in the repo, website and functions alike, from the root with `npm test`. Put tests in a `__tests__/` folder next to the code. Server and functions tests start with `// @vitest-environment node`.
- Never call real services in tests. Mock `@/lib/firebase/admin` (or use `src/test/fakeFirestore.ts`), `firebase-admin`, and every AI, Twilio and ElevenLabs module.
- Guards worth keeping green: `serializePublicPost` never leaks private fields, every authenticated route returns 401 without a valid token, the publish rule in `functions/src/lib/posts.ts`, the access rule (`functions/src/lib/access/__tests__`) and payments (`src/app/api/__tests__/payments.test.ts`), and `src/messages/__tests__` (all locales match, and every key the code uses exists).
- GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:
  - **website-build:** typecheck, then `next build` with only root packages installed, like Vercel.
  - **tests:** `npm test`.
  - **functions-build:** compiles the Cloud Functions.

  CI reports results but doesn't block Vercel deploys.

## Deploying and git

- Never commit or push unless the user asks, and each request covers only that one commit or push (see `.agents/workflows/git-rules.md`). Commit with an explicit pathspec, because other agents may have staged files.
- Before `firebase deploy`, run `git status --short functions/`. If there are uncommitted changes you didn't make, stop and ask: a deploy ships whatever is on disk. Deploy named functions only (`firebase deploy --only functions:<name>`).
- Firestore rules and indexes deploy separately (`firebase deploy --only firestore:rules,firestore:indexes`).
