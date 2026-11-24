const CACHE_NAME = 'barbachu-pos-offline-v3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

function extractBundleUrlsFromHtml(html) {
  const urls = new Set();
  const attrRegex = /(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css|woff2?|svg|png))["']/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    if (match[1]) {
      urls.add(match[1]);
    }
  }
  return Array.from(urls);
}

async function toNonRedirectedResponse(response) {
  if (!response) return response;
  if (!response.redirected) return response;
  const body = await response.clone().arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

async function cacheSafe(cache, url) {
  try {
    const req = new Request(url, { cache: 'no-cache', redirect: 'follow' });
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      const clean = await toNonRedirectedResponse(res);
      await cache.put(url, clean);
      return clean;
    }
  } catch {
    // Ignore optional missing assets during precache
  }
  return null;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(SHELL_ASSETS.map((asset) => cacheSafe(cache, asset)));
      try {
        const htmlRes = await cache.match('/index.html');
        if (htmlRes) {
          const htmlText = await htmlRes.clone().text();
          const bundleUrls = extractBundleUrlsFromHtml(htmlText);
          await Promise.allSettled(bundleUrls.map((bundleUrl) => cacheSafe(cache, bundleUrl)));
        }
      } catch {
        // Ignore HTML bundle parse issues
      }
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept SW script, API redirects, Firebase Auth handlers, or Vite HMR internals
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

  // Navigation requests (/, /pos, /?view=pos): network-first with redirect-free offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const clean = await toNonRedirectedResponse(networkResponse);
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/index.html', clean.clone());
            return clean;
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedShell = (await caches.match('/index.html')) || (await caches.match('/'));
          if (cachedShell) {
            return toNonRedirectedResponse(cachedShell);
          }
          return new Response(
            '<!doctype html><html lang="es"><body style="background:#0a0a0b;color:#f0e6d3;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100dvh;text-align:center;padding:24px;"><div><h1>Barbachu POS · Sin conexión</h1><p>Reconecta a internet para cargar la versión inicial en caché.</p></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // Immutable Vite hashed bundles (/assets/*): cache-first for fast offline POS access
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok && networkResponse.type === 'basic' && !networkResponse.redirected) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => Response.error());
      })
    );
    return;
  }

  // Other same-origin static files (icons, manifest): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic' && !networkResponse.redirected) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || networkFetch;
    })
  );
});
