// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import en from "../en.json";
import es from "../es.json";
import pt from "../pt.json";
import fr from "../fr.json";
import de from "../de.json";
import {
    optionKey,
    SKIN_TONE_OPTIONS,
    HAIR_COLOR_OPTIONS,
    HAIR_TEXTURE_OPTIONS,
    HAIR_VOLUME_OPTIONS,
    EYE_COLOR_OPTIONS,
} from "@/lib/constants/appearance";

type Messages = { [key: string]: unknown };

const LOCALES: Record<string, Messages> = { en, es, pt, fr, de };
const SRC = path.resolve(__dirname, "../..");

/** Leaf key paths ("feed.labelLetter") with their values. */
function leaves(obj: Messages, prefix = ""): [string, unknown][] {
    return Object.entries(obj).flatMap(([k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        return v && typeof v === "object" && !Array.isArray(v) ? leaves(v as Messages, key) : [[key, v] as [string, unknown]];
    });
}

/** The node at a dotted path in en.json, or undefined. */
function lookup(key: string): unknown {
    return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Messages)[part] : undefined), en);
}

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" || full === path.join(SRC, "test") ? [] : sourceFiles(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
}

const BINDING = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:(['"])([^'"]*)\2)?\s*\)/g;

interface KeyRef {
    file: string;
    key: string;
    /** True for a template-literal key; `key` is then the static prefix before the first ${. */
    dynamic: boolean;
}

/**
 * Statically finds translation keys: each `const x = useTranslations('ns')` (or getTranslations)
 * scopes the `x('key')` / `x.rich('key')` calls that follow it in the same file.
 */
function scanKeys(): KeyRef[] {
    const refs: KeyRef[] = [];
    for (const file of sourceFiles(SRC)) {
        const code = fs.readFileSync(file, "utf8");
        const bindings = [...code.matchAll(BINDING)].map((m) => ({ name: m[1], ns: m[3] ?? "", index: m.index! }));
        for (const name of new Set(bindings.map((b) => b.name))) {
            const call = new RegExp(`(?<![\\w.])${name}(?:\\.(?:rich|markup|raw|has))?\\(\\s*(?:(['"])([^'"\\n]+)\\1|\`([^\`]*)\`)`, "g");
            for (const m of code.matchAll(call)) {
                const binding = bindings.filter((b) => b.name === name && b.index < m.index!).pop();
                if (!binding) continue;
                const join = (k: string) => (binding.ns ? `${binding.ns}.${k}` : k);
                const rel = path.relative(SRC, file);
                if (m[2] !== undefined) {
                    refs.push({ file: rel, key: join(m[2]), dynamic: false });
                } else {
                    const prefix = m[3].split("${")[0];
                    if (m[3].includes("${") && prefix) refs.push({ file: rel, key: join(prefix), dynamic: true });
                    else if (!m[3].includes("${")) refs.push({ file: rel, key: join(m[3]), dynamic: false });
                }
            }
        }
    }
    return refs;
}

/** A template prefix like "profile.tabs." or "form.hairColor" must lead to at least one key. */
function prefixExists(prefix: string): boolean {
    return leaves(en).some(([key]) => key.startsWith(prefix));
}

describe("locale files", () => {
    const enKeys = leaves(en).map(([k]) => k).sort();

    it.each(Object.keys(LOCALES).filter((l) => l !== "en"))("%s has exactly the same keys as en", (locale) => {
        const keys = leaves(LOCALES[locale]).map(([k]) => k).sort();
        const missing = enKeys.filter((k) => !keys.includes(k));
        const extra = keys.filter((k) => !enKeys.includes(k));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });

    it.each(Object.keys(LOCALES))("%s has no empty values", (locale) => {
        const empty = leaves(LOCALES[locale])
            .filter(([, v]) => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0))
            .map(([k]) => k);
        expect(empty).toEqual([]);
    });
});

describe("translation keys used in src", () => {
    const refs = scanKeys();

    it("finds the keys the code uses (sanity check on the scanner)", () => {
        expect(refs.length).toBeGreaterThan(200);
        expect(refs.some((r) => r.key === "feed.labelLetter")).toBe(true);
    });

    it("every static key exists in en.json", () => {
        const missing = refs.filter((r) => !r.dynamic && lookup(r.key) === undefined).map((r) => `${r.key} (${r.file})`);
        expect([...new Set(missing)]).toEqual([]);
    });

    it("every dynamic key prefix exists in en.json", () => {
        const missing = refs.filter((r) => r.dynamic && !prefixExists(r.key)).map((r) => `${r.key}* (${r.file})`);
        expect([...new Set(missing)]).toEqual([]);
    });

    it.each([
        ["skinTone", SKIN_TONE_OPTIONS],
        ["hairColor", HAIR_COLOR_OPTIONS],
        ["hairTexture", HAIR_TEXTURE_OPTIONS],
        ["hairVolume", HAIR_VOLUME_OPTIONS],
        ["eyeColor", EYE_COLOR_OPTIONS],
    ])("every %s option has an onboarding.form label", (prefix, options) => {
        const missing = options.map((o) => `onboarding.form.${prefix}${optionKey(o)}`).filter((k) => typeof lookup(k) !== "string");
        expect(missing).toEqual([]);
    });

    it.each(["about", "posts", "liked"])("profile tab %s has a label", (tab) => {
        expect(typeof lookup(`profile.tabs.${tab}`)).toBe("string");
    });
});
