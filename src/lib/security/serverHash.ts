/**
 * Server-Side Phone Hash Utility
 *
 * Mirrors the client-side `hashPhoneNumber` from contactFirewall.ts
 * but uses Node.js `crypto` module instead of Web Crypto API.
 * Used in API routes and cron jobs to generate/verify author hashes.
 */

import { createHash } from "crypto";

/**
 * Strips all non-digit characters and normalises to a 10-digit US baseline.
 * Same logic as the client-side version.
 */
export function normalizePhoneNumberServer(raw: string): string {
    const digits = raw.replace(/\D/g, "");

    if (digits.length === 0) {
        throw new Error(`Invalid phone number: "${raw}" contains no digits.`);
    }

    // US numbers: if 11 digits starting with "1", drop the leading country code.
    if (digits.length === 11 && digits.startsWith("1")) {
        return digits.slice(1);
    }

    return digits;
}

/**
 * Hashes a normalised phone number string to a 64-character lowercase
 * SHA-256 hex digest using Node.js crypto. Produces identical output
 * to the client-side Web Crypto version.
 */
export function hashPhoneNumberServer(normalized: string): string {
    return createHash("sha256").update(normalized).digest("hex");
}
