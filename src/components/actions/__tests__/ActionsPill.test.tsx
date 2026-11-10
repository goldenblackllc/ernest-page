import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { CharacterProfile } from "@/types/character";

vi.mock("@/lib/auth/authFetch", () => ({ authFetch: vi.fn() }));

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

beforeEach(() => {
    localStorage.clear();
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
});
