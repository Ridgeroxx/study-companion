// sw.js
const CACHE = 'sc-v1';

// ONLY include same-origin files that actually exist in your project
const PRECACHE = [
  '/', 'index.html', 'app.html', 'reader.html', 'meetings.html', 'settings.html',
  'styles/base.css', 'styles/dark.css',
  'js/app.js', 'js/storage.js', 'js/reader.js', 'js/notes.js', 'js/schedule.js', 'js/flags.js',
  // add any other local files that really exist
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of PRECACHE) {
      try {
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch (err) {
        // skip missing or blocked item; keep installing
        // console.warn('[SW] skip precache', url, err);
      }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only cache-first for our own origin; let CDNs go to network
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const match = await caches.match(e.request);
      return match || fetch(e.request);
    })());
  }
});
