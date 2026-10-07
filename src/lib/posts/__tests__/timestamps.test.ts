// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase/firestore";
import { timestampToDate, reviveCreatedAt } from "../timestamps";

describe("timestampToDate", () => {
    it("converts a serialized { _seconds } object", () => {
        expect(timestampToDate({ _seconds: 1700000000 })).toEqual(new Date(1700000000 * 1000));
    });

    it("converts a client SDK Timestamp", () => {
        const ts = new Timestamp(1700000000, 0);
        expect(timestampToDate(ts)).toEqual(new Date(1700000000 * 1000));
    });

    it("treats _seconds 0 as the epoch, not as missing", () => {
        expect(timestampToDate({ _seconds: 0 })).toEqual(new Date(0));
    });

    it.each([null, undefined])("returns null for %s", (value) => {
        expect(timestampToDate(value)).toBeNull();
    });

    it("returns null for an unrecognized shape", () => {
        expect(timestampToDate({} as never)).toBeNull();
        expect(timestampToDate({ seconds: 5 } as never)).toBeNull();
    });
});

describe("reviveCreatedAt", () => {
    it("turns a serialized created_at into a Timestamp", () => {
        const post = reviveCreatedAt({ id: "p", created_at: { _seconds: 100, _nanoseconds: 7 } as unknown });
        expect(post.created_at).toBeInstanceOf(Timestamp);
        expect(post.created_at).toEqual(new Timestamp(100, 7));
    });

    it("defaults missing nanoseconds to 0", () => {
        const post = reviveCreatedAt({ created_at: { _seconds: 100 } as unknown });
        expect(post.created_at).toEqual(new Timestamp(100, 0));
    });

    it("revives _seconds 0", () => {
        const post = reviveCreatedAt({ created_at: { _seconds: 0 } as unknown });
        expect(post.created_at).toEqual(new Timestamp(0, 0));
    });

    it("returns the same object", () => {
        const post = { created_at: { _seconds: 1 } as unknown };
        expect(reviveCreatedAt(post)).toBe(post);
    });

    it.each([
        ["null", null],
        ["missing", undefined],
        ["an ISO string", "2026-01-01T00:00:00Z"],
        ["a Date", new Date(0)],
    ])("leaves %s created_at unchanged", (_label, value) => {
        const post = { created_at: value as unknown };
        reviveCreatedAt(post);
        expect(post.created_at).toBe(value);
    });
});
