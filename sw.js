const CACHE_NAME = 'webcam-cache-v22';

// On install — skip waiting so new SW activates immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// On activate — delete ALL old caches so fresh files are served
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Network first — always fetch fresh from disk, no cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
