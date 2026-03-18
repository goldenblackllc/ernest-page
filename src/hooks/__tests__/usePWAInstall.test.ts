import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// We need to mock next-intl before importing the hook
vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));

describe('usePWAInstall', () => {
    let originalMatchMedia: typeof window.matchMedia;

    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();

        // Default: not in standalone mode
        originalMatchMedia = window.matchMedia;
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        vi.restoreAllMocks();
    });

    it('returns canInstall: false initially when no beforeinstallprompt has fired', async () => {
        const { usePWAInstall } = await import('@/hooks/usePWAInstall');
        const { result } = renderHook(() => usePWAInstall());

        expect(result.current.canInstall).toBe(false);
        expect(result.current.isInstalled).toBe(false);
    });

    it('captures the beforeinstallprompt event and sets canInstall to true', async () => {
        const { usePWAInstall } = await import('@/hooks/usePWAInstall');
        const { result } = renderHook(() => usePWAInstall());

        // Simulate beforeinstallprompt
        const mockPrompt = vi.fn().mockResolvedValue(undefined);
        const mockEvent = new Event('beforeinstallprompt') as any;
        mockEvent.prompt = mockPrompt;
        mockEvent.userChoice = Promise.resolve({ outcome: 'dismissed' as const });
        mockEvent.preventDefault = vi.fn();

        await act(async () => {
            window.dispatchEvent(mockEvent);
        });

        expect(result.current.canInstall).toBe(true);
    });

    it('dismiss persists to localStorage and sets canInstall to false', async () => {
        const { usePWAInstall } = await import('@/hooks/usePWAInstall');
        const { result } = renderHook(() => usePWAInstall());

        // First fire beforeinstallprompt
        const mockEvent = new Event('beforeinstallprompt') as any;
        mockEvent.prompt = vi.fn().mockResolvedValue(undefined);
        mockEvent.userChoice = Promise.resolve({ outcome: 'dismissed' as const });
        mockEvent.preventDefault = vi.fn();

        await act(async () => {
            window.dispatchEvent(mockEvent);
        });

        expect(result.current.canInstall).toBe(true);

        // Now dismiss
        act(() => {
            result.current.dismiss();
        });

        expect(result.current.canInstall).toBe(false);
        expect(localStorage.getItem('pwa-install-dismissed')).toBe('true');
    });

    it('returns canInstall: false when already dismissed in localStorage', async () => {
        // Pre-seed localStorage
        localStorage.setItem('pwa-install-dismissed', 'true');

        const { usePWAInstall } = await import('@/hooks/usePWAInstall');
        const { result } = renderHook(() => usePWAInstall());

        // Even if beforeinstallprompt fires, should stay false
        const mockEvent = new Event('beforeinstallprompt') as any;
        mockEvent.prompt = vi.fn();
        mockEvent.userChoice = Promise.resolve({ outcome: 'dismissed' as const });
        mockEvent.preventDefault = vi.fn();

        await act(async () => {
            window.dispatchEvent(mockEvent);
        });

        expect(result.current.canInstall).toBe(false);
    });

    it('detects standalone mode as installed', async () => {
        // Mock standalone mode
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === '(display-mode: standalone)',
            media: query,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        const { usePWAInstall } = await import('@/hooks/usePWAInstall');
        const { result } = renderHook(() => usePWAInstall());

        expect(result.current.isInstalled).toBe(true);
        expect(result.current.canInstall).toBe(false);
    });

    it('promptInstall calls the deferred prompt', async () => {
        const { usePWAInstall } = await import('@/hooks/usePWAInstall');
        const { result } = renderHook(() => usePWAInstall());

        const mockPrompt = vi.fn().mockResolvedValue(undefined);
        const mockEvent = new Event('beforeinstallprompt') as any;
        mockEvent.prompt = mockPrompt;
        mockEvent.userChoice = Promise.resolve({ outcome: 'accepted' as const });
        mockEvent.preventDefault = vi.fn();

        await act(async () => {
            window.dispatchEvent(mockEvent);
        });

        expect(result.current.canInstall).toBe(true);

        await act(async () => {
            await result.current.promptInstall();
        });

        expect(mockPrompt).toHaveBeenCalled();
        expect(result.current.isInstalled).toBe(true);
    });
});
