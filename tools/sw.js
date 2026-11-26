// Service worker di Pneutrack: tiene in memoria l'app intera, così si apre anche senza rete.
// Il plugin tools/pwa.ts lo copia in dist/sw.js e ci mette davanti VERSION e FILES
// (tutti i file della build, con percorsi relativi alla cartella dell'app).
/* global VERSION, FILES */
const CACHE = `pneutrack-${VERSION}`;

self.addEventListener("install", (event) => {
  // si scarica tutto in una volta: o la versione nuova è completa o resta quella di prima
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("pneutrack-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// la pagina chiede di passare alla versione nuova quando l'utente sceglie «Aggiorna»
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // le due pagine (editor e catalogo) anche con ?parametri o senza .html; i file per nome
    let hit;
    if (req.mode === "navigate" && /\/(index\.html)?$/.test(url.pathname)) hit = await cache.match("./");
    else if (req.mode === "navigate" && /\/simboli(\.html)?$/.test(url.pathname)) hit = await cache.match("simboli.html");
    else hit = await cache.match(req, { ignoreSearch: true });
    return hit ?? fetch(req);
  })());
});
