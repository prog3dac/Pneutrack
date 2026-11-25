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
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
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

// 0. versione dell'app, novità e legenda delle linee
assert.match(await page.textContent("#app-version"), /^v\d+\.\d+\.\d+$/);
await page.click("#app-version");
assert.match(await page.textContent("#news-body"), /\(in uso\)/);
await page.keyboard.press("Escape");
assert.ok(await page.locator("#news-dialog").isHidden());
assert.equal(await page.locator("#legend li").count(), 10);

// menu Mostra: nasconde la legenda e la ripristina
await page.click("#view-filter summary");
await page.uncheck('#view-filter input[name="show-legend"]');
assert.ok(await page.locator("#legend").isHidden());
await page.check('#view-filter input[name="show-legend"]');
assert.ok(await page.locator("#legend").isVisible());
await page.click("#view-filter summary");

// 1. palette completa, a gruppi, con ricerca
const types = await page.locator(".palette-item[data-type]").evaluateAll((els) => els.map((e) => e.dataset.type));
assert.equal(new Set(types).size, 37, `tipi in palette: ${[...new Set(types)]}`);
assert.ok(types.length >= 37, "valvole già configurate");
await page.fill("#palette-search", "non ritorno");
const visible = () => page.locator(".palette-item[data-type]:visible").evaluateAll((els) => els.map((e) => e.textContent.trim()));
assert.deepEqual(await visible(), ["Valvola di non ritorno", "Non ritorno pilotata", "Regolatore di flusso unidirezionale"]);
await page.fill("#palette-search", "5/2 bistabile");
assert.deepEqual(await visible(), ["5/2 bistabile pneumatica", "5/2 bistabile elettrica", "5/2 bistabile elettropneumatica"]);
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
// la linea selezionata passa sopra ai simboli, le altre si attenuano
assert.equal(await page.locator('#lines-top [data-connection="1"].selected').count(), 1);
assert.ok(await page.locator("#lines.dimmed").count());
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

// 3b. misure normalizzate del cilindro: la misura predefinita è riconosciuta, il menu imposta alesaggio e stelo
assert.equal(await page.inputValue('#properties select[name="cylinder-size"]'), "iso6432|20|8");
assert.equal(await page.getAttribute('#properties input[name="param-stroke"]', "list"), "std-stroke");
await page.selectOption('#properties select[name="cylinder-size"]', "iso6432|25|10");
await settled();
s = await state();
assert.equal(s.doc.components[2].params.bore, "25 mm");
assert.equal(s.doc.components[2].params.rod, "10 mm");

// 4. parametro con unità sbagliata
await page.fill('#properties input[name="param-bore"]', "20 bar");
await page.press('#properties input[name="param-bore"]', "Enter");
await settled();
s = await state();
assert.ok(s.analysis.issues.some((i) => i.code === "INVALID_COMPONENT" && i.component === "C1"));

// 5. annulla tre volte (alesaggio sbagliato, misura standard, 4 bar): torna il cilindro valido a 10 bar
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.keyboard.press("Control+z");
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
// senza sigle e numeri di porta le etichette restano solo con le descrizioni
const labelTexts = () => page.locator("#labels .label").evaluateAll((els) => els.map((e) => e.textContent));
assert.ok((await labelTexts()).some((t) => t.startsWith("V1")));
await page.click("#view-filter summary");
await page.uncheck('#view-filter input[name="show-ids"]');
await page.uncheck('#view-filter input[name="show-ports"]');
assert.ok(!(await labelTexts()).some((t) => /^V1\b/.test(t)));
assert.ok(await page.locator(".port-label").first().isHidden());
await page.click('#view-filter button:has-text("Mostra tutto")');
await page.click("#view-filter summary");
assert.ok((await labelTexts()).some((t) => t.startsWith("V1")));

// 9. esportazione: scarica un file che il modello sa rileggere
const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="export"]')]);
assert.match(download.suggestedFilename(), /\.pneu\.json$/);
const saved = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
assert.equal(saved.format, "pneutrack/circuit");
assert.equal(saved.components.length, 8);

// 9b. foglio A3 con cartiglio ed esportazione PDF
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.selectOption('#properties select[name="sheet-format"]', "A3");
await settled();
s = await state();
assert.equal(s.doc.sheet.format, "A3");
assert.equal(s.doc.sheet.origin.length, 2);
assert.equal(await page.locator("#sheet .paper").count(), 1);
assert.match(await page.textContent("#sheet"), /Pneutrack v/);
const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click('[data-act="pdf"]')]);
assert.match(pdf.suggestedFilename(), /\.pdf$/);
const pdfBytes = Buffer.concat(await (await pdf.createReadStream()).toArray());
assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
assert.ok(pdfBytes.length > 5000);
await page.selectOption('#properties select[name="sheet-format"]', "");
await settled();
assert.equal((await state()).doc.sheet, undefined);

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

// 14. blocchi: Maiusc+clic, Unisci, nome e descrizione, sposta, duplica, libreria, Dividi
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.click('[data-component="V1"] .halo', { force: true });
await page.click('[data-component="C1"] .halo', { force: true, modifiers: ["Shift"] });
await page.click('[data-component="SL3"] .halo', { force: true, modifiers: ["Shift"] });
assert.match(await page.textContent("#properties h2"), /3 componenti selezionati/);
await page.keyboard.press("Control+g");
await settled();
s = await state();
assert.deepEqual(s.doc.blocks, [{ id: "B1", name: "Blocco 1", components: ["V1", "C1", "SL3"] }]);
await page.fill('#properties input[name="block-name"]', "Comando C1");
await page.press('#properties input[name="block-name"]', "Enter");
await page.fill('#properties textarea[name="block-description"]', "Valvola 5/2 con il suo cilindro");
await page.locator('#properties textarea[name="block-description"]').blur();
await settled();
assert.equal(await page.textContent("#blocks .block-label"), "Comando C1");
// trascinando un componente del blocco si sposta tutto il blocco
const before = (await state()).doc.layout;
const [bx, by] = await at('[data-component="C1"] .halo');
await page.mouse.move(bx, by); await page.mouse.down();
await page.mouse.move(bx + 40, by + 20, { steps: 4 }); await page.mouse.move(bx + 80, by + 40, { steps: 4 });
await page.mouse.up();
s = await state();
for (const id of ["V1", "C1", "SL3"]) assert.ok(s.doc.layout[id].x > before[id].x, `${id} spostato con il blocco`);
assert.equal(s.doc.layout.P.x, before.P.x, "P resta dov'era");
// duplica: nuove sigle, linee interne copiate, nuovo blocco
await page.keyboard.press("Control+d");
await settled();
s = await state();
assert.equal(s.doc.components.length, 11);
assert.equal(s.doc.blocks.length, 2);
assert.equal(s.doc.blocks[1].name, "Comando C1 (copia)");
const copyIds = s.doc.blocks[1].components;
assert.ok(s.doc.connections.some((c) => c.from === `${copyIds[1]}.A` && c.to === `${copyIds[0]}.4`));
// libreria: salva e reinserisce da palette
await page.click('#properties [data-block-act="library"]');
await page.waitForSelector('.library-item');
await page.click(".library-item");
await settled();
s = await state();
assert.equal(s.doc.components.length, 14);
assert.equal(s.doc.blocks.length, 3);
// Dividi: il blocco sparisce, i componenti restano
await page.keyboard.press("Control+Shift+g");
await settled();
s = await state();
assert.equal(s.doc.blocks.length, 2);
assert.equal(s.doc.components.length, 14);
await page.click('.library-item .remove');
assert.equal(await page.locator(".library-item").count(), 0);

// 15. punti di connessione e scarico
assert.equal(await page.locator('.palette-item[data-type="exhaust"]').count(), 1);
assert.equal(await page.locator('.palette-item[data-type="junction"]').count(), 1);
// punto a metà del tratto più lungo della linea dall'alimentazione, in coordinate dello schermo
async function linePoint(from) {
  // senza `from`: la linea con il tratto più lungo, lontano dalle porte
  return page.evaluate((from) => {
    const conns = window.pneutrack.doc.connections;
    let best = null;
    conns.forEach((c, i) => {
      if (from && c.from !== from && c.to !== from) return;
      const pl = document.querySelector(`[data-connection="${i}"] .stroke`);
      const pts = pl.getAttribute("points").split(" ").map((p) => p.split(",").map(Number));
      for (let j = 0; j + 1 < pts.length; j++) {
        const d = Math.abs(pts[j + 1][0] - pts[j][0]) + Math.abs(pts[j + 1][1] - pts[j][1]);
        if (!best || d > best.d) best = { d, i, pl, a: pts[j], b: pts[j + 1] };
      }
    });
    const m = best.pl.getScreenCTM();
    const x = (best.a[0] + best.b[0]) / 2, y = (best.a[1] + best.b[1]) / 2;
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, index: best.i,
             from: conns[best.i].from, to: conns[best.i].to };
  }, from);
}
await page.click("#canvas", { position: { x: 40, y: 40 } });
s = await state();
const nConn = s.doc.connections.length, nComp = s.doc.components.length;
await dropFromPalette("pressure_gauge", 900, 120);
await settled();
s = await state();
const gauge = s.doc.components.at(-1).id;
// trascinando una linea dal manometro sopra la linea dell'alimentazione nasce un punto di connessione
const mid = await linePoint(null);
const gp = await portCenter(`${gauge}.1`);
await page.mouse.move(gp.x, gp.y); await page.mouse.down();
await page.mouse.move((gp.x + mid.x) / 2, (gp.y + mid.y) / 2, { steps: 4 });
await page.mouse.move(mid.x, mid.y, { steps: 4 });
await page.mouse.up();
await settled();
s = await state();
const junction = s.doc.components.find((c) => c.type === "junction");
assert.ok(junction, "punto di connessione creato");
const jref = `${junction.id}.1`;
assert.equal(s.doc.connections.filter((c) => c.from === jref || c.to === jref).length, 3);
assert.equal(s.doc.connections.length, nConn + 2);
const linePr = s.analysis.pressures[mid.from]?.bar ?? 0;
assert.equal(s.analysis.pressures[`${gauge}.1`]?.bar ?? 0, linePr, "il manometro è nella stessa rete della linea");
// pulsante del pannello: un altro punto su una linea; Canc lo toglie ricucendo la linea
const mid2 = await linePoint(`${gauge}.1`);
await page.mouse.click(mid2.x, mid2.y);
await page.click('#properties button:has-text("Aggiungi punto di connessione")');
await settled();
s = await state();
assert.equal(s.doc.components.filter((c) => c.type === "junction").length, 2);
assert.equal(s.doc.connections.length, nConn + 3);
await page.keyboard.press("Delete");
await settled();
s = await state();
assert.equal(s.doc.components.filter((c) => c.type === "junction").length, 1);
assert.equal(s.doc.connections.length, nConn + 2);
assert.equal(s.doc.components.length, nComp + 2);
if (shots) await page.screenshot({ path: `${shots}/15-junction.png` });

// 16. selezione a riquadro trascinando sul vuoto; copia, taglia, incolla
s = await state();
const nAll = s.doc.components.length, nLines = s.doc.connections.length;
const cv = await page.locator("#canvas").boundingBox();
await page.mouse.move(cv.x + 4, cv.y + 4); await page.mouse.down();
await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2, { steps: 4 });
await page.mouse.move(cv.x + cv.width - 4, cv.y + cv.height - 4, { steps: 4 });
await page.mouse.up();
assert.match(await page.textContent("#properties h2"), new RegExp(`${nAll} componenti selezionati`));
assert.equal(await page.locator("#btn-paste").isDisabled(), true, "niente da incollare");
await page.keyboard.press("Control+c");
assert.equal(await page.locator("#btn-paste").isDisabled(), false);
await page.mouse.move(cv.x + 30, cv.y + 30);
await page.keyboard.press("Control+v");
await settled();
s = await state();
assert.equal(s.doc.components.length, 2 * nAll, "incollati tutti i componenti");
assert.equal(s.doc.connections.length, 2 * nLines, "incollate tutte le linee tra loro");
await page.keyboard.press("Control+z");
await settled();
// taglia un componente e lo reincolla con il pulsante (accanto all'originale)
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.click(`[data-component="${gauge}"] .halo`, { force: true });
await page.keyboard.press("Control+x");
await settled();
s = await state();
assert.equal(s.doc.components.length, nAll - 1);
assert.ok(!s.doc.components.some((c) => c.id === gauge));
await page.click("#btn-paste");
await settled();
s = await state();
assert.equal(s.doc.components.length, nAll);
assert.ok(s.doc.components.some((c) => c.id === gauge), "la sigla libera torna uguale");

// 17. ogni campo da compilare ha una descrizione al passaggio del mouse
const C = s.doc.components.find((c) => c.type === "double_acting_cylinder").id;
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.click(`[data-component="${C}"] .halo`, { force: true });
// se fa parte di un blocco il primo clic seleziona il blocco, il secondo il cilindro
if (!(await page.textContent("#properties h2")).startsWith("Cilindro")) {
  await page.click(`[data-component="${C}"] .halo`, { force: true });
}
const fields = await page.locator("#properties label.field").evaluateAll((els) =>
  els.map((e) => [e.querySelector("span").textContent.trim(), e.title]));
assert.ok(fields.length >= 8, "campi del cilindro");
for (const [label, title] of fields) assert.ok(title.length > 30, `descrizione del campo ${label}`);
assert.match(fields.find(([l]) => l.startsWith("Alesaggio"))[1], /Unità: mm/);
await page.click("#canvas", { position: { x: 40, y: 40 } });
const schemaFields = await page.locator("#properties label.field").evaluateAll((els) => els.map((e) => e.title));
assert.ok(schemaFields.every((t) => t.length > 30), "campi dello schema e del foglio");

// 18. specchia: le porte passano dall'altra parte, il simbolo resta al suo posto
await page.click("#canvas", { position: { x: 40, y: 40 } });
await dropFromPalette("double_acting_cylinder", 200, 640);
await settled();
s = await state();
const cyl = s.doc.components.at(-1).id;
const portX = async (p) => (await portCenter(`${cyl}.${p}`)).x;
const portY = async (p) => (await portCenter(`${cyl}.${p}`)).y;
assert.ok((await portX("A")) < (await portX("B")));
const yA = await portY("A");
await page.keyboard.press("h");
await settled();
s = await state();
assert.equal(s.doc.layout[cyl].mirror, true);
assert.ok((await portX("A")) > (await portX("B")), "A passa a destra");
await page.click('#properties [data-act="mirror-v"]');
await settled();
assert.ok((await portY("A")) < yA, "le porte passano sopra");
await page.keyboard.press("v");
await page.keyboard.press("h");
await settled();
s = await state();
assert.deepEqual({ ...s.doc.layout[cyl], x: 0, y: 0 }, { x: 0, y: 0, rot: 0 }, "due specchiature tornano all'originale");

// circuito elettrico di comando: simboli, fili, riferimenti per sigla
await page.evaluate(() => window.pneutrack.loadDoc({
  name: "Elettropneumatica",
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
    { id: "G", type: "electric_supply", params: { voltage: "24 V" } },
    { id: "S1", type: "pushbutton", contact: "no" },
    { id: "Y1", type: "valve_solenoid" },
  ],
  connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
  layout: { C1: { x: 300, y: 0, rot: 0 }, V1: { x: 300, y: 140, rot: 0 }, P: { x: 300, y: 260, rot: 0 },
            G: { x: 560, y: 80, rot: 0 }, S1: { x: 680, y: -40, rot: 0 }, Y1: { x: 680, y: 60, rot: 0 } },
}));
await settled();
for (const ref of ["G.+", "G.0V", "S1.13", "S1.14", "Y1.A1", "Y1.A2"]) {
  assert.equal(await page.locator(`[data-port="${ref}"]`).count(), 1, `morsetto ${ref}`);
}
await wire("Y1.A1", "P.1");
await settled();
assert.equal((await state()).doc.connections.length, 3, "un filo non si collega a una porta pneumatica");
await wire("G.+", "S1.13");
await wire("S1.14", "Y1.A1");
await wire("Y1.A2", "G.0V");
await settled();
assert.equal(await page.locator(".line.wire").count(), 3, "fili elettrici");
if (shots) await page.screenshot({ path: `${shots}/elettrico.png` });
assert.match(await page.textContent("#properties h2"), /Filo elettrico/);
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.click('[data-component="Y1"] .halo', { force: true });
await page.selectOption('#properties select[name="drives"]', "V1.14");
await settled();
s = await state();
assert.equal(s.doc.components.find((c) => c.id === "Y1").drives, "V1.14");
assert.deepEqual(s.analysis.issues.map((i) => i.code), []);
assert.match(await page.textContent('[data-component="V1"]'), /Y1/, "la valvola mostra la sua bobina");

// simulazione del circuito elettrico: il pulsante S1 eccita Y1 e il cilindro esce
await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim === "on");
await page.selectOption("#sim-speed", "1");
assert.equal(await page.locator('#properties [data-cmd="V1|14"]').count(), 0, "il solenoide con bobina non si comanda a clic");
await waitLive("load:Y1", "v === '0'");
// il disegno dei fili sotto tensione arriva al fotogramma dopo lo stato del carico: lo si attende
await page.waitForSelector(".line.wire.live", { timeout: 5000 }).catch(() => {});
assert.ok((await page.locator(".line.wire.live").count()) >= 1, "il filo dal + è sotto tensione");
await page.hover('#properties [data-switch="S1"]');
await page.mouse.down();
await waitLive("load:Y1", "v === '1'");
await waitLive("cyl:C1", "Number(v) > 0.99");
assert.equal(await page.locator(".line.wire.live").count(), 2, "con S1 premuto anche il filo verso Y1 è sotto tensione");
if (shots) await page.screenshot({ path: `${shots}/simulazione-elettrica.png` });
await page.mouse.up();
await waitLive("load:Y1", "v === '0'");
await waitLive("cyl:C1", "Number(v) < 0.01");
// anche nel disegno: clic sul pulsante
await page.mouse.move(...(await at('[data-component="S1"] .halo')));
await page.mouse.down();
await waitLive("load:Y1", "v === '1'");
await page.mouse.up();
await waitLive("load:Y1", "v === '0'");
// diagramma delle fasi: corsie di C1 e Y1, in tempo e per passi
await page.click('[data-act="sim-diagram"]');
await page.waitForSelector('#diagram:not([hidden]) .diagram-svg');
for (const id of ["C1", "Y1"]) {
  assert.equal(await page.locator(`#diagram [data-channel="${id}"] .dg-trace`).count(), 1, `il diagramma traccia ${id}`);
}
await page.click('#diagram [data-dmode="step"]');
await page.waitForSelector('#diagram .diagram-svg[data-mode="step"]');
assert.ok(Number(await page.getAttribute("#diagram .diagram-svg", "data-steps")) >= 3, "uscita e rientro di C1 sono passi");
if (shots) await page.screenshot({ path: `${shots}/diagramma.png` });
await page.click('[data-act="sim-reset"]');
await page.click('#diagram [data-dmode="close"]');
assert.ok(await page.locator("#diagram").isHidden(), "il diagramma si chiude");
await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim !== "on");

assert.deepEqual(errors, [], "errori JavaScript nella pagina");
await browser.close();
console.log("e2e ok");
