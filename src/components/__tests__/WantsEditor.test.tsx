import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { WantsEditor } from "../mylife/WantsEditor";
import { WantItem } from "@/types/character";

describe("WantsEditor", () => {
    const mockWants: WantItem[] = [
        { id: "1", text: "Learn Spanish", completed: true, created_at: 1000 },
        { id: "2", text: "Buy a sailboat", completed: false, created_at: 2000 },
        { id: "3", text: "Run a marathon", completed: false, created_at: 3000 },
    ];

    it("renders title 'What I Want'", () => {
        render(<WantsEditor wants={mockWants} onSave={vi.fn()} />);
        const title = screen.getByText("What I Want");
        expect(title).toBeDefined();
        expect(title.className).toContain("text-xl");
        expect(title.className).toContain("font-bold");
    });

    it("sorts unchecked items first, checked items at bottom", () => {
        render(<WantsEditor wants={mockWants} onSave={vi.fn()} />);
        const items = screen.getAllByText(/Buy a sailboat|Run a marathon|Learn Spanish/);
        expect(items[0].textContent).toBe("Buy a sailboat");
        expect(items[1].textContent).toBe("Run a marathon");
        expect(items[2].textContent).toBe("Learn Spanish");
    });

    it("applies correct styling for checked and unchecked items", () => {
        render(<WantsEditor wants={mockWants} onSave={vi.fn()} />);
        const checkedText = screen.getByText("Learn Spanish");
        expect(checkedText.className).toContain("text-zinc-500");
        expect(checkedText.className).toContain("line-through");

        const uncheckedText = screen.getByText("Buy a sailboat");
        expect(uncheckedText.className).toContain("text-white");
    });

    it("toggles completed status when circle checkbox is tapped", () => {
        const onSave = vi.fn();
        render(<WantsEditor wants={mockWants} onSave={onSave} />);

        const toggleBtn = screen.getByLabelText('Mark "Buy a sailboat" as complete');
        fireEvent.click(toggleBtn);

        expect(onSave).toHaveBeenCalledTimes(1);
        const updated = onSave.mock.calls[0][0];
        const toggledItem = updated.find((item: WantItem) => item.id === "2");
        expect(toggledItem.completed).toBe(true);
    });

    it("deletes item when delete button (X) is clicked", () => {
        const onSave = vi.fn();
        render(<WantsEditor wants={mockWants} onSave={onSave} />);

        const deleteBtn = screen.getByLabelText('Delete "Buy a sailboat"');
        fireEvent.click(deleteBtn);

        expect(onSave).toHaveBeenCalledTimes(1);
        const updated = onSave.mock.calls[0][0];
        expect(updated.find((item: WantItem) => item.id === "2")).toBeUndefined();
        expect(updated.length).toBe(2);
    });

    it("adds a new item on submit and clears input", () => {
        const onSave = vi.fn();
        render(<WantsEditor wants={mockWants} onSave={onSave} />);

        const input = screen.getByPlaceholderText("Add a want...") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "Visit Japan" } });
        expect(input.value).toBe("Visit Japan");

        fireEvent.submit(input.closest("form")!);

        expect(onSave).toHaveBeenCalledTimes(1);
        const updated = onSave.mock.calls[0][0];
        expect(updated.length).toBe(4);
        const newItem = updated[3];
        expect(newItem.text).toBe("Visit Japan");
        expect(newItem.completed).toBe(false);
        expect(typeof newItem.id).toBe("string");
        expect(newItem.id.length).toBeGreaterThan(0);
        expect(typeof newItem.created_at).toBe("number");

        expect(input.value).toBe("");
    });
});
