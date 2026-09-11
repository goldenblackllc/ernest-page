import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PillBar, MyLifeSection } from "../PillBar";

describe("PillBar", () => {
  it("renders all four pill buttons with correct labels", () => {
    render(<PillBar activeSection={null} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: "Wants" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loves" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dream" })).toBeInTheDocument();
  });

  it("applies active styles and aria-pressed when a section is active", () => {
    render(<PillBar activeSection="wants" onSelect={() => {}} />);

    const wantsBtn = screen.getByRole("button", { name: "Wants" });
    const lovesBtn = screen.getByRole("button", { name: "Loves" });

    expect(wantsBtn).toHaveAttribute("aria-pressed", "true");
    expect(wantsBtn.className).toContain("bg-amber-500/20");
    expect(wantsBtn.className).toContain("text-amber-400");
    expect(wantsBtn.className).toContain("border-amber-500/40");
    expect(wantsBtn.className).toContain("shadow-[0_0_12px_rgba(245,158,11,0.15)]");

    expect(lovesBtn).toHaveAttribute("aria-pressed", "false");
    expect(lovesBtn.className).toContain("bg-zinc-800/80");
    expect(lovesBtn.className).toContain("text-zinc-400");
    expect(lovesBtn.className).toContain("border-zinc-700/50");
  });

  it("calls onSelect with section name when inactive pill is clicked", () => {
    const onSelect = vi.fn();
    render(<PillBar activeSection={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Loves" }));
    expect(onSelect).toHaveBeenCalledWith("loves");
  });

  it("calls onSelect(null) when active pill is clicked to toggle off", () => {
    const onSelect = vi.fn();
    render(<PillBar activeSection="people" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "People" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("switches section when a different pill is clicked while one is active", () => {
    const onSelect = vi.fn();
    render(<PillBar activeSection="dream" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Wants" }));
    expect(onSelect).toHaveBeenCalledWith("wants");
  });
});
