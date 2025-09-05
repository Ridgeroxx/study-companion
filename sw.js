/* sw.js */
const CACHE = 'sc-v4'; // bump to force a clean install

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Strategy:
// - HTML (navigations): network-first -> cache fallback (so new UI shows immediately)
// - Same-origin static assets: stale-while-revalidate
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle our origin
  if (url.origin !== location.origin) return;

  // Navigation requests (HTML)
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const copy = fresh.clone();
        const cache = await caches.open(CACHE);
        cache.put(req, copy);
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('/app.html') || Response.error();
      }
    })());
    return;
  }

  // Other requests (CSS/JS/images): stale-while-revalidate
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || net;
  })());
  
});
