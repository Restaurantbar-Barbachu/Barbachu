const CACHE_NAME = 'barbachu-pos-cache-v2';
const PRECACHE_ASSETS = ['/index.html', '/manifest.json', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          const response = await fetch(assetUrl, { cache: 'no-cache' });
          if (response.ok && !response.redirected && response.type === 'basic') {
            await cache.put(assetUrl, response.clone());
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API endpoints, Firebase Auth handlers, the SW script itself, or Vite dev internals
  if (
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/__/') ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Network-first for HTML navigations so deploys never serve stale index.html with old chunk hashes
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.ok &&
            !networkResponse.redirected &&
            networkResponse.type === 'basic'
          ) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedShell = await caches.match('/index.html');
          return cachedShell || Response.error();
        })
    );
    return;
  }

  // Stale-while-revalidate for static same-origin assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.ok &&
            !networkResponse.redirected &&
            networkResponse.type === 'basic'
          ) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || networkFetch;
    })
  );
});
