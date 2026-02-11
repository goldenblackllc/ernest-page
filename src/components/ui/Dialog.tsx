"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    // Handle escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onOpenChange?.(false);
            }
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onOpenChange]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => onOpenChange?.(false)}
            />
            {/* Dialog Container - we pass this context to children effectively */}
            {children}
        </div>
    );
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export function DialogContent({ children, className, ...props }: DialogContentProps) {
    return (
        <div
            className={cn(
                "relative z-50 w-full bg-white shadow-lg animate-in fade-in zoom-in-95 duration-200",
                className
            )}
            onClick={(e) => e.stopPropagation()}
            {...props}
        >
            {children}
        </div>
    );
}

// Minimal trigger for compatibility, though we are controlling state externally in the modal
export function DialogTrigger({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
    return <>{children}</>;
}
