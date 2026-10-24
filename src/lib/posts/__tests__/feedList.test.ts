import { describe, it, expect } from "vitest";
import { newerPosts, appendPosts } from "../feedList";
import type { Post } from "@/types/post";

const post = (id: string, day: number) => ({
    id, created_at: { _seconds: Date.parse(`2026-10-${String(day).padStart(2, "0")}T00:00:00Z`) / 1000 },
}) as unknown as Post;

describe("newerPosts", () => {
    const shown = [post("b", 10), post("a", 9)];

    it("returns only posts created after the newest one shown", () => {
        const batch = [post("d", 12), post("c", 11), post("b", 10), post("old", 5)];
        expect(newerPosts(shown, batch, "2026-10-10T00:00:00.000Z").map((p) => p.id)).toEqual(["d", "c"]);
    });

    it("skips posts already shown", () => {
        expect(newerPosts([post("c", 11), ...shown], [post("c", 11)], "2026-10-10T00:00:00.000Z")).toEqual([]);
    });
});

describe("appendPosts", () => {
    it("adds the batch after the posts shown, without duplicates", () => {
        const result = appendPosts([post("b", 10), post("a", 9)], [post("a", 9), post("z", 1)]);
        expect(result.map((p) => p.id)).toEqual(["b", "a", "z"]);
    });
});
