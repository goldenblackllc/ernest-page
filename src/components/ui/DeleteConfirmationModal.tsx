"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    description?: string;
}

export function DeleteConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Delete Entry?",
    description = "This action cannot be undone."
}: DeleteConfirmationModalProps) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const deleteRef = useRef<HTMLButtonElement>(null);

    // Body scroll lock
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [isOpen]);

    // Auto-focus Cancel on open
    useEffect(() => {
        if (isOpen) {
            // Small delay to let the DOM render
            requestAnimationFrame(() => cancelRef.current?.focus());
        }
    }, [isOpen]);

    // Keyboard: Escape to close, Tab trap
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        if (e.key === 'Tab') {
            const focusable = [cancelRef.current, deleteRef.current].filter(Boolean) as HTMLElement[];
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
            onClick={onClose}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            aria-describedby="delete-modal-desc"
        >
            <div
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col items-center text-center">
                    {/* Warning icon */}
                    <div className="w-12 h-12 rounded-full bg-red-950/30 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                    </div>

                    <h3
                        id="delete-modal-title"
                        className="text-lg font-bold text-white mb-2"
                    >
                        {title}
                    </h3>

                    <p
                        id="delete-modal-desc"
                        className="text-sm text-zinc-400 mb-6"
                    >
                        {description}
                    </p>

                    <div className="flex gap-3 w-full">
                        <button
                            ref={cancelRef}
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-lg text-zinc-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            ref={deleteRef}
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors text-sm font-bold shadow-lg shadow-red-900/20"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
