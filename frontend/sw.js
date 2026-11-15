// Glance service worker — issue #160.
//
// What it is for: letting Glance install as its own app window, and opening
// that window quickly. It keeps the app's own static files (the page, its
// JavaScript and CSS, the icons) and nothing else.
//
// What it must never keep: any request to /api, anything a student captured,
// said or wrote, or any response from another site. Those requests are not
// even looked at: the worker returns without answering, so the browser sends
// them exactly as it would with no worker installed.
//
// MathJax comes from a CDN and is left alone too, so with no network the
// installed app opens but cannot typeset math. Glance needs the network for
// capture and step checking anyway.
//
// Updates: the build writes a new VERSION into this file on every deploy (see
// vite.config.ts), so the browser sees a changed worker and installs it. The
// new worker takes over at once (skipWaiting, clients.claim) and deletes every
// older cache. Pages are fetched from the network first, so an installed app
// opened after a redeploy loads the new build, not the one it was installed
// with; the cache is only a fallback when the network is down.

const VERSION = '__GLANCE_VERSION__';
const CACHE = `glance-shell-${VERSION}`;
const SHELL = __GLANCE_PRECACHE__;

/** True for the requests this worker may answer: same-site static files. */
function isShellRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return false;
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith('glance-shell-') && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isShellRequest(request)) return;

  if (request.mode === 'navigate') {
    // Network first: a redeploy reaches an installed app on its next open.
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  const path = new URL(request.url).pathname;
  // Only files the build listed. Their names change with their content, so a
  // cached copy is never stale.
  if (!SHELL.includes(path)) return;
  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
