"use client";

import { cn } from "@/lib/utils";

export type MyLifeSection = "wants" | "loves" | "people" | "dream";

export interface PillBarProps {
  activeSection: MyLifeSection | null;
  onSelect: (section: MyLifeSection | null) => void;
  className?: string;
}

interface PillConfig {
  id: MyLifeSection;
  label: string;
}

const SECTIONS: PillConfig[] = [
  { id: "wants", label: "Wants" },
  { id: "loves", label: "Loves" },
  { id: "people", label: "People" },
  { id: "dream", label: "Dream" },
];

/**
 * PillBar component renders four pill-shaped buttons in a horizontal row.
 * Designed to sit above the bottom navigation bar to control drawers/sections.
 *
 * Tapping the active pill calls `onSelect(null)` to toggle off/close.
 * Tapping an inactive pill calls `onSelect(section)` to switch sections.
 */
export function PillBar({ activeSection, onSelect, className }: PillBarProps) {
  const handleClick = (section: MyLifeSection) => {
    if (activeSection === section) {
      onSelect(null);
    } else {
      onSelect(section);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="My Life sections"
      className={cn("flex items-center justify-between gap-2 px-4 py-2", className)}
    >
      {SECTIONS.map(({ id, label }) => {
        const isActive = activeSection === id;

        return (
          <button
            key={id}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleClick(id)}
            className={cn(
              "flex-1 text-center py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer select-none",
              isActive
                ? "bg-amber-400 text-black font-bold border border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)] scale-[1.02]"
                : "bg-amber-500/80 text-black/80 font-semibold border border-amber-400/50 hover:bg-amber-400 hover:text-black"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default PillBar;
