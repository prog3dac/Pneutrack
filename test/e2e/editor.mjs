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
// comandi del menu File e Modifica: si apre il menu e si sceglie la voce
async function menuAct(act, menu = "#file-menu") {
  await page.click(`${menu} summary`);
  await page.click(`${menu} [data-act="${act}"]`);
}
// finestra dei dati di un componente: doppio clic sul simbolo, OK per confermare
const D = ".props-dialog";
async function openProps(id) {
  // un punto del simbolo non coperto da altri componenti (quelli incollati possono finirci sopra)
  const at = await page.evaluate((id) => {
    const h = document.querySelector(`[data-component="${id}"] .halo`).getBoundingClientRect();
    for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (const fx of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const x = h.x + h.width * fx, y = h.y + h.height * fy;
      if (document.elementFromPoint(x, y)?.closest("[data-component]")?.dataset.component === id) return { x, y };
    }
    return { x: h.x + h.width / 2, y: h.y + h.height / 2 };
  }, id);
  await page.mouse.dblclick(at.x, at.y);
  await page.waitForSelector(D);
}
async function okProps() {
  await page.click(`${D} [data-act="props-ok"]`);
  await page.waitForSelector(D, { state: "detached" });
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

// manuale d'uso: dal menu File, con le tre parti e i collegamenti tra le parti
await page.click("#file-menu summary");
await page.click('[data-act="manual"]');
assert.match(await page.textContent("#manual-body"), /Convenzioni/);
assert.equal(await page.locator("#manual-tabs button").count(), 3);
await page.click('#manual-tabs button[data-manual-part="calcoli.md"]');
assert.match(await page.textContent("#manual-body"), /ISO 6358/);
await page.click('#manual-tabs button[data-manual-part="componenti.md"]');
assert.match(await page.textContent("#manual-body"), /double_acting_cylinder/);
await page.keyboard.press("Escape");
assert.ok(await page.locator("#manual-dialog").isHidden());

// menu Mostra: nasconde la legenda e la ripristina
await page.click("#view-filter summary");
await page.uncheck('#view-filter input[name="show-legend"]');
assert.ok(await page.locator("#legend").isHidden());
await page.check('#view-filter input[name="show-legend"]');
assert.ok(await page.locator("#legend").isVisible());
await page.click("#view-filter summary");

// 1. palette completa, a gruppi, con ricerca
const types = await page.locator(".palette-item[data-type]").evaluateAll((els) => els.map((e) => e.dataset.type));
assert.equal(new Set(types).size, 72, `tipi in palette: ${[...new Set(types)]}`);
assert.ok(types.length >= 72, "valvole già configurate");
await page.fill("#palette-search", "non ritorno");
const visible = () => page.locator(".palette-item[data-type]:visible").evaluateAll((els) => els.map((e) => e.textContent.trim()));
assert.deepEqual(await visible(), ["Innesto rapido con non ritorno, innestato", "Innesto rapido con non ritorno, staccato",
  "Innesto rapido senza non ritorno", "Innesto rapido con due non ritorno", "Valvola di non ritorno",
  "Valvola di non ritorno con molla", "Non ritorno pilotata",
  "Doppia non ritorno pilotata", "Regolatore di flusso unidirezionale"]);
await page.fill("#palette-search", "5/2 bistabile");
assert.deepEqual(await visible(), ["5/2 bistabile pneumatica", "5/2 bistabile elettrica", "5/2 bistabile elettropneumatica"]);
await page.fill("#palette-search", "");
assert.equal((await visible()).length, types.length);
// la barra a sinistra nasconde e riapre la palette con un clic sulla sezione attiva
await page.click('#rail [data-rail="pneu"]');
assert.ok(await page.locator("#palette").isHidden(), "palette nascosta");
await page.click('#rail [data-rail="pneu"]');
assert.ok(await page.locator("#palette").isVisible(), "palette riaperta");

// 2. costruzione di uno schema: sorgente -> 3/2 -> cilindro semplice effetto
await dropFromPalette("pressure_source", 300, 520);
await dropFromPalette("directional_valve", 300, 340);
await dropFromPalette("single_acting_cylinder", 300, 160);
await settled();
let s = await state();
assert.deepEqual(s.doc.components.map((c) => c.id), ["P1", "V1", "C1"]);
assert.ok(s.analysis.issues.some((i) => i.code === "UNCONNECTED_PORT"));

// in Disegno la colonna di destra non c'è: i dati si cambiano nella finestra (doppio clic)
await page.click('[data-component="V1"] .halo', { force: true });
assert.ok(await page.locator("#side").isHidden(), "colonna nascosta con un componente selezionato");
await openProps("V1");
assert.match(await page.textContent(`${D} h2`), /V1/);
await page.selectOption(`${D} select[name="function"]`, "3/2");
await settled();
assert.equal((await state()).doc.components[1].function, "3/2", "la modifica si vede subito");
await okProps();
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
assert.ok(await page.locator("#side").isVisible(), "la colonna compare per la linea selezionata");
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
await page.click('#properties button:has-text("Togli le pieghe")');
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
await openProps("C1");
await page.fill(`${D} input[name="param-max_pressure"]`, "4");
await page.press(`${D} input[name="param-max_pressure"]`, "Enter");
await okProps();
await settled();
s = await state();
assert.equal(s.doc.components[2].params.max_pressure, "4 bar", "unità aggiunta in automatico");
assert.deepEqual(s.analysis.issues.map((i) => i.code), ["OVERPRESSURE"]);
await page.waitForSelector("#issues li.error", { state: "attached" });
assert.match(await page.textContent("#status"), /1 errore/);
if (shots) await page.screenshot({ path: `${shots}/sovrapressione.png` });

// 3b. misure normalizzate del cilindro: la misura predefinita è riconosciuta, il menu imposta alesaggio e stelo
await openProps("C1");
assert.equal(await page.inputValue(`${D} select[name="cylinder-size"]`), "iso6432|20|8");
assert.equal(await page.getAttribute(`${D} input[name="param-stroke"]`, "list"), "std-stroke");
await page.selectOption(`${D} select[name="cylinder-size"]`, "iso6432|25|10");
await okProps();
await settled();
s = await state();
assert.equal(s.doc.components[2].params.bore, "25 mm");
assert.equal(s.doc.components[2].params.rod, "10 mm");

// 4. parametro con unità sbagliata: il campo si segnala nella finestra
await openProps("C1");
await page.fill(`${D} input[name="param-bore"]`, "20 bar");
await page.press(`${D} input[name="param-bore"]`, "Enter");
await settled();
s = await state();
assert.ok(s.analysis.issues.some((i) => i.code === "INVALID_COMPONENT" && i.component === "C1"));
await page.waitForSelector(`${D} .field.invalid input[name="param-bore"]`);
await okProps();

// 4b. Annulla (o Esc) nella finestra scarta tutte le modifiche fatte lì, senza passi di annulla
await openProps("C1");
await page.fill(`${D} input[name="label"]`, "Da scartare");
await page.press(`${D} input[name="label"]`, "Enter");
await page.fill(`${D} input[name="param-stroke"]`, "250");
await page.press(`${D} input[name="param-stroke"]`, "Enter");
assert.equal((await state()).doc.components[2].label, "Da scartare");
await page.keyboard.press("Escape");
await page.waitForSelector(D, { state: "detached" });
s = await state();
assert.equal(s.doc.components[2].label, undefined, "Esc scarta");
assert.notEqual(s.doc.components[2].params.stroke, "250 mm");

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
await page.click("#status"); // il bollino apre l'elenco dei problemi
await page.click("#issues li.error");
assert.equal(await page.evaluate(() => window.pneutrack.selection?.id), "C1");
await page.keyboard.press("Delete");
await settled();
s = await state();
assert.deepEqual(s.doc.components.map((c) => c.id), ["P1", "V1"]);
assert.equal(s.doc.connections.length, 1);

// 7. rinomina e rotazione
await openProps("V1");
await page.fill(`${D} input[name="id"]`, "Y1");
await page.press(`${D} input[name="id"]`, "Enter");
// la finestra si ridisegna subito dopo la modifica e segue la sigla nuova
await page.waitForFunction((d) => /Y1/.test(document.querySelector(`${d} h2`)?.textContent ?? ""), D);
await page.keyboard.press("Control+Enter");
await page.waitForSelector(D, { state: "detached" });
// la validazione dopo la rinomina ridisegna i simboli: si clicca solo a disegno fermo
await settled();
await page.click("#canvas", { position: { x: 40, y: 40 } });
await page.click('[data-component="Y1"] .halo', { force: true });
await page.keyboard.press("r");
s = await state();
assert.equal(s.doc.connections[0].to === "Y1.1" || s.doc.connections[0].from === "Y1.1", true);
assert.equal(s.doc.layout.Y1.rot, 1);

// 8. esempio dal menu: la bozza con il lavoro fatto finora non si perde, diventa un progetto
await page.selectOption("#examples", "doppio_effetto_bistabile");
await settled();
assert.match(await page.textContent("#toast"), /La bozza di prima è tra i progetti: «Bozza del /);
{ // il progetto della bozza c'è, con i componenti; poi lo si toglie per non contarlo nei passi dopo
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("pneutrack.project."))
    .map((k) => [k, JSON.parse(localStorage.getItem(k))]).filter(([, p]) => p.name.startsWith("Bozza del ")));
  assert.equal(kept.length, 1);
  assert.deepEqual(kept[0][1].circuit.components.map((c) => c.id), ["P1", "Y1"]);
  await page.evaluate((k) => localStorage.removeItem(k), kept[0][0]);
}
// un esempio non modificato non diventa un progetto: il secondo caricamento non salva niente
await page.selectOption("#examples", "doppio_effetto_bistabile");
await settled();
assert.doesNotMatch(await page.textContent("#toast"), /Bozza/);
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
const [download] = await Promise.all([page.waitForEvent("download"), menuAct("export")]);
assert.match(download.suggestedFilename(), /\.pneu\.json$/);
const saved = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
assert.equal(saved.format, "pneutrack/circuit");
assert.equal(saved.components.length, 8);

// 9b. foglio A3 con cartiglio ed esportazione PDF
await page.click('#rail [data-rail="sheet"]');
await page.selectOption(`${D} select[name="sheet-format"]`, "A3");
await okProps();
await settled();
s = await state();
assert.equal(s.doc.sheet.format, "A3");
assert.equal(s.doc.sheet.origin.length, 2);
assert.equal(await page.locator("#sheet .paper").count(), 1);
assert.match(await page.textContent("#sheet"), /Pneutrack v/);
const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click('.tb-right [data-act="pdf"]')]);
assert.match(pdf.suggestedFilename(), /\.pdf$/);
const pdfBytes = Buffer.concat(await (await pdf.createReadStream()).toArray());
assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
assert.ok(pdfBytes.length > 5000);
// 9c. distinta componenti: codice articolo, finestra, CSV, PDF e tabella sul foglio
await openProps("C1");
await page.fill(`${D} input[name="code"]`, "DSBC-32-100");
await okProps(); // OK conferma anche il campo ancora in modifica
await settled();
assert.equal((await state()).doc.components.find((c) => c.id === "C1").code, "DSBC-32-100");
await page.click("#canvas", { position: { x: 40, y: 40 } });
await menuAct("bom");
assert.ok(await page.locator("#bom-dialog").isVisible());
const bomText = await page.textContent("#bom-table");
assert.match(bomText, /DSBC-32-100/);
assert.match(bomText, /Cilindro doppio effetto/);
const [csv] = await Promise.all([page.waitForEvent("download"), page.click('[data-bact="csv"]')]);
assert.match(csv.suggestedFilename(), /-distinta\.csv$/);
const csvText = Buffer.concat(await (await csv.createReadStream()).toArray()).toString();
assert.match(csvText, /^\uFEFFPos\.;Sigle;/);
assert.match(csvText, /;C1;Cilindro doppio effetto;.*;DSBC-32-100;1/);
const [bomPdf] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click('[data-bact="pdf"]')]);
assert.equal(Buffer.concat(await (await bomPdf.createReadStream()).toArray()).subarray(0, 5).toString(), "%PDF-");
await page.check("#bom-on-sheet");
await settled();
assert.equal((await state()).doc.sheet.bom, true);
assert.match(await page.textContent("#sheet"), /DSBC-32-100/);
await page.click('[data-bact="close"]');
assert.ok(await page.locator("#bom-dialog").isHidden());
if (shots) await page.screenshot({ path: `${shots}/09c-distinta-foglio.png` });
// 9d. SVG e DXF (con la distinta sul foglio) del foglio dal menu File
const [svgDl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), menuAct("export-svg")]);
assert.match(svgDl.suggestedFilename(), /\.svg$/);
const svgText = Buffer.concat(await (await svgDl.createReadStream()).toArray()).toString();
assert.match(svgText, /^<\?xml/);
assert.match(svgText, /width="420mm" height="297mm"/);
assert.match(svgText, />C1</);
assert.ok(!svgText.includes('class="halo"'), "niente elementi dell'editor nell'SVG");
const [dxfDl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), menuAct("export-dxf")]);
assert.match(dxfDl.suggestedFilename(), /\.dxf$/);
const dxfText = Buffer.concat(await (await dxfDl.createReadStream()).toArray()).toString("latin1");
if (shots) (await import("node:fs")).writeFileSync(`${shots}/schema.dxf`, dxfText, "latin1");
const dxfLines = dxfText.split("\r\n");
assert.equal(dxfLines[dxfLines.length - 2], "EOF");
for (const layer of ["CORNICE", "LINEE", "PILOTAGGI", "SIMBOLI", "TESTI"]) assert.ok(dxfLines.includes(layer), `layer ${layer}`);
const textAt = dxfLines.indexOf("C1");
assert.ok(textAt > 0 && dxfLines[textAt - 1] === "1", "la sigla C1 è un testo");
assert.ok(dxfLines.filter((l) => l === "LINE").length > 20, "linee del disegno");
assert.ok(dxfLines.includes("DSBC-32-100"), "la distinta sul foglio finisce nel DXF");
// tutto dentro il foglio A3 (420 × 297 mm)
const xs = [], ys = [];
for (let i = dxfLines.indexOf("ENTITIES"); i < dxfLines.length - 1; i += 2) {
  if (dxfLines[i] === "10") xs.push(Number(dxfLines[i + 1]));
  if (dxfLines[i] === "20") ys.push(Number(dxfLines[i + 1]));
}
assert.ok(Math.min(...xs) >= -0.01 && Math.max(...xs) <= 420.01 && Math.min(...ys) >= -0.01 && Math.max(...ys) <= 297.01);
// doppio clic sul vuoto: la finestra dello schema e del foglio
await page.dblclick("#canvas", { position: { x: 40, y: 40 } });
await page.selectOption(`${D} select[name="sheet-format"]`, "");
await okProps();
await settled();
assert.equal((await state()).doc.sheet, undefined);

// 9e. testi e forme: contorno di gruppo tratto-punto, testo, colore; nel DXF con il loro stile
await page.click('#rail [data-rail="ann"]');
await page.click('.palette-item[data-annotation="group"]');
await page.click('#properties [data-name="ann-color"] button[aria-label="Rosso"]');
await page.locator('.palette-item[data-annotation="text"]').dragTo(page.locator("#canvas"), { targetPosition: { x: 200, y: 120 } });
await page.fill('#properties textarea[name="ann-text"]', "Nota di prova");
await page.press('#properties textarea[name="ann-text"]', "Tab");
s = await state();
assert.deepEqual(s.doc.annotations.map((a) => a.kind), ["rect", "text"]);
assert.equal(s.doc.annotations[0].line, "dashdot");
assert.equal(s.doc.annotations[0].color, "#dc2626");
assert.equal(s.doc.annotations[1].text, "Nota di prova");
assert.equal(await page.locator("#annotations-top text", { hasText: "Nota di prova" }).count(), 1);
if (shots) await page.screenshot({ path: `${shots}/09e-testo-forme.png` });
const [annDxf] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), menuAct("export-dxf")]);
const annLines = Buffer.concat(await (await annDxf.createReadStream()).toArray()).toString("latin1").split("\r\n");
assert.ok(annLines.includes("ANNOTAZIONI") && annLines.includes("Nota di prova"), "le annotazioni finiscono nel DXF");
const dd = annLines.findIndex((l, i) => l === "DASHDOT" && annLines[i - 1] === "6");
assert.ok(dd > 0 && annLines[dd + 1] === "62" && annLines[dd + 2] === "1", "contorno tratto-punto rosso nel DXF");
await page.keyboard.press("Delete");
{ // il contorno si prende sul bordo (lontano dalle maniglie): dentro passano i clic ai componenti
  const fb = await page.locator("#annotations [data-ann] .ann-hit").boundingBox();
  await page.mouse.click(fb.x + 4, fb.y + fb.height * 0.3);
}
await page.keyboard.press("Delete");
await settled();
assert.equal((await state()).doc.annotations, undefined);

// 10. progetti: salva, autosalvataggio, riapertura dopo ricarica
const projects = () => page.evaluate(async () => {
  const r = [];
  document.querySelectorAll("#projects-list li[data-id] .project-name").forEach((e) => r.push(e.textContent));
  return r;
});
const saveText = () => page.textContent("#save-state");
assert.equal(await saveText(), "Bozza non salvata");
await menuAct("save");
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
await menuAct("save-as");
await page.waitForFunction(() => document.querySelector("#save-state").textContent.startsWith("Salvato"));
assert.notEqual(await page.evaluate(() => window.pneutrack.project.id), firstId);
await menuAct("projects");
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
await menuAct("new");
s = await state();
assert.equal(s.doc.components.length, 0);
assert.equal(await page.evaluate(() => window.pneutrack.project), null);
await menuAct("projects");
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

// misure: uscita e rientro sono un ciclo, con l'aria delle due camere (≈ 0,75 Nl a 5 bar, più le linee)
await waitLive("cycle:count", "Number(v) >= 1");
assert.ok(Number(await live("air:total")) > 0.75, "l'aria consumata comprende il ciclo");
assert.ok(Number(await live("stroke:C1")) > 0, "tempo di uscita di C1");
assert.ok(await page.getAttribute('#properties [data-live="cycle:flow"]', "title"), "le misure si spiegano al passaggio del mouse");
await page.waitForSelector('#diagram [data-cycle="1"]');
assert.ok(await page.locator("#diagram .dg-dur").count() >= 1, "tempi di corsa nel diagramma");
if (shots) await page.screenshot({ path: `${shots}/misure.png` });

await page.click('[data-act="mode-draw"]');
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
  // senza `from`: la linea con il tratto più lungo, lontano dalle porte e non coperto da un componente
  return page.evaluate((from) => {
    const conns = window.pneutrack.doc.connections;
    let best = null;
    conns.forEach((c, i) => {
      if (from && c.from !== from && c.to !== from) return;
      const pl = document.querySelector(`[data-connection="${i}"] .stroke`);
      const m = pl.getScreenCTM();
      const pts = pl.getAttribute("points").split(" ").map((p) => p.split(",").map(Number));
      for (let j = 0; j + 1 < pts.length; j++) {
        const d = Math.abs(pts[j + 1][0] - pts[j][0]) + Math.abs(pts[j + 1][1] - pts[j][1]);
        const x = (pts[j][0] + pts[j + 1][0]) / 2, y = (pts[j][1] + pts[j + 1][1]) / 2;
        const sx = m.a * x + m.c * y + m.e, sy = m.b * x + m.d * y + m.f;
        if (document.elementFromPoint(sx, sy)?.closest("[data-component]")) continue;
        if (!best || d > best.d) best = { d, i, x: sx, y: sy };
      }
    });
    return { x: best.x, y: best.y, index: best.i, from: conns[best.i].from, to: conns[best.i].to };
  }, from);
}
await page.click("#canvas", { position: { x: 40, y: 40 } });
s = await state();
const nConn = s.doc.connections.length, nComp = s.doc.components.length;
await dropFromPalette("pressure_gauge", 700, 120);
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
await menuAct("paste", "#edit-menu");
await settled();
s = await state();
assert.equal(s.doc.components.length, nAll);
assert.ok(s.doc.components.some((c) => c.id === gauge), "la sigla libera torna uguale");

// 16b. allineamento: centri sulla stessa orizzontale dal menu Modifica, poi annulla
await page.click("#canvas", { position: { x: 40, y: 40 } });
assert.equal(await page.locator('#edit-menu [data-act="align-center-y"]').isDisabled(), true, "allinea serve una selezione");
await page.keyboard.press("Control+a");
assert.ok(await page.locator('#properties [data-block-act="align-left"]').count(), "comandi di allineamento nel pannello");
const beforeAlign = (await state()).doc.layout;
await menuAct("align-center-y", "#edit-menu");
await settled();
s = await state();
assert.equal(new Set(s.doc.components.map((c) => s.doc.layout[c.id].y)).size, 1, "tutti i centri sulla stessa riga");
assert.ok(s.doc.components.every((c) => s.doc.layout[c.id].y % 10 === 0), "sulla griglia");
if (shots) await page.screenshot({ path: `${shots}/16b-allinea.png` });
await page.keyboard.press("Control+z");
await settled();
assert.deepEqual((await state()).doc.layout, beforeAlign, "annulla rimette le posizioni");

// 17. ogni campo da compilare ha una descrizione al passaggio del mouse
const C = s.doc.components.find((c) => c.type === "double_acting_cylinder").id;
await page.click("#canvas", { position: { x: 40, y: 40 } });
// anche se fa parte di un blocco il doppio clic apre i dati del cilindro
await openProps(C);
assert.match(await page.textContent(`${D} h2`), /^Cilindro/);
const fields = await page.locator(`${D} label.field`).evaluateAll((els) =>
  els.map((e) => [e.querySelector("span").textContent.trim(), e.title]));
assert.ok(fields.length >= 8, "campi del cilindro");
for (const [label, title] of fields) assert.ok(title.length > 30, `descrizione del campo ${label}`);
assert.match(fields.find(([l]) => l.startsWith("Alesaggio"))[1], /Unità: mm/);
await page.keyboard.press("Escape");
await page.click('#rail [data-rail="sheet"]');
const schemaFields = await page.locator(`${D} label.field`).evaluateAll((els) => els.map((e) => e.title));
await page.keyboard.press("Escape");
assert.ok(schemaFields.every((t) => t.length > 30), "campi dello schema e del foglio");

// 18. specchia: le porte passano dall'altra parte, il simbolo resta al suo posto
await page.click("#canvas", { position: { x: 40, y: 40 } });
await dropFromPalette("double_acting_cylinder", 420, 640);
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
await page.click('#selbar [data-act="mirror-v"]');
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
assert.ok(await page.locator("#side").isHidden(), "il filo appena disegnato non apre la colonna");
await page.click("#canvas", { position: { x: 40, y: 40 } });
await openProps("Y1");
await page.selectOption(`${D} select[name="drives"]`, "V1.14");
await okProps();
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
// diagramma delle fasi: aperto nella fascia in basso, corsie di C1 e Y1, in tempo e per passi
await page.waitForSelector('#diagram:not([hidden]) .diagram-svg');
for (const id of ["C1", "Y1"]) {
  assert.equal(await page.locator(`#diagram [data-channel="${id}"] .dg-trace`).count(), 1, `il diagramma traccia ${id}`);
}
await page.click('#sim-bar [data-dmode="step"]');
await page.waitForSelector('#diagram .diagram-svg[data-mode="step"]');
assert.ok(Number(await page.getAttribute("#diagram .diagram-svg", "data-steps")) >= 3, "uscita e rientro di C1 sono passi");
if (shots) await page.screenshot({ path: `${shots}/diagramma.png` });
await page.click('[data-act="sim-reset"]');
await page.click('[data-act="sim-diagram"]');
assert.ok(await page.locator("#diagram").isHidden(), "il diagramma si chiude");
await page.click('[data-act="mode-draw"]');
await page.waitForFunction(() => document.body.dataset.sim !== "on");

// nuovi simboli ISO 1219: comando manuale ausiliario e rubinetto si azionano con un clic nel disegno
await page.evaluate(() => window.pneutrack.loadDoc({
  name: "Comando manuale",
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "RB1", type: "shutoff_valve" },
    { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid_pilot", actuation_12: "spring", override: "detent" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" }, magnet: "yes" },
  ],
  connections: [{ from: "P.1", to: "RB1.1" }, { from: "RB1.2", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
  layout: { C1: { x: 300, y: 0, rot: 0 }, V1: { x: 300, y: 140, rot: 0 }, RB1: { x: 300, y: 240, rot: 0 }, P: { x: 300, y: 330, rot: 0 } },
}));
await settled();
assert.equal(await page.locator('[data-component="V1"] [data-override="1"]').count(), 1, "comando manuale disegnato");
await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim === "on");
await page.mouse.click(...(await at('[data-component="V1"] [data-override="1"]')));
await waitLive("valve:V1", "v === '14'");
await waitLive("cyl:C1", "Number(v) > 0.99");
// chiuso il rubinetto, sbloccato il comando manuale: la valvola torna a riposo
await page.mouse.click(...(await at('[data-component="RB1"] [data-side="14"]')));
await page.mouse.click(...(await at('[data-component="V1"] [data-override="1"]')));
await waitLive("valve:V1", "v === '12'");
assert.equal(await page.evaluate(() => window.pneutrack.sim.valvePosition("RB1")), "12", "rubinetto chiuso");
await page.click('[data-act="mode-draw"]');
await page.waitForFunction(() => document.body.dataset.sim !== "on");

// 12. più fogli: schede, rimandi tra fogli, copia/incolla, annulla/ripeti, simulazione ed export
await page.evaluate(() => window.pneutrack.loadDoc({
  name: "Due fogli",
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "RM1", type: "sheet_reference", label: "A1" },
    { id: "G", type: "electric_supply", params: { voltage: "24 V" } },
    { id: "S1", type: "pushbutton", contact: "no" },
    { id: "RE1", type: "wire_reference", label: "13" },
    { id: "RE2", type: "wire_reference", label: "0V" },
    { id: "RM2", type: "sheet_reference", label: "A1" },
    { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } },
    { id: "RE3", type: "wire_reference", label: "13" },
    { id: "RE4", type: "wire_reference", label: "0V" },
    { id: "Y1", type: "valve_solenoid", drives: "V1.14" },
  ],
  connections: [
    { from: "P.1", to: "RM1.1" }, { from: "G.+", to: "S1.13" }, { from: "S1.14", to: "RE1.1" }, { from: "G.0V", to: "RE2.1" },
    { from: "RM2.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" },
    { from: "RE3.1", to: "Y1.A1" }, { from: "Y1.A2", to: "RE4.1" },
  ],
  layout: {
    P: { x: 0, y: 0, rot: 0, sheet: "F1" }, RM1: { x: 0, y: -120, rot: 2, sheet: "F1" },
    G: { x: 200, y: 0, rot: 0, sheet: "F1" }, S1: { x: 200, y: 100, rot: 0, sheet: "F1" },
    RE1: { x: 200, y: 220, rot: 2, sheet: "F1" }, RE2: { x: 300, y: 100, rot: 2, sheet: "F1" },
    RM2: { x: 0, y: 260, rot: 0, sheet: "F2" }, V1: { x: 0, y: 140, rot: 0, sheet: "F2" }, C1: { x: 0, y: 0, rot: 0, sheet: "F2" },
    RE3: { x: 200, y: -40, rot: 0, sheet: "F2" }, Y1: { x: 200, y: 60, rot: 0, sheet: "F2" }, RE4: { x: 200, y: 160, rot: 2, sheet: "F2" },
  },
  sheets: [{ id: "F1", name: "Alimentazione", sheet: { format: "A4" } }, { id: "F2", name: "Attuatore", sheet: { format: "A4" } }],
}));
await settled();
const sheetsNow = () => page.evaluate(() => ({ n: window.pneutrack.pages.length, active: window.pneutrack.active,
  names: window.pneutrack.pages.map((p) => p.name), ids: window.pneutrack.doc.components.map((c) => c.id) }));
assert.equal(await page.locator("#sheet-tabs .sheet-tab").count(), 2, "due schede");
assert.deepEqual((await sheetsNow()).ids, ["P", "RM1", "G", "S1", "RE1", "RE2"], "sul primo foglio solo i suoi componenti");
assert.equal(await page.locator('[data-component="V1"]').count(), 0, "V1 non è disegnata sul primo foglio");
assert.match(await page.textContent("#sheet"), /Foglio 1 di 2/, "cartiglio con il numero del foglio");
assert.equal((await state()).analysis.errors, 0, "i rimandi chiudono il circuito tra i fogli");
// il rimando indica il foglio dove prosegue; un clic porta al compagno
assert.equal(await page.textContent('[data-goto="RM1"]'), "→ fg. 2");
await page.click('[data-goto="RM1"]');
assert.equal((await sheetsNow()).active, 1, "il clic sul rimando apre il foglio 2");
assert.equal((await state()).doc.components.length, 6);
// Invio apre i dati del componente selezionato (il rimando compagno)
await page.keyboard.press("Enter");
await page.waitForSelector(D);
assert.match(await page.textContent(D), /Prosegue su/);
await page.keyboard.press("Escape");
// PagSu torna al primo foglio
await page.keyboard.press("PageUp");
assert.equal((await sheetsNow()).active, 0);

// aggiungi, rinomina con doppio clic, annulla
await page.click("#btn-add-sheet");
assert.deepEqual(await sheetsNow().then((s) => [s.n, s.active]), [3, 1], "nuovo foglio dopo quello aperto");
assert.equal(await page.evaluate(() => window.pneutrack.doc.sheet?.format), "A4", "stesso formato del foglio di partenza");
await page.dblclick('#sheet-tabs [data-page="1"]');
await page.fill("#sheet-tabs .tab-rename", "Comando");
await page.keyboard.press("Enter");
assert.equal((await sheetsNow()).names[1], "Comando");
await page.keyboard.press("Control+z");
assert.equal((await sheetsNow()).names[1], "Foglio 3");
await page.keyboard.press("Control+z");
assert.equal((await sheetsNow()).n, 2, "annulla toglie il foglio aggiunto");

// copia sul foglio 1, incolla sul foglio 2: sigla nuova, unica nel progetto
await page.click('#sheet-tabs [data-page="0"]');
await page.click('[data-component="S1"] .halo', { force: true });
await page.keyboard.press("Control+c");
await page.click('#sheet-tabs [data-page="1"]');
await page.mouse.move(700, 300);
await page.keyboard.press("Control+v");
let s2 = await sheetsNow();
const pasted = s2.ids.find((id) => !["RM2", "V1", "C1", "RE3", "RE4", "Y1"].includes(id));
assert.ok(pasted && pasted !== "S1", `incollato con sigla nuova: ${s2.ids}`);
// annulla dal primo foglio: si torna al foglio della modifica
await page.click('#sheet-tabs [data-page="0"]');
await page.keyboard.press("Control+z");
s2 = await sheetsNow();
assert.equal(s2.active, 1, "annulla riporta al foglio dove era avvenuta la modifica");
assert.ok(!s2.ids.includes(pasted), "incolla annullato");
await page.keyboard.press("Control+y");
assert.ok((await sheetsNow()).ids.includes(pasted), "ripeti");
await page.keyboard.press("Control+z");

// duplica dal menu della scheda: sigle nuove sul foglio copiato
await page.click('#sheet-tabs [data-page="1"] .tab-more');
await page.click('#sheet-menu button:has-text("Duplica")');
s2 = await sheetsNow();
assert.deepEqual([s2.n, s2.active, s2.names[2]], [3, 2, "Attuatore (copia)"]);
assert.ok(!s2.ids.some((id) => ["V1", "C1", "Y1"].includes(id)), `sigle nuove nella copia: ${s2.ids}`);
const dupIds = s2.ids;
// riordina trascinando la scheda, poi elimina dal menu
{
  const [fx, fy] = await at('#sheet-tabs [data-page="2"]');
  const b = await page.locator('#sheet-tabs [data-page="0"]').boundingBox();
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(b.x + 10, fy, { steps: 6 });
  await page.mouse.up();
}
s2 = await sheetsNow();
assert.deepEqual(s2.names, ["Attuatore (copia)", "Alimentazione", "Attuatore"], "scheda spostata");
assert.equal(s2.active, 0, "il foglio aperto resta aperto");
await page.click('#sheet-tabs [data-page="0"] .tab-more');
await page.click('#sheet-menu button:has-text("Elimina")');
s2 = await sheetsNow();
assert.deepEqual(s2.names, ["Alimentazione", "Attuatore"]);
assert.ok(!(await page.evaluate(() => window.pneutrack.file.components.map((c) => c.id))).some((id) => dupIds.includes(id)));

// il file salva tutti i fogli e si riapre uguale
const sheetFile = await page.evaluate(() => window.pneutrack.file);
assert.deepEqual(sheetFile.sheets.map((s) => s.name), ["Alimentazione", "Attuatore"]);
assert.equal(sheetFile.layout.C1.sheet, "F2");

// simulazione: il pulsante sul foglio 1 comanda il cilindro sul foglio 2
await page.click('#sheet-tabs [data-page="0"]');
await page.click('[data-act="sim"]');
await page.waitForFunction(() => document.body.dataset.sim === "on");
await page.evaluate(() => window.pneutrack.sim.setSwitch("S1", true));
await page.waitForFunction(() => window.pneutrack.sim.cylinder("C1").fraction > 0.99, null, { timeout: 15000 });
await page.click('#sheet-tabs [data-page="1"]');
assert.equal((await sheetsNow()).active, 1, "in simulazione si cambia foglio");
assert.equal(await page.locator('[data-component="C1"]').count(), 1);
await page.click('[data-act="mode-draw"]');
await page.waitForFunction(() => document.body.dataset.sim !== "on");

// export: con più fogli si sceglie; il PDF ha una pagina per foglio
await page.click('.tb-right [data-act="pdf"]');
await page.waitForSelector("#export-dialog:not([hidden])");
const [pdf2] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("#export-all")]);
const pdfAll = await (await pdf2.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("latin1"));
assert.equal((pdfAll.match(/\/Type \/Page\b/g) ?? []).length, 2, "PDF di due pagine");
await page.click("#file-menu summary");
await page.click('#file-menu [data-act="export-dxf"]');
await page.waitForSelector("#export-dialog:not([hidden])");
const [dxf2] = await Promise.all([page.waitForEvent("download"), page.click("#export-all")]);
const dxfAll = await (await dxf2.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("latin1"));
assert.ok(dxfAll.includes("Alimentazione") && dxfAll.includes("Attuatore"), "DXF con i due fogli");
// distinta di tutti i fogli, con il foglio delle sigle
await menuAct("bom");
assert.match(await page.textContent("#bom-table"), /fg\. 2: C1/);
await page.keyboard.press("Escape");
if (shots) await page.screenshot({ path: `${shots}/fogli.png` });

assert.deepEqual(errors, [], "errori JavaScript nella pagina");
await browser.close();
console.log("e2e ok");
