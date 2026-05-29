const CACHE_NAME = 'quadrant-tasks-v1';
const ASSETS = [
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/store.js',
  'js/edit.js',
  'js/render.js',
  'js/drag.js',
  'js/markdown.js',
  'js/app.js',
  'manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k) { return caches.delete(k); })
      );
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request);
    })
  );
});
