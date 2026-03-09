/**
 * Contact Firewall — Client-Side Hash Utility
 *
 * Ensures users never see posts from people in their real-world network.
 * Raw phone numbers NEVER leave the browser. Only SHA-256 hashes are
 * persisted to Firestore.
 *
 * Flow: Contacts → Normalize → Hash (SHA-256) → Firestore batch write
 */

import { db } from "@/lib/firebase/config";
import {
    collection,
    writeBatch,
    doc,
    serverTimestamp,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of each document in `users/{userId}/blocked_hashes`. */
export interface BlockedHashDoc {
    hash: string;
    created_at: ReturnType<typeof serverTimestamp>;
}

/** Thrown when the browser does not support the Contact Picker API. */
export class ContactPickerUnsupportedError extends Error {
    constructor() {
        super(
            "Contact Picker API is not supported in this browser. " +
            "Please use the CSV import option instead."
        );
        this.name = "ContactPickerUnsupportedError";
    }
}

// Augment Navigator so TypeScript recognises the Contact Picker API.
interface ContactInfo {
    tel?: string[];
}

interface ContactsManager {
    select(
        properties: string[],
        options?: { multiple?: boolean }
    ): Promise<ContactInfo[]>;
    getProperties(): Promise<string[]>;
}

declare global {
    interface Navigator {
        contacts?: ContactsManager;
    }
}

// ---------------------------------------------------------------------------
// 1. Phone Number Normalization
// ---------------------------------------------------------------------------

/**
 * Strips all non-digit characters and normalises to a 10-digit US baseline.
 *
 * Examples:
 *   "+1 (555) 867-5309"  → "5558675309"
 *   "15558675309"        → "5558675309"
 *   "555-867-5309"       → "5558675309"
 *
 * @throws {Error} If the resulting digit string is empty.
 */
export function normalizePhoneNumber(raw: string): string {
    // Strip everything that isn't a digit.
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

// ---------------------------------------------------------------------------
// 2. SHA-256 Hashing (Web Crypto API)
// ---------------------------------------------------------------------------

/**
 * Hashes a normalised phone number string to a 64-character lowercase
 * SHA-256 hex digest using the native Web Crypto API. No dependencies.
 */
export async function hashPhoneNumber(normalized: string): Promise<string> {
    const encoded = new TextEncoder().encode(normalized);
    const buffer = await crypto.subtle.digest("SHA-256", encoded);

    // Convert ArrayBuffer → hex string.
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// 3. Contact Extraction (Web Contact Picker API)
// ---------------------------------------------------------------------------

/**
 * Prompts the user to select contacts and returns a flat array of raw
 * phone number strings.
 *
 * @throws {ContactPickerUnsupportedError} if the browser lacks support.
 */
export async function extractContactPhoneNumbers(): Promise<string[]> {
    if (!("contacts" in navigator) || !navigator.contacts) {
        throw new ContactPickerUnsupportedError();
    }

    const contacts: ContactInfo[] = await navigator.contacts.select(["tel"], {
        multiple: true,
    });

    // Flatten — each contact may have multiple phone numbers.
    const numbers: string[] = [];
    for (const contact of contacts) {
        if (contact.tel) {
            numbers.push(...contact.tel);
        }
    }

    return numbers;
}

// ---------------------------------------------------------------------------
// 4. File Parsing (VCF / CSV)
// ---------------------------------------------------------------------------

/**
 * Extracts phone numbers from a vCard (.vcf) file string.
 * Matches TEL property lines in both vCard 2.1 and 3.0/4.0 formats.
 *
 * Examples matched:
 *   TEL;TYPE=CELL:+1 555-867-5309
 *   TEL;TYPE=HOME,VOICE:(555) 867-5309
 *   TEL:5558675309
 */
export function parseVcfFile(text: string): string[] {
    const numbers: string[] = [];
    // Match TEL lines — value is everything after the last colon on the line
    const telRegex = /^TEL[^:]*:(.+)$/gim;
    let match: RegExpExecArray | null;

    while ((match = telRegex.exec(text)) !== null) {
        const raw = match[1].trim();
        if (raw) numbers.push(raw);
    }

    return numbers;
}

/**
 * Extracts phone-number-shaped strings from a CSV file.
 * Looks for sequences of digits (with optional +, -, spaces, parens, dots)
 * that contain at least 7 digits (minimum for a valid phone number).
 */
export function parseCsvFile(text: string): string[] {
    const numbers: string[] = [];
    // Match phone-shaped strings: optional +, then digits mixed with separators
    const phoneRegex = /(?:\+?\d[\d\s\-().]{6,}\d)/g;
    let match: RegExpExecArray | null;

    while ((match = phoneRegex.exec(text)) !== null) {
        const raw = match[0].trim();
        // Verify it has at least 7 actual digits
        const digitCount = raw.replace(/\D/g, "").length;
        if (digitCount >= 7) numbers.push(raw);
    }

    return numbers;
}

/**
 * Reads a File object and extracts phone numbers based on its extension.
 * Supports .vcf (vCard) and .csv files.
 */
export function parseContactFile(file: File): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (extension !== "vcf" && extension !== "csv") {
            reject(new Error(`Unsupported file format: .${extension}. Use .vcf or .csv.`));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const text = reader.result as string;
            const numbers = extension === "vcf" ? parseVcfFile(text) : parseCsvFile(text);
            resolve(numbers);
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsText(file);
    });
}

// ---------------------------------------------------------------------------
// 5. Firebase Sync (Batched Writes)
// ---------------------------------------------------------------------------

/** Firestore batch limit is 500 operations. */
const BATCH_LIMIT = 500;

/**
 * Writes an array of pre-hashed strings to
 * `users/{userId}/blocked_hashes` using batched writes.
 *
 * Each hash becomes its own document (keyed by the hash itself for
 * idempotency) with a `created_at` server timestamp.
 *
 * Automatically chunks into batches of 500 to stay within the
 * Firestore `writeBatch` operation limit.
 */
export async function syncFirewallHashes(
    userId: string,
    hashes: string[]
): Promise<void> {
    if (!userId) {
        throw new Error("syncFirewallHashes: userId is required.");
    }

    if (hashes.length === 0) return;

    const colRef = collection(db, "users", userId, "blocked_hashes");

    // Chunk into groups of BATCH_LIMIT.
    for (let i = 0; i < hashes.length; i += BATCH_LIMIT) {
        const chunk = hashes.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);

        for (const hash of chunk) {
            // Use the hash as the document ID → writes are idempotent.
            const docRef = doc(colRef, hash);
            batch.set(docRef, {
                hash,
                created_at: serverTimestamp(),
            });
        }

        await batch.commit();
    }
}

// ---------------------------------------------------------------------------
// 5. Convenience Orchestrator
// ---------------------------------------------------------------------------

/**
 * End-to-end convenience function:
 * 1. Opens the native Contact Picker
 * 2. Normalises every phone number
 * 3. Hashes each via SHA-256
 * 4. Syncs all hashes to Firestore
 *
 * Returns the count of hashes synced.
 *
 * @throws {ContactPickerUnsupportedError} if the Contact Picker is absent.
 */
export async function runContactFirewall(userId: string): Promise<number> {
    const rawNumbers = await extractContactPhoneNumbers();

    const hashes: string[] = [];
    for (const raw of rawNumbers) {
        try {
            const normalized = normalizePhoneNumber(raw);
            const hash = await hashPhoneNumber(normalized);
            hashes.push(hash);
        } catch {
            // Skip numbers that fail normalisation (e.g. blank entries).
            console.warn(`[ContactFirewall] Skipping invalid number: "${raw}"`);
        }
    }

    // De-duplicate before writing.
    const unique = [...new Set(hashes)];

    await syncFirewallHashes(userId, unique);

    return unique.length;
}
