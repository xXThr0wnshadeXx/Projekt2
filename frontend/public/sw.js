// The offline cache is intentionally limited to Glance's own static shell.
// Student work lives in local storage, and photos, audio, API traffic and
// model responses must never be copied into a service-worker cache.
const CACHE = 'glance-shell-v1';
const SHELL_PATHS = new Set(['/', '/manifest.webmanifest', '/icons/glance.svg']);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...SHELL_PATHS])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

function isStaticShellRequest(request, url) {
  if (url.origin !== self.location.origin || request.method !== 'GET') return false;
  return request.mode === 'navigate' || request.destination === 'script' || request.destination === 'style';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (!isStaticShellRequest(request, url)) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          await caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        return cached ?? (request.mode === 'navigate' ? caches.match('/') : Response.error());
      }
    })(),
  );
});
