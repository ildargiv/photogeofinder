// Офлайн-кэш: оболочка программы кэшируется при установке, шрифты и плитки карт по мере использования.
const VERSION = 'pgf-2.0.1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './config.js', './i18n.js', './vendor/exifr.js', './vendor/leaflet.js', './vendor/leaflet.css', './vendor/fonts/fonts.css', './app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});
// Новая версия ждёт, пока пользователь нажмёт «Перезапустить»
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || url.host.endsWith('tile.openstreetmap.org');
  // Адреса, фото Викисклада и встроенные карты всегда идут напрямую в сеть
  if (!cacheable) return;
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
