/* The cache is named after the app version in version.js, so each release replaces the old cache.
   Network first for this site's own files; the cached copy is used offline. Only caches that start with this
   app's prefix are ever deleted. */
importScripts('./version.js');
const PREFIX = 'make24-', V = PREFIX + self.APP_VERSION;
const F = ['./', './index.html', './version.js', './icon.svg', './manifest.webmanifest', './css/app.css', './js/test-badge.js', './js/game.js', './js/app.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(F)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(k => Promise.all(k.filter(x => x.startsWith(PREFIX) && x !== V).map(x => caches.delete(x))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});
