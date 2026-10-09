/* Service worker — schema comune a RecompApp, Bilancio e Style Wishlist.
   - VERSION è la versione dell'app: è la stessa usata in index.html come ?v=VERSION.
   - Pagina: rete con timeout di 3 secondi, poi la copia salvata (veloce anche con segnale scarso).
   - File con ?v= e icone: prima la cache; un nuovo rilascio cambia ?v= e quindi l'indirizzo.
   - Il nuovo worker resta in attesa finché l'app non chiede di attivarlo (avviso "Aggiorna"). */
const VERSION = '1.16.0';
const PREFIX = 'style-wishlist-';
const CACHE = PREFIX + VERSION;
const SHELL = [
  './',
  './index.html',
  './suite.js?v=1.16.0',
  './suite.css?v=1.16.0',
  './suite-ui.css?v=1.16.0',
  './suite-tokens.css?v=1.16.0',
  './app.css?v=1.16.0',
  './app.js?v=1.16.0',
  './manifest.webmanifest?v=1.16.0',
  './icon-192.png?v=1.16.0',
  './icon-512.png?v=1.16.0',
  './icon-512-maskable.png?v=1.16.0',
  './apple-touch-icon.png?v=1.16.0',
  './icon-32.png?v=1.16.0'
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const d = event.data;
  if (d === 'skip-waiting' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting();
});

function fromNetworkAndStore(request, cacheKey) {
  return fetch(request, { cache: 'no-store' }).then((response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(cacheKey || request, copy));
    }
    return response;
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    const network = fromNetworkAndStore(req, './index.html');
    event.waitUntil(network.catch(() => {}));
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    event.respondWith(
      Promise.race([network, timeout])
        .then((res) => res || caches.match('./index.html'))
        .catch(() => caches.match('./index.html'))
        .then((res) => res || network)
    );
    return;
  }

  event.respondWith(caches.match(req).then((cached) => cached || fromNetworkAndStore(req)));
});
