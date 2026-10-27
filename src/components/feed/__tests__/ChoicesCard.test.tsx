import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { Choice } from "@functions/lib/choices";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/authFetch", () => ({ authFetch }));

import { ChoicesCard } from "../ChoicesCard";

const user = { uid: "u1" } as User;
const choices: Choice[] = [
    { id: "a", text: "Call Dad on Sunday", chosen_on: "2026-10-20" },
    { id: "b", text: "Run by breath", chosen_on: "2026-10-22", done_at: 5 },
];

beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("ChoicesCard", () => {
    it("shows each choice and whether it's ticked, without its date", () => {
        render(<ChoicesCard user={user} choices={choices} />);
        expect(screen.getByText("My Actions")).toBeInTheDocument();
        expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument();
        expect(screen.queryByText(/Oct/)).not.toBeInTheDocument();
        const boxes = screen.getAllByRole("checkbox");
        expect(boxes.map(b => b.getAttribute("aria-checked"))).toEqual(["false", "true"]);
    });

    it("renders nothing when there are no choices", () => {
        const { container } = render(<ChoicesCard user={user} choices={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("ticks a choice at once and sends it", async () => {
        let finish!: (r: Response) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        render(<ChoicesCard user={user} choices={choices} />);
        fireEvent.click(screen.getAllByRole("checkbox")[0]);
        expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-checked", "true");
        expect(authFetch).toHaveBeenCalledWith(user, "/api/choices", expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ id: "a", done: true }),
        }));
        finish(new Response("{}", { status: 200 }));
    });

    it("hides a removed choice at once and sends the delete", async () => {
        render(<ChoicesCard user={user} choices={choices} />);
        let finish!: (r: Response) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();
        expect(authFetch).toHaveBeenCalledWith(user, "/api/choices", expect.objectContaining({
            method: "DELETE",
            body: JSON.stringify({ id: "a" }),
        }));
        finish(new Response("{}", { status: 200 }));
    });

    it("goes back to the saved state when the request fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        authFetch.mockResolvedValue(new Response("{}", { status: 500 }));
        render(<ChoicesCard user={user} choices={choices} />);
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
        await waitFor(() => expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument());
    });
});
