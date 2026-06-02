// PantauBelanjaMBG — Service Worker
// Strategy: Cache-first untuk assets statis, network-first untuk data

const CACHE_NAME = 'pantau-mbg-v2';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // CDN assets — di-cache saat pertama kali dimuat
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

// Install: cache semua static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[SW] Beberapa asset gagal di-cache:', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: hapus cache lama
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: cache-first untuk assets, network-first untuk Supabase API
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Supabase API requests — selalu dari network, jangan di-cache
  if (url.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // HTML / navigasi — network-first agar update selalu terbaca
  var accept = event.request.headers.get('accept') || '';
  if (event.request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, toCache); });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(c) { return c || caches.match('./index.html'); });
      })
    );
    return;
  }

  // Static assets lain — cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      return fetch(event.request).then(function(response) {
        // Cache respons sukses untuk assets statis
        if (response && response.status === 200 && response.type !== 'opaque') {
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, toCache);
          });
        }
        return response;
      }).catch(function() {
        // Offline fallback untuk HTML
        if (event.request.headers.get('accept') &&
            event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Background sync: kirim data yang pending saat online kembali
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
