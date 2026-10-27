// Runs the website locally against beta (earnest-page-beta) instead of live:
// beta sign-in, database, storage and functions. `npm run dev` stays on live.
//
//   npm run dev:beta
//
// Reads the beta settings from .env.beta.local (gitignored): the service-account
// key, the six NEXT_PUBLIC_FIREBASE_* web settings and COMPILE_FUNCTION_URL.
// They take precedence over .env.local, which still supplies everything else
// (AI keys, Twilio, Stripe test keys). Refuses to start unless every Firebase
// setting points at beta, so a half-filled file can never mix in live data.
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { spawn } from "child_process";

const BETA_PROJECT = "earnest-page-beta";
const REQUIRED = [
    "FIREBASE_SERVICE_ACCOUNT_KEY",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "COMPILE_FUNCTION_URL",
];

const beta = dotenv.parse(readFileSync(".env.beta.local"));
const missing = REQUIRED.filter((name) => !beta[name]);
if (missing.length) {
    console.error(`Missing in .env.beta.local: ${missing.join(", ")}`);
    process.exit(1);
}
const keyProject = JSON.parse(beta.FIREBASE_SERVICE_ACCOUNT_KEY).project_id;
const notBeta = [
    keyProject !== BETA_PROJECT && "FIREBASE_SERVICE_ACCOUNT_KEY",
    beta.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== BETA_PROJECT && "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    !beta.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.startsWith(`${BETA_PROJECT}.`) && "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    !beta.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.startsWith(`${BETA_PROJECT}.`) && "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    !beta.COMPILE_FUNCTION_URL.includes(BETA_PROJECT) && "COMPILE_FUNCTION_URL",
].filter(Boolean);
if (notBeta.length) {
    console.error(`These settings in .env.beta.local don't point at ${BETA_PROJECT}: ${notBeta.join(", ")}`);
    process.exit(1);
}

console.log(`Starting the website against ${BETA_PROJECT}.`);
// Next.js never overrides a variable that is already set, so these win over .env.local.
const env = { ...process.env, ...Object.fromEntries(REQUIRED.map((name) => [name, beta[name]])) };
const next = spawn("next", ["dev", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
next.on("exit", (code) => process.exit(code ?? 0));
