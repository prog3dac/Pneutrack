// Editor di schemi pneumatici: stato, disegno SVG, interazioni e simulazione.
// Tutto gira nel browser: modello, validazione e solutore sono moduli TypeScript.
import { emptyCircuit, type CircuitDoc, type ConnectionData } from "../model/circuit";
import {
  buildComponent, cylinderInfo, typeList, type ComponentData, type ParamSpec, type TypeDef,
} from "../model/components";
import { Quantity, type Dimension } from "../model/units";
import { analyze, type Analysis } from "../model/validation";
import { compileSim } from "../sim/network";
import { Simulator } from "../sim/simulator";
import { BAR, P_ATM } from "../solver/constants";
import { exportFile, newProjectId, openStore, type ProjectSummary, type Store } from "./storage";
import { geometry, rotate, thumbnail, type Dir, type SymbolState } from "./symbols";

const GRID = 10;
const SVGNS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "pneutrack.autosave.v1"; // bozza non ancora salvata come progetto
const SESSION_KEY = "pneutrack.session.v1"; // ultimo progetto aperto
const AUTOSAVE_MS = 1200;

const PREFIX: Record<string, string> = {
  pressure_source: "P", pressure_regulator: "R", silencer: "SL", plug: "T",
  directional_valve: "V", flow_control_valve: "F", single_acting_cylinder: "C",
  double_acting_cylinder: "C", rotary_actuator: "RA",
};

/** unità aggiunta quando si scrive solo un numero */
const PREF_UNIT: Record<Dimension, string> = {
  pressure: "bar", length: "mm", area: "cm2", volume: "cm3", force: "N", flow: "Nl/min",
  conductance: "dm3/(s·bar)", mass: "kg", time: "s", angle: "deg", dimensionless: "",
};
const EXAMPLE_VALUE: Partial<Record<Dimension, string>> = {
  pressure: "6 bar", length: "32 mm", flow: "500 Nl/min", angle: "90 deg", force: "10 N",
  mass: "1 kg", conductance: "1 dm3/(s·bar)", dimensionless: "0.35",
};
const ACTUATION_NAME: Record<string, string> = {
  solenoid: "solenoide", manual: "pulsante", mechanical: "rullo", pilot: "pilotaggio", spring: "molla",
};

const EXAMPLES = Object.entries(
  import.meta.glob<CircuitDoc>("../examples/*.json", { eager: true, import: "default" }),
).map(([path, data]) => ({ id: path.replace(/^.*\/|\.json$/g, ""), name: data.name || path, data }));

type Selection = { kind: "component"; id: string } | { kind: "connection"; index: number } | null;
type Doc = CircuitDoc;

// --- stato -------------------------------------------------------------------

const catalog: TypeDef[] = typeList();
let doc: Doc = emptyCircuit();
let selection: Selection = null;
let analysis: Analysis = { ok: true, issues: [], ports: {}, pressures: {}, errors: 0, warnings: 0 };
let view = { x: 0, y: 0, k: 1 };
const history: { past: string[]; future: string[] } = { past: [], future: [] };

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const svg = $<SVGSVGElement>("#canvas");
const viewport = $<SVGGElement>("#viewport");
const target = (e: Event) => e.target as Element;

const byId = (id: string) => doc.components.find((c) => c.id === id);
function layoutOf(id: string) {
  doc.layout[id] ??= { x: 0, y: 0, rot: 0 };
  return doc.layout[id];
}
const catalogEntry = (type: string) => catalog.find((t) => t.type === type);

// --- storia (annulla / ripeti) -----------------------------------------------

const snapshot = () => JSON.stringify(doc);
function commit(before?: string) {
  if (before !== undefined && before !== snapshot()) {
    history.past.push(before);
    if (history.past.length > 200) history.past.shift();
    history.future = [];
  }
  changed();
}
function mutate(fn: () => void) {
  if (sim) return; // durante la simulazione lo schema non si modifica
  const before = snapshot();
  fn();
  commit(before);
}
function undo() {
  if (sim || !history.past.length) return;
  history.future.push(snapshot());
  doc = JSON.parse(history.past.pop()!);
  fixSelection();
  changed();
}
function redo() {
  if (sim || !history.future.length) return;
  history.past.push(snapshot());
  doc = JSON.parse(history.future.pop()!);
  fixSelection();
  changed();
}
function fixSelection() {
  if (selection?.kind === "component" && !byId(selection.id)) selection = null;
  if (selection?.kind === "connection" && !doc.connections[selection.index]) selection = null;
}

// --- coordinate ----------------------------------------------------------------

function toWorld(evt: { clientX: number; clientY: number }) {
  const r = svg.getBoundingClientRect();
  return { x: (evt.clientX - r.left - view.x) / view.k, y: (evt.clientY - r.top - view.y) / view.k };
}
const snap = (v: number) => Math.round(v / GRID) * GRID;

interface PortPoint { x: number; y: number; dir: Dir }
function portWorld(compId: string, portName: string): PortPoint | null {
  const comp = byId(compId);
  if (!comp) return null;
  const p = geometry(comp).ports[portName];
  if (!p) return null;
  const l = layoutOf(compId);
  const [rx, ry] = rotate([p.x, p.y], l.rot || 0);
  return { x: l.x + rx, y: l.y + ry, dir: rotate(p.dir, l.rot || 0) };
}

function route(a: PortPoint, b: { x: number; y: number; dir?: Dir }) {
  const s1 = { x: a.x + a.dir[0] * 15, y: a.y + a.dir[1] * 15 };
  const s2 = b.dir ? { x: b.x + b.dir[0] * 15, y: b.y + b.dir[1] * 15 } : { x: b.x, y: b.y };
  const v1 = a.dir[0] === 0, v2 = b.dir ? b.dir[0] === 0 : !v1;
  const pts: [number, number][] = [[a.x, a.y], [s1.x, s1.y]];
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

function el(tag: string, attrs: Record<string, string | number> = {}, html = "") {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (html) e.innerHTML = html;
  return e;
}
function svgTitle(text: string) {
  const t = el("title");
  t.textContent = text;
  return t;
}

const issuesFor = (compId: string) => analysis.issues.filter((i) => i.component === compId);
const portIssue = (ref: string) =>
  analysis.issues.find((i) => i.code === "UNCONNECTED_PORT" && i.ports.includes(ref));
function connectedPorts() {
  const s = new Set<string>();
  for (const c of doc.connections) { s.add(c.from); s.add(c.to); }
  return s;
}
const portKind = (compId: string, name: string) => (analysis.ports[compId] || []).find((p) => p.name === name)?.kind;

function splitRef(ref: string): [string, string] {
  const i = ref.lastIndexOf(".");
  return [ref.slice(0, i), ref.slice(i + 1)];
}
const fmtBar = (bar: number) => `${bar.toFixed(bar < 10 ? 2 : 1).replace(".", ",")} bar`;

/** Stato grafico di un componente durante la simulazione. */
function symbolState(comp: ComponentData): SymbolState | undefined {
  if (!sim) return undefined;
  const s = sim.s;
  if (comp.type === "directional_valve") {
    const spec = s.net.valves.find((v) => v.id === comp.id);
    if (!spec) return undefined;
    const active = (side: "14" | "12") => {
      const act = side === "14" ? spec.act14 : spec.act12;
      if (act === "pilot") return s.gauge(`${comp.id}.${side}`) * BAR >= spec.pilotThreshold;
      return act !== "spring" && s.command(comp.id, side);
    };
    return { position: s.valvePosition(comp.id), active14: active("14"), active12: active("12") };
  }
  if (comp.type.endsWith("_cylinder")) {
    const c = s.cylinder(comp.id);
    return c ? { stroke: c.fraction } : undefined;
  }
  return undefined;
}

function render() {
  viewport.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
  $("#grid-pattern").setAttribute("patternTransform", `translate(${view.x},${view.y}) scale(${view.k})`);

  const lines = $("#lines"), comps = $("#components"), ports = $("#ports"), labels = $("#labels");
  lines.replaceChildren(); comps.replaceChildren(); ports.replaceChildren(); labels.replaceChildren();
  const P = sim ? sim.s.pressures() : null;
  const livePressure = (ref: string) => {
    if (!sim || !P) return null;
    const n = sim.s.net.portNode[ref];
    return n === undefined ? 0 : (P[n]! - P_ATM) / BAR;
  };
  const maxBar = sim ? Math.max(1, ...[...sim.s.net.fixed.values()].map((p) => (p - P_ATM) / BAR)) : 1;

  // collegamenti
  doc.connections.forEach((c, index) => {
    const [ca, pa] = splitRef(c.from), [cb, pb] = splitRef(c.to);
    const a = portWorld(ca, pa), b = portWorld(cb, pb);
    if (!a || !b) return;
    const kinds = [portKind(ca, pa), portKind(cb, pb)];
    const pilot = kinds.includes("pilot");
    const exhaust = kinds.includes("exhaust"); // linea di scarico: sfoga in atmosfera
    const live = livePressure(c.from);
    const pr = analysis.pressures[c.from] || analysis.pressures[c.to];
    const pressurized = live !== null ? live > 0.2 : !!pr && !exhaust;
    const cls = ["line", pressurized ? "pressurized" : "", pilot ? "pilot" : "", exhaust ? "exhaust" : "",
                 selection?.kind === "connection" && selection.index === index ? "selected" : ""]
      .filter(Boolean).join(" ");
    const pts = route(a, b);
    const g = el("g", { class: cls, "data-connection": index });
    g.append(el("polyline", { points: pts, class: "hit" }));
    const stroke = el("polyline", { points: pts, class: "stroke" });
    if (live !== null && pressurized) stroke.setAttribute("stroke-opacity", (0.35 + 0.65 * Math.min(1, live / maxBar)).toFixed(2));
    g.append(stroke);
    g.append(svgTitle(`${c.from} — ${c.to}` + (live !== null ? ` · ${fmtBar(live)}` : pr ? ` · ${pr.text}` : "")));
    lines.append(g);
  });

  const connected = connectedPorts();

  // componenti
  for (const comp of doc.components) {
    const l = layoutOf(comp.id);
    const g = geometry(comp, symbolState(comp));
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
    let label = comp.id + (comp.label ? ` · ${comp.label}` : "");
    const cyl = sim?.s.cylinder(comp.id);
    if (cyl) label += ` · ${(cyl.x * 1000).toFixed(0)} mm`;
    text.textContent = label;
    labels.append(text);

    // porte
    for (const name of Object.keys(g.ports)) {
      const pw = portWorld(comp.id, name)!;
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
      const live = livePressure(ref);
      const pr = analysis.pressures[ref];
      pg.append(svgTitle(`${ref} · ${live !== null ? fmtBar(live) : pr ? pr.text : "0 bar"}`));
      ports.append(pg);
    }
  }
  renderStatus();
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
      const sample: ComponentData = { id: "", type: t.type,
        ...Object.fromEntries((t.options ?? []).map((o) => [o.name, o.default])) };
      b.innerHTML = `${thumbnail(sample)}<span></span>`;
      b.querySelector("span")!.textContent = t.label;
      b.addEventListener("click", () => addComponent(t.type, viewCenter()));
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer!.setData("application/x-pneutrack-type", t.type);
        e.dataTransfer!.effectAllowed = "copy";
      });
      pal.append(b);
    }
  }
}

function field(label: string, input: HTMLElement) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(span, input);
  return wrap;
}
function heading(panel: HTMLElement, text: string, level: "h2" | "h3" = "h3") {
  const h = document.createElement(level);
  h.textContent = text;
  panel.append(h);
  return h;
}

function paramInput(comp: ComponentData, p: ParamSpec) {
  const inp = document.createElement("input");
  inp.name = `param-${p.name}`;
  inp.value = comp.params?.[p.name] ?? "";
  inp.placeholder = p.simDefault ? `predefinito ${p.simDefault}`
    : (p.required ? "obbligatorio, " : "") + `es. ${EXAMPLE_VALUE[p.dimension] ?? `1 ${PREF_UNIT[p.dimension]}`}`;
  inp.spellcheck = false;
  inp.addEventListener("change", () => mutate(() => {
    const c = byId(comp.id)!;
    c.params ??= {};
    const v = inp.value.trim();
    const unit = PREF_UNIT[p.dimension];
    if (v) c.params[p.name] = /^[-+]?[\d.,]+$/.test(v) && unit ? `${v} ${unit}` : v;
    else delete c.params[p.name];
  }));
  const f = field(p.label + (p.required ? " *" : ""), inp);
  const bad = issuesFor(comp.id).find((i) => i.code === "INVALID_COMPONENT" && i.message.includes(`'${p.name}'`));
  if (bad) f.classList.add("invalid");
  return f;
}

function renderProperties() {
  if (sim) return renderSimPanel();
  const panel = $("#properties");
  panel.replaceChildren();
  const title = heading(panel, "", "h2");

  if (selection?.kind === "component" && byId(selection.id)) {
    const comp = byId(selection.id)!;
    const meta = catalogEntry(comp.type);
    title.textContent = meta?.label || comp.type;

    const idIn = document.createElement("input");
    idIn.value = comp.id; idIn.name = "id"; idIn.spellcheck = false;
    idIn.addEventListener("change", () => renameComponent(comp.id, idIn.value.trim()));
    panel.append(field("Sigla", idIn));

    const labIn = document.createElement("input");
    labIn.value = comp.label || ""; labIn.name = "label"; labIn.placeholder = "facoltativa";
    labIn.addEventListener("change", () => mutate(() => {
      const c = byId(comp.id)!;
      if (labIn.value.trim()) c.label = labIn.value.trim(); else delete c.label;
    }));
    panel.append(field("Descrizione", labIn));

    for (const opt of meta?.options ?? []) {
      const sel = document.createElement("select");
      sel.name = opt.name;
      for (const [value, text] of opt.choices) {
        const o = document.createElement("option");
        o.value = value; o.textContent = text;
        sel.append(o);
      }
      sel.value = comp[opt.name] ?? opt.default;
      sel.addEventListener("change", () => mutate(() => {
        byId(comp.id)![opt.name] = sel.value;
        pruneConnections(comp.id);
      }));
      panel.append(field(opt.label, sel));
    }

    const catalogParams = meta?.params.filter((p) => p.group === "catalog") ?? [];
    const simParams = meta?.params.filter((p) => p.group === "sim") ?? [];
    if (catalogParams.length) heading(panel, "Parametri da catalogo");
    for (const p of catalogParams) panel.append(paramInput(comp, p));
    if (simParams.length) heading(panel, "Parametri di simulazione");
    for (const p of simParams) panel.append(paramInput(comp, p));

    const portsIn = Object.keys(geometry(comp).ports);
    if (portsIn.length) {
      heading(panel, "Porte");
      const ul = document.createElement("ul");
      ul.className = "port-list";
      for (const name of portsIn) {
        const ref = `${comp.id}.${name}`;
        const li = document.createElement("li");
        const pr = analysis.pressures[ref];
        const n = doc.connections.filter((c) => c.from === ref || c.to === ref).length;
        li.innerHTML = `<b></b><span>${n ? `${n} collegament${n > 1 ? "i" : "o"}` : "libera"}</span>` +
          `<span class="pressure">${pr ? pr.text : "0 bar"}</span>`;
        li.querySelector("b")!.textContent = name;
        ul.append(li);
      }
      panel.append(ul);
    }

    if (comp.type.endsWith("_cylinder")) {
      try {
        const pr = analysis.pressures[`${comp.id}.A`]?.text || "6 bar";
        const info = cylinderInfo(buildComponent(comp), Quantity.parse(pr));
        if (info) {
          const box = document.createElement("div");
          box.className = "derived";
          box.innerHTML = `<h3>Valori teorici a ${info.atPressure}</h3>
            <dl><dt>Area pistone</dt><dd>${info.pistonArea}</dd>
            <dt>Area anulare</dt><dd>${info.annularArea}</dd>
            <dt>Forza in uscita</dt><dd>${info.forceExtend}</dd>
            <dt>Forza in rientro</dt><dd>${info.forceRetract}</dd></dl>`;
          panel.append(box);
        }
      } catch { /* parametri non validi: già segnalati */ }
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.innerHTML = `<button data-act="rotate">Ruota (R)</button>
      <button data-act="duplicate">Duplica</button>
      <button data-act="delete" class="danger">Elimina</button>`;
    actions.addEventListener("click", (e) => {
      const act = (target(e).closest("button") as HTMLElement | null)?.dataset.act;
      if (act === "rotate") rotateSelection();
      if (act === "duplicate") duplicateSelection();
      if (act === "delete") deleteSelection();
    });
    panel.append(actions);
  } else if (selection?.kind === "connection" && doc.connections[selection.index]) {
    const c = doc.connections[selection.index]!;
    title.textContent = "Collegamento";
    const p = document.createElement("p");
    const pr = analysis.pressures[c.from];
    p.innerHTML = `<code></code> — <code></code><br>Pressione massima: <b>${pr ? pr.text : "0 bar"}</b>`;
    const codes = p.querySelectorAll("code");
    codes[0]!.textContent = c.from;
    codes[1]!.textContent = c.to;
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
      <p>Con <b>Simula</b> lo schema si anima: azioni pulsanti e solenoidi facendo clic sui comandi delle valvole.</p>
      <ul><li><kbd>R</kbd> ruota</li><li><kbd>Canc</kbd> elimina</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> annulla / ripeti</li>
      <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplica</li><li><kbd>Ctrl</kbd>+<kbd>S</kbd> salva il progetto</li>
      <li>Rotella: zoom · trascina il foglio: sposta la vista</li></ul>`;
    panel.append(help);
  }
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
    li.querySelector(".msg")!.textContent = i.message;
    const cid = i.component;
    if (cid && byId(cid)) {
      li.classList.add("clickable");
      li.addEventListener("click", () => { select({ kind: "component", id: cid }); centerOn(cid); });
    }
    list.append(li);
  }
}

function renderStatus() {
  const s = $("#status");
  s.className = analysis.errors ? "status error" : analysis.warnings ? "status warning" : "status ok";
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  s.textContent = analysis.errors
    ? plural(analysis.errors, "errore", "errori") +
      (analysis.warnings ? `, ${plural(analysis.warnings, "avviso", "avvisi")}` : "")
    : analysis.warnings ? plural(analysis.warnings, "avviso", "avvisi") : "Schema valido";
  $<HTMLButtonElement>("#btn-undo").disabled = !!sim || !history.past.length;
  $<HTMLButtonElement>("#btn-redo").disabled = !!sim || !history.future.length;
  $("#doc-name").textContent = doc.name || "Senza nome";
  renderSaveState();
}

// --- modifiche -----------------------------------------------------------------

function nextId(type: string) {
  const prefix = PREFIX[type] || "X";
  let n = 1;
  while (byId(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function addComponent(type: string, at: { x: number; y: number }) {
  const meta = catalogEntry(type);
  if (!meta || sim) return;
  const comp: ComponentData = { id: nextId(type), type, params: { ...meta.defaults } };
  for (const o of meta.options ?? []) comp[o.name] = o.default;
  mutate(() => {
    doc.components.push(comp);
    doc.layout[comp.id] = { x: snap(at.x), y: snap(at.y), rot: 0 };
  });
  select({ kind: "component", id: comp.id });
  return comp;
}

function renameComponent(oldId: string, newId: string) {
  if (!newId || newId === oldId) return renderProperties();
  if (!/^[A-Za-z0-9_-]+$/.test(newId)) { toast("La sigla può contenere solo lettere, numeri, - e _"); return renderProperties(); }
  if (byId(newId)) { toast(`La sigla ${newId} è già usata`); return renderProperties(); }
  mutate(() => {
    byId(oldId)!.id = newId;
    doc.layout[newId] = layoutOf(oldId);
    delete doc.layout[oldId];
    const fix = (ref: string) => { const [c, p] = splitRef(ref); return c === oldId ? `${newId}.${p}` : ref; };
    doc.connections = doc.connections.map((c) => ({ ...c, from: fix(c.from), to: fix(c.to) }));
  });
  select({ kind: "component", id: newId });
}

// Dopo un cambio di funzione/comando di una valvola, toglie le linee su porte sparite.
function pruneConnections(compId: string) {
  const valid = new Set(Object.keys(geometry(byId(compId)!).ports));
  doc.connections = doc.connections.filter((c) => [c.from, c.to].every((ref) => {
    const [cid, p] = splitRef(ref);
    return cid !== compId || valid.has(p);
  }));
}

function connect(a: string, b: string) {
  if (a === b || sim) return;
  if (doc.connections.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))) {
    toast("Collegamento già presente");
    return;
  }
  mutate(() => doc.connections.push({ from: a, to: b }));
  select({ kind: "connection", index: doc.connections.length - 1 });
}

function deleteSelection() {
  const sel = selection;
  if (!sel || sim) return;
  mutate(() => {
    if (sel.kind === "component") {
      const id = sel.id;
      doc.components = doc.components.filter((c) => c.id !== id);
      delete doc.layout[id];
      doc.connections = doc.connections.filter((c) =>
        splitRef(c.from)[0] !== id && splitRef(c.to)[0] !== id);
    } else {
      doc.connections.splice(sel.index, 1);
    }
  });
  select(null);
}

function rotateSelection() {
  const sel = selection;
  if (sel?.kind !== "component") return;
  mutate(() => { const l = layoutOf(sel.id); l.rot = ((l.rot || 0) + 1) % 4; });
}

function duplicateSelection() {
  if (selection?.kind !== "component" || sim) return;
  const src = byId(selection.id)!;
  const l = layoutOf(src.id);
  const copy: ComponentData = JSON.parse(JSON.stringify(src));
  copy.id = nextId(src.type);
  mutate(() => {
    doc.components.push(copy);
    doc.layout[copy.id] = { x: l.x + 40, y: l.y + 40, rot: l.rot || 0 };
  });
  select({ kind: "component", id: copy.id });
}

function select(sel: Selection) {
  selection = sel;
  render();
  renderProperties();
}

// --- analisi ---------------------------------------------------------------------

let analyzeTimer: ReturnType<typeof setTimeout> | undefined;
let analyzeSeq = 0;
function changed() {
  render();
  renderProperties();
  projectChanged();
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(runAnalysis, 60);
}
function runAnalysis() {
  const seq = ++analyzeSeq;
  analysis = analyze(JSON.parse(snapshot()));
  render();
  renderIssues();
  if (document.activeElement?.closest("#properties") == null) renderProperties();
  document.body.dataset.analyzed = String(seq);
}

// --- simulazione -------------------------------------------------------------------

interface SimRun {
  s: Simulator;
  playing: boolean;
  speed: number;
  raf: number;
  last: number;
  lastPanel: number;
  warnings: string[];
}
let sim: SimRun | null = null;
/** comandi a pressione (pulsante, rullo) tenuti premuti col puntatore */
let held: { id: string; side: "14" | "12" } | null = null;

function startSim() {
  if (sim) return;
  clearTimeout(analyzeTimer);
  runAnalysis();
  if (!doc.components.length) { toast("Lo schema è vuoto: inserisci dei componenti"); return; }
  const r = compileSim(JSON.parse(snapshot()));
  if (!r.ok) {
    toast(`Correggi ${r.errors.length > 1 ? `i ${r.errors.length} errori` : "l'errore"} prima di simulare`);
    return;
  }
  const speed = Number($<HTMLSelectElement>("#sim-speed").value) || 0.25;
  sim = { s: new Simulator(r.network), playing: true, speed, raf: 0, last: performance.now(), lastPanel: 0,
          warnings: r.warnings };
  $("#app").classList.add("simulating");
  $("#sim-bar").hidden = false;
  $("#btn-sim").textContent = "■ Ferma simulazione";
  $("#btn-sim").classList.add("on");
  document.body.dataset.sim = "on";
  updatePlayButton();
  renderProperties();
  sim.raf = requestAnimationFrame(simFrame);
  if (r.warnings.length) toast(r.warnings[0]!);
}

function stopSim() {
  if (!sim) return;
  cancelAnimationFrame(sim.raf);
  sim = null;
  held = null;
  $("#app").classList.remove("simulating");
  $("#sim-bar").hidden = true;
  $("#btn-sim").textContent = "▶ Simula";
  $("#btn-sim").classList.remove("on");
  delete document.body.dataset.sim;
  render();
  renderProperties();
}

function resetSim() {
  if (!sim) return;
  const commands = sim.s.net.valves.flatMap((v) => (["14", "12"] as const)
    .filter((side) => sim!.s.command(v.id, side)).map((side) => [v.id, side] as const));
  sim.s = new Simulator(sim.s.net);
  // i solenoidi restano come li ha lasciati l'utente
  for (const [id, side] of commands) {
    const v = sim.s.net.valves.find((x) => x.id === id)!;
    if ((side === "14" ? v.act14 : v.act12) === "solenoid") sim.s.setCommand(id, side, true);
  }
  render();
  renderSimPanel();
}

function updatePlayButton() {
  $("#btn-play").textContent = sim?.playing ? "⏸ Pausa" : "▶ Avvia";
}

function simFrame(ts: number) {
  if (!sim) return;
  const dt = Math.min(0.05, Math.max(0, (ts - sim.last) / 1000));
  sim.last = ts;
  if (sim.playing) sim.s.advance(dt * sim.speed);
  render();
  if (ts - sim.lastPanel > 120) { sim.lastPanel = ts; updateSimPanel(); }
  sim.raf = requestAnimationFrame(simFrame);
}

/** Lati di valvola che l'utente può comandare: solenoide (interruttore), pulsante e rullo (a pressione). */
function commandSides() {
  if (!sim) return [];
  return sim.s.net.valves.flatMap((v) => (["14", "12"] as const).flatMap((side) => {
    const act = side === "14" ? v.act14 : v.act12;
    return act === "solenoid" || act === "manual" || act === "mechanical" ? [{ id: v.id, side, act }] : [];
  }));
}

function pressCommand(id: string, side: "14" | "12") {
  if (!sim) return;
  const v = sim.s.net.valves.find((x) => x.id === id);
  if (!v) return;
  const act = side === "14" ? v.act14 : v.act12;
  if (act === "solenoid") {
    sim.s.setCommand(id, side, !sim.s.command(id, side));
  } else if (act === "manual" || act === "mechanical") {
    releaseHeld();
    sim.s.setCommand(id, side, true);
    held = { id, side };
  } else return;
  render();
  updateSimPanel();
}
function releaseHeld() {
  if (sim && held) sim.s.setCommand(held.id, held.side, false);
  held = null;
  if (sim) { render(); updateSimPanel(); }
}

function renderSimPanel() {
  if (!sim) return;
  const panel = $("#properties");
  panel.replaceChildren();
  heading(panel, "Simulazione", "h2");
  const info = document.createElement("p");
  info.className = "sim-help";
  info.textContent = "Fai clic sui comandi delle valvole nello schema o qui sotto. " +
    "Pulsanti e rulli restano azionati finché tieni premuto; i solenoidi si eccitano e si diseccitano a ogni clic.";
  panel.append(info);
  for (const w of sim.warnings) {
    const p = document.createElement("p");
    p.className = "sim-warning";
    p.textContent = w;
    panel.append(p);
  }

  const cmds = commandSides();
  if (cmds.length) {
    heading(panel, "Comandi");
    const box = document.createElement("div");
    box.className = "sim-commands";
    for (const c of cmds) {
      const b = document.createElement("button");
      b.dataset.cmd = `${c.id}|${c.side}`;
      b.className = `sim-cmd ${c.act}`;
      b.textContent = `${c.id} · ${c.side} · ${ACTUATION_NAME[c.act]}`;
      b.title = c.act === "solenoid" ? "Clic: eccita / diseccita" : "Tieni premuto per azionare";
      box.append(b);
    }
    panel.append(box);
  }

  const dl = document.createElement("dl");
  dl.className = "sim-values";
  const row = (label: string, key: string) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.dataset.live = key;
    dl.append(dt, dd);
  };
  for (const v of sim.s.net.valves) row(`Valvola ${v.id}`, `valve:${v.id}`);
  for (const c of sim.s.net.cylinders) row(`Cilindro ${c.id}`, `cyl:${c.id}`);
  const comp = selection?.kind === "component" ? byId(selection.id) : undefined;
  if (comp) {
    for (const name of Object.keys(geometry(comp).ports)) row(`${comp.id}.${name}`, `port:${comp.id}.${name}`);
  }
  if (dl.childElementCount) { heading(panel, comp ? `Valori (${comp.id})` : "Valori"); panel.append(dl); }
  updateSimPanel();
}

function updateSimPanel() {
  if (!sim) return;
  const s = sim.s;
  $("#sim-time").textContent = `t = ${s.t.toFixed(2).replace(".", ",")} s`;
  document.body.dataset.simTime = s.t.toFixed(3);
  const POS: Record<string, string> = { "14": "lato 14 (azionata)", "12": "lato 12", "0": "centrale" };
  for (const dd of document.querySelectorAll<HTMLElement>("#properties [data-live]")) {
    const [kind, key] = [dd.dataset.live!.slice(0, dd.dataset.live!.indexOf(":")),
                         dd.dataset.live!.slice(dd.dataset.live!.indexOf(":") + 1)];
    if (kind === "valve") {
      const v = s.net.valves.find((x) => x.id === key);
      const pos = s.valvePosition(key) ?? "";
      dd.textContent = v?.act14 === "spring" && pos === "14" ? "lato 14 (riposo)" : POS[pos] ?? pos;
      dd.dataset.value = pos;
    } else if (kind === "cyl") {
      const c = s.cylinder(key)!;
      const state = Math.abs(c.v) > 1e-3 ? (c.v > 0 ? "esce" : "rientra")
        : c.fraction > 0.995 ? "tutto fuori" : c.fraction < 0.005 ? "tutto dentro" : "fermo";
      dd.textContent = `${(c.x * 1000).toFixed(1).replace(".", ",")} mm · ${state}`;
      dd.dataset.value = c.fraction.toFixed(4);
    } else if (kind === "port") {
      const bar = s.gauge(key);
      dd.textContent = fmtBar(bar);
      dd.dataset.value = bar.toFixed(3);
    }
  }
  for (const b of document.querySelectorAll<HTMLElement>("#properties [data-cmd]")) {
    const [id, side] = b.dataset.cmd!.split("|") as [string, "14" | "12"];
    b.classList.toggle("on", s.command(id, side));
  }
}

$("#properties").addEventListener("pointerdown", (e) => {
  const b = (target(e).closest("[data-cmd]") as HTMLElement | null);
  if (!b || !sim) return;
  e.preventDefault();
  const [id, side] = b.dataset.cmd!.split("|") as [string, "14" | "12"];
  pressCommand(id, side);
});
window.addEventListener("pointerup", () => { if (held) releaseHeld(); });
window.addEventListener("pointercancel", () => { if (held) releaseHeld(); });

$("#sim-speed").addEventListener("change", (e) => {
  if (sim) sim.speed = Number((e.target as HTMLSelectElement).value) || 0.25;
});

// --- vista -------------------------------------------------------------------------

function viewCenter() {
  const r = svg.getBoundingClientRect();
  return { x: (r.width / 2 - view.x) / view.k, y: (r.height / 2 - view.y) / view.k };
}
function centerOn(id: string) {
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

type Drag =
  | { mode: "wire"; from: string; start: PortPoint }
  | { mode: "move"; id: string; dx: number; dy: number; before: string; moved: boolean }
  | { mode: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean };
let drag: Drag | null = null;

svg.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  const t = target(e);
  const port = t.closest<SVGElement>("[data-port]");
  const comp = t.closest<SVGElement>("[data-component]");
  const line = t.closest<SVGElement>("[data-connection]");
  const w = toWorld(e);

  if (sim && e.button === 0) {
    // in simulazione: si azionano i comandi, si seleziona per leggere i valori, si sposta la vista
    const side = t.closest<SVGElement>("[data-side]");
    if (side && comp) {
      e.preventDefault();
      pressCommand(comp.dataset.component!, side.dataset.side as "14" | "12");
      return;
    }
    if (comp) { select({ kind: "component", id: comp.dataset.component! }); return; }
  }
  svg.setPointerCapture(e.pointerId);

  if (!sim && port && e.button === 0) {
    const ref = port.dataset.port!;
    const [cid, p] = splitRef(ref);
    drag = { mode: "wire", from: ref, start: portWorld(cid, p)! };
  } else if (!sim && comp && e.button === 0) {
    const id = comp.dataset.component!;
    const l = layoutOf(id);
    drag = { mode: "move", id, dx: w.x - l.x, dy: w.y - l.y, before: snapshot(), moved: false };
    if (selection?.kind !== "component" || selection.id !== id) select({ kind: "component", id });
  } else if (!sim && line && e.button === 0) {
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
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>("[data-port]");
    document.querySelectorAll(".port.target").forEach((p) => p.classList.remove("target"));
    if (over && over.dataset.port !== drag.from) over.classList.add("target");
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
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>("[data-port]");
    if (over && over.dataset.port !== d.from) connect(d.from, over.dataset.port!);
    else if (!over) {
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
  if (!sim && e.dataTransfer?.types.includes("application/x-pneutrack-type")) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
svg.addEventListener("drop", (e) => {
  const type = e.dataTransfer?.getData("application/x-pneutrack-type");
  if (!type) return;
  e.preventDefault();
  addComponent(type, toWorld(e));
});

// --- tastiera e barra strumenti ---------------------------------------------------------

document.addEventListener("keydown", (e) => {
  const typing = target(e).closest("input, select, textarea");
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === "s") { e.preventDefault(); saveProject({ asNew: e.shiftKey }); return; }
  if (e.key === "Escape" && !$("#projects-dialog").hidden) { closeProjects(); return; }
  if (typing) return;
  if (sim) {
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "Escape") stopSim();
    else if (key === "f" && !mod) fitView();
    return;
  }
  if (mod && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && key === "d") { e.preventDefault(); duplicateSelection(); }
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
  else if (key === "r" && !mod) rotateSelection();
  else if (e.key === "Escape") select(null);
  else if (key === "f" && !mod) fitView();
});

function togglePlay() {
  if (!sim) return;
  sim.playing = !sim.playing;
  sim.last = performance.now();
  updatePlayButton();
}

function loadDoc(data: Partial<CircuitDoc>, { fit = true } = {}) {
  stopSim();
  const before = snapshot();
  doc = { ...emptyCircuit(), ...JSON.parse(JSON.stringify(data)) };
  doc.layout ??= {};
  doc.connections ??= [];
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

let store: Store | null = null;
let project: { id: string; createdAt: string } | null = null; // progetto aperto, null per una bozza
let savedSnapshot: string | null = null; // stato dell'ultimo salvataggio
let saveState: "idle" | "saving" | "saved" | "error" = "idle";
let saveError = "";
let lastSavedAt: string | null = null;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null; // un solo salvataggio alla volta

const isDirty = () => snapshot() !== savedSnapshot;
const fileName = () =>
  `${(doc.name || "schema").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "schema"}.pneu.json`;
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `oggi ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function remember(key: string, value: string | null) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* non disponibile */ }
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
  const box = document.querySelector<HTMLElement>("#save-state");
  if (!box) return;
  let text: string, cls: string;
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
  box.textContent = text;
  box.className = `save-state ${cls}`;
  box.title = store ? `Archivio: ${store.label}` : "";
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
  const current = project;
  const snap = snapshot();
  const record = { id: current.id, name: doc.name || "Senza nome", createdAt: current.createdAt,
                   updatedAt: now, circuit: JSON.parse(snap) as CircuitDoc };
  saveState = "saving";
  renderSaveState();
  saving = store.put(record).then(() => {
    savedSnapshot = snap;
    lastSavedAt = now;
    saveState = "saved";
    remember(SESSION_KEY, current.id);
    remember(STORAGE_KEY, null);
    if (!silent && asNew) toast("Progetto salvato come copia");
  }).catch((err: Error) => {
    saveState = "error";
    saveError = err.message || "errore";
    toast(`Salvataggio non riuscito: ${saveError}`);
  }).finally(() => { saving = null; renderStatus(); });
  await saving;
  if (!projectsDialogHidden()) refreshProjectList();
}

async function openProject(id: string) {
  if (project && isDirty()) await saveProject();
  try {
    const p = await store!.get(id);
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
    toast(`Impossibile aprire il progetto: ${(err as Error).message}`);
  }
}

async function newDocument(data: Partial<CircuitDoc> = emptyCircuit(), message = "Nuovo schema") {
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
    toast(`Esportazione non riuscita: ${(err as Error).message}`);
  }
}

$<HTMLInputElement>("#file-input").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
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
    toast(`Impossibile aprire il file: ${(err as Error).message}`);
  }
});

// --- finestra Progetti -----------------------------------------------------------------

const projectsDialogHidden = () => $("#projects-dialog").hidden;
let projectList: ProjectSummary[] = [];
let pendingDelete: string | null = null;

function openProjects() {
  $("#projects-dialog").hidden = false;
  $("#projects-store").textContent = store ? `Archivio: ${store.label}` : "";
  $<HTMLInputElement>("#projects-search").value = "";
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
    projectList = await store!.list();
  } catch (err) {
    ul.innerHTML = "";
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = `Impossibile leggere l'archivio: ${(err as Error).message}`;
    ul.append(li);
    return;
  }
  renderProjectList();
}

function renderProjectList() {
  const ul = $("#projects-list");
  ul.replaceChildren();
  const q = $<HTMLInputElement>("#projects-search").value.trim().toLowerCase();
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
  const btn = target(e).closest<HTMLElement>("[data-pact]");
  const li = target(e).closest<HTMLElement>("li[data-id]");
  if (!btn || !li || !store) return;
  const id = li.dataset.id!;
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
    toast(`Operazione non riuscita: ${(err as Error).message}`);
  }
});

function startRename(li: HTMLElement, id: string) {
  const current = projectList.find((p) => p.id === id);
  const input = document.createElement("input");
  input.className = "rename-input";
  input.value = current?.name || "";
  input.setAttribute("aria-label", "Nuovo nome del progetto");
  li.querySelector(".project-open")!.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (ok: boolean) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (ok && name && name !== current?.name && store) {
      try {
        if (project?.id === id) {
          stopSim();
          mutate(() => { doc.name = name; });
          await saveProject();
        } else {
          const p = await store.get(id);
          await store.put({ ...p, name, updatedAt: new Date().toISOString(), circuit: { ...p.circuit, name } });
        }
        toast("Progetto rinominato");
      } catch (err) { toast(`Rinomina non riuscita: ${(err as Error).message}`); }
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
  if (target(e).id === "projects-dialog") return closeProjects();
  const act = target(e).closest<HTMLElement>("button")?.dataset.dact;
  if (act === "close") closeProjects();
  if (act === "new") { closeProjects(); newDocument(); }
  if (act === "import") $("#file-input").click();
  if (act === "save-current") saveProject().then(refreshProjectList);
});

$("#toolbar").addEventListener("click", (e) => {
  const act = target(e).closest<HTMLElement>("button")?.dataset.act;
  switch (act) {
    case "projects": openProjects(); break;
    case "new": newDocument(); break;
    case "save": saveProject(); break;
    case "save-as": saveProject({ asNew: true }); break;
    case "export": exportCurrent(); break;
    case "undo": undo(); break;
    case "redo": redo(); break;
    case "fit": fitView(); break;
    case "sim": if (sim) stopSim(); else startSim(); break;
    case "sim-play": togglePlay(); break;
    case "sim-reset": resetSim(); break;
  }
});

$<HTMLSelectElement>("#examples").addEventListener("change", async (e) => {
  const sel = e.target as HTMLSelectElement;
  const id = sel.value;
  sel.value = "";
  const ex = EXAMPLES.find((x) => x.id === id);
  if (ex) await newDocument(ex.data, "Esempio caricato");
});

window.addEventListener("beforeunload", (e) => {
  if (project && isDirty()) { saveProject(); e.preventDefault(); }
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// --- avvio -----------------------------------------------------------------------------

async function init() {
  renderPalette();
  for (const ex of EXAMPLES) {
    const o = document.createElement("option");
    o.value = ex.id; o.textContent = ex.name;
    $("#examples").append(o);
  }
  const r = svg.getBoundingClientRect();
  view = { x: r.width / 2, y: r.height / 2, k: 1 };

  // bozza locale subito, poi l'archivio (sul web può rispondere dopo qualche secondo)
  let restored: Partial<CircuitDoc> | null = null;
  try { restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { restored = null; }
  if (restored?.components) doc = { ...emptyCircuit(), ...restored } as Doc;
  history.past = []; history.future = [];
  changed();
  if (doc.components.length) fitView();

  store = await openStore();
  document.body.dataset.store = store.kind;
  let lastId: string | null = null;
  try { lastId = localStorage.getItem(SESSION_KEY); } catch { lastId = null; }
  if (lastId && !restored?.components) {
    try {
      const p = await store.get(lastId);
      doc = { ...emptyCircuit(), ...p.circuit };
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

declare global {
  interface Window { pneutrack: unknown }
}
window.pneutrack = {
  get doc() { return doc; }, get analysis() { return analysis; }, get project() { return project; },
  get store() { return store?.kind; }, get sim() { return sim?.s ?? null; },
  isDirty, loadDoc, addComponent, connect: (a: string, b: string) => connect(a, b), saveProject,
  startSim, stopSim, pressCommand, releaseHeld,
};
export type { ConnectionData };
init();
