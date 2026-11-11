import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import pt from "@/messages/pt.json";
import fr from "@/messages/fr.json";
import de from "@/messages/de.json";
import { formatMinutes, formatNowDate } from "../format";

type NowT = Parameters<typeof formatMinutes>[1];
const translator = (locale: string, messages: Record<string, unknown>) =>
    createTranslator({ locale, messages, namespace: "now" }) as unknown as NowT;
const t = translator("en", en);
// Intl puts a narrow no-break space before AM/PM
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatMinutes", () => {
    it("shows minutes, hours, or both", () => {
        expect(formatMinutes(25, t)).toBe("25 min");
        expect(formatMinutes(60, t)).toBe("1 hr");
        expect(formatMinutes(100, t)).toBe("1 hr 40 min");
    });
});

describe("formatNowDate", () => {
    const now = new Date(2026, 10, 10, 18, 0);

    it("says today or yesterday, then the day, with the year only when it isn't this one", () => {
        expect(plain(formatNowDate(new Date(2026, 10, 10, 16, 5), now, "en", t))).toBe("Today, 4:05 PM");
        expect(plain(formatNowDate(new Date(2026, 10, 9, 18, 30), now, "en", t))).toBe("Yesterday, 6:30 PM");
        expect(plain(formatNowDate(new Date(2026, 10, 3, 18, 30), now, "en", t))).toBe("Nov 3, 6:30 PM");
        expect(plain(formatNowDate(new Date(2025, 11, 31, 18, 30), now, "en", t))).toBe("Dec 31, 2025, 6:30 PM");
    });

    it.each([["es", es], ["pt", pt], ["fr", fr], ["de", de]])("fills in every value in %s", (locale, messages) => {
        const tl = translator(locale, messages);
        expect(formatMinutes(25, tl)).toContain("25");
        expect(formatMinutes(100, tl)).toMatch(/1\D+40/);
        expect(formatNowDate(new Date(2026, 10, 10, 16, 5), now, locale, tl)).toContain("16:05");
        expect(formatNowDate(new Date(2026, 10, 3, 16, 5), now, locale, tl)).toMatch(/3.*16:05/);
    });
});
