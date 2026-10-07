# Earnest Page

Talk to your ideal self. People have conversations with an AI character built from their own Character Bible, and finished conversations become anonymous "Dear Earnest" posts in a social feed.

- **[MANIFESTO.md](MANIFESTO.md)**: vision, philosophy, voice and design rules.
- **[CLAUDE.md](CLAUDE.md)**: architecture, conventions and commands, written for agents but useful for anyone working on the code.

## Layout

- `src/`: the Next.js 16 website, hosted on Vercel.
- `functions/`: Firebase Cloud Functions, which do all the slow and background work (Mirror chat replies, post generation, images, audio, video).
- `firestore.rules`, `firestore.indexes.json`: Firestore configuration.
- `scripts/`: one-off maintenance and diagnostic scripts, run with `npx tsx` or `node`.

## Getting started

```bash
npm install
npm install --prefix functions
npm run dev
```

The website needs `.env.local` (Firebase client config, `FIREBASE_SERVICE_ACCOUNT_KEY`, Twilio, Turnstile, ElevenLabs and AI provider keys). Cloud Functions read their secrets from `functions/.env`.

## Checks

```bash
npm run typecheck
npm test
npm run lint
npm run build --prefix functions
```

## Deploying

- **Website:** hosted on Vercel (`vercel.json`).
- **Cloud Functions:** `firebase deploy --only functions:<name>`. Check `git status functions/` first.
- **Firestore:** `firebase deploy --only firestore:rules,firestore:indexes`.
