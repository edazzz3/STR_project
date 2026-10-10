// Оффлайн-кеширование: app shell — заранее, CDN-библиотеки — при первом использовании.
const CACHE = 'str-viewer-v1';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/app.js',
  './js/parsers/strParser.js', './js/parsers/txtParser.js', './js/parsers/pdfOverlay.js',
  './js/renderers/render2d.js', './js/renderers/render3d.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// stale-while-revalidate
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
