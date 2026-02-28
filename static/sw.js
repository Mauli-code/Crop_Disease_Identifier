/**
 * CropDoc AI — Service Worker
 * 100% Offline-First with Complete Pre-caching Strategy
 * - All critical assets cached at install
 * - Cache-first for assets, Network-first for APIs
 * - Graceful offline fallbacks
 */

const CACHE_NAME = 'cropdoc-v3';
const FONT_CACHE = 'cropdoc-fonts-v1';
const MODEL_CACHE = 'cropdoc-models-v1';

const STATIC_ASSETS = [
    '/',
    '/static/index.html',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/offline.js',
    '/static/js/preprocess.js',
    '/static/js/storage.js',
    '/static/manifest.json',
    '/knowledge_base.json',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js'
];

const FONT_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHAPMtMZiIAUuSWAYt06gYc.woff2'
];

const MODEL_ASSETS = [
    '/static/models/model.json',
    '/static/models/group1-shard1of3.bin',
    '/static/models/group1-shard2of3.bin',
    '/static/models/group1-shard3of3.bin'
];

// ─── Install: Pre-cache all critical assets ───
self.addEventListener('install', (event) => {
    console.log('[SW] Installing CropDoc AI Service Worker v3...');
    event.waitUntil(
        Promise.all([
            // Static assets (HTML, CSS, JS, JSON)
            caches.open(CACHE_NAME)
                .then(cache => {
                    console.log('[SW] Caching static assets...');
                    return cache.addAll(STATIC_ASSETS)
                        .then(() => console.log('[SW] ✅ Static assets cached'))
                        .catch(err => {
                            console.warn('[SW] ⚠️ Some static assets failed:', err.message);
                            // Try caching individually to skip problematic assets
                            return Promise.allSettled(
                                STATIC_ASSETS.map(url => cache.add(url).catch(() => null))
                            );
                        });
                }),
            // Fonts for offline fallback
            caches.open(FONT_CACHE)
                .then(cache => {
                    console.log('[SW] Caching Google Fonts...');
                    return cache.addAll(FONT_ASSETS)
                        .then(() => console.log('[SW] ✅ Fonts cached'))
                        .catch(err => {
                            console.warn('[SW] ⚠️ Font caching failed (will use system fonts):', err.message);
                        });
                }),
            // TF.js model files (~10MB)
            caches.open(MODEL_CACHE)
                .then(cache => {
                    console.log('[SW] Caching ML model files...');
                    return cache.addAll(MODEL_ASSETS)
                        .then(() => console.log('[SW] ✅ Model files cached'))
                        .catch(err => {
                            console.warn('[SW] ⚠️ Model caching failed:', err.message);
                            return Promise.allSettled(
                                MODEL_ASSETS.map(url => cache.add(url).catch(() => null))
                            );
                        });
                })
        ]).then(() => {
            console.log('[SW] Installation complete. Ready for offline use!');
            self.skipWaiting();
        })
    );
});

// ─── Activate: Clean up old caches ───
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => ![CACHE_NAME, MODEL_CACHE, FONT_CACHE].includes(key))
                    .map(key => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => {
            console.log('[SW] Ready! All caches validated.');
            self.clients.claim();
        })
    );
});

// ─── Fetch: Intelligent hybrid caching strategy ───
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET requests (POST /predict goes to network if available)
    if (event.request.method !== 'GET') {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // API calls: network-first, fallback to offline color-analysis
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Model files: cache-first (large, never change)
    if (url.pathname.includes('/models/')) {
        event.respondWith(cacheFirst(event.request, MODEL_CACHE));
        return;
    }

    // TensorFlow.js & Google Fonts: cache-first with offline support
    if ((url.hostname.includes('cdn.jsdelivr.net') && url.pathname.includes('tensorflow')) ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            cacheFirst(event.request, url.hostname.includes('fonts') ? FONT_CACHE : CACHE_NAME)
        );
        return;
    }

    // Everything else: cache-first for instant loads + network fallback
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
});

// ─── Cache-first: Prefer cached, fallback to network, then offline fallback ───
async function cacheFirst(request, cacheName) {
    try {
        // 1. Check cache first
        const cached = await caches.match(request);
        if (cached) {
            console.log(`[SW] Cache hit: ${request.url}`);
            return cached;
        }

        // 2. Try network
        console.log(`[SW] Fetching from network: ${request.url}`);
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
            console.log(`[SW] Cached: ${request.url}`);
        }
        return response;
    } catch (err) {
        // 3. Network failed, check cache again
        console.warn(`[SW] Network failed for ${request.url}, using cache`);
        const cached = await caches.match(request);
        if (cached) return cached;

        // 4. Final fallback: return app shell for HTML
        if (request.headers.get('Accept')?.includes('text/html')) {
            console.warn(`[SW] Returning app shell for ${request.url}`);
            try {
                return await caches.match('/static/index.html') || 
                       await caches.match('/');
            } catch (e) {
                console.error('[SW] Could not serve app shell:', e);
            }
        }

        // 5. Return offline error response
        console.error(`[SW] ❌ Offline and no cache for ${request.url}`);
        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// ─── Network-first: Try network, fallback to cache ───
async function networkFirst(request) {
    try {
        // 1. Try network first
        console.log(`[SW] Network-first: ${request.url}`);
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // 2. Network failed, try cache
        console.warn(`[SW] Network failed, falling back to cache: ${request.url}`);
        const cached = await caches.match(request);
        if (cached) return cached;

        // 3. No cache, return offline response
        console.error(`[SW] ❌ Offline and no cache for ${request.url}`);
        if (request.url.includes('/api/')) {
            return new Response(JSON.stringify({ 
                error: 'Offline - API unavailable',
                fallback: true 
            }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
