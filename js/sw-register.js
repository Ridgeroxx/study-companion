// /js/sw-register.js
(() => {
  if (!('serviceWorker' in navigator)) return;

  const SW_URL = '/sw.js'; // keep sw.js at site root for full scope

  // Register after page load for best compatibility
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).then((reg) => {
      console.log('[SW] registered:', reg.scope);

      // Optional: detect updates and auto-activate
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            // A new version is installed and waiting
            // Example: auto-activate immediately (skip waiting)
            nw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch((err) => console.warn('[SW] registration failed', err));
  });

  // Optional: react when a new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[SW] new service worker active');
    // You can force-refresh if you want:
    // location.reload();
  });
})();
