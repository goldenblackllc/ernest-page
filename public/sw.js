// Minimal service worker — satisfies Chrome's installability requirement.
// No caching logic; Next.js handles all asset serving.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
