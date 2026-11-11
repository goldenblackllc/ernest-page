import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import type { CharacterProfile } from "@/types/character";
import type { NowPost } from "@/types/post";

vi.mock("@/lib/auth/authFetch", () => ({ authFetch: vi.fn() }));

import { authFetch } from "@/lib/auth/authFetch";
import { NowPill } from "../NowPill";
import { NowCard } from "../NowCard";
import { NOW_POSTED_EVENT, openNowSheet } from "../nowSheet";

const user = { uid: "u1" } as User;
const NOW = Date.UTC(2026, 10, 10, 16, 0);
const underway = {
    action: "Walk the lake",
    options: ["Walk the lake", "Call Mom", "Write"],
    started_at: Timestamp.fromMillis(NOW - 25 * 60_000),
};
const idle: CharacterProfile = { uid: "u1" };
const busy: CharacterProfile = { uid: "u1", now: { underway, polish: true } };
const post: NowPost = {
    kind: "now", id: "n1", action: "Walk the lake", raw_text: "Saw a heron.", polished_text: null, show_raw: false,
    photo_url: null, minutes: 25, polishing: true, created_at: { _seconds: NOW / 1000, _nanoseconds: 0 },
};

const fetchMock = vi.mocked(authFetch);
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const openPill = () => fireEvent.click(screen.getByRole("button", { name: "Now" }));
const drawer = () => screen.queryByRole("dialog", { name: "Now" });
const note = () => screen.getByLabelText("What happened? Anything unexpected?");
const typeOption = (number: number, text: string) =>
    fireEvent.change(screen.getByRole("textbox", { name: `Option ${number}` }), { target: { value: text } });
const options = () => screen.getAllByRole("textbox").map((el) => (el as HTMLInputElement).value);

beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    act(() => openNowSheet(null));
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("Now: Take action", () => {
    it("opens straight to the list when nothing is underway", () => {
        render(<NowPill user={user} profile={idle} />);
        openPill();
        expect(screen.getByRole("heading", { name: "Take action" })).toBeInTheDocument();
        expect(options()).toEqual([""]);
    });

    it("asks for a list, then a pick, before committing", () => {
        render(<NowPill user={user} profile={idle} />);
        openPill();
        fireEvent.click(screen.getByRole("button", { name: "Commit" }));
        expect(screen.getByRole("alert")).toHaveTextContent("List an option first.");

        typeOption(1, "Walk the lake");
        typeOption(2, "Call Mom");
        expect(options()).toEqual(["Walk the lake", "Call Mom", ""]);
        fireEvent.click(screen.getByRole("button", { name: "Commit" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Pick one first.");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("commits to the picked option and closes", async () => {
        fetchMock.mockResolvedValue(reply({ ok: true }));
        render(<NowPill user={user} profile={idle} />);
        openPill();
        typeOption(1, "Walk the lake");
        typeOption(2, " Call Mom ");
        fireEvent.click(screen.getByRole("radio", { name: "Call Mom" }));
        expect(screen.getByRole("radio", { name: "Call Mom" })).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("button", { name: "Commit" }));

        await waitFor(() => expect(drawer()).not.toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledWith(user, "/api/now", expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ options: ["Walk the lake", "Call Mom"], action: "Call Mom" }),
        }));
    });

    it("needs no pick with a single option", async () => {
        fetchMock.mockResolvedValue(reply({ ok: true }));
        render(<NowPill user={user} profile={idle} />);
        openPill();
        typeOption(1, "Write");
        fireEvent.click(screen.getByRole("button", { name: "Commit" }));
        await waitFor(() => expect(drawer()).not.toBeInTheDocument());
        expect(fetchMock.mock.calls[0][2]?.body).toBe(JSON.stringify({ options: ["Write"], action: "Write" }));
    });
});

describe("Now: Finish", () => {
    it("opens Finish while an action is underway, with Polish as last time", () => {
        render(<NowPill user={user} profile={busy} />);
        openPill();
        expect(screen.getByRole("heading", { name: "Walk the lake 25 min" })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: /Polish/ })).toBeChecked();
    });

    it("posts what happened, then Next brings back the options not picked", async () => {
        const posted = vi.fn();
        window.addEventListener(NOW_POSTED_EVENT, posted);
        fetchMock.mockResolvedValue(reply({ post, remaining: ["Call Mom", "Write"] }));
        render(<NowPill user={user} profile={busy} />);
        openPill();
        fireEvent.change(note(), { target: { value: "Saw a heron." } });
        fireEvent.click(screen.getByRole("button", { name: "Done" }));

        expect(await screen.findByRole("status")).toHaveTextContent("Posted. Only you can see it.");
        const [, path, init] = fetchMock.mock.calls[0];
        expect(path).toBe("/api/now/posts");
        expect((init?.body as FormData).get("text")).toBe("Saw a heron.");
        expect((init?.body as FormData).get("polish")).toBe("true");
        expect(posted.mock.calls[0][0].detail).toEqual(post);
        window.removeEventListener(NOW_POSTED_EVENT, posted);

        fireEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(screen.getByRole("heading", { name: "Take action" })).toBeInTheDocument();
        expect(options()).toEqual(["Call Mom", "Write", ""]);
    });

    it("keeps what was written when the sheet is closed", () => {
        render(<NowPill user={user} profile={busy} />);
        openPill();
        fireEvent.change(note(), { target: { value: "Halfway round." } });
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(drawer()).not.toBeInTheDocument();

        openPill();
        expect(note()).toHaveValue("Halfway round.");
    });

    it("stays open with what was written when posting fails", async () => {
        fetchMock.mockResolvedValue(reply({ error: "Server error" }, 500));
        render(<NowPill user={user} profile={busy} />);
        openPill();
        fireEvent.change(note(), { target: { value: "Saw a heron." } });
        fireEvent.click(screen.getByRole("button", { name: "Done" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("That didn't save. Try again.");
        expect(note()).toHaveValue("Saw a heron.");
    });

    it("asks before dropping the action, then ends it with no post", async () => {
        fetchMock.mockResolvedValue(reply({ ok: true }));
        render(<NowPill user={user} profile={busy} />);
        openPill();
        fireEvent.click(screen.getByRole("button", { name: "Drop it" }));
        expect(screen.getByText("End it without a post?")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Drop" }));
        await waitFor(() => expect(drawer()).not.toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledWith(user, "/api/now", { method: "DELETE" });
    });
});

describe("NowCard", () => {
    it("shows the action underway and its time so far, and opens Finish", () => {
        render(<><NowCard underway={underway} /><NowPill user={user} profile={busy} /></>);
        const card = screen.getByRole("button", { name: "Now: Walk the lake. Tap to finish." });
        expect(card).toHaveTextContent("Walk the lake");
        expect(card).toHaveTextContent("25 min");
        fireEvent.click(card);
        expect(note()).toBeInTheDocument();
    });
});
