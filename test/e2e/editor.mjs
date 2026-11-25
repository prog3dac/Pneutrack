// Test end-to-end dell'editor nel browser (Playwright, senza test runner).
// Uso: npm run build && npx vite preview --port 4173 &
//      node test/e2e/editor.mjs http://127.0.0.1:4173/Pneutrack/ [cartella-screenshot]
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:4173/Pneutrack/";
const shots = process.argv[3];
const expectedStore = process.env.PNEUTRACK_EXPECT_STORE || "browser";

const browser = await chromium.launch(
  process.env.PNEUTRACK_CHROMIUM ? { executablePath: process.env.PNEUTRACK_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const state = () => page.evaluate(() => JSON.parse(JSON.stringify({
  doc: window.pneutrack.doc, analysis: window.pneutrack.analysis })));
async function settled() {
  // attende che l'analisi rifletta l'ultimo stato
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
  await page.locator(`.palette-item[data-type="${type}"]`).first().dragTo(page.locator("#canvas"), {
    targetPosition: { x, y } });
  void canvas;
}

await page.goto(url);
await page.waitForSelector(".palette-item");
await page.waitForFunction(() => document.body.dataset.ready === "1");
assert.equal(await page.evaluate(() => window.pneutrack.store), expectedStore);

// 1. palette completa, a gruppi, con ricerca
const types = await page.locator(".palette-item").evaluateAll((els) => els.map((e) => e.dataset.type));
assert.equal(new Set(types).size, 25, `tipi in palette: ${[...new Set(types)]}`);
assert.ok(types.length >= 37, "valvole già configurate");
await page.fill("#palette-search", "non ritorno");
const visible = () => page.locator(".palette-item:visible").evaluateAll((els) => els.map((e) => e.textContent.trim()));
assert.deepEqual(await visible(), ["Valvola di non ritorno", "Non ritorno pilotata", "Regolatore di flusso unidirezionale"]);
await page.fill("#palette-search", "5/2 bistabile");
assert.deepEqual(await visible(), ["5/2 bistabile pneumatica", "5/2 bistabile elettrica"]);
await page.fill("#palette-search", "");
assert.equal((await visible()).length, types.length);

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

// 2b. tubi: misura standard, lunghezza, pieghe trascinate
const lineMid = async (i) => {
  const pts = (await page.getAttribute(`[data-connection="${i}"] .hit`, "points")).split(" ").map((p) => p.split(",").map(Number));
  // centro del tratto più lungo, in coordinate dello schermo
  let best = 0, k = 0;
  for (let j = 0; j + 1 < pts.length; j++) {
    const d = Math.abs(pts[j + 1][0] - pts[j][0]) + Math.abs(pts[j + 1][1] - pts[j][1]);
    if (d > best) { best = d; k = j; }
  }
  const [x, y] = [(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2];
  return page.evaluate(([x, y]) => {
    const m = document.querySelector("#viewport").getScreenCTM();
    return [m.a * x + m.e, m.d * y + m.f];
  }, [x, y]);
};
await page.mouse.click(...(await lineMid(1)));
await page.waitForSelector('#properties select[name="tube-size"]');
await page.selectOption('#properties select[name="tube-size"]', { label: "Ø6 × 4" });
await page.fill('#properties input[name="tube-length"]', "2");
await page.press('#properties input[name="tube-length"]', "Enter");
await settled();
s = await state();
assert.deepEqual(s.doc.connections[1].tube, { outer_diameter: "6 mm", inner_diameter: "4 mm", length: "2 m" });
assert.match(await page.textContent("#properties .tube-info"), /Volume 25 cm³/);
assert.equal(s.analysis.errors, 0);

// trascinando la linea nasce una piega; doppio clic sul punto la toglie
const [mx, my] = await lineMid(1);
await page.mouse.move(mx, my);
await page.mouse.down();
await page.mouse.move(mx + 30, my + 10, { steps: 3 });
await page.mouse.move(mx + 80, my + 20, { steps: 5 });
await page.mouse.up();
s = await state();
assert.equal(s.doc.connections[1].points.length, 1, "piega aggiunta");
if (shots) await page.screenshot({ path: `${shots}/tubi.png` });
await page.dblclick(".bend-handle");
s = await state();
assert.equal(s.doc.connections[1].points, undefined, "piega tolta");
await page.keyboard.press("Control+z");
s = await state();
assert.equal(s.doc.connections[1].points.length, 1, "annulla riporta la piega");
await page.click('#properties button:has-text("Raddrizza linea")');
s = await state();
assert.equal(s.doc.connections[1].points, undefined);

// tubo non valido: errore sulla linea
await page.fill('#properties input[name="tube-inner_diameter"]', "8");
await page.press('#properties input[name="tube-inner_diameter"]', "Enter");
await settled();
s = await state();
assert.deepEqual(s.analysis.issues.map((i) => i.code), ["INVALID_TUBE"]);
await page.keyboard.press("Control+z");
await page.click("#canvas", { position: { x: 40, y: 40 } });
await settled();
s = await state();
assert.equal(s.analysis.errors, 0);

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

// 9. esportazione: scarica un file che il modello sa rileggere
const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
assert.match(download.suggestedFilename(), /\.pneu\.json$/);
const saved = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
assert.equal(saved.format, "pneutrack/circuit");
assert.equal(saved.components.length, 8);

// 10. progetti: salva, autosalvataggio, riapertura dopo ricarica
const projects = () => page.evaluate(async () => {
  const r = [];
  document.querySelectorAll("#projects-list li[data-id] .project-name").forEach((e) => r.push(e.textContent));
  return r;
});
const saveText = () => page.textContent("#save-state");
assert.equal(await saveText(), "Bozza non salvata");
await page.click('[data-act="save"]');
await page.waitForFunction(() => document.querySelector("#save-state").textContent.startsWith("Salvato"));
const firstId = await page.evaluate(() => window.pneutrack.project.id);

await page.click('[data-component="C1"] .halo', { force: true });
await page.keyboard.press("r");
assert.equal(await saveText(), "Modifiche da salvare");
await page.waitForFunction(() => document.querySelector("#save-state").textContent.startsWith("Salvato"), null, { timeout: 5000 });
assert.equal(await page.evaluate(() => window.pneutrack.isDirty()), false, "autosalvataggio");

await page.reload();
await page.waitForFunction(() => document.body.dataset.ready === "1");
s = await state();
assert.equal(await page.evaluate(() => window.pneutrack.project?.id), firstId, "progetto riaperto");
assert.equal(s.doc.layout.C1.rot, 1, "modifica autosalvata");
assert.equal(s.doc.components.length, 8);

// 11. finestra Progetti: salva copia, rinomina, duplica, elimina, apri
await page.click('[data-act="save-as"]');
await page.waitForFunction(() => document.querySelector("#save-state").textContent.startsWith("Salvato"));
assert.notEqual(await page.evaluate(() => window.pneutrack.project.id), firstId);
await page.click('[data-act="projects"]');
await page.waitForSelector("#projects-list li[data-id]");
let names = await projects();
assert.deepEqual(names.sort(), ["Comando indiretto cilindro doppio effetto",
                                "Comando indiretto cilindro doppio effetto (copia)"]);
if (shots) await page.screenshot({ path: `${shots}/progetti.png` });

const row = (name) => page.locator("#projects-list li[data-id]", { has: page.locator(".project-name", { hasText: new RegExp(`^${name.replace(/[()]/g, "\\$&")}$`) }) });
await row("Comando indiretto cilindro doppio effetto").locator('[data-pact="rename"]').click();
await page.fill(".rename-input", "Pressa banco 1");
await page.press(".rename-input", "Enter");
await page.waitForFunction(() => [...document.querySelectorAll(".project-name")].some((e) => e.textContent === "Pressa banco 1"));
await row("Pressa banco 1").locator('[data-pact="duplicate"]').click();
await page.waitForFunction(() => document.querySelectorAll("#projects-list li[data-id]").length === 3);
await row("Pressa banco 1 (copia)").locator('[data-pact="delete"]').click();
await row("Pressa banco 1 (copia)").locator('[data-pact="delete-yes"]').click();
await page.waitForFunction(() => document.querySelectorAll("#projects-list li[data-id]").length === 2);
await page.fill("#projects-search", "pressa");
assert.deepEqual(await projects(), ["Pressa banco 1"]);
await row("Pressa banco 1").locator('[data-pact="open"]').click();
await page.waitForFunction(() => document.querySelector("#projects-dialog").hidden);
assert.equal(await page.evaluate(() => window.pneutrack.project.id), firstId);
assert.equal(await page.textContent("#doc-name"), "Pressa banco 1");

// 12. nuovo schema: bozza separata, il progetto resta in archivio
await page.click('[data-act="new"]');
s = await state();
assert.equal(s.doc.components.length, 0);
assert.equal(await page.evaluate(() => window.pneutrack.project), null);
await page.click('[data-act="projects"]');
await page.waitForFunction(() => document.querySelectorAll("#projects-list li[data-id]").length === 2);
await page.keyboard.press("Escape");

// 13. simulazione: il pulsante S1 fa uscire il cilindro, S2 lo fa rientrare
await page.selectOption("#examples", "doppio_effetto_bistabile");
await settled();
await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim === "on");
await page.selectOption("#sim-speed", "1");
const live = (key) => page.getAttribute(`#properties [data-live="${key}"]`, "data-value");
const waitLive = (key, test, timeout = 15000) => page.waitForFunction(([k, t]) => {
  const v = document.querySelector(`#properties [data-live="${k}"]`)?.dataset.value;
  return v !== undefined && new Function("v", `return ${t}`)(v);
}, [key, test], { timeout });
await waitLive("cyl:C1", "Number(v) < 0.01"); // all'inizio V1 alimenta la camera stelo
assert.equal(await live("valve:V1"), "12");

// tieni premuto S1 dal pannello finché V1 commuta
await page.hover('[data-cmd="S1|14"]');
await page.mouse.down();
await waitLive("valve:S1", "v === '14'");
await waitLive("valve:V1", "v === '14'");
await page.mouse.up();
await waitLive("valve:S1", "v === '12'"); // la molla riporta il pulsante a riposo
await waitLive("cyl:C1", "Number(v) > 0.99");
assert.equal(await live("valve:V1"), "14", "bistabile: resta commutata");
if (shots) await page.screenshot({ path: `${shots}/simulazione.png` });

// durante la simulazione lo schema non si modifica
// (in simulazione il disegno si rinnova a ogni fotogramma: si fa clic per coordinate)
const at = async (sel) => {
  for (let i = 0; i < 50; i++) {
    // l'elemento può essere sostituito proprio mentre lo si misura: si riprova
    const b = await page.locator(sel).boundingBox().catch(() => null);
    if (b) return [b.x + b.width / 2, b.y + b.height / 2];
    await page.waitForTimeout(20);
  }
  throw new Error(`elemento non trovato: ${sel}`);
};
await page.mouse.click(...(await at('[data-component="C1"] .halo')));
await page.waitForSelector('#properties [data-live="port:C1.A"]');
await page.keyboard.press("Delete");
assert.equal((await state()).doc.components.length, 8);

// S2 azionato facendo clic sul suo pulsante nel disegno
await page.mouse.move(...(await at('[data-component="S2"] [data-side="14"]')));
await page.mouse.down();
await waitLive("valve:V1", "v === '12'");
await page.mouse.up();
await waitLive("cyl:C1", "Number(v) < 0.01");

await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim === undefined);

assert.deepEqual(errors, [], "errori JavaScript nella pagina");
await browser.close();
console.log("e2e ok");
