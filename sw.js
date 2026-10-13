// Оффлайн-кеширование: app shell — поштучно (один 404 не ломает весь install),
// CDN-библиотеки — при первом использовании.
const CACHE = 'str-viewer-v4';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/app.js', './js/state.js',
  './js/ui/layers.js', './js/ui/fields.js', './js/ui/georef.js',
  './js/ui/pdfPages.js', './js/ui/importFiles.js', './js/ui/survey.js',
  './js/surveyStore.js',
  './js/strWriter.js',
  './js/parsers/strParser.js', './js/parsers/txtParser.js', './js/parsers/pdfOverlay.js',
  './js/parsers/gridDetector.js',
  './js/renderers/render2d.js', './js/renderers/render3d.js', './js/renderers/pivot.js',
  './js/renderers/input.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(url => c.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

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
      }).catch(() => hit || new Response('Offline', { status: 503, statusText: 'Offline' }));
      return hit || net;
    })
  );
});