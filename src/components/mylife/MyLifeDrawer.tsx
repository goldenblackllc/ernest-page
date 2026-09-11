"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface MyLifeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * MyLifeDrawer component renders a slide-up sheet/drawer container
 * that holds editor content above the PillBar and bottom navigation bar.
 */
export function MyLifeDrawer({
  isOpen,
  onClose,
  children,
  className,
}: MyLifeDrawerProps) {
  const [visible, setVisible] = useState(false);

  // Trigger slide-up and fade-in animation on mount/open
  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => {
        cancelAnimationFrame(raf);
      };
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Scrim / Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 z-[45] transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Container */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[46]",
          "max-h-[70vh] flex flex-col",
          "bg-zinc-900 rounded-t-2xl border-t border-zinc-700/50",
          "pb-[calc(7rem+env(safe-area-inset-bottom))]",
          className
        )}
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag Handle */}
        <div
          className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mt-3 mb-2 shrink-0"
          aria-hidden="true"
        />

        {/* Scrollable Children Content Area */}
        <div className="flex-1 min-h-0 px-5 pb-4 flex flex-col overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}

export default MyLifeDrawer;
