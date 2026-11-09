import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import type { Action } from "@functions/lib/actions";

const authFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/authFetch", () => ({ authFetch }));

import { ActionsList } from "../ActionsList";

const user = { uid: "u1" } as User;
const TODAY = "2026-10-25";
const actions: Action[] = [
    { id: "a", text: "Call Dad on Sunday", kind: "once", decided_on: "2026-10-20" },
    { id: "b", text: "Run by breath", kind: "daily", decided_on: "2026-10-22", done_on: TODAY },
    { id: "c", text: "Rest when tired", kind: "daily", decided_on: "2026-10-22", done_on: "2026-10-24" },
    { id: "d", text: "Order the notebook", decided_on: "2026-10-21", done_on: "2026-10-24" },
];
const list = (saved = actions, score = 7) =>
    <ActionsList user={user} actions={saved} score={score} today={TODAY} timeZone="America/New_York" />;
const ticks = () => screen.getAllByRole("checkbox").map(b => b.getAttribute("aria-checked"));

beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("ActionsList", () => {
    it("shows every-day actions, then once ones, with today's ticks and without dates", () => {
        render(list());
        const headings = screen.getAllByRole("heading").map(h => h.textContent);
        expect(headings).toEqual(["Every day", "Once"]);
        expect(screen.getAllByRole("listitem").map(li => li.textContent)).toEqual(["Run by breath", "Rest when tired", "Call Dad on Sunday"]);
        // Yesterday's tick on an every-day action doesn't count today
        expect(ticks()).toEqual(["true", "false", "false"]);
        expect(screen.queryByText(/Oct|2026/)).not.toBeInTheDocument();
    });

    it("leaves out a once action ticked on an earlier day", () => {
        render(list());
        expect(screen.queryByText("Order the notebook")).not.toBeInTheDocument();
    });

    it("shows the score and how many are ticked today", () => {
        render(list());
        expect(screen.getByText("7 points")).toBeInTheDocument();
        expect(screen.getByText("· +1 today")).toBeInTheDocument();
    });

    it("says where actions come from when there are none", () => {
        render(list([], 0));
        expect(screen.getByText("0 points")).toBeInTheDocument();
        expect(screen.getByText("The actions you decide on in your sessions show up here.")).toBeInTheDocument();
    });

    it("ticks an action at once, with its point, and sends it with the time zone", async () => {
        let finish!: (r: Response) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        render(list());
        fireEvent.click(screen.getAllByRole("checkbox")[2]);
        expect(ticks()[2]).toBe("true");
        expect(screen.getByText("8 points")).toBeInTheDocument();
        expect(authFetch).toHaveBeenCalledWith(user, "/api/actions", expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ id: "a", done: true, timeZone: "America/New_York" }),
        }));
        finish(new Response("{}", { status: 200 }));
    });

    it("takes the point back at once when today's tick is undone", () => {
        render(list());
        fireEvent.click(screen.getAllByRole("checkbox")[0]);
        expect(ticks()[0]).toBe("false");
        expect(screen.getByText("6 points")).toBeInTheDocument();
    });

    it("hides a removed action at once and sends the delete", async () => {
        render(list());
        let finish!: (r: Response) => void;
        authFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]);
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();
        expect(authFetch).toHaveBeenCalledWith(user, "/api/actions", expect.objectContaining({
            method: "DELETE",
            body: JSON.stringify({ id: "a" }),
        }));
        finish(new Response("{}", { status: 200 }));
    });

    it("keeps a removed action hidden until the saved list drops it", async () => {
        const { rerender } = render(list());
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]);
        // The delete is saved, but the subscription hasn't brought the new list yet
        await waitFor(() => expect(authFetch).toHaveBeenCalled());
        await Promise.resolve();
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();

        rerender(list(actions.filter(c => c.id !== "a")));
        expect(screen.queryByText("Call Dad on Sunday")).not.toBeInTheDocument();
        // Once saved, the subscription is the truth again
        rerender(list());
        expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument();
    });

    it("keeps a tick until the saved list shows it", async () => {
        const { rerender } = render(list());
        fireEvent.click(screen.getAllByRole("checkbox")[2]);
        await waitFor(() => expect(authFetch).toHaveBeenCalled());
        await Promise.resolve();
        // An update without the tick yet (another field changed) doesn't undo it
        rerender(list([...actions]));
        expect(ticks()[2]).toBe("true");

        const ticked = actions.map(c => (c.id === "a" ? { ...c, done_on: TODAY } : c));
        rerender(list(ticked, 8));
        expect(screen.getByText("8 points")).toBeInTheDocument();
        rerender(list());
        expect(ticks()[2]).toBe("false");
    });

    it("goes back to the saved state when the request fails", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        authFetch.mockResolvedValue(new Response("{}", { status: 500 }));
        render(list());
        fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[2]);
        await waitFor(() => expect(screen.getByText("Call Dad on Sunday")).toBeInTheDocument());
    });
});
