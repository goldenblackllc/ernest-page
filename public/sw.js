// ═══════════════════════════════════════════════════════════════════
// Earnest Page — Service Worker (App Shell Caching)
// Goal: Instant cold-open by serving cached assets before network.
// ═══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'ep-v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// Assets to precache on install (critical for first paint)
const PRECACHE_ASSETS = [
    '/fonts/hkgrotesk/hkgrotesk-light-webfont.woff2',
    '/fonts/hkgrotesk/hkgrotesk-regular-webfont.woff2',
    '/fonts/hkgrotesk/hkgrotesk-bold-webfont.woff2',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
    '/apple-touch-icon.png',
    '/favicon.ico',
    '/site.webmanifest',
];

// ─── Install: precache critical static assets ───────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: clean up old caches ─────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ─── Fetch: strategy per request type ──────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests (POST to API, etc.)
    if (request.method !== 'GET') return;

    // Skip API routes, auth, and tracking — always network
    if (url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/__/') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseinstallations') ||
        url.hostname.includes('identitytoolkit')) {
        return;
    }

    // Strategy 1: Cache-first for static assets (fonts, images, _next/static)
    if (url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/fonts/') ||
        url.pathname.startsWith('/icons/') ||
        url.pathname.match(/\.(woff2?|ttf|eot|png|jpg|jpeg|gif|webp|svg|ico|css)$/)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Strategy 2: Stale-while-revalidate for JS bundles
    if (url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js')) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Strategy 3: Network-first for navigation (HTML pages)
    // Serves cached shell instantly if network is slow/offline
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    // Default: stale-while-revalidate for everything else
    event.respondWith(staleWhileRevalidate(request));
});

// ─── Caching strategies ────────────────────────────────────────

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('', { status: 503 });
    }
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        return cached || new Response('', { status: 503 });
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request);

    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, response.clone());
            });
        }
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}
