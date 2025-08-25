// sw.js — Study Companion PWA (clean + safe clones)
const VERSION = '1.0.3';
const CACHE_NAME = `study-companion-${VERSION}`;

// List only files that actually exist at your server root.
// Add/remove as appropriate for your project.
const APP_SHELL = [
  'app.html',
  'reader.html',
  'meetings.html',
  'convention.html',
  'settings.html',
  'notes.html',
  'manifest.webmanifest',
  'js/app.js',
  'js/storage.js',
  'js/reader.js',
  'js/notes.js',
  'js/scripture.js',
  'js/search.js',
  'js/schedule.js',
  'js/exporter.js',
  'logo.png', // since you said your icon is in the root
  'styles.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try { await cache.addAll(APP_SHELL); } catch (e) { /* Some files may be 404 during dev; okay */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Strategy:
// - Navigations: network-first, fallback to app.html when offline
// - Same-origin assets: stale-while-revalidate (serve cache, update in bg)
// - Cross-origin: try network, fallback to cache if present
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // Navigations
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Always try network for HTML first
        const net = await fetch(req);
        return net;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('app.html')) || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets: stale-while-revalidate
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);

      const updatePromise = fetch(req).then(async (net) => {
        if (net && net.ok) {
          // Clone ONCE, put the clone in cache, return the original
          await cache.put(req, net.clone());
        }
        return net;
      }).catch(() => undefined);

      // Return cached immediately if we have it, else wait for network
      return cached || (await updatePromise) || new Response('Offline', { status: 503 });
    })());
    return;
  }

  // Cross-origin: network first, fallback to cache if available
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      return cached || new Response('Offline', { status: 503 });
    }
  })());
});
