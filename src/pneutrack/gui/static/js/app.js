// Editor di schemi pneumatici: stato, disegno SVG e interazioni.
import { geometry, rotate, thumbnail } from "./symbols.js";
import * as api from "./api.js";
import { exportFile, newProjectId, openStore } from "./storage.js";

const GRID = 10;
const SVGNS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "pneutrack.autosave.v1"; // bozza non ancora salvata come progetto
const SESSION_KEY = "pneutrack.session.v1"; // ultimo progetto aperto
const AUTOSAVE_MS = 1200;

const PREFIX = {
  pressure_source: "P", pressure_regulator: "R", silencer: "SL", plug: "T",
  directional_valve: "V", flow_control_valve: "F", single_acting_cylinder: "C",
  double_acting_cylinder: "C", rotary_actuator: "RA",
};

// --- stato -------------------------------------------------------------------

let catalog = [];
let doc = emptyDoc();
let selection = null; // {kind: "component", id} | {kind: "connection", index}
let analysis = { issues: [], ports: {}, pressures: {}, errors: 0, warnings: 0 };
let view = { x: 0, y: 0, k: 1 };
const history = { past: [], future: [] };

function emptyDoc() {
  return { format: "pneutrack/circuit", version: 1, name: "Nuovo schema",
           components: [], connections: [], layout: {} };
}

const $ = (sel) => document.querySelector(sel);
const svg = $("#canvas");
const viewport = $("#viewport");

function byId(id) { return doc.components.find((c) => c.id === id); }
function layoutOf(id) {
  doc.layout[id] ??= { x: 0, y: 0, rot: 0 };
  return doc.layout[id];
}
function catalogEntry(type) { return catalog.find((t) => t.type === type); }

// --- storia (annulla / ripeti) -----------------------------------------------

function snapshot() { return JSON.stringify(doc); }
function commit(before) {
  if (before !== undefined && before !== snapshot()) {
    history.past.push(before);
    if (history.past.length > 200) history.past.shift();
    history.future = [];
  }
  changed();
}
function mutate(fn) {
  const before = snapshot();
  fn();
  commit(before);
}
function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  doc = JSON.parse(history.past.pop());
  fixSelection();
  changed();
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  doc = JSON.parse(history.future.pop());
  fixSelection();
  changed();
}
function fixSelection() {
  if (selection?.kind === "component" && !byId(selection.id)) selection = null;
  if (selection?.kind === "connection" && !doc.connections[selection.index]) selection = null;
}

// --- coordinate ----------------------------------------------------------------

function toWorld(evt) {
  const r = svg.getBoundingClientRect();
  return { x: (evt.clientX - r.left - view.x) / view.k, y: (evt.clientY - r.top - view.y) / view.k };
}
const snap = (v) => Math.round(v / GRID) * GRID;

function portWorld(compId, portName) {
  const comp = byId(compId);
  if (!comp) return null;
  const g = geometry(comp);
  const p = g.ports[portName];
  if (!p) return null;
  const l = layoutOf(compId);
  const [rx, ry] = rotate([p.x, p.y], l.rot || 0);
  return { x: l.x + rx, y: l.y + ry, dir: rotate(p.dir, l.rot || 0) };
}

function route(a, b) {
  const s1 = { x: a.x + a.dir[0] * 15, y: a.y + a.dir[1] * 15 };
  const s2 = b.dir ? { x: b.x + b.dir[0] * 15, y: b.y + b.dir[1] * 15 } : { x: b.x, y: b.y };
  const v1 = a.dir[0] === 0, v2 = b.dir ? b.dir[0] === 0 : !v1;
  const pts = [[a.x, a.y], [s1.x, s1.y]];
  if (v1 && v2) {
    const my = (s1.y + s2.y) / 2;
    pts.push([s1.x, my], [s2.x, my]);
  } else if (!v1 && !v2) {
    const mx = (s1.x + s2.x) / 2;
    pts.push([mx, s1.y], [mx, s2.y]);
  } else if (v1) {
    pts.push([s1.x, s2.y]);
  } else {
    pts.push([s2.x, s1.y]);
  }
  pts.push([s2.x, s2.y], [b.x, b.y]);
  return pts.map((p) => p.join(",")).join(" ");
}

// --- disegno -----------------------------------------------------------------

function el(tag, attrs = {}, html = "") {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

function issuesFor(compId) { return analysis.issues.filter((i) => i.component === compId); }
function portIssue(ref) {
  return analysis.issues.find((i) => i.code === "UNCONNECTED_PORT" && i.ports.includes(ref));
}
function connectedPorts() {
  const s = new Set();
  for (const c of doc.connections) { s.add(c.from); s.add(c.to); }
  return s;
}
function portKind(compId, name) {
  return (analysis.ports[compId] || []).find((p) => p.name === name)?.kind;
}

function render() {
  viewport.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
  const grid = $("#grid-pattern");
  grid.setAttribute("patternTransform", `translate(${view.x},${view.y}) scale(${view.k})`);

  const lines = $("#lines"), comps = $("#components"), ports = $("#ports"), labels = $("#labels");
  lines.replaceChildren(); comps.replaceChildren(); ports.replaceChildren(); labels.replaceChildren();

  // collegamenti
  doc.connections.forEach((c, index) => {
    const [ca, pa] = splitRef(c.from), [cb, pb] = splitRef(c.to);
    const a = portWorld(ca, pa), b = portWorld(cb, pb);
    if (!a || !b) return;
    const pr = analysis.pressures[c.from] || analysis.pressures[c.to];
    const kinds = [portKind(ca, pa), portKind(cb, pb)];
    const pilot = kinds.includes("pilot");
    const exhaust = kinds.includes("exhaust"); // linea di scarico: sfoga in atmosfera
    const cls = ["line", pr && !exhaust ? "pressurized" : "", pilot ? "pilot" : "",
                 exhaust ? "exhaust" : "",
                 selection?.kind === "connection" && selection.index === index ? "selected" : ""]
      .filter(Boolean).join(" ");
    const pts = route(a, b);
    const g = el("g", { class: cls, "data-connection": index });
    g.append(el("polyline", { points: pts, class: "hit" }));
    g.append(el("polyline", { points: pts, class: "stroke" }));
    g.append(el("title", {}, `${c.from} — ${c.to}${pr ? ` · ${pr.text}` : ""}`));
    lines.append(g);
  });

  const connected = connectedPorts();

  // componenti
  for (const comp of doc.components) {
    const l = layoutOf(comp.id);
    const g = geometry(comp);
    const iss = issuesFor(comp.id);
    const cls = ["component",
      selection?.kind === "component" && selection.id === comp.id ? "selected" : "",
      iss.some((i) => i.severity === "error") ? "has-error" :
        iss.some((i) => i.severity === "warning") ? "has-warning" : ""].filter(Boolean).join(" ");
    const grp = el("g", {
      class: cls, "data-component": comp.id,
      transform: `translate(${l.x},${l.y}) rotate(${(l.rot || 0) * 90})`,
    });
    const pad = 6;
    grp.append(el("rect", { class: "halo", x: -g.w / 2 - pad, y: -g.h / 2 - pad,
                            width: g.w + 2 * pad, height: g.h + 2 * pad, rx: 6 }));
    grp.append(el("g", { class: "symbol" }, g.svg));
    comps.append(grp);

    // etichetta (non ruotata), sopra l'ingombro ruotato
    const hh = (l.rot || 0) % 2 ? g.w / 2 : g.h / 2;
    const text = el("text", { x: l.x, y: l.y - hh - 10, class: "label" });
    text.textContent = comp.id + (comp.label ? ` · ${comp.label}` : "");
    labels.append(text);

    // porte
    for (const name of Object.keys(g.ports)) {
      const pw = portWorld(comp.id, name);
      const ref = `${comp.id}.${name}`;
      const isOpen = !connected.has(ref);
      const pc = ["port", isOpen ? "open" : "connected", portIssue(ref) ? "error" : "",
                  portKind(comp.id, name) || ""].filter(Boolean).join(" ");
      const pg = el("g", { class: pc, "data-port": ref, transform: `translate(${pw.x},${pw.y})` });
      pg.append(el("circle", { r: 9, class: "port-hit" }));
      pg.append(el("circle", { r: 3.2, class: "port-dot" }));
      const lx = pw.dir[0] * -9 + (pw.dir[0] === 0 ? 7 : 0);
      const ly = pw.dir[1] * -9 + (pw.dir[1] === 0 ? -6 : 3);
      const t = el("text", { x: lx, y: ly, class: "port-label" });
      t.textContent = name;
      pg.append(t);
      const pr = analysis.pressures[ref];
      pg.append(el("title", {}, `${ref}${pr ? ` · ${pr.text}` : " · 0 bar"}`));
      ports.append(pg);
    }
  }
  renderStatus();
}

function splitRef(ref) {
  const i = ref.lastIndexOf(".");
  return [ref.slice(0, i), ref.slice(i + 1)];
}

// --- pannelli ------------------------------------------------------------------

function renderPalette() {
  const pal = $("#palette");
  pal.replaceChildren();
  const cats = [...new Set(catalog.map((t) => t.category))];
  for (const cat of cats) {
    const h = document.createElement("h3");
    h.textContent = cat;
    pal.append(h);
    for (const t of catalog.filter((x) => x.category === cat)) {
      const b = document.createElement("button");
      b.className = "palette-item";
      b.draggable = true;
      b.dataset.type = t.type;
      b.title = t.doc;
      const sample = { type: t.type, ...Object.fromEntries(t.options.map((o) => [o.name, o.default])) };
      b.innerHTML = `${thumbnail(sample)}<span>${t.label}</span>`;
      b.addEventListener("click", () => addComponent(t.type, viewCenter()));
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-pneutrack-type", t.type);
        e.dataTransfer.effectAllowed = "copy";
      });
      pal.append(b);
    }
  }
}

function field(label, input) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(span, input);
  return wrap;
}

function renderProperties() {
  const panel = $("#properties");
  panel.replaceChildren();
  const title = document.createElement("h2");
  panel.append(title);

  if (selection?.kind === "component" && byId(selection.id)) {
    const comp = byId(selection.id);
    const meta = catalogEntry(comp.type);
    title.textContent = meta?.label || comp.type;

    const idIn = document.createElement("input");
    idIn.value = comp.id; idIn.name = "id"; idIn.spellcheck = false;
    idIn.addEventListener("change", () => renameComponent(comp.id, idIn.value.trim()));
    panel.append(field("Sigla", idIn));

    const labIn = document.createElement("input");
    labIn.value = comp.label || ""; labIn.name = "label"; labIn.placeholder = "facoltativa";
    labIn.addEventListener("change", () => mutate(() => {
      if (labIn.value.trim()) comp.label = labIn.value.trim(); else delete comp.label;
    }));
    panel.append(field("Descrizione", labIn));

    for (const opt of meta?.options || []) {
      const sel = document.createElement("select");
      sel.name = opt.name;
      for (const [value, text] of opt.choices) {
        const o = document.createElement("option");
        o.value = value; o.textContent = text;
        sel.append(o);
      }
      sel.value = comp[opt.name] ?? opt.default;
      sel.addEventListener("change", () => mutate(() => {
        comp[opt.name] = sel.value;
        pruneConnections(comp.id);
      }));
      panel.append(field(opt.label, sel));
    }

    if (meta?.params.length) {
      const h = document.createElement("h3");
      h.textContent = "Parametri da catalogo";
      panel.append(h);
    }
    for (const p of meta?.params || []) {
      const inp = document.createElement("input");
      inp.name = `param-${p.name}`;
      inp.value = comp.params?.[p.name] ?? "";
      inp.placeholder = (p.required ? "obbligatorio, " : "") + `es. ${exampleValue(p)}`;
      inp.spellcheck = false;
      inp.addEventListener("change", () => mutate(() => {
        comp.params ??= {};
        const v = inp.value.trim();
        if (v) comp.params[p.name] = /^[-+]?[\d.,]+$/.test(v) ? `${v} ${p.units[0]}` : v;
        else delete comp.params[p.name];
      }));
      const f = field(p.label + (p.required ? " *" : ""), inp);
      const bad = issuesFor(comp.id).find((i) => i.code === "INVALID_COMPONENT" &&
                                               i.message.includes(p.name));
      if (bad) f.classList.add("invalid");
      panel.append(f);
    }

    const portsIn = Object.keys(geometry(comp).ports);
    if (portsIn.length) {
      const h = document.createElement("h3");
      h.textContent = "Porte";
      panel.append(h);
      const ul = document.createElement("ul");
      ul.className = "port-list";
      for (const name of portsIn) {
        const ref = `${comp.id}.${name}`;
        const li = document.createElement("li");
        const pr = analysis.pressures[ref];
        const n = doc.connections.filter((c) => c.from === ref || c.to === ref).length;
        li.innerHTML = `<b>${name}</b><span>${n ? `${n} collegament${n > 1 ? "i" : "o"}` : "libera"}</span>` +
          `<span class="pressure">${pr ? pr.text : "0 bar"}</span>`;
        ul.append(li);
      }
      panel.append(ul);
    }

    if (comp.type.endsWith("_cylinder")) {
      const box = document.createElement("div");
      box.className = "derived";
      panel.append(box);
      const pr = analysis.pressures[`${comp.id}.A`]?.text || "6 bar";
      api.cylinderInfo({ ...comp, pressure: pr }).then((info) => {
        if (info.error || !info.piston_area) return;
        box.innerHTML = `<h3>Valori teorici a ${info.at_pressure}</h3>
          <dl><dt>Area pistone</dt><dd>${info.piston_area}</dd>
          <dt>Area anulare</dt><dd>${info.annular_area}</dd>
          <dt>Forza in uscita</dt><dd>${info.force_extend}</dd>
          <dt>Forza in rientro</dt><dd>${info.force_retract}</dd></dl>`;
      });
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.innerHTML = `<button data-act="rotate">Ruota (R)</button>
      <button data-act="duplicate">Duplica</button>
      <button data-act="delete" class="danger">Elimina</button>`;
    actions.addEventListener("click", (e) => {
      const act = e.target.closest("button")?.dataset.act;
      if (act === "rotate") rotateSelection();
      if (act === "duplicate") duplicateSelection();
      if (act === "delete") deleteSelection();
    });
    panel.append(actions);
  } else if (selection?.kind === "connection" && doc.connections[selection.index]) {
    const c = doc.connections[selection.index];
    title.textContent = "Collegamento";
    const p = document.createElement("p");
    const pr = analysis.pressures[c.from];
    p.innerHTML = `<code>${c.from}</code> — <code>${c.to}</code><br>Pressione massima: <b>${pr ? pr.text : "0 bar"}</b>`;
    panel.append(p);
    const del = document.createElement("button");
    del.className = "danger"; del.textContent = "Elimina collegamento";
    del.addEventListener("click", deleteSelection);
    panel.append(del);
  } else {
    title.textContent = "Schema";
    const nameIn = document.createElement("input");
    nameIn.value = doc.name || ""; nameIn.name = "circuit-name";
    nameIn.addEventListener("change", () => mutate(() => { doc.name = nameIn.value; }));
    panel.append(field("Nome", nameIn));
    const help = document.createElement("div");
    help.className = "help";
    help.innerHTML = `<p>Trascina un componente dalla palette sul foglio, oppure fai clic per inserirlo al centro.</p>
      <p>Per collegare due porte trascina da una porta all'altra. Più linee sulla stessa porta formano un raccordo a T.</p>
      <ul><li><kbd>R</kbd> ruota</li><li><kbd>Canc</kbd> elimina</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> annulla / ripeti</li>
      <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplica</li><li><kbd>Ctrl</kbd>+<kbd>S</kbd> salva il progetto</li>
      <li>Rotella: zoom · trascina il foglio: sposta la vista</li></ul>`;
    panel.append(help);
  }
}

function exampleValue(p) {
  return { pressure: "6 bar", length: "32 mm", flow: "500 Nl/min", angle: "90 deg" }[p.dimension] ||
    `1 ${p.units[0]}`;
}

function renderIssues() {
  const list = $("#issues");
  list.replaceChildren();
  if (!analysis.issues.length) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = doc.components.length ? "Schema valido: nessun problema." : "Lo schema è vuoto.";
    list.append(li);
    return;
  }
  const sorted = [...analysis.issues].sort((a, b) =>
    (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1));
  for (const i of sorted) {
    const li = document.createElement("li");
    li.className = i.severity;
    li.innerHTML = `<span class="badge">${i.severity === "error" ? "Errore" : "Avviso"}</span>
      <span class="msg"></span><code>${i.code}</code>`;
    li.querySelector(".msg").textContent = i.message;
    if (i.component && byId(i.component)) {
      li.classList.add("clickable");
      li.addEventListener("click", () => { select({ kind: "component", id: i.component }); centerOn(i.component); });
    }
    list.append(li);
  }
}

function renderStatus() {
  const s = $("#status");
  s.className = analysis.errors ? "status error" : analysis.warnings ? "status warning" : "status ok";
  s.textContent = analysis.errors
    ? `${analysis.errors} error${analysis.errors > 1 ? "i" : "e"}` +
      (analysis.warnings ? `, ${analysis.warnings} avvis${analysis.warnings > 1 ? "i" : "o"}` : "")
    : analysis.warnings ? `${analysis.warnings} avvis${analysis.warnings > 1 ? "i" : "o"}` : "Schema valido";
  $("#btn-undo").disabled = !history.past.length;
  $("#btn-redo").disabled = !history.future.length;
  $("#doc-name").textContent = doc.name || "Senza nome";
  renderSaveState();
}

// --- modifiche -----------------------------------------------------------------

function nextId(type) {
  const prefix = PREFIX[type] || "X";
  let n = 1;
  while (byId(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function addComponent(type, at) {
  const meta = catalogEntry(type);
  if (!meta) return;
  const comp = { id: nextId(type), type, params: { ...meta.defaults } };
  for (const o of meta.options) comp[o.name] = o.default;
  mutate(() => {
    doc.components.push(comp);
    doc.layout[comp.id] = { x: snap(at.x), y: snap(at.y), rot: 0 };
  });
  select({ kind: "component", id: comp.id });
  return comp;
}

function renameComponent(oldId, newId) {
  if (!newId || newId === oldId) return renderProperties();
  if (!/^[A-Za-z0-9_-]+$/.test(newId)) { toast("La sigla può contenere solo lettere, numeri, - e _"); return renderProperties(); }
  if (byId(newId)) { toast(`La sigla ${newId} è già usata`); return renderProperties(); }
  mutate(() => {
    byId(oldId).id = newId;
    doc.layout[newId] = doc.layout[oldId];
    delete doc.layout[oldId];
    const fix = (ref) => { const [c, p] = splitRef(ref); return c === oldId ? `${newId}.${p}` : ref; };
    doc.connections = doc.connections.map((c) => ({ ...c, from: fix(c.from), to: fix(c.to) }));
  });
  select({ kind: "component", id: newId });
}

// Dopo un cambio di funzione/comando di una valvola, toglie le linee su porte sparite.
function pruneConnections(compId) {
  const valid = new Set(Object.keys(geometry(byId(compId)).ports));
  doc.connections = doc.connections.filter((c) => [c.from, c.to].every((ref) => {
    const [cid, p] = splitRef(ref);
    return cid !== compId || valid.has(p);
  }));
}

function connect(a, b) {
  if (a === b) return;
  if (doc.connections.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))) {
    toast("Collegamento già presente");
    return;
  }
  mutate(() => doc.connections.push({ from: a, to: b }));
  select({ kind: "connection", index: doc.connections.length - 1 });
}

function deleteSelection() {
  if (!selection) return;
  mutate(() => {
    if (selection.kind === "component") {
      const id = selection.id;
      doc.components = doc.components.filter((c) => c.id !== id);
      delete doc.layout[id];
      doc.connections = doc.connections.filter((c) =>
        splitRef(c.from)[0] !== id && splitRef(c.to)[0] !== id);
    } else {
      doc.connections.splice(selection.index, 1);
    }
  });
  select(null);
}

function rotateSelection() {
  if (selection?.kind !== "component") return;
  mutate(() => { const l = layoutOf(selection.id); l.rot = ((l.rot || 0) + 1) % 4; });
}

function duplicateSelection() {
  if (selection?.kind !== "component") return;
  const src = byId(selection.id);
  const l = layoutOf(src.id);
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = nextId(src.type);
  mutate(() => {
    doc.components.push(copy);
    doc.layout[copy.id] = { x: l.x + 40, y: l.y + 40, rot: l.rot || 0 };
  });
  select({ kind: "component", id: copy.id });
}

function select(sel) {
  selection = sel;
  render();
  renderProperties();
}

// --- analisi (server) ------------------------------------------------------------

let analyzeTimer = null;
let analyzeSeq = 0;
function changed() {
  render();
  renderProperties();
  projectChanged();
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(runAnalysis, 120);
}
async function runAnalysis() {
  const seq = ++analyzeSeq;
  try {
    const result = await api.analyze(doc);
    if (seq !== analyzeSeq) return;
    analysis = result;
    $("#app").classList.remove("offline");
  } catch (e) {
    $("#app").classList.add("offline");
    toast("Server non raggiungibile: la validazione è sospesa");
    return;
  }
  render();
  renderIssues();
  if (document.activeElement?.closest("#properties") == null) renderProperties();
  document.body.dataset.analyzed = String(seq);
}

// --- vista -------------------------------------------------------------------------

function viewCenter() {
  const r = svg.getBoundingClientRect();
  return { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k };
}
function centerOn(id) {
  const l = layoutOf(id);
  const r = svg.getBoundingClientRect();
  view.x = r.width / 2 - l.x * view.k;
  view.y = r.height / 2 - l.y * view.k;
  render();
}
function fitView() {
  const r = svg.getBoundingClientRect();
  if (!doc.components.length) { view = { x: r.width / 2, y: r.height / 2, k: 1 }; return render(); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of doc.components) {
    const l = layoutOf(c.id), g = geometry(c);
    const [hw, hh] = (l.rot || 0) % 2 ? [g.h / 2, g.w / 2] : [g.w / 2, g.h / 2];
    x0 = Math.min(x0, l.x - hw); x1 = Math.max(x1, l.x + hw);
    y0 = Math.min(y0, l.y - hh - 24); y1 = Math.max(y1, l.y + hh);
  }
  const pad = 60;
  const k = Math.max(0.3, Math.min(2, Math.min(r.width / (x1 - x0 + 2 * pad), r.height / (y1 - y0 + 2 * pad))));
  view = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: r.height / 2 - ((y0 + y1) / 2) * k };
  render();
}

// --- interazioni sul foglio ----------------------------------------------------------

let drag = null;

svg.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  const port = e.target.closest("[data-port]");
  const comp = e.target.closest("[data-component]");
  const line = e.target.closest("[data-connection]");
  const w = toWorld(e);
  svg.setPointerCapture(e.pointerId);

  if (port && e.button === 0) {
    const ref = port.dataset.port;
    const [cid, p] = splitRef(ref);
    drag = { mode: "wire", from: ref, start: portWorld(cid, p) };
  } else if (comp && e.button === 0) {
    const id = comp.dataset.component;
    const l = layoutOf(id);
    drag = { mode: "move", id, dx: w.x - l.x, dy: w.y - l.y, before: snapshot(), moved: false };
    if (selection?.kind !== "component" || selection.id !== id) select({ kind: "component", id });
  } else if (line && e.button === 0) {
    select({ kind: "connection", index: Number(line.dataset.connection) });
  } else {
    drag = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }
});

svg.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const w = toWorld(e);
  if (drag.mode === "move") {
    const l = layoutOf(drag.id);
    const nx = snap(w.x - drag.dx), ny = snap(w.y - drag.dy);
    if (nx !== l.x || ny !== l.y) { l.x = nx; l.y = ny; drag.moved = true; render(); }
  } else if (drag.mode === "pan") {
    view.x = drag.vx + e.clientX - drag.sx;
    view.y = drag.vy + e.clientY - drag.sy;
    drag.moved = true;
    render();
  } else if (drag.mode === "wire") {
    const temp = $("#temp-wire");
    temp.setAttribute("points", route(drag.start, { x: w.x, y: w.y }));
    temp.style.display = "";
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-port]");
    document.querySelectorAll(".port.target").forEach((p) => p.classList.remove("target"));
    if (target && target.dataset.port !== drag.from) target.classList.add("target");
  }
});

svg.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.mode === "move") {
    if (d.moved) commit(d.before);
  } else if (d.mode === "pan") {
    if (!d.moved) select(null);
  } else if (d.mode === "wire") {
    $("#temp-wire").style.display = "none";
    document.querySelectorAll(".port.target").forEach((p) => p.classList.remove("target"));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-port]");
    if (target && target.dataset.port !== d.from) connect(d.from, target.dataset.port);
    else if (!target) {
      const [cid] = splitRef(d.from);
      if (selection?.kind !== "component" || selection.id !== cid) select({ kind: "component", id: cid });
    }
  }
});

svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = Math.max(0.25, Math.min(4, view.k * Math.exp(-e.deltaY * 0.0015)));
  view.x = mx - ((mx - view.x) * k) / view.k;
  view.y = my - ((my - view.y) * k) / view.k;
  view.k = k;
  render();
}, { passive: false });

svg.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("application/x-pneutrack-type")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
svg.addEventListener("drop", (e) => {
  const type = e.dataTransfer.getData("application/x-pneutrack-type");
  if (!type) return;
  e.preventDefault();
  addComponent(type, toWorld(e));
});

// --- tastiera e barra strumenti ---------------------------------------------------------

document.addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, select, textarea");
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveProject({ asNew: e.shiftKey }); return; }
  if (e.key === "Escape" && !$("#projects-dialog").hidden) { closeProjects(); return; }
  if (typing) return;
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelection(); }
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
  else if (e.key.toLowerCase() === "r" && !mod) rotateSelection();
  else if (e.key === "Escape") select(null);
  else if (e.key === "f" && !mod) fitView();
});

function loadDoc(data, { fit = true } = {}) {
  const before = snapshot();
  doc = { ...emptyDoc(), ...JSON.parse(JSON.stringify(data)) };
  doc.layout ??= {};
  let i = 0;
  for (const c of doc.components) {
    if (!doc.layout[c.id]) doc.layout[c.id] = { x: (i % 5) * 160, y: Math.floor(i / 5) * 140, rot: 0 };
    i++;
  }
  selection = null;
  commit(before);
  if (fit) fitView();
}

// --- progetti --------------------------------------------------------------------------

let store = null;
let project = null; // { id, createdAt } del progetto aperto, null per una bozza
let savedSnapshot = null; // stato dell'ultimo salvataggio
let saveState = "idle"; // idle | saving | saved | error
let saveError = "";
let lastSavedAt = null;
let autosaveTimer = null;
let saving = null; // promessa del salvataggio in corso (un solo salvataggio alla volta)

const isDirty = () => snapshot() !== savedSnapshot;
const fileName = () =>
  `${(doc.name || "schema").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "schema"}.pneu.json`;
const fmtTime = (iso) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `oggi ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function remember(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* non disponibile */ }
}

function projectChanged() {
  if (!project) {
    remember(STORAGE_KEY, snapshot());
  } else if (isDirty()) {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => saveProject(), AUTOSAVE_MS);
  }
  renderSaveState();
}

function renderSaveState() {
  const el = $("#save-state");
  if (!el) return;
  let text, cls;
  if (!project) {
    text = doc.components.length ? "Bozza non salvata" : "";
    cls = "draft";
  } else if (saveState === "saving") {
    text = "Salvataggio…"; cls = "saving";
  } else if (saveState === "error") {
    text = `Non salvato: ${saveError}`; cls = "error";
  } else if (isDirty()) {
    text = "Modifiche da salvare"; cls = "draft";
  } else {
    text = lastSavedAt ? `Salvato ${fmtTime(lastSavedAt)}` : "Salvato"; cls = "saved";
  }
  el.textContent = text;
  el.className = `save-state ${cls}`;
  el.title = store ? `Archivio: ${store.label}` : "";
}

async function saveProject({ asNew = false, silent = false } = {}) {
  clearTimeout(autosaveTimer);
  if (!store) return;
  if (saving) { await saving; if (!asNew && !isDirty()) return; }
  const now = new Date().toISOString();
  if (!project || asNew) {
    project = { id: newProjectId(), createdAt: now };
    if (asNew && doc.name) doc.name = doc.name.endsWith(" (copia)") ? doc.name : `${doc.name} (copia)`;
  }
  const snap = snapshot();
  const record = { id: project.id, name: doc.name || "Senza nome", createdAt: project.createdAt,
                   updatedAt: now, circuit: JSON.parse(snap) };
  saveState = "saving";
  renderSaveState();
  saving = store.put(record).then(() => {
    savedSnapshot = snap;
    lastSavedAt = now;
    saveState = "saved";
    remember(SESSION_KEY, project.id);
    remember(STORAGE_KEY, null);
    if (!silent && asNew) toast("Progetto salvato come copia");
  }).catch((err) => {
    saveState = "error";
    saveError = err.message || "errore";
    toast(`Salvataggio non riuscito: ${saveError}`);
  }).finally(() => { saving = null; renderStatus(); });
  await saving;
  if (!projectsDialogHidden()) refreshProjectList();
}

async function openProject(id) {
  if (project && isDirty()) await saveProject();
  try {
    const p = await store.get(id);
    clearTimeout(autosaveTimer);
    project = null; // il caricamento non deve finire nel progetto precedente
    loadDoc(p.circuit);
    history.past = []; history.future = [];
    project = { id: p.id, createdAt: p.createdAt };
    savedSnapshot = snapshot();
    lastSavedAt = p.updatedAt;
    saveState = "saved";
    remember(SESSION_KEY, p.id);
    remember(STORAGE_KEY, null);
    closeProjects();
    renderStatus();
    toast(`Aperto «${p.name}»`);
  } catch (err) {
    toast(`Impossibile aprire il progetto: ${err.message}`);
  }
}

async function newDocument(data = emptyDoc(), message = "Nuovo schema") {
  if (project && isDirty()) await saveProject();
  project = null;
  savedSnapshot = null;
  saveState = "idle";
  remember(SESSION_KEY, null);
  loadDoc(data);
  toast(`${message} (Ctrl+Z per tornare indietro)`);
}

async function exportCurrent() {
  try {
    const r = await exportFile(fileName(), JSON.stringify(doc, null, 2) + "\n");
    if (r === "saved") toast(`Esportato ${fileName()}`);
  } catch (err) {
    toast(`Esportazione non riuscita: ${err.message}`);
  }
}

$("#file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const circuit = data.circuit && data.circuit.components ? data.circuit : data; // progetto o schema
    if (circuit.format && circuit.format !== "pneutrack/circuit") throw new Error("formato non riconosciuto");
    if (!Array.isArray(circuit.components)) throw new Error("il file non contiene uno schema");
    if (!circuit.name) circuit.name = file.name.replace(/\.pneu\.json$|\.json$/i, "");
    await newDocument(circuit, `Importato ${file.name}`);
    await saveProject({ silent: true });
    closeProjects();
  } catch (err) {
    toast(`Impossibile aprire il file: ${err.message}`);
  }
});

// --- finestra Progetti -----------------------------------------------------------------

const projectsDialogHidden = () => $("#projects-dialog").hidden;
let projectList = [];
let pendingDelete = null;

function openProjects() {
  $("#projects-dialog").hidden = false;
  $("#projects-store").textContent = store ? `Archivio: ${store.label}` : "";
  $("#projects-search").value = "";
  $("#projects-list").replaceChildren();
  refreshProjectList();
  $("#projects-search").focus();
}
function closeProjects() {
  $("#projects-dialog").hidden = true;
  pendingDelete = null;
}

async function refreshProjectList() {
  const ul = $("#projects-list");
  try {
    projectList = await store.list();
  } catch (err) {
    ul.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = `Impossibile leggere l'archivio: ${err.message}`;
    ul.append(li);
    return;
  }
  renderProjectList();
}

function renderProjectList() {
  const ul = $("#projects-list");
  ul.replaceChildren();
  const q = $("#projects-search").value.trim().toLowerCase();
  const items = projectList.filter((p) => !q || p.name.toLowerCase().includes(q));
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = projectList.length ? "Nessun progetto corrisponde alla ricerca."
      : "Nessun progetto salvato. Salva lo schema corrente o creane uno nuovo.";
    ul.append(li);
    return;
  }
  for (const p of items) {
    const li = document.createElement("li");
    li.dataset.id = p.id;
    if (project?.id === p.id) li.classList.add("current");
    const open = document.createElement("button");
    open.className = "project-open";
    open.dataset.pact = "open";
    const name = document.createElement("span");
    name.className = "project-name";
    name.textContent = p.name;
    const meta = document.createElement("span");
    meta.className = "project-meta";
    meta.textContent = `${p.updatedAt ? fmtTime(p.updatedAt) : ""} · ${p.components} component${p.components === 1 ? "e" : "i"}` +
      (project?.id === p.id ? " · aperto" : "");
    open.append(name, meta);
    const acts = document.createElement("span");
    acts.className = "project-actions";
    if (pendingDelete === p.id) {
      acts.innerHTML = `<span class="confirm-text">Eliminare?</span>
        <button data-pact="delete-yes" class="danger">Elimina</button><button data-pact="delete-no">Annulla</button>`;
    } else {
      acts.innerHTML = `<button data-pact="rename" title="Rinomina">Rinomina</button>
        <button data-pact="duplicate" title="Duplica">Duplica</button>
        <button data-pact="delete" class="danger" title="Elimina">Elimina</button>`;
    }
    li.append(open, acts);
    ul.append(li);
  }
}

$("#projects-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pact]");
  const li = e.target.closest("li[data-id]");
  if (!btn || !li) return;
  const id = li.dataset.id;
  const act = btn.dataset.pact;
  try {
    if (act === "open") return openProject(id);
    if (act === "delete") { pendingDelete = id; return renderProjectList(); }
    if (act === "delete-no") { pendingDelete = null; return renderProjectList(); }
    if (act === "delete-yes") {
      await store.remove(id);
      pendingDelete = null;
      if (project?.id === id) { project = null; savedSnapshot = null; remember(SESSION_KEY, null); renderStatus(); }
      toast("Progetto eliminato");
    } else if (act === "duplicate") {
      const p = await store.get(id);
      const now = new Date().toISOString();
      const name = `${p.name} (copia)`;
      await store.put({ ...p, id: newProjectId(), name, createdAt: now, updatedAt: now,
                        circuit: { ...p.circuit, name } });
      toast("Progetto duplicato");
    } else if (act === "rename") {
      return startRename(li, id);
    }
    await refreshProjectList();
  } catch (err) {
    toast(`Operazione non riuscita: ${err.message}`);
  }
});

function startRename(li, id) {
  const current = projectList.find((p) => p.id === id);
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = current?.name || "";
  input.setAttribute("aria-label", "Nuovo nome del progetto");
  li.querySelector(".project-open").replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (ok) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (ok && name && name !== current?.name) {
      try {
        if (project?.id === id) {
          mutate(() => { doc.name = name; });
          await saveProject();
        } else {
          const p = await store.get(id);
          await store.put({ ...p, name, updatedAt: new Date().toISOString(), circuit: { ...p.circuit, name } });
        }
        toast("Progetto rinominato");
      } catch (err) { toast(`Rinomina non riuscita: ${err.message}`); }
    }
    refreshProjectList();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") { e.stopPropagation(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

$("#projects-search").addEventListener("input", renderProjectList);
$("#projects-dialog").addEventListener("click", (e) => {
  if (e.target.id === "projects-dialog") return closeProjects();
  const act = e.target.closest("button")?.dataset.dact;
  if (act === "close") closeProjects();
  if (act === "new") { closeProjects(); newDocument(); }
  if (act === "import") $("#file-input").click();
  if (act === "save-current") saveProject().then(refreshProjectList);
});

$("#toolbar").addEventListener("click", async (e) => {
  const act = e.target.closest("button")?.dataset.act;
  switch (act) {
    case "projects": openProjects(); break;
    case "new": newDocument(); break;
    case "save": saveProject(); break;
    case "save-as": saveProject({ asNew: true }); break;
    case "export": exportCurrent(); break;
    case "undo": undo(); break;
    case "redo": redo(); break;
    case "fit": fitView(); break;
  }
});

$("#examples").addEventListener("change", async (e) => {
  const id = e.target.value;
  e.target.value = "";
  if (!id) return;
  await newDocument(await api.example(id), "Esempio caricato");
});

window.addEventListener("beforeunload", (e) => {
  if (project && isDirty()) { saveProject(); e.preventDefault(); }
});

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// --- avvio -----------------------------------------------------------------------------

async function init() {
  catalog = await api.catalog();
  renderPalette();
  const examples = await api.examples();
  for (const ex of examples) {
    const o = document.createElement("option");
    o.value = ex.id; o.textContent = ex.name;
    $("#examples").append(o);
  }
  const r = svg.getBoundingClientRect();
  view = { x: r.width / 2, y: r.height / 2, k: 1 };

  // bozza locale subito, poi l'archivio (sul web può rispondere dopo qualche secondo)
  let restored = null;
  try { restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { restored = null; }
  if (restored?.components) doc = { ...emptyDoc(), ...restored };
  history.past = []; history.future = [];
  changed();
  if (doc.components.length) fitView();

  store = await openStore({ serverAvailable: !api.isLocal() });
  document.body.dataset.store = store.kind;
  let lastId = null;
  try { lastId = localStorage.getItem(SESSION_KEY); } catch { lastId = null; }
  if (lastId && !restored?.components) {
    try {
      const p = await store.get(lastId);
      doc = { ...emptyDoc(), ...p.circuit };
      project = { id: p.id, createdAt: p.createdAt };
      savedSnapshot = snapshot();
      lastSavedAt = p.updatedAt;
      saveState = "saved";
      history.past = []; history.future = [];
      changed();
      fitView();
    } catch { remember(SESSION_KEY, null); }
  }
  renderStatus();
  document.body.dataset.ready = "1";
}

window.pneutrack = {
  get doc() { return doc; }, get analysis() { return analysis; }, get project() { return project; },
  get store() { return store?.kind; }, isDirty, loadDoc, addComponent, connect, saveProject,
};
init();
