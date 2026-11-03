const CACHE_NAME = 'lagangilang-shell-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/icons.svg',
  '/assets/icon-512.png',
  '/assets/road_trail_360_logo.png',
  '/data/lagangilang_roads_graph.json',
  '/data/lagangilang-custom.geojson',
  '/data/aligned_sequences.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching warning:', err);
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

  // Ignore chrome-extension or custom non-http schemes
  if (url.protocol.startsWith('chrome') || url.protocol.startsWith('lagangilang')) {
    return;
  }

  // Handle navigation requests (SPA routing)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return resp;
        })
        .catch(async () => {
          return (await caches.match(request)) || (await caches.match('/index.html')) || (await caches.match('/'));
        })
    );
    return;
  }

  // Cache-first with background revalidation for same-origin static assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Revalidate in background when online
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
            if (!resp || resp.status !== 200) {
              return resp;
            }
            const toCache = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
            return resp;
          })
          .catch(() => {
            // If offline and requesting an image/asset
            return cached || null;
          });
      })
    );
  }
});
