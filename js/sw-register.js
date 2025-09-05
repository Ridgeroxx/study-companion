// js/sw-register.js
(async function ensureServiceWorker(){
  if (!('serviceWorker' in navigator)) return;

  // Dev: disable SW on localhost/127.0.0.1 and clear any old caches
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      regs.forEach(r => r.unregister());
      if (self.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      console.info('[SW] Disabled in dev and caches cleared.');
    } catch(e) { console.warn('[SW] cleanup failed', e); }
    return;
  }

  // Prod: register normally
  const url = '/sw.js';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('javascript')) return;
    await navigator.serviceWorker.register(url);
    console.log('[SW] registered', url);
  } catch (e) { console.warn('[SW] registration failed', e); }
})();
