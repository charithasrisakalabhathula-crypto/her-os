/* My Life OS — service worker
   - Caches the app shell so the tracker works offline.
   - Shows water-reminder notifications and handles their action buttons.
   Bump CACHE_VERSION whenever you upload new versions of the files. */
const CACHE_VERSION = 'lifeos-v1';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: instant from cache, refreshed in the background.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req, { ignoreSearch: sameOrigin }).then(cached => {
        const network = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (cached) { event.waitUntil(network); return cached; }
        return network.then(res => {
          if (res) return res;
          if (req.mode === 'navigate') return cache.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
    )
  );
});

// Notification buttons: "I drank" / "Snooze". The app handles the logic.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const action = event.action || 'open';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (list.length) {
      const client = list.find(c => c.visibilityState === 'visible') || list[0];
      client.postMessage({ type: 'water-action', action });
      try { await client.focus(); } catch (e) { /* ignore */ }
      return;
    }
    await self.clients.openWindow('./?water=' + encodeURIComponent(action));
  })());
});