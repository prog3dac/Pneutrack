// Test end-to-end dell'app installabile: manifest, service worker e uso senza rete.
// Uso: npm run build && npm run preview &
//      node test/e2e/pwa.mjs http://127.0.0.1:4173/Pneutrack/
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:4173/Pneutrack/";
const browser = await chromium.launch(
  process.env.PNEUTRACK_CHROMIUM ? { executablePath: process.env.PNEUTRACK_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1400, height: 820 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(url);
await page.waitForFunction(() => document.body.dataset.ready === "1");

// manifest con nome, icone e pagina d'avvio, letto dal link della pagina
const manifest = await page.evaluate(async () => {
  const href = document.querySelector('link[rel="manifest"]').href;
  const m = await (await fetch(href)).json();
  const icons = await Promise.all(m.icons.map(async (i) => (await fetch(new URL(i.src, href))).ok));
  return { name: m.name, display: m.display, start: new URL(m.start_url, href).href, icons };
});
assert.equal(manifest.name, "Pneutrack");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start, new URL(url).href, "l'app installata parte dall'editor");
assert.ok(manifest.icons.every(Boolean), "icone raggiungibili");

// il service worker prende la pagina e mette in memoria tutti i file
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const cache = await caches.open(keys.find((k) => k.startsWith("pneutrack-")));
  return (await cache.keys()).map((r) => new URL(r.url).pathname);
});
assert.ok(cached.some((p) => p.endsWith("/index.html")) && cached.some((p) => p.endsWith("/simboli.html")), `in memoria: ${cached}`);
assert.ok(cached.some((p) => /\/assets\/main-.*\.js$/.test(p)), "script dell'editor in memoria");

// nel browser (non installata) il menu File offre l'installazione, con le istruzioni se serve
await page.click("#file-menu summary");
assert.equal(await page.isVisible("#btn-install"), true, "voce «Installa l'app»");
await page.click("#btn-install");
await page.waitForSelector("#install-dialog:not([hidden])");
await page.keyboard.press("Escape");
assert.equal(await page.isHidden("#install-dialog"), true);

// senza rete l'editor si apre lo stesso, anche con parametri, e così il catalogo dei simboli
await context.setOffline(true);
await page.reload();
await page.waitForFunction(() => document.body.dataset.ready === "1");
assert.ok(await page.locator(".palette-item").count() > 20, "palette senza rete");
await page.goto(url + "?prova=1");
await page.waitForFunction(() => document.body.dataset.ready === "1");
await page.goto(new URL("simboli.html", url).href);
await page.waitForSelector("#catalog section, #catalog .cat-card, #catalog > *");
// la simulazione e l'export (caricati a richiesta) funzionano senza rete
await page.goto(url);
await page.waitForFunction(() => document.body.dataset.ready === "1");
await page.selectOption("#examples", { index: 1 });
await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim === "on");
await page.click('[data-act="mode-draw"]');
const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click('.tb-right [data-act="pdf"]')]);
assert.match(pdf.suggestedFilename(), /\.pdf$/);
await context.setOffline(false);

assert.deepEqual(errors, [], "errori JavaScript nella pagina");
await browser.close();
console.log("pwa e2e ok");
