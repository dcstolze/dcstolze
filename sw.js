/* sw.js — offline service worker for SISTER (3D). Cache-first app shell so the
   game installs as a PWA and runs without a connection after the first load. */
const CACHE = 'sister-3d-v7';
const ASSETS = [
  './index.html',
  './',
  './css/style.css',
  './assets/intro/farm.png',
  './js3d/main.js',
  './js3d/audio.js',
  './js3d/farm.js',
  './assets/vendor/three.module.js',
  './assets/vendor/GLTFLoader.js',
  './assets/vendor/BufferGeometryUtils.js',
  './assets/farm/scene.gltf',
  './assets/farm/scene.bin',
  './assets/fonts/Nosifer.ttf',
  './assets/fonts/SpecialElite.ttf',
  './assets/fonts/Oswald.ttf',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
