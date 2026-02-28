/**
 * CropDoc AI — Service Worker
 * Enables offline functionality with cache-first strategy for app shell
 * and network-first for API calls.
 */

const CACHE_NAME = 'cropdoc-v1';
const STATIC_ASSETS = [
    '/',
    '/static/index.html',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/offline.js',
    '/static/js/online.js',
    '/static/js/preprocess.js',
    '/static/js/storage.js',
    '/static/manifest.json',
    '/knowledge_base.json'
];

const MODEL_CACHE = 'cropdoc-models-v1';
const MODEL_ASSETS = [
    '/static/models/model.json'
    // Shard files will be cached dynamically when first loaded
];

// ─── Install: Pre-cache static assets ───
self.addEventListener('install', (event) => {
    console.log('[SW] Installing CropDoc AI Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS).catch(err => {
                    console.warn('[SW] Some assets failed to cache:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// ─── Activate: Clean up old caches ───
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key !== MODEL_CACHE)
                    .map(key => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ─── Fetch: Hybrid caching strategy ───
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests (POST /predict goes to network)
    if (event.request.method !== 'GET') {
        return;
    }

    // API calls: network-first
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Model files: cache-first (they're large and rarely change)
    if (url.pathname.includes('/models/')) {
        event.respondWith(cacheFirst(event.request, MODEL_CACHE));
        return;
    }

    // TensorFlow.js CDN: cache-first
    if (url.hostname.includes('cdn.jsdelivr.net') && url.pathname.includes('tensorflow')) {
        event.respondWith(cacheFirst(event.request, CACHE_NAME));
        return;
    }

    // Google Fonts: cache-first
    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(cacheFirst(event.request, CACHE_NAME));
        return;
    }

    // Static assets: cache-first with network fallback
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

// ─── Cache-first strategy ───
async function cacheFirst(request, cacheName) {
    try {
        const cached = await caches.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Return offline fallback for HTML
        if (request.headers.get('Accept')?.includes('text/html')) {
            const cached = await caches.match('/');
            if (cached) return cached;
        }
        throw err;
    }
}

// ─── Network-first strategy ───
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return caches.match(request);
    }
}
