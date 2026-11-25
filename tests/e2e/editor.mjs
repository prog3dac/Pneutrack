// Test end-to-end dell'editor nel browser (Playwright, senza test runner).
// Uso: node tests/e2e/editor.mjs http://127.0.0.1:8765/ [cartella-screenshot]
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:8765/";
const shots = process.argv[3];

const browser = await chromium.launch(
  process.env.PNEUTRACK_CHROMIUM ? { executablePath: process.env.PNEUTRACK_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const state = () => page.evaluate(() => JSON.parse(JSON.stringify({
  doc: window.pneutrack.doc, analysis: window.pneutrack.analysis })));
async function settled() {
  // attende che l'analisi del server rifletta l'ultimo stato
  await page.waitForFunction(() => {
    const a = window.pneutrack.analysis, d = window.pneutrack.doc;
    return d.components.every((c) => c.id in a.ports ||
      a.issues.some((i) => i.component === c.id && i.code === "INVALID_COMPONENT"));
  });
  await page.waitForTimeout(250);
}
async function portCenter(ref) {
  const box = await page.locator(`[data-port="${ref}"] .port-hit`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function wire(a, b) {
  const p = await portCenter(a), q = await portCenter(b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.mouse.up();
}
async function dropFromPalette(type, x, y) {
  const canvas = await page.locator("#canvas").boundingBox();
  await page.locator(`.palette-item[data-type="${type}"]`).dragTo(page.locator("#canvas"), {
    targetPosition: { x, y } });
  void canvas;
}

await page.goto(url);
await page.waitForSelector(".palette-item");

// 1. palette completa
const types = await page.locator(".palette-item").evaluateAll((els) => els.map((e) => e.dataset.type));
assert.equal(types.length, 9, `palette: ${types}`);

// 2. costruzione di uno schema: sorgente -> 3/2 -> cilindro semplice effetto
await dropFromPalette("pressure_source", 300, 520);
await dropFromPalette("directional_valve", 300, 340);
await dropFromPalette("single_acting_cylinder", 300, 160);
await settled();
let s = await state();
assert.deepEqual(s.doc.components.map((c) => c.id), ["P1", "V1", "C1"]);
assert.ok(s.analysis.issues.some((i) => i.code === "UNCONNECTED_PORT"));

// la valvola diventa 3/2 dal pannello proprietà
await page.click('[data-component="V1"] .halo', { force: true });
await page.selectOption('#properties select[name="function"]', "3/2");
await settled();
s = await state();
assert.equal(s.doc.components[1].function, "3/2");
assert.deepEqual(s.analysis.ports.V1.map((p) => p.name).sort(), ["1", "2", "3"]);

await wire("P1.1", "V1.1");
await wire("V1.2", "C1.A");
await settled();
s = await state();
assert.equal(s.doc.connections.length, 2);
assert.equal(s.analysis.errors, 0, JSON.stringify(s.analysis.issues));
assert.equal(await page.textContent("#status"), "Schema valido");
assert.equal(s.analysis.pressures["C1.A"].text, "6 bar");
if (shots) await page.screenshot({ path: `${shots}/costruito.png` });

// 3. sovrapressione: cilindro da 4 bar
await page.click('[data-component="C1"] .halo', { force: true });
await page.fill('#properties input[name="param-max_pressure"]', "4");
await page.press('#properties input[name="param-max_pressure"]', "Enter");
await settled();
s = await state();
assert.equal(s.doc.components[2].params.max_pressure, "4 bar", "unità aggiunta in automatico");
assert.deepEqual(s.analysis.issues.map((i) => i.code), ["OVERPRESSURE"]);
await page.waitForSelector("#issues li.error");
assert.match(await page.textContent("#status"), /1 errore/);
if (shots) await page.screenshot({ path: `${shots}/sovrapressione.png` });

// 4. parametro con unità sbagliata
await page.fill('#properties input[name="param-bore"]', "20 bar");
await page.press('#properties input[name="param-bore"]', "Enter");
await settled();
s = await state();
assert.ok(s.analysis.issues.some((i) => i.code === "INVALID_COMPONENT" && i.component === "C1"));

// 5. annulla due volte: torna il cilindro valido a 4 bar, poi a 10 bar
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.keyboard.press("Control+z");
await page.keyboard.press("Control+z");
await settled();
s = await state();
assert.equal(s.analysis.errors, 0);
await page.keyboard.press("Control+y");
await settled();
s = await state();
assert.deepEqual(s.analysis.issues.map((i) => i.code), ["OVERPRESSURE"]);

// 6. clic sul problema seleziona il componente; Canc lo elimina con le sue linee
await page.click("#issues li.error");
assert.equal(await page.inputValue('#properties input[name="id"]'), "C1");
await page.keyboard.press("Delete");
await settled();
s = await state();
assert.deepEqual(s.doc.components.map((c) => c.id), ["P1", "V1"]);
assert.equal(s.doc.connections.length, 1);

// 7. rinomina e rotazione
await page.click('[data-component="V1"] .halo', { force: true });
await page.fill('#properties input[name="id"]', "Y1");
await page.press('#properties input[name="id"]', "Enter");
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.click('[data-component="Y1"] .halo', { force: true });
await page.keyboard.press("r");
s = await state();
assert.equal(s.doc.connections[0].to === "Y1.1" || s.doc.connections[0].from === "Y1.1", true);
assert.equal(s.doc.layout.Y1.rot, 1);

// 8. esempio dal menu
await page.selectOption("#examples", "doppio_effetto_bistabile");
await settled();
s = await state();
assert.equal(s.doc.components.length, 8);
assert.equal(s.analysis.issues.length, 0);
if (shots) await page.screenshot({ path: `${shots}/esempio.png` });

// 9. salvataggio: scarica un file che il modello sa rileggere
const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="save"]')]);
assert.match(download.suggestedFilename(), /\.pneu\.json$/);
const saved = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
assert.equal(saved.format, "pneutrack/circuit");
assert.equal(saved.components.length, 8);

assert.deepEqual(errors, [], "errori JavaScript nella pagina");
await browser.close();
console.log("e2e ok");
