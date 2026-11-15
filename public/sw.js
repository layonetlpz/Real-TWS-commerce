// REAL TWS — Service Worker PWA (Shell Seguro)
// Regla de seguridad: nunca cachear respuestas de Supabase Auth, REST o Storage privado.

const CACHE_NAME = 'real-tws-shell-v1';
const APP_SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icons/real-tws-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Nunca interceptar llamadas a Supabase ni APIs externas
  if (url.origin !== self.location.origin) return;

  // Navegación SPA: network-first con fallback a /index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Recursos estáticos propios: cache-first con actualización en red
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
