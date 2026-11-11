import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import type { NowPost } from "@/types/post";

const user = { uid: "u1" };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user }) }));
vi.mock("@/lib/auth/authFetch", () => ({ authFetch: vi.fn() }));

import { authFetch } from "@/lib/auth/authFetch";
import { NowPostCard } from "../NowPostCard";

const NOW = new Date(2026, 10, 10, 18, 0).getTime();
const created = Math.floor(new Date(2026, 10, 10, 16, 5).getTime() / 1000);
const post: NowPost = {
    kind: "now", id: "n1", action: "Walk the lake", raw_text: "went round saw a heron",
    polished_text: "Went round. Saw a heron.", show_raw: false,
    photo_url: "https://firebasestorage.googleapis.com/n1.jpg", minutes: 25, polishing: false,
    created_at: { _seconds: created, _nanoseconds: 0 },
};

const fetchMock = vi.mocked(authFetch);
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("NowPostCard", () => {
    it("shows the photo, the action, when and for how long, and the polished words", () => {
        vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
        const { container } = render(<NowPostCard post={post} onChange={vi.fn()} onRequestDelete={vi.fn()} />);
        expect(container.querySelector("img")).toHaveAttribute("src", post.photo_url);
        expect(screen.getByRole("heading", { name: "Walk the lake" })).toBeInTheDocument();
        expect(container.textContent?.replace(/\s/g, " ")).toContain("Now · Today, 4:05 PM · 25 min");
        expect(screen.getByText("Went round. Saw a heron.")).toBeInTheDocument();
        expect(screen.getByText("Only Me")).toBeInTheDocument();
    });

    it("switches to the person's own words and saves the choice", async () => {
        fetchMock.mockResolvedValue(reply({ ok: true }));
        const onChange = vi.fn();
        render(<NowPostCard post={post} onChange={onChange} onRequestDelete={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Show raw" }));
        expect(onChange).toHaveBeenCalledWith({ ...post, show_raw: true });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(user, "/api/now/posts", expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ id: "n1", show_raw: true }),
        })));
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("switches back when saving the choice fails", async () => {
        fetchMock.mockResolvedValue(reply({ error: "Server error" }, 500));
        const onChange = vi.fn();
        render(<NowPostCard post={post} onChange={onChange} onRequestDelete={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Show raw" }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ ...post, show_raw: false }));
    });

    it("shows the raw words when the person chose them", () => {
        render(<NowPostCard post={{ ...post, show_raw: true }} onChange={vi.fn()} onRequestDelete={vi.fn()} />);
        expect(screen.getByText("went round saw a heron")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Show polished" })).toBeInTheDocument();
    });

    it("picks up the polished words when they land", async () => {
        vi.useFakeTimers();
        const polishing = { ...post, polished_text: null, polishing: true };
        fetchMock
            .mockResolvedValueOnce(reply({ post: polishing }))
            .mockResolvedValueOnce(reply({ post }));
        const onChange = vi.fn();
        render(<NowPostCard post={polishing} onChange={onChange} onRequestDelete={vi.fn()} />);
        expect(screen.getByText("Polishing…")).toBeInTheDocument();
        expect(screen.getByText("went round saw a heron")).toBeInTheDocument();

        await act(() => vi.advanceTimersByTimeAsync(4000));
        expect(fetchMock).toHaveBeenCalledWith(user, "/api/now/posts?id=n1", { cache: "no-store" });
        expect(onChange).not.toHaveBeenCalled();

        await act(() => vi.advanceTimersByTimeAsync(6000));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "n1", polished_text: "Went round. Saw a heron.", polishing: false }));
    });

    it("asks to delete the post", () => {
        const onRequestDelete = vi.fn();
        render(<NowPostCard post={post} onChange={vi.fn()} onRequestDelete={onRequestDelete} />);
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(onRequestDelete).toHaveBeenCalledWith("n1");
    });
});
