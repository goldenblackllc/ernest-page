import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { CharacterProfile } from "@/types/character";

const h = vi.hoisted(() => ({ onProfile: (_p: CharacterProfile) => {} }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }));
vi.mock("@/context/AudioMuteContext", () => ({ useAudioMute: () => ({ suppressAutoPlay: vi.fn(), unsuppressAutoPlay: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children }: { children: React.ReactNode }) => children, usePathname: () => "/" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/firebase/config", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), setDoc: vi.fn() }));
vi.mock("@/lib/firebase/chat", () => ({ getMostRecentActiveChat: vi.fn(async () => null) }));
vi.mock("@/lib/firebase/character", () => ({
    subscribeToCharacterProfile: (_uid: string, cb: (p: CharacterProfile) => void) => { h.onProfile = cb; return () => {}; },
    updateWants: vi.fn(), updateLoves: vi.fn(), updatePeople: vi.fn(), updateDream: vi.fn(),
}));
vi.mock("@/hooks/useCharacterNow", () => ({ useCharacterNow: () => ({}) }));
vi.mock("../MirrorChat", () => ({ MirrorChat: () => null }));
vi.mock("../OnboardingForm", () => ({ OnboardingForm: () => <div>onboarding form</div> }));
vi.mock("../mylife/PillBar", () => ({ PillBar: () => null }));
vi.mock("../mylife/MyLifeDrawer", () => ({ MyLifeDrawer: () => null }));
vi.mock("../payments/PurchasePanel", () => ({ PurchasePanel: () => null }));

import { TriagePanel } from "../TriagePanel";

describe("TriagePanel onboarding", () => {
    it("opens onboarding for a user without a record and closes it once the record arrives", () => {
        render(<TriagePanel />);
        act(() => h.onProfile({ uid: "u1" }));
        expect(screen.getByText("onboarding form")).toBeInTheDocument();

        act(() => h.onProfile({ uid: "u1", onboarding_complete: true, defining_words: ["Calm"] }));
        expect(screen.queryByText("onboarding form")).not.toBeInTheDocument();
    });

    it("doesn't open onboarding for a user who has finished it", () => {
        render(<TriagePanel />);
        act(() => h.onProfile({ uid: "u1", onboarding_complete: true }));
        expect(screen.queryByText("onboarding form")).not.toBeInTheDocument();
    });
});
