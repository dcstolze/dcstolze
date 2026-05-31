/* sw.js — offline service worker for SISTER (3D). Cache-first app shell so the
   game installs as a PWA and runs without a connection after the first load. */
const CACHE = 'sister-3d-v3';
const ASSETS = [
  './index3d.html',
  './css/style.css',
  './assets/intro/farm.png',
  './js3d/main.js',
  './js3d/world3d.js',
  './js3d/audio.js',
  './assets/vendor/three.module.js',
  './assets/textures/BRICK_3A.png',
  './assets/textures/BRICK_1A.png',
  './assets/textures/CONCRETE_1A.png',
  './assets/textures/CONCRETE_2A.png',
  './assets/textures/FLOOR_1A.png',
  './assets/textures/DOOR_1A.png',
  './assets/textures/DOOR_2A.png',
  './assets/characters/sister.png',
  './assets/characters/sister_face.png',
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
    }).catch(() => caches.match('./index3d.html')))
  );
});
