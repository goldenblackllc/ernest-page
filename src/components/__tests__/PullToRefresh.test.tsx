import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';

// Mock next-intl
vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

// Mock framer-motion to render plain divs
vi.mock('framer-motion', () => ({
    motion: {
        div: React.forwardRef(({ children, animate, transition, className, ...props }: any, ref: any) => {
            const style = animate?.height !== undefined ? { height: animate.height } : {};
            return React.createElement('div', { ref, className, style, ...props }, children);
        }),
    },
    AnimatePresence: ({ children }: any) => children,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
    Loader2: (props: any) => React.createElement('span', { ...props, 'data-testid': 'loader' }, '⟳'),
}));

import { PullToRefresh } from '@/components/PullToRefresh';

describe('PullToRefresh', () => {
    let onRefresh: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        onRefresh = vi.fn().mockResolvedValue(undefined);

        // Mock scrollY to 0 (at top)
        Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
        Object.defineProperty(document.documentElement, 'scrollTop', { value: 0, writable: true });
        Object.defineProperty(document.body, 'scrollTop', { value: 0, writable: true });
    });

    it('does not activate when page is scrolled down', () => {
        Object.defineProperty(window, 'scrollY', { value: 100, writable: true });

        const { container } = render(
            <PullToRefresh onRefresh={onRefresh}>
                <div>Content</div>
            </PullToRefresh>
        );

        const wrapper = container.firstChild as HTMLElement;

        fireEvent.touchStart(wrapper, { touches: [{ clientY: 200 }] });
        fireEvent.touchMove(wrapper, { touches: [{ clientY: 300 }] });
        fireEvent.touchEnd(wrapper);

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('calls onRefresh when pulled past the threshold (60px pull = 24px dampened, need 150px+ to overcome 0.4 damping)', async () => {
        const { container } = render(
            <PullToRefresh onRefresh={onRefresh}>
                <div>Content</div>
            </PullToRefresh>
        );

        const wrapper = container.firstChild as HTMLElement;

        // Pull distance * 0.4 must exceed 60px threshold, so pull 200px
        fireEvent.touchStart(wrapper, { touches: [{ clientY: 100 }] });
        fireEvent.touchMove(wrapper, { touches: [{ clientY: 300 }] });
        fireEvent.touchEnd(wrapper);

        expect(onRefresh).toHaveBeenCalled();
    });

    it('does NOT call onRefresh when pull is below threshold', () => {
        const { container } = render(
            <PullToRefresh onRefresh={onRefresh}>
                <div>Content</div>
            </PullToRefresh>
        );

        const wrapper = container.firstChild as HTMLElement;

        // Pull only 50px (50 * 0.4 = 20px dampened, below 60px threshold)
        fireEvent.touchStart(wrapper, { touches: [{ clientY: 100 }] });
        fireEvent.touchMove(wrapper, { touches: [{ clientY: 150 }] });
        fireEvent.touchEnd(wrapper);

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('renders children correctly', () => {
        render(
            <PullToRefresh onRefresh={onRefresh}>
                <div data-testid="child">Hello</div>
            </PullToRefresh>
        );

        expect(screen.getByTestId('child')).toBeTruthy();
        expect(screen.getByText('Hello')).toBeTruthy();
    });
});
