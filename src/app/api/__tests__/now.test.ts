// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());
const photos = vi.hoisted(() => ({
    saveNowPhoto: vi.fn(async (uid: string, postId: string) => ({
        path: `now_posts/${uid}/${postId}/photo.jpg`,
        url: "https://firebasestorage.googleapis.com/photo.jpg?alt=media&token=t",
    })),
    deleteNowPhoto: vi.fn(async () => {}),
}));
vi.mock("@/lib/now/nowPhotos", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/now/nowPhotos")>()),
    ...photos,
}));

import { POST as commit, DELETE as drop } from "../now/route";
import { POST as finish, GET, PATCH, DELETE } from "../now/posts/route";

const USER = `users/${TEST_UID}`;
const POSTS = `${USER}/now_posts`;
const NOW = Date.UTC(2026, 10, 10, 16, 0);
const seconds = (ms: number) => ({ _seconds: Math.floor(ms / 1000), _nanoseconds: 0 });
const STARTED = seconds(NOW - 25 * 60_000);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const json = (handler: (req: Request) => Promise<Response>, method: string, body?: unknown, url = "http://localhost/api/now") =>
    handler(makeRequest(url, { method, token: VALID_TOKEN, body }));

function finishWith({ text, polish, photo }: { text?: string; polish?: boolean; photo?: Blob }) {
    const form = new FormData();
    if (text !== undefined) form.set("text", text);
    if (polish !== undefined) form.set("polish", String(polish));
    if (photo) form.set("photo", photo, "photo.jpg");
    return finish(new Request("http://localhost/api/now/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${VALID_TOKEN}` },
        body: form,
    }));
}

beforeEach(() => {
    fakeDb.reset();
    photos.saveNowPhoto.mockClear();
    photos.deleteNowPhoto.mockClear();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb.seed(USER, {
        name: "Ana",
        now: { underway: { action: "Walk the lake", options: ["Walk the lake", "Call Mom", "Write"], started_at: STARTED }, polish: false },
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("POST /api/now", () => {
    it("commits to the picked option, in the list's own spelling", async () => {
        const res = await json(commit, "POST", { options: [" call  mom ", "Write", "write"], action: "CALL MOM" });
        expect(res.status).toBe(200);
        expect(fakeDb.writes).toEqual([{
            op: "set",
            path: USER,
            data: { now: { underway: { action: "call mom", options: ["call mom", "Write"], started_at: { __op: "serverTimestamp" } } } },
        }]);
    });

    it("refuses a pick that isn't one of the options", async () => {
        const res = await json(commit, "POST", { options: ["Walk", "Write"], action: "Nap" });
        expect(res.status).toBe(400);
        expect(fakeDb.writes).toEqual([]);
    });

    it("DELETE drops the action underway without a post", async () => {
        const res = await json(drop, "DELETE");
        expect(res.status).toBe(200);
        expect(fakeDb.writes).toEqual([{ op: "set", path: USER, data: { now: { underway: { __op: "delete" } } } }]);
    });
});

describe("POST /api/now/posts", () => {
    it("posts what happened, ends the action and remembers the Polish choice", async () => {
        const res = await finishWith({ text: "  Went all the way round.\nSaw a heron.  ", polish: true });
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(fakeDb.docs.get(`${POSTS}/auto-1`)).toEqual({
            action: "Walk the lake",
            raw_text: "Went all the way round.\nSaw a heron.",
            polish: true,
            started_at: STARTED,
            created_at: seconds(NOW),
        });
        expect(fakeDb.docs.get(USER)).toEqual({ name: "Ana", now: { polish: true } });
        expect(body).toEqual({
            post: {
                kind: "now",
                id: "auto-1",
                action: "Walk the lake",
                raw_text: "Went all the way round.\nSaw a heron.",
                polished_text: null,
                show_raw: false,
                photo_url: null,
                minutes: 25,
                polishing: true,
                created_at: seconds(NOW),
            },
            remaining: ["Call Mom", "Write"],
        });
    });

    it("has nothing to polish in an empty note, but still remembers the choice", async () => {
        const res = await finishWith({ polish: true });
        expect(res.status).toBe(200);
        expect(fakeDb.docs.get(`${POSTS}/auto-1`)).toMatchObject({ raw_text: "", polish: false });
        expect(fakeDb.docs.get(USER)?.now).toEqual({ polish: true });
        expect((await res.json()).post.polishing).toBe(false);
    });

    it("keeps the photo with the post, and never sends its storage path", async () => {
        const res = await finishWith({ text: "Done", photo: new Blob([JPEG], { type: "image/jpeg" }) });
        expect(res.status).toBe(200);
        expect(photos.saveNowPhoto).toHaveBeenCalledWith(TEST_UID, "auto-1", expect.any(Buffer));
        expect(fakeDb.docs.get(`${POSTS}/auto-1`)).toMatchObject({
            photo_url: "https://firebasestorage.googleapis.com/photo.jpg?alt=media&token=t",
            photo_path: `now_posts/${TEST_UID}/auto-1/photo.jpg`,
        });
        const { post } = await res.json();
        expect(post.photo_url).toBe("https://firebasestorage.googleapis.com/photo.jpg?alt=media&token=t");
        expect(post).not.toHaveProperty("photo_path");
    });

    it("refuses a photo that isn't a JPEG", async () => {
        const res = await finishWith({ text: "Done", photo: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]) });
        expect(res.status).toBe(400);
        expect(photos.saveNowPhoto).not.toHaveBeenCalled();
        expect(fakeDb.writes).toEqual([]);
    });

    it("refuses a photo over 4 MB", async () => {
        const big = new Uint8Array(4 * 1024 * 1024 + 1);
        big.set(JPEG);
        const res = await finishWith({ text: "Done", photo: new Blob([big]) });
        expect(res.status).toBe(413);
        expect(photos.saveNowPhoto).not.toHaveBeenCalled();
    });

    it("returns 409 when no action is underway, and removes the photo it saved", async () => {
        fakeDb.seed(USER, { name: "Ana" });
        const res = await finishWith({ text: "Done", photo: new Blob([JPEG]) });
        expect(res.status).toBe(409);
        expect(fakeDb.docs.has(`${POSTS}/auto-1`)).toBe(false);
        expect(photos.deleteNowPhoto).toHaveBeenCalledWith(`now_posts/${TEST_UID}/auto-1/photo.jpg`);
    });

    it("returns 400 without form data", async () => {
        const res = await json(finish, "POST", { text: "Done" }, "http://localhost/api/now/posts");
        expect(res.status).toBe(400);
        expect(fakeDb.writes).toEqual([]);
    });
});

describe("/api/now/posts, one post", () => {
    const POSTS_URL = "http://localhost/api/now/posts";
    beforeEach(() => {
        fakeDb.seed(`${POSTS}/p1`, {
            action: "Walk the lake", raw_text: "went round", polished_text: "Went round.", polish: true,
            photo_url: "https://firebasestorage.googleapis.com/p1.jpg", photo_path: `now_posts/${TEST_UID}/p1/a.jpg`,
            started_at: STARTED, created_at: seconds(NOW - 60_000),
        });
    });

    it("GET returns the post with its polished words", async () => {
        const res = await json(GET, "GET", undefined, `${POSTS_URL}?id=p1`);
        expect(res.status).toBe(200);
        expect((await res.json()).post).toMatchObject({ id: "p1", polished_text: "Went round.", polishing: false, minutes: 24 });
    });

    it("GET returns 404 for a post that isn't there and 400 without a valid id", async () => {
        expect((await json(GET, "GET", undefined, `${POSTS_URL}?id=p2`)).status).toBe(404);
        expect((await json(GET, "GET", undefined, `${POSTS_URL}?id=../p1`)).status).toBe(400);
    });

    it("PATCH switches the post to the person's own words", async () => {
        const res = await json(PATCH, "PATCH", { id: "p1", show_raw: true }, POSTS_URL);
        expect(res.status).toBe(200);
        expect(fakeDb.writes).toEqual([{ op: "update", path: `${POSTS}/p1`, data: { show_raw: true } }]);
    });

    it("PATCH returns 404 for a post that isn't there and 400 without show_raw", async () => {
        expect((await json(PATCH, "PATCH", { id: "p2", show_raw: true }, POSTS_URL)).status).toBe(404);
        expect((await json(PATCH, "PATCH", { id: "p1" }, POSTS_URL)).status).toBe(400);
        expect(fakeDb.writes).toEqual([]);
    });

    it("DELETE removes the post and its photo", async () => {
        const res = await json(DELETE, "DELETE", { id: "p1" }, POSTS_URL);
        expect(res.status).toBe(200);
        expect(fakeDb.writes).toEqual([{ op: "delete", path: `${POSTS}/p1` }]);
        expect(photos.deleteNowPhoto).toHaveBeenCalledWith(`now_posts/${TEST_UID}/p1/a.jpg`);
    });

    it("DELETE returns 404 for a post that isn't there", async () => {
        expect((await json(DELETE, "DELETE", { id: "p2" }, POSTS_URL)).status).toBe(404);
        expect(photos.deleteNowPhoto).not.toHaveBeenCalled();
    });
});
