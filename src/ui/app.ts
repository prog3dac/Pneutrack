// Editor di schemi pneumatici: stato, disegno SVG, interazioni e simulazione.
// Tutto gira nel browser: modello, validazione e solutore sono moduli TypeScript.
import {
  blockOf, extractFragment, insertFragment, mergeBlock, parseFragment, pruneBlocks, splitBlock, type Fragment,
} from "../model/blocks";
import { emptyCircuit, type CircuitDoc, type ConnectionData } from "../model/circuit";
import { dissolveJunction, JUNCTION, splitConnection } from "../model/junctions";
import {
  CYLINDER_SERIES, seriesOf, STANDARD_BORES, STANDARD_RODS, STANDARD_STROKES, toMm,
} from "../model/cylinders";
import {
  ACTUATION_SHORT, buildComponent, cylinderInfo, isElectric, isLatching, isMechanical, isMomentary, typeList,
  type Actuation, type ComponentData, type ParamSpec, type TypeDef,
} from "../model/components";
import { parseTube, TUBE_SIZES, tubeConductance, tubeLabel, tubeVolume, type Tube, type TubeData } from "../model/tubes";
import { Quantity, type Dimension } from "../model/units";
import { analyze, type Analysis } from "../model/validation";
import { compileSim } from "../sim/network";
import { Simulator } from "../sim/simulator";
import { BAR, P_ATM } from "../solver/constants";
import { APP_VERSION, parseChangelog } from "./changelog";
import { sheetSvg, svgToPdf } from "./pdf";
import {
  centeredOrigin, drawingArea, FRAME, SHEET_FORMATS, sheetRect, sheetSizeMm, smallestFormat, TITLE_BLOCK, UNITS_PER_MM,
  type Orientation, type Rect, type SheetData, type SheetFormat,
} from "../model/sheet";
import { exportFile, newProjectId, openStore, type ProjectSummary, type Store } from "./storage";
import { FIELD_HELP, optionHelp, paramHelp } from "./help";
import { geometry, rotate, thumbnail, type Dir, type SymbolState } from "./symbols";

const GRID = 10;
const SVGNS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "pneutrack.autosave.v1"; // bozza non ancora salvata come progetto
const SESSION_KEY = "pneutrack.session.v1"; // ultimo progetto aperto
const AUTOSAVE_MS = 1200;

const PREFIX: Record<string, string> = {
  pressure_source: "P", pressure_regulator: "R", silencer: "SL", exhaust: "S", plug: "T", junction: "N",
  directional_valve: "V", flow_control_valve: "F", single_acting_cylinder: "C",
  double_acting_cylinder: "C", double_rod_cylinder: "C", rotary_actuator: "RA",
  air_reservoir: "SB", air_filter: "FI", lubricator: "LU", frl_unit: "FRL", pressure_gauge: "M",
  check_valve: "NR", pilot_check_valve: "NRP", shuttle_valve: "OR", and_valve: "AND",
  quick_exhaust_valve: "SR", one_way_flow_control: "RF", relief_valve: "VS", sequence_valve: "SQ",
  time_delay_valve: "TM", air_motor: "MP",
};

/** unità aggiunta quando si scrive solo un numero */
const PREF_UNIT: Record<Dimension, string> = {
  pressure: "bar", length: "mm", area: "cm2", volume: "cm3", force: "N", flow: "Nl/min",
  conductance: "dm3/(s·bar)", mass: "kg", time: "s", angle: "deg", voltage: "V", dimensionless: "",
};
const EXAMPLE_VALUE: Partial<Record<Dimension, string>> = {
  pressure: "6 bar", length: "32 mm", flow: "500 Nl/min", angle: "90 deg", force: "10 N",
  mass: "1 kg", conductance: "1 dm3/(s·bar)", dimensionless: "0.35",
};

const EXAMPLES = Object.entries(
  import.meta.glob<CircuitDoc>("../examples/*.json", { eager: true, import: "default" }),
).map(([path, data]) => ({ id: path.replace(/^.*\/|\.json$/g, ""), name: data.name || path, data }));

type Selection =
  | { kind: "component"; id: string }
  | { kind: "connection"; index: number }
  /** più componenti scelti con Maiusc+clic o con un riquadro (trascinando sul vuoto) */
  | { kind: "multi"; ids: string[] }
  | { kind: "block"; id: string }
  | null;
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
  if (selection?.kind === "block") {
    const id = selection.id;
    if (!doc.blocks?.some((b) => b.id === id)) selection = null;
  }
  if (selection?.kind === "multi") {
    const ids = selection.ids.filter((id) => byId(id));
    selection = ids.length > 1 ? { kind: "multi", ids } : ids.length ? { kind: "component", id: ids[0]! } : null;
  }
}

/** Componenti selezionati (uno, più o quelli del blocco). */
function selectedIds(): string[] {
  if (selection?.kind === "component") return [selection.id];
  if (selection?.kind === "multi") return selection.ids;
  if (selection?.kind === "block") return doc.blocks?.find((b) => b.id === (selection as { id: string }).id)?.components ?? [];
  return [];
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

type Pt = [number, number];

/**
 * Percorso ortogonale di una linea: tratto d'uscita dalla porta, poi i punti di piega
 * scelti dall'utente (se ci sono), poi il tratto d'ingresso nell'altra porta.
 * `bendAt[k]` è l'indice in `pts` del k-esimo punto di piega.
 */
function routePoints(a: PortPoint, b: { x: number; y: number; dir?: Dir }, bends: Pt[] = []) {
  const s1: Pt = [a.x + a.dir[0] * 15, a.y + a.dir[1] * 15];
  const s2: Pt = b.dir ? [b.x + b.dir[0] * 15, b.y + b.dir[1] * 15] : [b.x, b.y];
  const pts: Pt[] = [[a.x, a.y], s1];
  const bendAt: number[] = [];
  if (!bends.length) {
    const v1 = a.dir[0] === 0, v2 = b.dir ? b.dir[0] === 0 : !v1;
    if (v1 && v2) {
      const my = (s1[1] + s2[1]) / 2;
      pts.push([s1[0], my], [s2[0], my]);
    } else if (!v1 && !v2) {
      const mx = (s1[0] + s2[0]) / 2;
      pts.push([mx, s1[1]], [mx, s2[1]]);
    } else if (v1) {
      pts.push([s1[0], s2[1]]);
    } else {
      pts.push([s2[0], s1[1]]);
    }
  } else {
    let vertical = a.dir[0] === 0; // asse dell'ultimo tratto
    const goTo = (q: Pt) => {
      const p = pts[pts.length - 1]!;
      if (p[0] !== q[0] && p[1] !== q[1]) {
        // gira: prima perpendicolare all'ultimo tratto, poi di nuovo parallelo
        pts.push(vertical ? [q[0], p[1]] : [p[0], q[1]]);
      } else if (p[0] !== q[0] || p[1] !== q[1]) {
        vertical = p[0] === q[0];
      }
      pts.push(q);
    };
    for (const w of bends) { goTo(w); bendAt.push(pts.length - 1); }
    goTo(s2);
  }
  pts.push(s2, [b.x, b.y]);
  return { pts, bendAt };
}
const ptsAttr = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");
const route = (a: PortPoint, b: { x: number; y: number; dir?: Dir }, bends?: Pt[]) =>
  ptsAttr(routePoints(a, b, bends).pts);

/** Indice del tratto di `pts` più vicino al punto (x, y). */
function nearestSegment(pts: Pt[], x: number, y: number) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i]!, [x2, y2] = pts[i + 1]!;
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2)) : 0;
    const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const isJunction = (id: string) => byId(id)?.type === JUNCTION;

/** Direzione d'uscita da un punto di connessione: verso il punto successivo della linea. */
function aim(p: PortPoint, toward: Pt): PortPoint {
  const dx = toward[0] - p.x, dy = toward[1] - p.y;
  if (!dx && !dy) return p;
  return { ...p, dir: Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)] };
}

/** Capi di una linea; sui punti di connessione la linea esce verso la piega più vicina. */
function connEnds(c: ConnectionData): { a: PortPoint; b: PortPoint } | null {
  const [ca, pa] = splitRef(c.from), [cb, pb] = splitRef(c.to);
  let a = portWorld(ca, pa), b = portWorld(cb, pb);
  if (!a || !b) return null;
  const bends = c.points ?? [];
  const pa0 = a, pb0 = b;
  if (isJunction(ca)) a = aim(a, bends[0] ?? (isJunction(cb) ? [pb0.x, pb0.y] : [pb0.x + pb0.dir[0] * 15, pb0.y + pb0.dir[1] * 15]));
  if (isJunction(cb)) b = aim(b, bends[bends.length - 1] ?? (isJunction(ca) ? [pa0.x, pa0.y] : [pa0.x + pa0.dir[0] * 15, pa0.y + pa0.dir[1] * 15]));
  return { a, b };
}

/** Tubo valido di un collegamento, o null. */
function tubeOf(c: ConnectionData): Tube | null {
  try { return parseTube(c.tube, "linea"); } catch { return null; }
}
/** ultimo tubo scelto: lo ricevono le nuove linee */
let lastTube: TubeData | null = null;

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
  const spec = s.net.valves.find((v) => v.id === comp.id);
  if (spec) {
    return { position: s.valvePosition(comp.id), active14: s.sideActive(spec, "14"), active12: s.sideActive(spec, "12") };
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

  renderSheet();
  const lines = $("#lines"), comps = $("#components"), ports = $("#ports"), labels = $("#labels");
  const linesTop = $("#lines-top");
  lines.replaceChildren(); comps.replaceChildren(); ports.replaceChildren(); labels.replaceChildren();
  linesTop.replaceChildren();
  // con una linea selezionata le altre si attenuano e la selezionata passa sopra ai simboli
  lines.classList.toggle("dimmed", selection?.kind === "connection");
  const P = sim ? sim.s.pressures() : null;
  const livePressure = (ref: string) => {
    if (!sim || !P) return null;
    const n = sim.s.net.portNode[ref];
    return n === undefined ? 0 : (P[n]! - P_ATM) / BAR;
  };

  // collegamenti
  doc.connections.forEach((c, index) => {
    const [ca, pa] = splitRef(c.from), [cb, pb] = splitRef(c.to);
    const ends = connEnds(c);
    if (!ends) return;
    const { a, b } = ends;
    const kinds = [portKind(ca, pa), portKind(cb, pb)];
    const pilot = kinds.includes("pilot");
    const exhaust = kinds.includes("exhaust"); // linea di scarico: sfoga in atmosfera
    const lf = livePressure(c.from), lt = livePressure(c.to);
    const live = lf === null || lt === null ? null : (lf + lt) / 2;
    const pr = analysis.pressures[c.from] || analysis.pressures[c.to];
    const bar = live !== null ? live : pr && !exhaust ? pr.bar : 0;
    const pressurized = bar > 0.2;
    const cls = ["line", pressurized ? `pressurized ${pressureBand(bar)}` : "", pilot ? "pilot" : "", exhaust ? "exhaust" : "",
                 selection?.kind === "connection" && selection.index === index ? "selected" : ""]
      .filter(Boolean).join(" ");
    const { pts: path, bendAt } = routePoints(a, b, c.points);
    const pts = ptsAttr(path);
    const tube = tubeOf(c);
    const selected = selection?.kind === "connection" && selection.index === index;
    const g = el("g", { class: cls, "data-connection": index });
    g.append(el("polyline", { points: pts, class: "hit" }));
    const stroke = el("polyline", { points: pts, class: "stroke" });
    // lo spessore segue il diametro esterno del tubo
    if (tube) stroke.style.strokeWidth = String(1.3 + 0.2 * (tube.outer ?? tube.inner * 1.4) * 1000);
    g.append(stroke);
    g.append(svgTitle(`${c.from} — ${c.to}` + (tube ? ` · ${tubeLabel(tube)}` : "") +
      (live !== null ? ` · ${fmtBar(live)}` : pr ? ` · ${pr.text}` : "")));
    (selected ? linesTop : lines).append(g);
    // misura del tubo: sulla linea selezionata o, se richiesto, su tutte
    if (tube && (show.tubes || (selected && !sim))) {
      // etichetta sul tratto più lungo
      let k = 1, best = -1;
      for (let i = 1; i + 2 < path.length; i++) {
        const d = Math.abs(path[i + 1]![0] - path[i]![0]) + Math.abs(path[i + 1]![1] - path[i]![1]);
        if (d > best) { best = d; k = i; }
      }
      const [x1, y1] = path[k]!, [x2, y2] = path[k + 1]!;
      const t = el("text", { x: (x1 + x2) / 2 + (x1 === x2 ? 6 : 0), y: (y1 + y2) / 2 - (y1 === y2 ? 6 : 0),
                             class: "tube-label", "text-anchor": x1 === x2 ? "start" : "middle" });
      t.textContent = tubeLabel(tube);
      labels.append(t);
    }
    if (selected && !sim) {
      bendAt.forEach((at, k) => {
        const [x, y] = path[at]!;
        const h = el("circle", { cx: x, cy: y, r: 5, class: "bend-handle", "data-bend": k, "data-connection": index });
        h.append(svgTitle("Trascina per spostare la piega · doppio clic per toglierla"));
        ports.append(h);
      });
    }
  });

  const connected = connectedPorts();

  // componenti
  for (const comp of doc.components) {
    const l = layoutOf(comp.id);
    const g = geometry(comp, symbolState(comp));
    const iss = issuesFor(comp.id);
    const junction = comp.type === JUNCTION;
    const jp = junction ? (livePressure(`${comp.id}.1`) ?? analysis.pressures[`${comp.id}.1`]?.bar ?? 0) : 0;
    const cls = ["component", junction ? "junction" : "", jp > 0.2 ? `pressurized ${pressureBand(jp)}` : "",
      selectedIds().includes(comp.id) ? "selected" : "",
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
    const parts: string[] = [];
    if (show.ids) parts.push(comp.id);
    if (show.desc && comp.label) parts.push(comp.label);
    if (show.values) {
      const cyl = sim?.s.cylinder(comp.id);
      if (cyl) parts.push(`${(cyl.x * 1000).toFixed(0)} mm`);
      if (sim && (comp.type === "pressure_gauge" || comp.type === "air_reservoir")) {
        parts.push(fmtBar(sim.s.gauge(`${comp.id}.1`)));
      }
      const left = sim?.s.delayRemaining(comp.id);
      if (left != null && left > 0) parts.push(`${left.toFixed(1).replace(".", ",")} s`);
    }
    text.textContent = parts.join(" · ");
    // i punti di connessione mostrano solo la descrizione, se c'è
    if (junction && !(show.desc && comp.label)) parts.length = 0;
    else if (junction) text.textContent = comp.label!;
    if (parts.length) labels.append(text);

    // porte
    for (const name of Object.keys(g.ports)) {
      const pw = portWorld(comp.id, name)!;
      const ref = `${comp.id}.${name}`;
      const isOpen = !connected.has(ref);
      const pc = ["port", isOpen ? "open" : "connected", portIssue(ref) ? "error" : "",
                  portKind(comp.id, name) || ""].filter(Boolean).join(" ");
      const pg = el("g", { class: pc, "data-port": ref, transform: `translate(${pw.x},${pw.y})` });
      if (junction) {
        // anello attorno al pallino: da qui parte una nuova linea; il centro sposta il punto
        pg.append(el("circle", { r: 12, class: "port-hit" }));
        pg.append(svgTitle(`${comp.id} · trascina dall'anello per collegare una linea, dal centro per spostare`));
        ports.append(pg);
        ports.append(el("circle", { cx: pw.x, cy: pw.y, r: 5, class: "junction-grab",
                                    "data-component": comp.id, "data-port-target": ref }));
        continue;
      }
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
  renderBlocks();
  renderStatus();
}

/** Ingombro di un componente sul foglio (con l'etichetta sopra). */
function compBox(id: string): Rect {
  const c = byId(id)!, l = layoutOf(id), g = geometry(c);
  const [hw, hh] = (l.rot || 0) % 2 ? [g.h / 2, g.w / 2] : [g.w / 2, g.h / 2];
  return { x: l.x - hw, y: l.y - hh - 22, w: 2 * hw, h: 2 * hh + 22 };
}

/** Riquadri tratteggiati dei blocchi, con nome (e descrizione nel suggerimento). */
function renderBlocks() {
  const g = $("#blocks");
  g.replaceChildren();
  for (const b of doc.blocks ?? []) {
    const boxes = b.components.filter((id) => byId(id)).map(compBox);
    if (!boxes.length) continue;
    const pad = 12;
    const x0 = Math.min(...boxes.map((r) => r.x)) - pad, y0 = Math.min(...boxes.map((r) => r.y)) - pad;
    const x1 = Math.max(...boxes.map((r) => r.x + r.w)) + pad, y1 = Math.max(...boxes.map((r) => r.y + r.h)) + pad;
    const sel = selection?.kind === "block" && selection.id === b.id;
    const grp = el("g", { class: `block${sel ? " selected" : ""}`, "data-block": b.id });
    grp.append(el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 8, class: "block-frame" }));
    const t = el("text", { x: x0 + 6, y: y0 - 6, class: "block-label" });
    t.textContent = b.name;
    grp.append(t);
    grp.append(svgTitle(b.description ? `${b.name}\n${b.description}` : b.name));
    g.append(grp);
  }
}

// --- pannelli ------------------------------------------------------------------

/** Voce della palette: un tipo con le opzioni di una sua configurazione. */
interface PaletteItem { type: TypeDef; preset: number; label: string; data: ComponentData }
function paletteItems(): PaletteItem[] {
  return catalog.filter((t) => !t.hidden).flatMap((t) => (t.presets ?? [{ label: t.label }]).map((preset, i) => ({
    type: t, preset: t.presets ? i : -1, label: preset.label,
    data: { id: "", type: t.type, params: { ...t.defaults, ...preset.params },
            ...Object.fromEntries((t.options ?? []).map((o) => [o.name, preset.options?.[o.name] ?? o.default])) },
  })));
}
const PALETTE_KEY = "pneutrack.palette.v1"; // categorie chiuse

/** Fasce di pressione per il colore delle linee (bar relativi). */
const PRESSURE_BANDS: { upTo: number; cls: string; label: string }[] = [
  { upTo: 2, cls: "p1", label: "fino a 2 bar" },
  { upTo: 4, cls: "p2", label: "2–4 bar" },
  { upTo: 6, cls: "p3", label: "4–6 bar" },
  { upTo: 8, cls: "p4", label: "6–8 bar" },
  { upTo: Infinity, cls: "p5", label: "oltre 8 bar" },
];
const pressureBand = (bar: number) => PRESSURE_BANDS.find((b) => bar <= b.upTo)!.cls;
const LEGEND_KEY = "pneutrack.legend.v1"; // "closed" se richiusa

/** Legenda in basso a destra: colori delle linee in base alla pressione e tipi di linea. */
function renderLegend() {
  const box = $("#legend");
  const swatch = (cls: string, label: string) =>
    `<li><svg width="28" height="10" aria-hidden="true"><line x1="1" y1="5" x2="27" y2="5" class="${cls}"/></svg>` +
    `<span>${label}</span></li>`;
  let closed = false;
  try { closed = localStorage.getItem(LEGEND_KEY) === "closed"; } catch { /* nessuna memoria */ }
  box.innerHTML = `<details${closed ? "" : " open"}><summary>Legenda linee</summary>
    <p class="legend-note">${sim ? "Pressione istantanea" : "Pressione massima raggiungibile"}</p>
    <ul>${swatch("lg-none", "senza pressione")}${PRESSURE_BANDS.map((b) => swatch(`lg ${b.cls}`, b.label)).join("")}
    ${swatch("lg-exhaust", "scarico")}${swatch("lg-pilot", "pilotaggio")}${swatch("lg-selected", "linea selezionata")}</ul></details>`;
  box.querySelector("details")!.addEventListener("toggle", (e) => {
    try { localStorage.setItem(LEGEND_KEY, (e.target as HTMLDetailsElement).open ? "open" : "closed"); } catch { /* */ }
  });
}

// --- foglio e cartiglio -----------------------------------------------------------
const today = () => new Date().toLocaleDateString("it-IT");

/** Disegna foglio, cornice e cartiglio nel gruppo #sheet (sotto a linee e componenti). */
function renderSheet() {
  const g = $("#sheet");
  g.replaceChildren();
  const sheet = currentSheet();
  if (!sheet) return;
  const u = UNITS_PER_MM;
  const r = sheetRect(sheet);
  g.append(el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, class: "paper" }));
  const fx = r.x + FRAME.left * u, fy = r.y + FRAME.top * u;
  const fw = r.w - (FRAME.left + FRAME.right) * u, fh = r.h - (FRAME.top + FRAME.bottom) * u;
  g.append(el("rect", { x: fx, y: fy, width: fw, height: fh, class: "frame" }));
  // cartiglio: tre righe, la prima con il titolo
  const tw = TITLE_BLOCK.w * u, th = TITLE_BLOCK.h * u;
  const tx = fx + fw - tw, ty = fy + fh - th;
  g.append(el("rect", { x: tx, y: ty, width: tw, height: th, class: "frame" }));
  const rows = [12, 10, 10].map((h) => h * u);
  const cells: [number, number, number, string, string][] = []; // x, y, larghezza, etichetta, valore
  const w1 = 70 * u, w2 = 55 * u, w3 = 55 * u;
  cells.push([tx, ty, tw, "Titolo", doc.name || "Senza nome"]);
  let y = ty + rows[0]!;
  cells.push([tx, y, w1, "Disegnato da", sheet.author ?? ""], [tx + w1, y, w2, "Data", today()],
             [tx + w1 + w2, y, w3, "Formato", `${sheet.format} ${sheet.orientation === "portrait" ? "verticale" : "orizzontale"}`]);
  y += rows[1]!;
  cells.push([tx, y, w1, "Numero disegno", sheet.number ?? ""], [tx + w1, y, w2, "Revisione", sheet.revision ?? ""],
             [tx + w1 + w2, y, w3, "Programma", `Pneutrack v${APP_VERSION}`]);
  for (const [x, cy, w, label, value] of cells) {
    const h = cy === ty ? rows[0]! : rows[1]!;
    g.append(el("rect", { x, y: cy, width: w, height: h, class: "cell" }));
    const cap = el("text", { x: x + 1.5 * u, y: cy + 3 * u, class: "tb-caption" });
    cap.textContent = label;
    const val = el("text", { x: x + 1.5 * u, y: cy + h - 2 * u, class: cy === ty ? "tb-title" : "tb-value" });
    val.textContent = value;
    g.append(cap, val);
  }
}

/** Sezione "Foglio" nel pannello dello schema. */
function renderSheetFields(panel: HTMLElement) {
  heading(panel, "Foglio");
  const fmt = document.createElement("select");
  fmt.name = "sheet-format";
  for (const [v, t] of [["", "Nessuno (area libera)"], ...SHEET_FORMATS.map((f) => [f, f])] as [string, string][]) {
    const o = document.createElement("option");
    o.value = v; o.textContent = t;
    fmt.append(o);
  }
  fmt.value = doc.sheet?.format ?? "";
  fmt.addEventListener("change", () => {
    mutate(() => {
      if (!fmt.value) { delete doc.sheet; return; }
      const next: SheetData = { ...(doc.sheet ?? {}), format: fmt.value as SheetFormat };
      delete next.origin;
      next.origin = centeredOrigin(next, contentBox() ?? { x: 0, y: 0, w: 0, h: 0 });
      doc.sheet = next;
    });
    fitView();
  });
  panel.append(field("Formato", fmt, FIELD_HELP["sheet-format"]));
  if (!doc.sheet) {
    const auto = document.createElement("button");
    auto.textContent = "Scegli il formato adatto al disegno";
    auto.addEventListener("click", () => { fitSheetToDrawing(); });
    panel.append(auto);
    return;
  }
  const ori = document.createElement("select");
  ori.name = "sheet-orientation";
  for (const [v, t] of [["landscape", "Orizzontale"], ["portrait", "Verticale"]]) {
    const o = document.createElement("option");
    o.value = v!; o.textContent = t!;
    ori.append(o);
  }
  ori.value = doc.sheet.orientation ?? "landscape";
  ori.addEventListener("change", () => {
    mutate(() => {
      const next: SheetData = { ...doc.sheet!, orientation: ori.value as Orientation };
      next.origin = centeredOrigin(next, contentBox() ?? { x: 0, y: 0, w: 0, h: 0 });
      doc.sheet = next;
    });
    fitView();
  });
  panel.append(field("Orientamento", ori, FIELD_HELP["sheet-orientation"]));
  for (const [key, label] of [["author", "Disegnato da"], ["number", "Numero disegno"], ["revision", "Revisione"]] as const) {
    const inp = document.createElement("input");
    inp.name = `sheet-${key}`; inp.value = doc.sheet[key] ?? "";
    inp.addEventListener("change", () => mutate(() => {
      if (inp.value.trim()) doc.sheet![key] = inp.value.trim(); else delete doc.sheet![key];
    }));
    panel.append(field(label, inp, FIELD_HELP[`sheet-${key}`]));
  }
  const box = contentBox(), area = drawingArea(currentSheet()!);
  if (box && (box.x < area.x || box.y < area.y || box.x + box.w > area.x + area.w || box.y + box.h > area.y + area.h)) {
    const warn = document.createElement("p");
    warn.className = "sheet-warning";
    warn.textContent = "Il disegno esce dall'area utile del foglio: centralo, scegli un formato più grande o sposta i componenti.";
    panel.append(warn);
  }
  const actions = document.createElement("div");
  actions.className = "actions";
  const center = document.createElement("button");
  center.textContent = "Centra sul disegno";
  center.addEventListener("click", () => {
    mutate(() => { doc.sheet!.origin = centeredOrigin(doc.sheet!, contentBox() ?? { x: 0, y: 0, w: 0, h: 0 }); });
    fitView();
  });
  const auto = document.createElement("button");
  auto.textContent = "Formato adatto al disegno";
  auto.addEventListener("click", () => { fitSheetToDrawing(); });
  actions.append(center, auto);
  panel.append(actions);
}

/** Il formato più piccolo che contiene il disegno, centrato. */
function fitSheetToDrawing() {
  const box = contentBox() ?? { x: 0, y: 0, w: 0, h: 0 };
  const orientation = doc.sheet?.orientation ?? (box.h > box.w ? "portrait" : "landscape");
  mutate(() => {
    const next: SheetData = { ...(doc.sheet ?? {}), format: smallestFormat(box, orientation), orientation };
    next.origin = centeredOrigin(next, box);
    doc.sheet = next;
  });
  fitView();
}

// --- filtri di visualizzazione --------------------------------------------------
/** Cosa mostrare nell'area di lavoro (solo visualizzazione: lo schema non cambia). */
const VIEW_OPTIONS = [
  { key: "ids", label: "Sigle dei componenti", group: "Testi", def: true },
  { key: "desc", label: "Descrizioni", group: "Testi", def: true },
  { key: "values", label: "Valori in simulazione (corsa, pressione, tempo)", group: "Testi", def: true },
  { key: "ports", label: "Numeri delle porte", group: "Testi", def: true },
  { key: "cams", label: "Sigle dei finecorsa", group: "Testi", def: true },
  { key: "tubes", label: "Misure di tutti i tubi", group: "Testi", def: false },
  { key: "dots", label: "Punti di collegamento", group: "Elementi", def: true },
  { key: "blocks", label: "Riquadri dei blocchi", group: "Elementi", def: true },
  { key: "pilot", label: "Linee di pilotaggio", group: "Elementi", def: true },
  { key: "exhaust", label: "Linee di scarico", group: "Elementi", def: true },
  { key: "grid", label: "Griglia", group: "Elementi", def: true },
  { key: "legend", label: "Legenda", group: "Elementi", def: true },
] as const;
type ViewKey = typeof VIEW_OPTIONS[number]["key"];
const VIEW_KEY = "pneutrack.view.v1";
const show = Object.fromEntries(VIEW_OPTIONS.map((o) => [o.key, o.def])) as Record<ViewKey, boolean>;
try { Object.assign(show, JSON.parse(localStorage.getItem(VIEW_KEY) || "{}")); } catch { /* predefiniti */ }

function applyView() {
  const stage = $("#stage");
  for (const o of VIEW_OPTIONS) stage.classList.toggle(`hide-${o.key}`, !show[o.key]);
}
function renderViewFilter() {
  const body = $("#view-filter-body");
  body.replaceChildren();
  let group = "";
  for (const o of VIEW_OPTIONS) {
    if (o.group !== group) {
      group = o.group;
      const h = document.createElement("h4");
      h.textContent = group;
      body.append(h);
    }
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.name = `show-${o.key}`; cb.checked = show[o.key];
    cb.addEventListener("change", () => {
      show[o.key] = cb.checked;
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(show)); } catch { /* */ }
      applyView();
      render();
    });
    lab.append(cb, " ", o.label);
    body.append(lab);
  }
  const reset = document.createElement("button");
  reset.textContent = "Mostra tutto";
  reset.addEventListener("click", () => {
    for (const o of VIEW_OPTIONS) show[o.key] = o.key === "tubes" ? show.tubes : true;
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(show)); } catch { /* */ }
    applyView(); renderViewFilter(); render();
  });
  body.append(reset);
}
// il menu si chiude facendo clic altrove
document.addEventListener("pointerdown", (e) => {
  const menu = $<HTMLDetailsElement>("#view-filter");
  if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
});

function renderPalette() {
  const pal = $("#palette");
  pal.replaceChildren();
  const search = document.createElement("input");
  search.type = "search";
  search.id = "palette-search";
  search.placeholder = "Cerca componente";
  search.setAttribute("aria-label", "Cerca componente");
  pal.append(search);
  let closed: string[] = [];
  try { closed = JSON.parse(localStorage.getItem(PALETTE_KEY) || "[]"); } catch { closed = []; }
  const items = paletteItems();
  const groups: HTMLDetailsElement[] = [];
  for (const cat of [...new Set(catalog.map((t) => t.category))]) {
    const det = document.createElement("details");
    det.className = "palette-group";
    det.dataset.cat = cat;
    det.open = !closed.includes(cat);
    const sum = document.createElement("summary");
    sum.textContent = cat;
    det.append(sum);
    det.addEventListener("toggle", () => {
      if (search.value) return; // durante la ricerca i gruppi si aprono da soli
      const now = groups.filter((g) => !g.open).map((g) => g.dataset.cat!);
      try { localStorage.setItem(PALETTE_KEY, JSON.stringify(now)); } catch { /* non disponibile */ }
    });
    for (const it of items.filter((x) => x.type.category === cat)) {
      const b = document.createElement("button");
      b.className = "palette-item";
      b.draggable = true;
      b.dataset.type = it.type.type;
      if (it.preset >= 0) b.dataset.preset = String(it.preset);
      b.dataset.search = `${it.label} ${it.type.label} ${it.type.doc}`.toLowerCase();
      b.title = it.type.doc;
      b.innerHTML = `${thumbnail(it.data)}<span></span>`;
      b.querySelector("span")!.textContent = it.label;
      b.addEventListener("click", () => addComponent(it.type.type, viewCenter(), it.preset));
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer!.setData("application/x-pneutrack-type", `${it.type.type}|${it.preset}`);
        e.dataTransfer!.effectAllowed = "copy";
      });
      det.append(b);
    }
    groups.push(det);
    pal.append(det);
  }
  // blocchi salvati nella libreria del browser
  const lib = blockLibrary();
  {
    const det = document.createElement("details");
    det.className = "palette-group";
    const cat = "Blocchi salvati";
    det.dataset.cat = cat;
    det.open = !closed.includes(cat);
    const sum = document.createElement("summary");
    sum.textContent = `${cat} (${lib.length})`;
    det.append(sum);
    det.addEventListener("toggle", () => {
      if (search.value) return;
      const now = groups.filter((g) => !g.open).map((g) => g.dataset.cat!);
      try { localStorage.setItem(PALETTE_KEY, JSON.stringify(now)); } catch { /* non disponibile */ }
    });
    if (!lib.length) {
      const p = document.createElement("p");
      p.className = "palette-empty";
      p.textContent = "Seleziona un blocco e usa «Salva nella libreria» per riusarlo qui.";
      det.append(p);
    }
    lib.forEach((f, i) => {
      const b = document.createElement("button");
      b.className = "palette-item library-item";
      b.draggable = true;
      b.dataset.library = String(i);
      b.dataset.search = `${f.name} ${f.description ?? ""} blocco`.toLowerCase();
      b.title = `${f.name}${f.description ? `\n${f.description}` : ""}\n${f.components.length} componenti`;
      b.innerHTML = `<svg class="thumb" viewBox="0 0 40 30" aria-hidden="true"><rect x="3" y="3" width="34" height="24" rx="4"
        fill="none" stroke="currentColor" stroke-dasharray="4 3"/><rect x="9" y="9" width="9" height="12" fill="none"
        stroke="currentColor"/><rect x="22" y="9" width="9" height="12" fill="none" stroke="currentColor"/></svg><span></span>`;
      b.querySelector("span")!.textContent = `${f.name} (${f.components.length})`;
      b.addEventListener("click", (e) => {
        if ((e.target as Element).closest(".remove")) return;
        insertLibraryBlock(i, viewCenter());
      });
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer!.setData("application/x-pneutrack-block", String(i));
        e.dataTransfer!.effectAllowed = "copy";
      });
      const rm = document.createElement("span");
      rm.className = "remove"; rm.textContent = "×"; rm.title = "Togli dalla libreria"; rm.setAttribute("role", "button");
      rm.addEventListener("click", (e) => { e.stopPropagation(); removeLibraryBlock(i); });
      b.append(rm);
      det.append(b);
    });
    groups.push(det);
    pal.append(det);
  }
  const wasOpen = new Map<HTMLDetailsElement, boolean>();
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (q && !wasOpen.size) groups.forEach((g) => wasOpen.set(g, g.open));
    for (const g of groups) {
      let any = false;
      for (const b of g.querySelectorAll<HTMLElement>(".palette-item")) {
        const show = !q || q.split(/\s+/).every((w) => b.dataset.search!.includes(w));
        b.hidden = !show;
        any ||= show;
      }
      g.hidden = !!q && !any;
      if (q) g.open = true;
    }
    if (!q) { wasOpen.forEach((open, g) => (g.open = open)); wasOpen.clear(); }
  });
}

/** Campo con etichetta; `help` è la descrizione mostrata al passaggio del mouse. */
function field(label: string, input: HTMLElement, help = "") {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  if (help) {
    wrap.title = help;
    wrap.classList.add("has-help");
    const i = document.createElement("i");
    i.className = "help-mark"; i.textContent = "?"; i.setAttribute("aria-hidden", "true");
    span.append(" ", i);
    input.setAttribute("aria-description", help);
  }
  wrap.append(span, input);
  return wrap;
}
function heading(panel: HTMLElement, text: string, level: "h2" | "h3" = "h3") {
  const h = document.createElement(level);
  h.textContent = text;
  panel.append(h);
  return h;
}

function camField(comp: ComponentData, side: "14" | "12") {
  const key = `cam_${side}` as const;
  const sel = document.createElement("select");
  sel.name = key;
  const choices: [string, string][] = [["", "a mano (clic in simulazione)"]];
  const what = ACTUATION_SHORT[(comp[`actuation_${side}`] ?? "mechanical") as Actuation];
  for (const c of doc.components.filter((x) => x.type.endsWith("_cylinder"))) {
    choices.push([`${c.id}+`, `${c.id} tutto fuori (${c.id}+)`], [`${c.id}-`, `${c.id} tutto dentro (${c.id}-)`]);
  }
  const current = comp[key] ?? "";
  if (current && !choices.some(([v]) => v === current)) choices.push([current, `${current} (cilindro mancante)`]);
  for (const [value, label] of choices) {
    const o = document.createElement("option");
    o.value = value; o.textContent = label;
    sel.append(o);
  }
  sel.value = current;
  sel.addEventListener("change", () => mutate(() => {
    const c = byId(comp.id)!;
    if (sel.value) c[key] = sel.value; else delete c[key];
  }));
  const f = field(`${what[0]!.toUpperCase()}${what.slice(1)} ${side} azionato da`, sel, FIELD_HELP.cam);
  if (issuesFor(comp.id).some((i) => i.code === "INVALID_CAM")) f.classList.add("invalid");
  return f;
}

/** Misura normalizzata del cilindro: imposta insieme alesaggio e stelo. */
function cylinderSizeField(comp: ComponentData) {
  const sel = document.createElement("select");
  sel.name = "cylinder-size";
  const custom = document.createElement("option");
  custom.value = ""; custom.textContent = "Personalizzata (valori inseriti a mano)";
  sel.append(custom);
  for (const series of CYLINDER_SERIES) {
    const g = document.createElement("optgroup");
    g.label = series.label;
    for (const { bore, rod } of series.sizes) {
      const o = document.createElement("option");
      o.value = `${series.id}|${bore}|${rod}`;
      o.textContent = `${series.label.split(" (")[0]} · Ø${bore} · stelo Ø${rod}`;
      g.append(o);
    }
    sel.append(g);
  }
  const match = seriesOf(comp.params?.bore, comp.params?.rod)[0];
  sel.value = match ? `${match.id}|${toMm(comp.params!.bore)}|${toMm(comp.params!.rod)}` : "";
  sel.addEventListener("change", () => {
    if (!sel.value) return;
    const [, bore, rod] = sel.value.split("|");
    mutate(() => {
      const c = byId(comp.id)!;
      c.params = { ...c.params, bore: `${bore} mm`, rod: `${rod} mm` };
    });
  });
  return field("Misura standard", sel, FIELD_HELP["cylinder-size"]);
}

function button(text: string, onClick: () => void, key = "", act = "", cls = "") {
  const b = document.createElement("button");
  b.textContent = text;
  if (key) b.title = key;
  if (act) b.dataset.blockAct = act;
  if (cls) b.className = cls;
  b.addEventListener("click", onClick);
  return b;
}

/** Pannello di un blocco: nome, descrizione, componenti e comandi. */
function renderBlockPanel(panel: HTMLElement, title: HTMLElement, id: string) {
  const b = doc.blocks!.find((x) => x.id === id)!;
  title.textContent = `Blocco ${b.name}`;
  const nameIn = document.createElement("input");
  nameIn.name = "block-name"; nameIn.value = b.name;
  nameIn.addEventListener("change", () => mutate(() => {
    doc.blocks!.find((x) => x.id === id)!.name = nameIn.value.trim() || id;
  }));
  panel.append(field("Nome", nameIn, FIELD_HELP["block-name"]));
  const desc = document.createElement("textarea");
  desc.name = "block-description"; desc.rows = 3; desc.value = b.description ?? "";
  desc.placeholder = "Che cosa fa questo blocco";
  desc.addEventListener("change", () => mutate(() => {
    const x = doc.blocks!.find((y) => y.id === id)!;
    if (desc.value.trim()) x.description = desc.value.trim(); else delete x.description;
  }));
  panel.append(field("Descrizione", desc, FIELD_HELP["block-description"]));
  heading(panel, `Componenti (${b.components.length})`);
  const ul = document.createElement("ul");
  ul.className = "block-members";
  for (const cid of b.components) {
    const li = document.createElement("li");
    const a = document.createElement("button");
    a.className = "link";
    a.textContent = cid + (byId(cid)?.label ? ` · ${byId(cid)!.label}` : "");
    a.addEventListener("click", () => select({ kind: "component", id: cid }));
    li.append(a);
    ul.append(li);
  }
  panel.append(ul);
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    button("Dividi", splitSelection, "Ctrl+Maiusc+G", "split"),
    button("Duplica", duplicateSelection, "Ctrl+D", "duplicate"),
    button("Salva nella libreria", () => saveBlockToLibrary(id), "", "library"),
    button("Elimina", deleteSelection, "Canc", "", "danger"),
  );
  panel.append(actions);
  const help = document.createElement("p");
  help.className = "help";
  help.textContent = "Trascina il blocco per spostarlo con le sue linee. Un secondo clic su un componente lo " +
    "seleziona da solo. La libreria rende il blocco disponibile nella palette in tutti i progetti di questo browser.";
  panel.append(help);
}

/** Suggerimenti per i campi di alesaggio, stelo e corsa (si può sempre scrivere un altro valore). */
const STANDARD_LISTS: Record<string, number[]> = { bore: STANDARD_BORES, rod: STANDARD_RODS, stroke: STANDARD_STROKES };
function standardList(name: string): string | null {
  const values = STANDARD_LISTS[name];
  if (!values) return null;
  const id = `std-${name}`;
  if (!document.getElementById(id)) {
    const dl = document.createElement("datalist");
    dl.id = id;
    for (const v of values) {
      const o = document.createElement("option");
      o.value = `${v} mm`;
      dl.append(o);
    }
    document.body.append(dl);
  }
  return id;
}

function paramInput(comp: ComponentData, p: ParamSpec) {
  const inp = document.createElement("input");
  inp.name = `param-${p.name}`;
  const list = comp.type.endsWith("_cylinder") ? standardList(p.name) : null;
  if (list) inp.setAttribute("list", list);
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
  const f = field(p.label + (p.required ? " *" : ""), inp, paramHelp(comp.type, p));
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
    panel.append(field("Sigla", idIn, FIELD_HELP.id));

    const labIn = document.createElement("input");
    labIn.value = comp.label || ""; labIn.name = "label"; labIn.placeholder = "facoltativa";
    labIn.addEventListener("change", () => mutate(() => {
      const c = byId(comp.id)!;
      if (labIn.value.trim()) c.label = labIn.value.trim(); else delete c.label;
    }));
    panel.append(field("Descrizione", labIn, FIELD_HELP.label));
    const inBlock = blockOf(doc, comp.id);
    if (inBlock) {
      const p = document.createElement("p");
      p.className = "help";
      p.append(`Fa parte del blocco «${inBlock.name}». `);
      const a = document.createElement("button");
      a.className = "link"; a.textContent = "Seleziona il blocco";
      a.addEventListener("click", () => select({ kind: "block", id: inBlock.id }));
      p.append(a);
      panel.append(p);
    }

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
        const c = byId(comp.id)!;
        c[opt.name] = sel.value;
        if (opt.name !== "function" && !isMechanical(sel.value as Actuation)) delete c[opt.name === "actuation_14" ? "cam_14" : "cam_12"];
        pruneConnections(comp.id);
      }));
      panel.append(field(opt.label, sel, optionHelp(comp.type, opt)));
      // rullo: può essere premuto da un cilindro a fine corsa
      const side = opt.name === "actuation_14" ? "14" : opt.name === "actuation_12" ? "12" : null;
      if (side && isMechanical((comp[opt.name] ?? opt.default) as Actuation)) panel.append(camField(comp, side));
    }

    const catalogParams = meta?.params.filter((p) => p.group === "catalog") ?? [];
    const simParams = meta?.params.filter((p) => p.group === "sim") ?? [];
    if (catalogParams.length) heading(panel, "Parametri da catalogo");
    if (comp.type.endsWith("_cylinder")) panel.append(cylinderSizeField(comp));
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
  } else if (selection?.kind === "block" && doc.blocks?.some((b) => b.id === (selection as { id: string }).id)) {
    renderBlockPanel(panel, title, selection.id);
  } else if (selection?.kind === "multi") {
    title.textContent = `${selection.ids.length} componenti selezionati`;
    const p = document.createElement("p");
    p.className = "help";
    p.textContent = selection.ids.join(", ");
    panel.append(p);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      button("Unisci in un blocco", mergeSelection, "Ctrl+G", "merge"),
      button("Duplica", duplicateSelection, "Ctrl+D"),
      button("Elimina", deleteSelection, "Canc", "", "danger"),
    );
    panel.append(actions);
    const help = document.createElement("p");
    help.className = "help";
    help.textContent = "Trascina uno dei componenti per spostarli tutti. Maiusc+clic aggiunge o toglie un componente, " +
      "trascinando sul vuoto si seleziona con un riquadro. Ctrl+C / Ctrl+X / Ctrl+V copia, taglia e incolla.";
    panel.append(help);
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
    renderTubeFields(panel, selection.index);
    const actions = document.createElement("div");
    actions.className = "actions";
    if (c.points?.length) {
      const straight = document.createElement("button");
      straight.textContent = "Raddrizza linea";
      straight.title = "Toglie i punti di piega";
      straight.addEventListener("click", () => mutate(() => { delete doc.connections[(selection as { index: number }).index]!.points; }));
      actions.append(straight);
    }
    const split = document.createElement("button");
    split.textContent = "Aggiungi punto di connessione";
    split.title = "Spezza la linea con un punto a cui collegare altre linee";
    split.addEventListener("click", () => {
      const index = (selection as { index: number }).index;
      const ends = connEnds(doc.connections[index]!);
      if (!ends) return;
      // a metà del tratto più lungo
      const { pts } = routePoints(ends.a, ends.b, doc.connections[index]!.points);
      let k = 0, best = -1;
      for (let i = 0; i + 1 < pts.length; i++) {
        const d = Math.abs(pts[i + 1]![0] - pts[i]![0]) + Math.abs(pts[i + 1]![1] - pts[i]![1]);
        if (d > best) { best = d; k = i; }
      }
      const mid = { x: (pts[k]![0] + pts[k + 1]![0]) / 2, y: (pts[k]![1] + pts[k + 1]![1]) / 2 };
      let id = "";
      mutate(() => { id = splitLine(index, mid)?.split(".")[0] ?? ""; });
      if (id) select({ kind: "component", id });
    });
    actions.append(split);
    const del = document.createElement("button");
    del.className = "danger"; del.textContent = "Elimina collegamento";
    del.addEventListener("click", deleteSelection);
    actions.append(del);
    panel.append(actions);
    const help = document.createElement("p");
    help.className = "help";
    help.textContent = "Trascina la linea per aggiungere una piega, trascina i punti per spostarle, doppio clic su un punto per toglierlo. " +
      "Per diramare la linea trascina sopra di essa un'altra linea: nasce un punto di connessione.";
    panel.append(help);
  } else {
    title.textContent = "Schema";
    const nameIn = document.createElement("input");
    nameIn.value = doc.name || ""; nameIn.name = "circuit-name";
    nameIn.addEventListener("change", () => mutate(() => { doc.name = nameIn.value; }));
    panel.append(field("Nome", nameIn, FIELD_HELP["circuit-name"]));
    renderSheetFields(panel);
    const help = document.createElement("div");
    help.className = "help";
    help.innerHTML = `<p>Trascina un componente dalla palette sul foglio, oppure fai clic per inserirlo al centro.</p>
      <p>Per collegare due porte trascina da una porta all'altra. Per diramare una linea trascina una nuova linea sopra di essa: nasce un punto di connessione a cui collegarne altre.</p>
      <p>Con <b>Simula</b> lo schema si anima: azioni pulsanti e solenoidi facendo clic sui comandi delle valvole.</p>
      <ul><li><kbd>R</kbd> ruota</li><li><kbd>Canc</kbd> elimina</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> annulla / ripeti</li>
      <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplica</li><li><kbd>Ctrl</kbd>+<kbd>S</kbd> salva il progetto</li>
      <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> copia, taglia, incolla (sotto il puntatore)</li>
      <li>Trascina sul vuoto: seleziona con un riquadro (<kbd>Maiusc</kbd> per aggiungere) · <kbd>Ctrl</kbd>+<kbd>A</kbd> tutto</li>
      <li>Rotella: zoom · <kbd>Spazio</kbd>+trascina o tasto centrale: sposta la vista</li></ul>`;
    panel.append(help);
  }
}

const sameLength = (a?: string, b?: string) => {
  try { return !!a && !!b && Quantity.parse(a).equals(Quantity.parse(b)); } catch { return false; }
};
const presetOf = (t?: TubeData) =>
  t ? TUBE_SIZES.findIndex((z) => sameLength(z.outer, t.outer_diameter) && sameLength(z.inner, t.inner_diameter)) : -1;

/** Scelta del tubo di un collegamento: misura standard, personalizzata o nessuna. */
function renderTubeFields(panel: HTMLElement, index: number) {
  const c = doc.connections[index]!;
  heading(panel, "Tubo");
  const setTube = (tube: TubeData | null) => mutate(() => {
    const conn = doc.connections[index]!;
    if (tube) { conn.tube = tube; lastTube = { ...tube }; } else { delete conn.tube; }
  });

  const size = document.createElement("select");
  size.name = "tube-size";
  const options: [string, string][] = [["", "Non specificato (linea ideale)"],
    ...TUBE_SIZES.map((z, i): [string, string] => [String(i), z.label]), ["custom", "Personalizzato"]];
  for (const [value, text] of options) {
    const o = document.createElement("option");
    o.value = value; o.textContent = text;
    size.append(o);
  }
  const preset = presetOf(c.tube);
  size.value = !c.tube ? "" : preset >= 0 ? String(preset) : "custom";
  size.addEventListener("change", () => {
    const length = c.tube?.length || lastTube?.length || "1 m";
    if (size.value === "") setTube(null);
    else if (size.value === "custom") setTube({ ...(c.tube ?? { outer_diameter: "6 mm", inner_diameter: "4 mm" }), length });
    else {
      const z = TUBE_SIZES[Number(size.value)]!;
      setTube({ outer_diameter: z.outer, inner_diameter: z.inner, length });
    }
  });
  panel.append(field("Misura", size, FIELD_HELP["tube-size"]));
  if (!c.tube) return;

  const input = (name: keyof TubeData, label: string, unit: string, placeholder: string) => {
    const inp = document.createElement("input");
    inp.name = `tube-${name}`;
    inp.value = c.tube?.[name] ?? "";
    inp.placeholder = placeholder;
    inp.spellcheck = false;
    inp.addEventListener("change", () => {
      const v = inp.value.trim();
      const tube: TubeData = { ...doc.connections[index]!.tube };
      if (v) tube[name] = /^[-+]?[\d.,]+$/.test(v) ? `${v} ${unit}` : v;
      else delete tube[name];
      setTube(tube);
    });
    const f = field(label, inp, FIELD_HELP[`tube-${name}`]);
    const bad = analysis.issues.some((i) => i.code === "INVALID_TUBE" && i.ports.includes(c.from) &&
      i.ports.includes(c.to) && (i.message.includes(`'${name}'`) || i.message.includes(`.${name}:`)));
    if (bad) f.classList.add("invalid");
    return f;
  };
  panel.append(input("outer_diameter", "Ø esterno", "mm", "facoltativo, es. 6 mm"));
  panel.append(input("inner_diameter", "Ø interno *", "mm", "es. 4 mm"));
  panel.append(input("length", "Lunghezza *", "m", "es. 1.5 m"));

  const tube = tubeOf(c);
  if (tube) {
    const info = document.createElement("p");
    info.className = "tube-info";
    const vol = tubeVolume(tube) * 1e6, C = tubeConductance(tube) / 1e-8;
    info.textContent = `Volume ${vol.toFixed(vol < 10 ? 1 : 0).replace(".", ",")} cm³ · ` +
      `conduttanza ≈ ${C.toFixed(2).replace(".", ",")} dm³/(s·bar)`;
    panel.append(info);
    const all = document.createElement("button");
    all.textContent = "Usa questo tubo per tutte le linee";
    all.addEventListener("click", () => {
      const t = doc.connections[index]!.tube!;
      mutate(() => { for (const conn of doc.connections) if (!isPilotLine(conn)) conn.tube = { ...t }; });
      toast("Tubo applicato a tutte le linee di potenza (i pilotaggi restano come sono)");
    });
    panel.append(all);
  }
}
const isPilotLine = (c: ConnectionData) => [c.from, c.to].some((r) => { const [cid, p] = splitRef(r); return portKind(cid, p) === "pilot"; });

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
    const wire = i.code === "INVALID_TUBE"
      ? doc.connections.findIndex((c) => i.ports.includes(c.from) && i.ports.includes(c.to)) : -1;
    if (wire >= 0) {
      li.classList.add("clickable");
      li.addEventListener("click", () => select({ kind: "connection", index: wire }));
    } else if (cid && byId(cid)) {
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
  const none = !selectedIds().length;
  $<HTMLButtonElement>("#btn-copy").disabled = none;
  $<HTMLButtonElement>("#btn-cut").disabled = !!sim || none;
  $<HTMLButtonElement>("#btn-paste").disabled = !!sim || !storedClip();
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

function addComponent(type: string, at: { x: number; y: number }, presetIndex = -1) {
  const meta = catalogEntry(type);
  if (!meta || sim) return;
  const preset = meta.presets?.[presetIndex];
  const comp: ComponentData = { id: nextId(type), type, params: { ...meta.defaults, ...preset?.params } };
  for (const o of meta.options ?? []) comp[o.name] = preset?.options?.[o.name] ?? o.default;
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
    for (const b of doc.blocks ?? []) b.components = b.components.map((c) => (c === oldId ? newId : c));
    doc.layout[newId] = layoutOf(oldId);
    delete doc.layout[oldId];
    const fix = (ref: string) => { const [c, p] = splitRef(ref); return c === oldId ? `${newId}.${p}` : ref; };
    doc.connections = doc.connections.map((c) => ({ ...c, from: fix(c.from), to: fix(c.to) }));
    // i finecorsa seguono il cilindro rinominato
    for (const c of doc.components) {
      for (const key of ["cam_14", "cam_12"] as const) {
        const cam = c[key];
        if (cam && cam.slice(0, -1) === oldId) c[key] = newId + cam.slice(-1);
      }
    }
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
  mutate(() => doc.connections.push(lastTube ? { from: a, to: b, tube: { ...lastTube } } : { from: a, to: b }));
  select({ kind: "connection", index: doc.connections.length - 1 });
}

function deleteSelection() {
  const sel = selection;
  if (!sel || sim) return;
  mutate(() => {
    if (sel.kind === "connection") {
      doc.connections.splice(sel.index, 1);
      return;
    }
    // un punto di connessione tra due sole linee si toglie ricucendole
    if (sel.kind === "component" && dissolveJunction(doc, sel.id)) { pruneBlocks(doc); return; }
    const ids = new Set(selectedIds());
    doc.components = doc.components.filter((c) => !ids.has(c.id));
    for (const id of ids) delete doc.layout[id];
    doc.connections = doc.connections.filter((c) => !ids.has(splitRef(c.from)[0]) && !ids.has(splitRef(c.to)[0]));
    pruneBlocks(doc);
  });
  select(null);
}

function rotateSelection() {
  const sel = selection;
  if (sel?.kind !== "component") return;
  mutate(() => { const l = layoutOf(sel.id); l.rot = ((l.rot || 0) + 1) % 4; });
}

/** Sigla libera per un tipo, saltando anche quelle già scelte in questa operazione. */
function freeId(type: string, taken: Set<string>) {
  const prefix = PREFIX[type] || "X";
  let n = 1;
  while (taken.has(`${prefix}${n}`) || byId(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Duplica la selezione: componenti, linee tra loro e, per un blocco, il blocco stesso. */
function duplicateSelection() {
  const ids = selectedIds();
  if (!ids.length || sim) return;
  const block = selection?.kind === "block" ? doc.blocks?.find((b) => b.id === (selection as { id: string }).id) : undefined;
  const frag = extractFragment(doc, ids, block?.name, block?.description);
  const x0 = Math.min(...ids.map((id) => layoutOf(id).x)), y0 = Math.min(...ids.map((id) => layoutOf(id).y));
  let added: string[] = [];
  let newBlock: string | undefined;
  mutate(() => {
    added = insertFragment(doc, frag, { x: x0 + 40, y: y0 + 40 }, freeId);
    if (block) newBlock = mergeBlock(doc, added, `${block.name} (copia)`, block.description).id;
  });
  if (newBlock) select({ kind: "block", id: newBlock });
  else select(added.length > 1 ? { kind: "multi", ids: added } : { kind: "component", id: added[0]! });
}

// --- appunti: copia, taglia, incolla ------------------------------------------------
const CLIP_KEY = "pneutrack.clipboard.v1"; // ultima copia, condivisa tra progetti e schede
const CLIP_FORMAT = "pneutrack/clipboard";
interface Clip { format: typeof CLIP_FORMAT; block: boolean; origin: [number, number]; fragment: Fragment }
let clipPastes = 0; // incolla ripetuti senza puntatore sul foglio: ogni copia scala di 40
let pointerWorld: { x: number; y: number } | null = null; // ultimo punto del puntatore sul foglio

function parseClip(text: string | null | undefined): Clip | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<Clip>;
    if (raw?.format !== CLIP_FORMAT) return null;
    const fragment = parseFragment(raw.fragment);
    if (!fragment) return null;
    const o = Array.isArray(raw.origin) && raw.origin.length === 2 ? raw.origin as [number, number] : [0, 0] as [number, number];
    return { format: CLIP_FORMAT, block: !!raw.block, origin: o, fragment };
  } catch { return null; }
}
function storedClip(): Clip | null {
  try { return parseClip(localStorage.getItem(CLIP_KEY)); } catch { return null; }
}

/** Copia la selezione negli appunti dell'app (e restituisce il testo per quelli del sistema). */
function copySelection(): string | null {
  const ids = selectedIds();
  if (!ids.length) return null;
  const block = selection?.kind === "block" ? doc.blocks?.find((b) => b.id === (selection as { id: string }).id) : undefined;
  const frag = extractFragment(doc, ids, block?.name ?? "", block?.description);
  const origin: [number, number] = [Math.min(...ids.map((id) => layoutOf(id).x)), Math.min(...ids.map((id) => layoutOf(id).y))];
  const text = JSON.stringify({ format: CLIP_FORMAT, block: !!block, origin, fragment: frag } satisfies Clip);
  try { localStorage.setItem(CLIP_KEY, text); } catch { /* resta solo negli appunti del sistema */ }
  clipPastes = 0;
  renderStatus();
  toast(ids.length === 1 ? `Copiato ${ids[0]}` : `Copiati ${ids.length} componenti` + (block ? ` (blocco «${block.name}»)` : ""));
  return text;
}

function cutSelection(): string | null {
  if (sim) return null;
  const text = copySelection();
  if (text) deleteSelection();
  return text;
}

/** Incolla: sotto il puntatore se è sul foglio, altrimenti scalato rispetto all'originale. */
function pasteClip(clip: Clip | null = storedClip()) {
  if (!clip || sim) { if (!clip) toast("Niente da incollare: copia prima uno o più componenti"); return; }
  clipPastes++;
  const at = pointerWorld
    ? { x: snap(pointerWorld.x), y: snap(pointerWorld.y) }
    : { x: clip.origin[0] + 40 * clipPastes, y: clip.origin[1] + 40 * clipPastes };
  let added: string[] = [];
  let newBlock: string | undefined;
  mutate(() => {
    added = insertFragment(doc, clip.fragment, at, freeId);
    if (clip.block) newBlock = mergeBlock(doc, added, clip.fragment.name || undefined, clip.fragment.description).id;
  });
  if (newBlock) select({ kind: "block", id: newBlock });
  else select(added.length > 1 ? { kind: "multi", ids: added } : { kind: "component", id: added[0]! });
}

// gli eventi copy/cut/paste passano anche dagli appunti del sistema: si copia tra schede e browser
const editingText = () => !!(document.activeElement?.closest("input, select, textarea"));
document.addEventListener("copy", (e) => {
  if (editingText() || window.getSelection()?.toString()) return;
  const text = copySelection();
  if (text && e.clipboardData) { e.clipboardData.setData("text/plain", text); e.preventDefault(); }
});
document.addEventListener("cut", (e) => {
  if (editingText() || window.getSelection()?.toString()) return;
  const text = cutSelection();
  if (text && e.clipboardData) { e.clipboardData.setData("text/plain", text); e.preventDefault(); }
});
document.addEventListener("paste", (e) => {
  if (editingText()) return;
  e.preventDefault();
  pasteClip(parseClip(e.clipboardData?.getData("text/plain")) ?? storedClip());
});

/** Unisci: i componenti selezionati diventano un blocco. */
function mergeSelection() {
  const ids = selectedIds();
  if (ids.length < 1 || sim) return;
  let id = "";
  mutate(() => { id = mergeBlock(doc, ids).id; });
  select({ kind: "block", id });
  toast("Blocco creato: dagli un nome e una descrizione nel pannello a destra");
}

/** Dividi: il blocco selezionato torna a essere un gruppo di componenti singoli. */
function splitSelection() {
  if (selection?.kind !== "block" || sim) return;
  const id = selection.id;
  let ids: string[] = [];
  mutate(() => { ids = splitBlock(doc, id); });
  select(ids.length > 1 ? { kind: "multi", ids } : ids.length ? { kind: "component", id: ids[0]! } : null);
}

// --- libreria dei blocchi (nel browser, per riusarli in ogni progetto) ------------
const LIBRARY_KEY = "pneutrack.blocks.v1";
function blockLibrary(): Fragment[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(parseFragment).filter((f): f is Fragment => !!f) : [];
  } catch { return []; }
}
function saveLibrary(list: Fragment[]) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
function saveBlockToLibrary(blockId: string) {
  const b = doc.blocks?.find((x) => x.id === blockId);
  if (!b) return;
  const list = blockLibrary().filter((f) => f.name !== b.name);
  list.push(extractFragment(doc, b.components, b.name, b.description));
  if (saveLibrary(list)) { toast(`"${b.name}" salvato nella libreria dei blocchi`); renderPalette(); }
  else toast("Questo browser non permette di salvare la libreria");
}
function insertLibraryBlock(index: number, at: { x: number; y: number }) {
  const frag = blockLibrary()[index];
  if (!frag || sim) return;
  let id = "";
  mutate(() => {
    const ids = insertFragment(doc, frag, { x: snap(at.x), y: snap(at.y) }, freeId);
    id = mergeBlock(doc, ids, frag.name, frag.description).id;
  });
  select({ kind: "block", id });
}
function removeLibraryBlock(index: number) {
  const list = blockLibrary();
  const [gone] = list.splice(index, 1);
  saveLibrary(list);
  renderPalette();
  if (gone) toast(`"${gone.name}" tolto dalla libreria`);
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
  renderLegend();
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
  renderLegend();
}

function resetSim() {
  if (!sim) return;
  const commands = sim.s.net.valves.flatMap((v) => (["14", "12"] as const)
    .filter((side) => sim!.s.command(v.id, side)).map((side) => [v.id, side] as const));
  sim.s = new Simulator(sim.s.net);
  // i solenoidi restano come li ha lasciati l'utente
  for (const [id, side] of commands) {
    const v = sim.s.net.valves.find((x) => x.id === id)!;
    if (isLatching(side === "14" ? v.act14 : v.act12)) sim.s.setCommand(id, side, true);
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
    const cam = side === "14" ? v.cam14 : v.cam12;
    return isLatching(act) || (isMomentary(act) && !cam) ? [{ id: v.id, side, act }] : [];
  }));
}

function pressCommand(id: string, side: "14" | "12") {
  if (!sim) return;
  const v = sim.s.net.valves.find((x) => x.id === id);
  if (!v) return;
  const act = side === "14" ? v.act14 : v.act12;
  if (isLatching(act)) {
    const on = !sim.s.command(id, side);
    sim.s.setCommand(id, side, on);
    // leva con arresto su entrambi i lati: è una sola leva, spostarla libera l'altro lato
    const other = side === "14" ? "12" : "14";
    if (on && act === "lever_detent" && (other === "14" ? v.act14 : v.act12) === "lever_detent") {
      sim.s.setCommand(id, other, false);
    }
  } else if (isMomentary(act)) {
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
    "Pulsanti, leve, pedali e rulli restano azionati finché tieni premuto; solenoidi e leve con arresto " +
    "cambiano stato a ogni clic. Le elettrovalvole servopilotate commutano solo se il pilota ha pressione.";
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
      b.textContent = `${c.id} · ${c.side} · ${ACTUATION_SHORT[c.act]}`;
      b.title = isElectric(c.act) ? "Clic: eccita / diseccita" : isLatching(c.act) ? "Clic: sposta la leva"
        : "Tieni premuto per azionare";
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
/** Ingombro del disegno (componenti, etichette e punti di piega) in unità dello schema. */
function contentBox(): Rect | null {
  if (!doc.components.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of doc.components) {
    const l = layoutOf(c.id), g = geometry(c);
    const [hw, hh] = (l.rot || 0) % 2 ? [g.h / 2, g.w / 2] : [g.w / 2, g.h / 2];
    x0 = Math.min(x0, l.x - hw); x1 = Math.max(x1, l.x + hw);
    y0 = Math.min(y0, l.y - hh - 24); y1 = Math.max(y1, l.y + hh);
  }
  for (const c of doc.connections) for (const [x, y] of c.points ?? []) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Foglio mostrato: quello dello schema, con l'origine centrata sul disegno se non indicata. */
function currentSheet(): SheetData | null {
  if (!doc.sheet) return null;
  if (doc.sheet.origin) return doc.sheet;
  const box = contentBox() ?? { x: 0, y: 0, w: 0, h: 0 };
  return { ...doc.sheet, origin: centeredOrigin(doc.sheet, box) };
}

function fitView() {
  const r = svg.getBoundingClientRect();
  const sheet = currentSheet();
  if (sheet) {
    const s = sheetRect(sheet), pad = 30;
    const k = Math.min(r.width / (s.w + 2 * pad), r.height / (s.h + 2 * pad));
    view = { k, x: r.width / 2 - (s.x + s.w / 2) * k, y: r.height / 2 - (s.y + s.h / 2) * k };
    return render();
  }
  const box = contentBox();
  if (!box) { view = { x: r.width / 2, y: r.height / 2, k: 1 }; return render(); }
  const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  const pad = 60;
  const k = Math.max(0.3, Math.min(2, Math.min(r.width / (x1 - x0 + 2 * pad), r.height / (y1 - y0 + 2 * pad))));
  view = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: r.height / 2 - ((y0 + y1) / 2) * k };
  render();
}

// --- interazioni sul foglio ----------------------------------------------------------

type Drag =
  | { mode: "wire"; from: string; start: PortPoint }
  | { mode: "move"; id: string; dx: number; dy: number; before: string; moved: boolean }
  /** più componenti insieme (selezione multipla o blocco), con le pieghe delle linee tra loro */
  | { mode: "group"; ids: string[]; sx: number; sy: number; start: Record<string, [number, number]>;
      points: Map<number, Pt[]>; before: string; moved: boolean; clicked?: string }
  | { mode: "marquee"; sx: number; sy: number; add: string[] }
  | { mode: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  /** piega di una linea: `bend` è l'indice del punto, -1 finché non si è mosso il puntatore */
  | { mode: "bend"; index: number; bend: number; sx: number; sy: number; before: string; moved: boolean };
let drag: Drag | null = null;
/** barra spaziatrice tenuta premuta: trascinando si sposta la vista */
let spaceHeld = false;
document.addEventListener("keyup", (e) => { if (e.key === " ") { spaceHeld = false; svg.classList.remove("panning"); } });
window.addEventListener("blur", () => { spaceHeld = false; svg.classList.remove("panning"); });

svg.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  const t = target(e);
  const port = t.closest<SVGElement>("[data-port]");
  const comp = t.closest<SVGElement>("[data-component]");
  const line = t.closest<SVGElement>("[data-connection]");
  const blockEl = t.closest<SVGElement>("[data-block]");
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

  const bend = t.closest<SVGElement>("[data-bend]");
  if (!sim && bend && e.button === 0) {
    drag = { mode: "bend", index: Number(bend.dataset.connection), bend: Number(bend.dataset.bend),
             sx: e.clientX, sy: e.clientY, before: snapshot(), moved: false };
  } else if (!sim && port && e.button === 0) {
    const ref = port.dataset.port!;
    const [cid, p] = splitRef(ref);
    drag = { mode: "wire", from: ref, start: portWorld(cid, p)! };
  } else if (!sim && comp && e.button === 0 && e.shiftKey) {
    // Maiusc+clic: aggiunge o toglie il componente dalla selezione
    const id = comp.dataset.component!;
    const cur = selectedIds();
    const ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    select(ids.length > 1 ? { kind: "multi", ids } : ids.length ? { kind: "component", id: ids[0]! } : null);
  } else if (!sim && comp && e.button === 0) {
    const id = comp.dataset.component!;
    const block = blockOf(doc, id);
    const group = selectedIds();
    let clicked: string | undefined;
    if (group.length > 1 && group.includes(id)) {
      // clic su un componente già nel gruppo: si trascina tutto; al rilascio senza movimento, se è
      // un blocco, si entra nel blocco e si seleziona solo quel componente
      if (selection?.kind === "block") clicked = id;
    } else if (block && block.components.length > 1 && !(selection?.kind === "component" && selection.id === id)) {
      select({ kind: "block", id: block.id });
    } else if (selection?.kind !== "component" || selection.id !== id) {
      select({ kind: "component", id });
    }
    const ids = selectedIds();
    if (ids.length > 1) drag = groupDrag(ids, w, clicked);
    else {
      const l = layoutOf(id);
      drag = { mode: "move", id, dx: w.x - l.x, dy: w.y - l.y, before: snapshot(), moved: false };
    }
  } else if (!sim && blockEl && e.button === 0) {
    const id = blockEl.dataset.block!;
    if (selection?.kind !== "block" || selection.id !== id) select({ kind: "block", id });
    drag = groupDrag(selectedIds(), w);
  } else if (!sim && e.button === 0 && !line && !spaceHeld) {
    // trascinando sul vuoto: riquadro di selezione (con Maiusc si aggiunge alla selezione)
    drag = { mode: "marquee", sx: w.x, sy: w.y, add: e.shiftKey ? selectedIds() : [] };
  } else if (!sim && line && e.button === 0) {
    const index = Number(line.dataset.connection);
    if (selection?.kind !== "connection" || selection.index !== index) select({ kind: "connection", index });
    drag = { mode: "bend", index, bend: -1, sx: e.clientX, sy: e.clientY, before: snapshot(), moved: false };
  } else {
    drag = { mode: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }
});

svg.addEventListener("pointermove", (e) => {
  pointerWorld = toWorld(e);
  if (!drag) return;
  const w = toWorld(e);
  if (drag.mode === "group") {
    const dx = snap(w.x - drag.sx), dy = snap(w.y - drag.sy);
    const [fx, fy] = drag.start[drag.ids[0]!]!;
    const l0 = layoutOf(drag.ids[0]!);
    if (l0.x === fx + dx && l0.y === fy + dy) return;
    for (const id of drag.ids) {
      const [x, y] = drag.start[id]!;
      const l = layoutOf(id);
      l.x = x + dx; l.y = y + dy;
    }
    drag.points.forEach((pts, i) => { doc.connections[i]!.points = pts.map(([x, y]) => [x + dx, y + dy]); });
    drag.moved = true;
    render();
  } else if (drag.mode === "marquee") {
    const m = $("#marquee");
    m.setAttribute("x", String(Math.min(drag.sx, w.x))); m.setAttribute("y", String(Math.min(drag.sy, w.y)));
    m.setAttribute("width", String(Math.abs(w.x - drag.sx))); m.setAttribute("height", String(Math.abs(w.y - drag.sy)));
    m.style.display = "";
  } else if (drag.mode === "move") {
    const l = layoutOf(drag.id);
    const nx = snap(w.x - drag.dx), ny = snap(w.y - drag.dy);
    if (nx !== l.x || ny !== l.y) { l.x = nx; l.y = ny; drag.moved = true; render(); }
  } else if (drag.mode === "pan") {
    view.x = drag.vx + e.clientX - drag.sx;
    view.y = drag.vy + e.clientY - drag.sy;
    drag.moved = true;
    render();
  } else if (drag.mode === "bend") {
    const c = doc.connections[drag.index];
    if (!c) return;
    if (drag.bend < 0) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      // nuova piega nel tratto più vicino al punto in cui si è cominciato a trascinare
      const ends = connEnds(c);
      if (!ends) return;
      const { pts, bendAt } = routePoints(ends.a, ends.b, c.points);
      const start = toWorld({ clientX: drag.sx, clientY: drag.sy });
      const seg = nearestSegment(pts, start.x, start.y);
      drag.bend = bendAt.filter((k) => k <= seg).length;
      c.points = [...(c.points ?? [])];
      c.points.splice(drag.bend, 0, [snap(w.x), snap(w.y)]);
    }
    const pt: Pt = [snap(w.x), snap(w.y)];
    const cur = c.points![drag.bend]!;
    if (!drag.moved || cur[0] !== pt[0] || cur[1] !== pt[1]) {
      c.points![drag.bend] = pt;
      drag.moved = true;
      render();
    }
  } else if (drag.mode === "wire") {
    const temp = $("#temp-wire");
    const start = isJunction(splitRef(drag.from)[0]) ? aim(drag.start, [w.x, w.y]) : drag.start;
    temp.setAttribute("points", route(start, { x: w.x, y: w.y }));
    temp.style.display = "";
    const over = portUnder(e);
    document.querySelectorAll(".port.target, .line.target").forEach((p) => p.classList.remove("target"));
    if (over && over !== drag.from) document.querySelector(`[data-port="${CSS.escape(over)}"]`)?.classList.add("target");
    else if (!over) lineUnder(e, drag.from)?.el.classList.add("target");
  }
});

svg.addEventListener("pointerleave", () => { if (!drag) pointerWorld = null; });

svg.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.mode === "group") {
    if (d.moved) commit(d.before);
    else if (d.clicked) select({ kind: "component", id: d.clicked });
    return;
  }
  if (d.mode === "marquee") {
    $("#marquee").style.display = "none";
    const w = toWorld(e);
    const x0 = Math.min(d.sx, w.x), x1 = Math.max(d.sx, w.x), y0 = Math.min(d.sy, w.y), y1 = Math.max(d.sy, w.y);
    const inside = doc.components.map((c) => c.id).filter((id) => {
      const l = layoutOf(id);
      return l.x >= x0 && l.x <= x1 && l.y >= y0 && l.y <= y1;
    });
    const ids = [...new Set([...d.add, ...inside])];
    select(ids.length > 1 ? { kind: "multi", ids } : ids.length ? { kind: "component", id: ids[0]! } : null);
    return;
  }
  if (d.mode === "move" || d.mode === "bend") {
    if (d.moved) commit(d.before);
    else if (d.mode === "bend" && d.bend >= 0) bendClicked(d.index, d.bend);
  } else if (d.mode === "pan") {
    if (!d.moved) select(null);
  } else if (d.mode === "wire") {
    $("#temp-wire").style.display = "none";
    document.querySelectorAll(".port.target, .line.target").forEach((p) => p.classList.remove("target"));
    const over = portUnder(e);
    const onLine = over ? null : lineUnder(e, d.from);
    if (over && over !== d.from) connect(d.from, over);
    else if (onLine) connectToLine(d.from, onLine.index, toWorld(e));
    else if (!over) {
      const [cid] = splitRef(d.from);
      if (selection?.kind !== "component" || selection.id !== cid) select({ kind: "component", id: cid });
    }
  }
});

/** Porta sotto il puntatore (anche il centro di un punto di connessione). */
function portUnder(e: { clientX: number; clientY: number }): string | null {
  const t = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>("[data-port], [data-port-target]");
  return t ? (t.dataset.port ?? t.dataset.portTarget ?? null) : null;
}

/** Linea sotto il puntatore, esclusa quella che parte già dalla porta `from`. */
function lineUnder(e: { clientX: number; clientY: number }, from?: string) {
  const t = document.elementFromPoint(e.clientX, e.clientY)?.closest<SVGElement>("[data-connection]");
  if (!t || t.dataset.bend !== undefined) return null;
  const index = Number(t.dataset.connection);
  const c = doc.connections[index];
  if (!c || (from && (c.from === from || c.to === from))) return null;
  return { index, el: t };
}

/**
 * Spezza la linea `index` con un nuovo punto di connessione nel punto più vicino a `w`.
 * Va chiamata dentro mutate(); restituisce la porta del nuovo punto.
 */
function splitLine(index: number, w: { x: number; y: number }): string | null {
  const c = doc.connections[index];
  const ends = c && connEnds(c);
  if (!c || !ends) return null;
  const { pts, bendAt } = routePoints(ends.a, ends.b, c.points);
  const seg = nearestSegment(pts, w.x, w.y);
  const [x1, y1] = pts[seg]!, [x2, y2] = pts[seg + 1]!;
  const clamp = (v: number, a: number, b: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), v));
  // sul tratto ortogonale si aggancia alla griglia lungo il tratto stesso
  const at: Pt = y1 === y2 ? [clamp(snap(w.x), x1, x2), y1] : x1 === x2 ? [x1, clamp(snap(w.y), y1, y2)] : [snap(w.x), snap(w.y)];
  const segLen = (i: number) => Math.abs(pts[i + 1]![0] - pts[i]![0]) + Math.abs(pts[i + 1]![1] - pts[i]![1]);
  let before = Math.abs(at[0] - x1) + Math.abs(at[1] - y1), total = 0;
  for (let i = 0; i + 1 < pts.length; i++) { total += segLen(i); if (i < seg) before += segLen(i); }
  const bendsBefore = bendAt.filter((k) => k <= seg).length;
  return splitConnection(doc, index, at, nextId(JUNCTION), bendsBefore, total ? before / total : 0.5);
}

/** Collega la porta `from` a una linea esistente, con un punto di connessione dove la si lascia. */
function connectToLine(from: string, index: number, w: { x: number; y: number }) {
  if (sim) return;
  mutate(() => {
    const ref = splitLine(index, w);
    if (ref) doc.connections.push(lastTube ? { from, to: ref, tube: { ...lastTube } } : { from, to: ref });
  });
  select({ kind: "connection", index: doc.connections.length - 1 });
}

/** Trascinamento di più componenti: posizioni di partenza e pieghe delle linee tra loro. */
function groupDrag(ids: string[], w: { x: number; y: number }, clicked?: string): Drag {
  const set = new Set(ids);
  const start: Record<string, [number, number]> = {};
  for (const id of ids) { const l = layoutOf(id); start[id] = [l.x, l.y]; }
  const points = new Map<number, Pt[]>();
  doc.connections.forEach((c, i) => {
    if (c.points && set.has(splitRef(c.from)[0]) && set.has(splitRef(c.to)[0])) points.set(i, c.points.map((p) => [...p] as Pt));
  });
  return { mode: "group", ids, sx: w.x, sy: w.y, start, points, before: snapshot(), moved: false, clicked };
}

// doppio clic su un punto di piega: lo toglie (la cattura del puntatore assorbe "dblclick")
let lastBendClick = { key: "", at: 0 };
function bendClicked(index: number, k: number) {
  const key = `${index}:${k}`, now = performance.now();
  const double = lastBendClick.key === key && now - lastBendClick.at < 450;
  lastBendClick = double ? { key: "", at: 0 } : { key, at: now };
  if (!double) return;
  mutate(() => {
    const c = doc.connections[index]!;
    c.points = (c.points ?? []).filter((_, i) => i !== k);
    if (!c.points.length) delete c.points;
  });
}

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
  if (!sim && (e.dataTransfer?.types.includes("application/x-pneutrack-type") ||
               e.dataTransfer?.types.includes("application/x-pneutrack-block"))) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
svg.addEventListener("drop", (e) => {
  const lib = e.dataTransfer?.getData("application/x-pneutrack-block");
  if (lib) { e.preventDefault(); insertLibraryBlock(Number(lib), toWorld(e)); return; }
  const data = e.dataTransfer?.getData("application/x-pneutrack-type");
  if (!data) return;
  e.preventDefault();
  const [type, preset] = data.split("|");
  const onLine = type === JUNCTION ? lineUnder(e) : null;
  if (onLine) {
    let id = "";
    mutate(() => { id = splitLine(onLine.index, toWorld(e))?.split(".")[0] ?? ""; });
    if (id) select({ kind: "component", id });
    return;
  }
  addComponent(type!, toWorld(e), Number(preset ?? -1));
});

// --- tastiera e barra strumenti ---------------------------------------------------------

document.addEventListener("keydown", (e) => {
  const typing = target(e).closest("input, select, textarea");
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && key === "s") { e.preventDefault(); saveProject({ asNew: e.shiftKey }); return; }
  if (e.key === "Escape" && !$("#projects-dialog").hidden) { closeProjects(); return; }
  if (e.key === "Escape" && !$("#news-dialog").hidden) { closeNews(); return; }
  if (typing) return;
  if (sim) {
    if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "Escape") stopSim();
    else if (key === "f" && !mod) fitView();
    return;
  }
  if (e.key === " ") { e.preventDefault(); spaceHeld = true; svg.classList.add("panning"); return; }
  if (mod && key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (key === "y" || (key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  else if (mod && key === "d") { e.preventDefault(); duplicateSelection(); }
  else if (mod && key === "g" && e.shiftKey) { e.preventDefault(); splitSelection(); }
  else if (mod && key === "g") { e.preventDefault(); mergeSelection(); }
  else if (mod && key === "a") {
    e.preventDefault();
    const ids = doc.components.map((c) => c.id);
    select(ids.length > 1 ? { kind: "multi", ids } : ids.length ? { kind: "component", id: ids[0]! } : null);
  }
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

/** PDF vettoriale del foglio (se non è scelto, il formato più piccolo che contiene il disegno). */
async function exportPdf() {
  if (!doc.components.length) { toast("Lo schema è vuoto: niente da esportare"); return; }
  const saved = { selection, sheet: doc.sheet, theme: document.documentElement.dataset.theme };
  let sheet = currentSheet();
  if (!sheet) {
    const box = contentBox()!;
    const orientation: Orientation = box.h > box.w ? "portrait" : "landscape";
    const format = smallestFormat(box, orientation);
    sheet = { format, orientation, origin: centeredOrigin({ format, orientation }, box) };
  }
  let svgOut: SVGSVGElement;
  // disegno pulito, in tema chiaro, senza selezione
  try {
    selection = null;
    doc.sheet = sheet;
    document.documentElement.dataset.theme = "light";
    render();
    svgOut = sheetSvg($("#viewport") as unknown as SVGGElement, sheetRect(sheet), sheetSizeMm(sheet));
  } finally {
    selection = saved.selection;
    doc.sheet = saved.sheet;
    if (saved.theme) document.documentElement.dataset.theme = saved.theme;
    else delete document.documentElement.dataset.theme;
    render();
  }
  try {
    toast("Preparo il PDF…");
    const blob = await svgToPdf(svgOut, sheetSizeMm(sheet), doc.name || "Schema");
    const name = fileName().replace(/\.pneu\.json$/, "") + ".pdf";
    const r = await exportFile(name, blob);
    if (r === "saved") toast(`Esportato ${name} (${sheet.format})`);
  } catch (err) {
    toast(`PDF non riuscito: ${(err as Error).message}`);
  }
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
    case "pdf": exportPdf(); break;
    case "undo": undo(); break;
    case "copy": copySelection(); break;
    case "cut": cutSelection(); break;
    case "paste": pasteClip(); break;
    case "redo": redo(); break;
    case "fit": fitView(); break;
    case "whats-new": openNews(); break;
    case "sim": if (sim) stopSim(); else startSim(); break;
    case "sim-play": togglePlay(); break;
    case "sim-reset": resetSim(); break;
  }
});

// --- versione dell'app e novità -------------------------------------------------
const VERSION_KEY = "pneutrack.version.v1"; // ultima versione di cui l'utente ha visto le novità

function openNews() {
  const body = $("#news-body");
  body.replaceChildren();
  for (const r of parseChangelog()) {
    const h = document.createElement("h3");
    h.textContent = `Versione ${r.version}` + (r.version === APP_VERSION ? " (in uso)" : "");
    const d = document.createElement("span");
    d.className = "news-date";
    d.textContent = r.date;
    h.append(" ", d);
    const ul = document.createElement("ul");
    for (const n of r.notes) {
      const li = document.createElement("li");
      li.textContent = n;
      ul.append(li);
    }
    body.append(h, ul);
  }
  $("#news-dialog").hidden = false;
  try { localStorage.setItem(VERSION_KEY, APP_VERSION); } catch { /* nessuna memoria */ }
}
function closeNews() { $("#news-dialog").hidden = true; }
$("#news-dialog").addEventListener("click", (e) => {
  if (target(e).id === "news-dialog" || target(e).closest("[data-nact=close]")) closeNews();
});
$("#app-version").textContent = `v${APP_VERSION}`;
// dopo un aggiornamento mostra le novità una volta; al primo avvio no
try {
  const seen = localStorage.getItem(VERSION_KEY);
  if (seen && seen !== APP_VERSION) openNews();
  else if (!seen) localStorage.setItem(VERSION_KEY, APP_VERSION);
} catch { /* nessuna memoria */ }

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
  renderLegend();
  renderViewFilter();
  applyView();
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
