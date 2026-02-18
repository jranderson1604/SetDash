const CACHE_NAME = 'setdash-v1';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Install - cache all assets
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch - cache-first, fallback to network
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((cached) => {
            return cached || fetch(e.request).then((response) => {
                // Cache new successful requests
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                }
                return response;
            });
        }).catch(() => {
            // Offline fallback for navigation
            if (e.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
