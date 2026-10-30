import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { Action } from "@functions/lib/actions";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/authFetch", () => ({ authFetch }));

import { ActionsCard } from "../ActionsCard";

const user = { uid: "u1" } as User;
const actions: Action[] = [
    { id: "a", text: "Call Dad on Sunday", decided_on: "2026-10-20" },
    { id: "b", text: "Run by breath", decided_on: "2026-10-22", done_at: 5 },
];

beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("ActionsCard", () => {
    it("shows each action and whether it's ticked, without its date", () => {
        render(<ActionsCard user={user} actions={actions} />);
        expect(screen.getByText("My Actions")).toBeInTheDocument();
        expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument();
        expect(screen.queryByText(/Oct/)).not.toBeInTheDocument();
        const boxes = screen.getAllByRole("checkbox");
        expect(boxes.map(b => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    });

    it("renders nothing when there are no actions", () => {
        const { container } = render(<ActionsCard user={user} actions={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("ticks an action at once and sends it", async () => {
        let finish!: (r: Response) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        render(<ActionsCard user={user} actions={actions} />);
        fireEvent.click(screen.getAllByRole("checkbox")[0]);
        expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");
        expect(authFetch).toHaveBeenCalledWith(user, "/api/actions", expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ id: "a", done: true }),
        }));
        finish(new Response("{}", { status: 200 }));
    });

    it("hides a removed action at once and sends the delete", async () => {
        render(<ActionsCard user={user} actions={actions} />);
        let finish!: (r: Response) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();
        expect(authFetch).toHaveBeenCalledWith(user, "/api/actions", expect.objectContaining({
            method: "DELETE",
            body: JSON.stringify({ id: "a" }),
        }));
        finish(new Response("{}", { status: 200 }));
    });

    it("keeps a removed action hidden until the saved list drops it", async () => {
        const { rerender } = render(<ActionsCard user={user} actions={actions} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
        // The delete is saved, but the subscription hasn't brought the new list yet
        await waitFor(() => expect(authFetch).toHaveBeenCalled());
        await Promise.resolve();
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();

        rerender(<ActionsCard user={user} actions={actions.slice(1)} />);
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();
        // Once saved, the subscription is the truth again
        rerender(<ActionsCard user={user} actions={actions} />);
        expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument();
    });

    it("keeps a tick until the saved list shows it", async () => {
        const { rerender } = render(<ActionsCard user={user} actions={actions} />);
        fireEvent.click(screen.getAllByRole("checkbox")[0]);
        await waitFor(() => expect(authFetch).toHaveBeenCalled());
        await Promise.resolve();
        // An update without the tick yet (another field changed) doesn't undo it
        rerender(<ActionsCard user={user} actions={[...actions]} />);
        expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");

        const ticked = [{ ...actions[0], done_at: 9 }, actions[1]];
        rerender(<ActionsCard user={user} actions={ticked} />);
        rerender(<ActionsCard user={user} actions={actions} />);
        expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "false");
    });

    it("goes back to the saved state when the request fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        authFetch.mockResolvedValue(new Response("{}", { status: 500 }));
        render(<ActionsCard user={user} actions={actions} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
        await waitFor(() => expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument());
    });
});
