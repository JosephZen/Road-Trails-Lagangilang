const CACHE_NAME = 'lagangilang-shell-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
  '/data/lagangilang_roads_graph.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching non-fatal warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) {
            return caches.delete(k);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore chrome-extension or custom schemes
  if (url.protocol.startsWith('chrome') || url.protocol.startsWith('lagangilang')) {
    return;
  }

  // Network first for API/external, Cache first for local static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in background
          fetch(request)
            .then((fresh) => {
              if (fresh && fresh.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, fresh));
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(request)
          .then((resp) => {
            if (!resp || resp.status !== 200 || resp.type !== 'basic') {
              return resp;
            }
            const toCache = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
            return resp;
          })
          .catch(() => {
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
    );
  }
});
