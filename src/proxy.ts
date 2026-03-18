import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Security headers applied to all page responses
const SECURITY_HEADERS: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-DNS-Prefetch-Control': 'on',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(self)',
};

export default function proxy(request: NextRequest) {
    const response = intlMiddleware(request);

    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        response.headers.set(key, value);
    }

    return response;
}

export const config = {
  // Match all pathnames except for:
  // - /api, /trpc, /_next, /_vercel routes
  // - files with extensions (e.g. favicon.ico, images)
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
