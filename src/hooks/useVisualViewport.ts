"use client";

import { useCallback, useEffect, useState } from "react";

// Track the visual viewport to detect when the software keyboard is open.
// When the keyboard appears the visual viewport shrinks; the difference
// between the layout height and the visual height is the keyboard height.
// We shift the fixed overlay upward by that amount so the input bar stays
// visible above the keyboard on iOS and Android.
// We also track visualViewport.offsetTop — on iOS the browser scrolls the
// fixed-position page down when focusing an input, which pushes the header
// above the visible area. By tracking offsetTop we can shift the entire
// container down to stay within the visible viewport.
export function useVisualViewport(isOpen: boolean) {
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const [viewportTop, setViewportTop] = useState(0);

    const updateKeyboardOffset = useCallback(() => {
        if (!window.visualViewport) return;
        const vvHeight = window.visualViewport.height;
        const layoutHeight = window.innerHeight;
        const offset = Math.max(0, layoutHeight - vvHeight - window.visualViewport.offsetTop);
        setKeyboardOffset(offset);
        setViewportTop(window.visualViewport.offsetTop);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setKeyboardOffset(0);
            setViewportTop(0);
            return;
        }
        const vv = window.visualViewport;
        if (!vv) return;
        vv.addEventListener('resize', updateKeyboardOffset);
        vv.addEventListener('scroll', updateKeyboardOffset);
        updateKeyboardOffset();
        return () => {
            vv.removeEventListener('resize', updateKeyboardOffset);
            vv.removeEventListener('scroll', updateKeyboardOffset);
        };
    }, [isOpen, updateKeyboardOffset]);

    return { keyboardOffset, viewportTop };
}
