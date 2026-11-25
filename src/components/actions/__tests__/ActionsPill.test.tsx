import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { CharacterProfile } from "@/types/character";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/authFetch", () => ({ authFetch }));

import { ActionsPill } from "../ActionsPill";

const user = { uid: "u1" } as User;
const profile: CharacterProfile = {
    uid: "u1",
    action_score: 12,
    identity: { text: "I am a gentleman, a father, and retired.", title: "Gentleman, Father, Retired" },
    actions: [{ id: "a", text: "Rest when tired", kind: "daily", decided_on: "2026-10-20" }],
};
const pill = () => screen.getByRole("button", { name: "My Actions, 12 points" });
const pulses = () => !!pill().querySelector(".animate-ping");

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
    localStorage.clear();
    authFetch.mockReset();
    authFetch.mockImplementation(async () => reply({}));
});

describe("ActionsPill", () => {
    it("shows Be and the score", () => {
        render(<ActionsPill user={user} profile={profile} />);
        expect(pill()).toHaveTextContent("Be12");
    });

    it("shows nothing until there is an action or an identity", () => {
        const { container } = render(<ActionsPill user={user} profile={{ uid: "u1" }} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("opens the drawer with who they decided to be and their actions", () => {
        render(<ActionsPill user={user} profile={profile} />);
        fireEvent.click(pill());
        const drawer = screen.getByRole("dialog", { name: "My Actions" });
        expect(drawer).toHaveTextContent("I am a gentleman, a father, and retired.");
        expect(drawer).toHaveTextContent("Rest when tired");
    });

    it("pulses until the person has seen the actions, and remembers it", () => {
        const { unmount } = render(<ActionsPill user={user} profile={profile} />);
        expect(pulses()).toBe(true);
        fireEvent.click(pill());
        expect(pulses()).toBe(false);
        unmount();

        render(<ActionsPill user={user} profile={profile} />);
        expect(pulses()).toBe(false);
    });

    it("pulses again when a session adds an action", () => {
        const { rerender } = render(<ActionsPill user={user} profile={profile} />);
        fireEvent.click(pill());
        fireEvent.keyDown(window, { key: "Escape" });
        const added = { ...profile, actions: [...profile.actions!, { id: "b", text: "Call Dad", kind: "once" as const, decided_on: "2026-10-25" }] };
        rerender(<ActionsPill user={user} profile={added} />);
        expect(pulses()).toBe(true);
    });

    it("shows the saved list when the subscription's copy is out of date", async () => {
        // The subscription still has "Rest when tired", merged away by a session
        const saved = [{ id: "c", text: "Rest and walk when tired", kind: "daily" as const, decided_on: "2026-10-20" }];
        authFetch.mockImplementation(async () => reply({ actions: saved, score: 15 }));
        render(<ActionsPill user={user} profile={profile} />);
        fireEvent.click(pill());
        const drawer = screen.getByRole("dialog", { name: "My Actions" });
        await waitFor(() => expect(drawer).toHaveTextContent("Rest and walk when tired"));
        expect(drawer).not.toHaveTextContent("Rest when tired");
        expect(screen.getByRole("button", { name: "My Actions, 15 points" })).toBeInTheDocument();
    });

    it("keeps a deleted action gone after the drawer closes and opens again", async () => {
        const two = { ...profile, actions: [...profile.actions!, { id: "b", text: "Call Dad", kind: "once" as const, decided_on: "2026-10-25" }] };
        authFetch.mockImplementation(async (_user, _url, init?: RequestInit) =>
            reply(init?.method === "DELETE" ? { actions: profile.actions, score: 12 } : { actions: two.actions, score: 12 }));
        render(<ActionsPill user={user} profile={two} />);
        fireEvent.click(pill());
        await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
        await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(2));

        // The subscription never brings the delete; the reply's list is shown instead
        authFetch.mockImplementation(async () => reply({ actions: profile.actions, score: 12 }));
        fireEvent.keyDown(window, { key: "Escape" });
        fireEvent.click(pill());
        await waitFor(() => expect(authFetch).toHaveBeenCalledTimes(3));
        expect(screen.getByRole("dialog", { name: "My Actions" })).not.toHaveTextContent("Call Dad");
    });

    it("goes back to the subscription's list once it changes", async () => {
        authFetch.mockImplementation(async () => reply({ actions: [], score: 3 }));
        const { rerender } = render(<ActionsPill user={user} profile={profile} />);
        fireEvent.click(pill());
        await waitFor(() => expect(screen.getByRole("button", { name: "My Actions, 3 points" })).toBeInTheDocument());
        rerender(<ActionsPill user={user} profile={{ ...profile, action_score: 13 }} />);
        expect(screen.getByRole("button", { name: "My Actions, 13 points" })).toBeInTheDocument();
    });
});
