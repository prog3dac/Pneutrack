// Editor di schemi pneumatici: stato, disegno SVG, interazioni e simulazione.
// Tutto gira nel browser: modello, validazione e solutore sono moduli TypeScript.
import {
  blockOf, extractFragment, insertFragment, mergeBlock, parseFragment, pruneBlocks, splitBlock, type Fragment,
} from "../model/blocks";
import { emptyCircuit, fileBaseName, type CircuitDoc, type ConnectionData } from "../model/circuit";
import {
  defaultPageName, duplicatePage, joinPages, mergedCircuit, newPageId, pageOfComponent, REFERENCE_TYPES,
  referenceTargets, referenceText, splitPages, type Page, type ReferenceTarget,
} from "../model/sheets";
import {
  aciOf, ANN_PRESETS, annBox, annFromPreset, annLabel, arrowHead, COLORS, contains, dashArray, DEFAULT_TEXT_SIZE,
  DEFAULT_WEIGHT, detachFrom, dxfLinetype, fontUnits, inside as insideBox, leaderTip, LINE_TYPES, moveAnn, nextAnnId,
  normalizeAnnotations, offsetPolyline, rotateBox, rotatePt, strokeUnits, TEXT_SIZES, WEIGHTS,
  type AnnotationData, type Box, type Pt as APt, type Terminal,
} from "../model/annotations";
import { mirrorComponents, type Axis } from "../model/mirror";
import { ALIGN_LABELS, alignComponents, type AlignMode } from "../model/align";
import { applyPart, partByCode, partsFor } from "../model/parts";
import { dissolveJunction, isJunctionType, JUNCTION, splitConnection, WIRE_JUNCTION } from "../model/junctions";
import {
  CYLINDER_SERIES, seriesOf, STANDARD_BORES, STANDARD_RODS, STANDARD_STROKES, toMm,
} from "../model/cylinders";
import {
  ACTUATION_SHORT, buildComponent, cylinderInfo, isCylinder, isElectric, isLatching, isManual, isManualDetent, isMechanical, isMomentary, isElectricType, typeList,
  type Actuation, type ComponentData, type ParamSpec, type TypeDef,
  paramApplies, upgradeComponent,
} from "../model/components";
import { parseTube, TUBE_SIZES, tubeConductance, tubeLabel, tubeVolume, type Tube, type TubeData } from "../model/tubes";
import { fmtG, Quantity, type Dimension } from "../model/units";
import { analyze, type Analysis } from "../model/validation";
import { compileSim, type Tunable, type TunableKind, type ValveSpec } from "../sim/network";
import { Simulator } from "../sim/simulator";
import { Recorder } from "../sim/recorder";
import { strokes, summarize } from "../sim/measures";
import { diagramHeight, fmt as fmtNum, renderDiagram, type DiagramMode } from "./diagram";
import { BAR, P_ATM } from "../solver/constants";
import { APP_VERSION, parseChangelog } from "./changelog";
import { MANUAL_PARTS, renderManual } from "./manual";
import { bomToPdf, sheetSvg, svgsToPdf } from "./pdf";
import { BOM_HEADERS, billOfMaterials, bomCells, bomCsv } from "../model/bom";
import { dxfBytes, sheetsToDxf } from "./dxf";
import {
  centeredOrigin, drawingArea, FRAME, SHEET_FORMATS, sheetRect, sheetSizeMm, smallestFormat, TITLE_BLOCK, UNITS_PER_MM,
  type Orientation, type Rect, type SheetData, type SheetFormat,
} from "../model/sheet";
import { exportFile, newProjectId, openStore, type ProjectSummary, type Store } from "./storage";
import { FIELD_HELP, optionHelp, paramHelp } from "./help";
import { geometry, rotate, thumbnail, type Dir, type SymbolState } from "./symbols";
import { openValveDialog } from "./valveDialog";
import { openCylinderDialog } from "./cylinderDialog";
import { CONFIGURABLE_CYLINDERS } from "../model/cylinderConfig";
import { sanitizeValve, valveTemplate } from "../model/valveConfig";
import { labelSpot } from "./labels";
import { initPwa } from "./pwa";
import { designationPrefix, paletteCategories, paletteItems } from "./palette";
import { EXIT, routePoints, simplifyPolyline, straightenBends, type PortPoint, type RouteEnd } from "../model/route";

const GRID = 10;
const SVGNS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "pneutrack.autosave.v1"; // bozza non ancora salvata come progetto
const SESSION_KEY = "pneutrack.session.v1"; // ultimo progetto aperto
const AUTOSAVE_MS = 1200;


/** componenti che mostrano la pressione della porta 1 accanto al simbolo, in simulazione */
const GAUGE_TYPES = new Set(["pressure_gauge", "air_reservoir", "pressure_sensor"]);
/** cilindri senza le misure ISO 15552 di alesaggio e stelo */
const NO_ISO_SIZES = new Set(["rodless_cylinder", "bellows_cylinder", "diaphragm_cylinder"]);

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
  /** `quiet`: linea appena disegnata, evidenziata ma senza aprire la colonna di destra */
  | { kind: "connection"; index: number; quiet?: boolean }
  /** più componenti (e annotazioni) scelti con Maiusc+clic o con un riquadro (trascinando sul vuoto) */
  | { kind: "multi"; ids: string[]; anns?: string[] }
  /** testo o forma disegnata sullo schema */
  | { kind: "annotation"; id: string }
  | { kind: "block"; id: string }
  | null;
type Doc = CircuitDoc;

// --- stato -------------------------------------------------------------------

const catalog: TypeDef[] = typeList();
/** fogli del progetto; `doc` è lo schema del foglio aperto (pages[active].doc) */
let pages: Page[] = [{ id: "F1", name: defaultPageName(1), doc: emptyCircuit() }];
let active = 0;
let doc: Doc = pages[0]!.doc;
let selection: Selection = null;
let analysis: Analysis = { ok: true, issues: [], ports: {}, pressures: {}, errors: 0, warnings: 0 };
let view = { x: 0, y: 0, k: 1 };
/** vista (spostamento e zoom) di ogni foglio, per ritrovarla tornandoci */
const pageViews = new Map<string, { x: number; y: number; k: number }>();
const history: { past: string[]; future: string[] } = { past: [], future: [] };

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const svg = $<SVGSVGElement>("#canvas");
const viewport = $<SVGGElement>("#viewport");
const target = (e: Event) => e.target as Element;

/** componente del foglio aperto */
const byId = (id: string) => doc.components.find((c) => c.id === id);
/** componenti di tutti i fogli (le sigle sono uniche in tutto il progetto) */
const allComponents = () => pages.flatMap((p) => p.doc.components);
const anyById = (id: string) => {
  for (const p of pages) { const c = p.doc.components.find((x) => x.id === id); if (c) return c; }
  return undefined;
};
function layoutOf(id: string) {
  doc.layout[id] ??= { x: 0, y: 0, rot: 0 };
  return doc.layout[id];
}
const catalogEntry = (type: string) => catalog.find((t) => t.type === type);

// --- storia (annulla / ripeti) -----------------------------------------------

/** stato per annulla/ripeti: tutti i fogli e il foglio aperto (per tornarci annullando) */
const snapshot = () => JSON.stringify({ active: pages[active]!.id, pages });
function restore(snap: string) {
  const st = JSON.parse(snap) as { active: string; pages: Page[] };
  const was = pages[active]?.id;
  pages = st.pages;
  active = Math.max(0, pages.findIndex((p) => p.id === st.active));
  doc = pages[active]!.doc;
  if (pages[active]!.id !== was) {
    // si torna al foglio della modifica, con la sua vista
    if (was) pageViews.set(was, { ...view });
    selection = null;
    const v = pageViews.get(pages[active]!.id);
    if (v) view = { ...v };
  }
}
/** lo stesso stato, ma con il foglio aperto adesso */
function onActivePage(snap: string) {
  const st = JSON.parse(snap) as { active: string; pages: Page[] };
  return JSON.stringify({ ...st, active: pages[active]!.id });
}
/** il file del progetto (tutti i fogli) */
const fileDoc = (): CircuitDoc => joinPages(doc.name, pages);
const fileJson = () => JSON.stringify(fileDoc());
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
  // con la finestra delle proprietà aperta le modifiche diventano un solo passo alla chiusura (OK)
  if (propsDlg) { fn(); changed(); return; }
  const before = snapshot();
  fn();
  commit(before);
}
function undo() {
  if (sim || !history.past.length) return;
  const cur = snapshot();
  restore(history.past.pop()!);
  history.future.push(onActivePage(cur)); // ripetendo si resta sul foglio della modifica
  fixSelection();
  changed();
}
function redo() {
  if (sim || !history.future.length) return;
  const cur = snapshot();
  restore(history.future.pop()!);
  history.past.push(onActivePage(cur));
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
  if (selection?.kind === "annotation" && !annById(selection.id)) selection = null;
  if (selection?.kind === "multi") {
    selection = selectionOf(selection.ids.filter((id) => byId(id)), (selection.anns ?? []).filter((id) => annById(id)));
  }
}

// --- annotazioni (testi e forme) ---------------------------------------------------
const annById = (id: string) => doc.annotations?.find((a) => a.id === id);
/** Annotazioni selezionate (una sola o quelle di una selezione multipla). */
function selectedAnns(): string[] {
  if (selection?.kind === "annotation") return [selection.id];
  if (selection?.kind === "multi") return selection.anns ?? [];
  return [];
}
/** Selezione per un insieme di componenti e annotazioni. */
function selectionOf(ids: string[], anns: string[] = []): Selection {
  if (ids.length + anns.length > 1) return { kind: "multi", ids, ...(anns.length ? { anns } : {}) };
  if (ids.length) return { kind: "component", id: ids[0]! };
  if (anns.length) return { kind: "annotation", id: anns[0]! };
  return null;
}
/** Centro di un componente, per i richiami agganciati. */
const compPos = (id: string): APt | null => { const l = byId(id) && doc.layout[id]; return l ? [l.x, l.y] : null; };
/** Ingombri misurati nell'ultimo disegno (il testo si misura solo nel browser). */
const annMeasured = new Map<string, Box>();
const annBoxOf = (a: AnnotationData): Box => annMeasured.get(a.id) ?? annBox(a, compPos);

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

function portWorld(compId: string, portName: string): PortPoint | null {
  const comp = byId(compId);
  if (!comp) return null;
  const p = geometry(comp).ports[portName];
  if (!p) return null;
  const l = layoutOf(compId);
  const m = l.mirror ? -1 : 1;
  const [rx, ry] = rotate([m * p.x, p.y], l.rot || 0);
  return { x: l.x + rx, y: l.y + ry, dir: rotate([m * p.dir[0], p.dir[1]], l.rot || 0) };
}

type Pt = [number, number];

const ptsAttr = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");
const route = (a: PortPoint, b: RouteEnd, bends?: Pt[]) =>
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

const isJunction = (id: string) => isJunctionType(byId(id)?.type);

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
  if (isJunction(ca)) a = aim(a, bends[0] ?? (isJunction(cb) ? [pb0.x, pb0.y] : [pb0.x + pb0.dir[0] * EXIT, pb0.y + pb0.dir[1] * EXIT]));
  if (isJunction(cb)) b = aim(b, bends[bends.length - 1] ?? (isJunction(ca) ? [pa0.x, pa0.y] : [pa0.x + pa0.dir[0] * EXIT, pa0.y + pa0.dir[1] * EXIT]));
  return { a, b };
}

/**
 * Raddrizza le pieghe di una linea (gradini lunghi al più `maxJog`, tratti allineati, pieghe
 * superflue). Restituisce true se la linea è cambiata.
 */
function straightenConnection(c: ConnectionData, maxJog = GRID): boolean {
  const old = c.points;
  if (!old?.length) return false;
  const ends = connEnds(c);
  if (!ends) return false;
  const next = straightenBends(ends.a, ends.b, old, maxJog);
  if (next.length === old.length && next.every((p, i) => p[0] === old[i]![0] && p[1] === old[i]![1])) return false;
  if (next.length) c.points = next; else delete c.points;
  // sui punti di connessione la direzione d'uscita dipende dalle pieghe: si controlla il disegno ottenuto
  const after = connEnds(c);
  const want = simplifyPolyline(routePoints(ends.a, ends.b, next).pts, 0);
  const got = after && simplifyPolyline(routePoints(after.a, after.b, next).pts, 0);
  if (!got || got.length !== want.length || got.some((p, i) => p[0] !== want[i]![0] || p[1] !== want[i]![1])) {
    c.points = old;
    return false;
  }
  return true;
}

/** Raddrizza le linee che toccano i componenti `ids` (tutte, senza `ids`). Restituisce quante ne ha cambiate. */
function straightenLines(ids?: Iterable<string>, maxJog = GRID): number {
  const set = ids ? new Set(ids) : null;
  let n = 0;
  for (const c of doc.connections) {
    if (set && !set.has(splitRef(c.from)[0]) && !set.has(splitRef(c.to)[0])) continue;
    if (straightenConnection(c, maxJog)) n++;
  }
  return n;
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

/** Gruppi con il manometro sul corpo: FRL e, con l'opzione, riduttore e filtro riduttore (leggono la porta 2). */
const hasIntegratedGauge = (comp: ComponentData) => comp.type === "frl_unit" ||
  ((comp.type === "pressure_regulator" || comp.type === "filter_regulator") && comp.gauge_fitted === "yes");
/** Fondo scala del manometro integrato [bar]: 10 bar, o il massimo del campo di regolazione se è più alto. */
function gaugeScale(comp: ComponentData): number {
  try {
    const max = comp.params?.setpoint_max ? Quantity.coerce(comp.params.setpoint_max).to("bar") : 0;
    return max > 10 ? 16 : 10;
  } catch { return 10; }
}

/** Stato grafico di un componente durante la simulazione. */
function symbolState(comp: ComponentData): SymbolState | undefined {
  if (comp.type === "directional_valve") {
    const coil = (side: string) => allComponents().find((c) => c.type === "valve_solenoid" && c.drives === `${comp.id}.${side}`)?.id;
    const coils = { coil14: coil("14"), coil12: coil("12") };
    if (!sim) return coils.coil14 || coils.coil12 ? coils : undefined;
    const spec = sim.s.net.valves.find((v) => v.id === comp.id);
    if (spec) {
      return { ...coils, position: sim.s.valvePosition(comp.id),
               active14: sim.s.sideActive(spec, "14"), active12: sim.s.sideActive(spec, "12"),
               override14: sim.s.override(comp.id, "14"), override12: sim.s.override(comp.id, "12") };
    }
  }
  if (!sim) return undefined;
  const s = sim.s;
  const el = s.electricState();
  if (el && isElectricType(comp.type)) {
    return { actuated: el.actuated.has(comp.id) || el.switched.has(comp.id), energized: el.energized.has(comp.id) };
  }
  const spec = s.net.valves.find((v) => v.id === comp.id);
  if (spec) {
    return { position: s.valvePosition(comp.id), active14: s.sideActive(spec, "14"), active12: s.sideActive(spec, "12") };
  }
  if (isCylinder(comp.type)) {
    const c = s.cylinder(comp.id);
    return c ? { stroke: c.fraction } : undefined;
  }
  if (hasIntegratedGauge(comp)) return { gauge: s.gauge(`${comp.id}.2`) / gaugeScale(comp) };
  if (comp.type === "pressure_indicator") {
    let t = 1;
    try { if (comp.params?.threshold) t = Quantity.coerce(comp.params.threshold).to("bar"); } catch { /* resta 1 bar */ }
    return { energized: s.gauge(`${comp.id}.1`) >= t };
  }
  return undefined;
}

function render() {
  viewport.setAttribute("transform", `translate(${view.x},${view.y}) scale(${view.k})`);
  $("#grid-pattern").setAttribute("patternTransform", `translate(${view.x},${view.y}) scale(${view.k})`);

  refTargets = referenceTargets(pages);
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

  const switchIds = new Set(manualSwitches().map((x) => x.id));
  // collegamenti
  doc.connections.forEach((c, index) => {
    const [ca, pa] = splitRef(c.from), [cb, pb] = splitRef(c.to);
    const ends = connEnds(c);
    if (!ends) return;
    const { a, b } = ends;
    const kinds = [portKind(ca, pa), portKind(cb, pb)];
    const pilot = kinds.includes("pilot");
    const wire = kinds.includes("electric");
    const liveWire = wire && sim?.s.electricState()?.potential[c.from] === "+";
    const exhaust = kinds.includes("exhaust"); // linea di scarico: sfoga in atmosfera
    const lf = livePressure(c.from), lt = livePressure(c.to);
    const live = lf === null || lt === null ? null : (lf + lt) / 2;
    const pr = analysis.pressures[c.from] || analysis.pressures[c.to];
    const bar = live !== null ? live : pr && !exhaust ? pr.bar : 0;
    const pressurized = bar > 0.2;
    const cls = ["line", pressurized ? `pressurized ${pressureBand(bar)}` : "", pilot ? "pilot" : "", exhaust ? "exhaust" : "", wire ? "wire" : "", liveWire ? "live" : "",
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
    const junction = isJunctionType(comp.type);
    const jp = junction ? (livePressure(`${comp.id}.1`) ?? analysis.pressures[`${comp.id}.1`]?.bar ?? 0) : 0;
    const cls = ["component", junction ? "junction" : "", jp > 0.2 ? `pressurized ${pressureBand(jp)}` : "",
      selectedIds().includes(comp.id) ? "selected" : "",
      sim && switchIds.has(comp.id) ? "switchable" : "",
      sim && tunablesOf(comp.id).length ? "tunable" : "", sim && tuneOpen === comp.id ? "tune-open" : "",
      iss.some((i) => i.severity === "error") ? "has-error" :
        iss.some((i) => i.severity === "warning") ? "has-warning" : ""].filter(Boolean).join(" ");
    const grp = el("g", {
      class: cls, "data-component": comp.id,
      transform: `translate(${l.x},${l.y}) rotate(${(l.rot || 0) * 90})${l.mirror ? " scale(-1,1)" : ""}`,
    });
    const pad = 6;
    grp.append(el("rect", { class: "halo", x: -g.w / 2 - pad, y: -g.h / 2 - pad,
                            width: g.w + 2 * pad, height: g.h + 2 * pad, rx: 6 }));
    const sym = el("g", { class: "symbol" }, g.svg);
    // nel simbolo specchiato le scritte restano leggibili: si specchiano di nuovo sul loro punto
    if (l.mirror) {
      sym.querySelectorAll("text").forEach((t) => {
        const x = Number(t.getAttribute("x") ?? 0);
        t.setAttribute("transform", `matrix(-1 0 0 1 ${2 * x} 0)`);
      });
    }
    grp.append(sym);
    comps.append(grp);

    // etichetta (non ruotata): sul lato senza porte, o dove l'utente l'ha trascinata
    const text = el("text", { class: l.label ? "label moved" : "label", "data-label-for": comp.id });
    if (!sim) text.append(svgTitle("Trascina per spostare il testo · doppio clic per rimetterlo al suo posto"));
    const parts: string[] = [];
    if (show.ids) parts.push(comp.id);
    if (show.desc && comp.label) parts.push(comp.label);
    if (show.values) {
      const cyl = sim?.s.cylinder(comp.id);
      if (cyl) parts.push(`${(cyl.x * 1000).toFixed(0)} mm`);
      if (sim && GAUGE_TYPES.has(comp.type)) parts.push(fmtBar(sim.s.gauge(`${comp.id}.1`)));
      if (sim && hasIntegratedGauge(comp)) parts.push(fmtBar(sim.s.gauge(`${comp.id}.2`)));
      if (sim && comp.type === "differential_gauge") {
        parts.push(`Δ ${fmtBar(sim.s.gauge(`${comp.id}.1`) - sim.s.gauge(`${comp.id}.2`))}`);
      }
      const left = sim?.s.delayRemaining(comp.id) ?? sim?.s.electric?.remaining(comp.id, sim.s.t);
      if (left != null && left > 0) parts.push(`${left.toFixed(1).replace(".", ",")} s`);
    }
    text.textContent = parts.join(" · ");
    // i punti di connessione mostrano solo la descrizione, se c'è
    if (junction && !(show.desc && comp.label)) parts.length = 0;
    else if (junction) text.textContent = comp.label!;
    // rimando: in coda all'etichetta i fogli dove prosegue (fai clic per andarci)
    const targets = REFERENCE_TYPES[comp.type] ? refTargets.get(comp.id) : undefined;
    const xr = targets ? referenceText(targets, active) : "";
    if (xr) {
      const t = el("tspan", { class: "xref", "data-goto": comp.id });
      t.textContent = xr;
      const where = targets!.filter((x) => x.page !== active)
        .map((x) => `foglio ${x.page + 1} «${pages[x.page]!.name}» (${x.id})`).join(", ");
      text.dataset.xref = `Prosegue su ${where}`;
      if (parts.length) text.append(" ");
      text.append(t);
    }
    const spot = labelSpot(g, l, text.textContent ?? "");
    text.setAttribute("x", String(l.x + spot.dx));
    text.setAttribute("y", String(l.y + spot.dy));
    text.setAttribute("style", `text-anchor: ${spot.anchor}`);
    if (parts.length || xr) labels.append(text);

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
      // numero della bocca accanto al tratto tra simbolo e porta, dove non arriva la linea collegata:
      // porte verticali a destra del tratto, orizzontali sopra
      const vertical = pw.dir[0] === 0;
      const lx = vertical ? 3.5 : pw.dir[0] * -5;
      const ly = vertical ? pw.dir[1] * -5 + 3 : -4;
      const t = el("text", { x: lx, y: ly, class: "port-label", style: `text-anchor: ${vertical ? "start" : "middle"}` });
      t.textContent = name;
      pg.append(t);
      const live = livePressure(ref);
      const pr = analysis.pressures[ref];
      pg.append(svgTitle(`${ref} · ${live !== null ? fmtBar(live) : pr ? pr.text : "0 bar"}`));
      ports.append(pg);
    }
  }
  renderBlocks();
  renderAnnotations();
  renderStatus();
  renderTabs();
  positionSelbar();
  positionTunePop();
  $("#zoom-level").textContent = `${Math.round(view.k * 100)}%`;
}

/** Barra mobile sopra la selezione: ruota, specchia, duplica, elimina. */
function positionSelbar() {
  const bar = $("#selbar");
  const ids = sim ? [] : selectedIds().filter((id) => byId(id));
  const anns = sim ? [] : selectedAnns().map(annById).filter((a): a is AnnotationData => !!a);
  if (!ids.length && !anns.length) { bar.hidden = true; return; }
  const boxes = [...ids.map(compBox), ...anns.map(annBoxOf)];
  const x0 = Math.min(...boxes.map((r) => r.x)), x1 = Math.max(...boxes.map((r) => r.x + r.w));
  const y0 = Math.min(...boxes.map((r) => r.y)), y1 = Math.max(...boxes.map((r) => r.y + r.h));
  const stage = $("#stage").getBoundingClientRect();
  // selezione fuori dalla vista: niente barra
  if (x1 * view.k + view.x < 0 || x0 * view.k + view.x > stage.width ||
      y1 * view.k + view.y < 0 || y0 * view.k + view.y > stage.height) { bar.hidden = true; return; }
  bar.hidden = false;
  const one = selection?.kind === "annotation" ? annById(selection.id) : undefined;
  $<HTMLButtonElement>('#selbar [data-act="rotate"]').disabled = selection?.kind !== "component" && one?.kind !== "text";
  for (const b of document.querySelectorAll<HTMLButtonElement>('#selbar [data-act^="mirror"]')) b.disabled = !ids.length;
  $<HTMLElement>('#selbar [data-act="props"]').hidden = selection?.kind !== "component";
  const w = bar.offsetWidth, h = bar.offsetHeight;
  const cx = ((x0 + x1) / 2) * view.k + view.x;
  let top = y0 * view.k + view.y - h - 10;
  if (top < 8) top = y1 * view.k + view.y + 10;
  bar.style.left = `${Math.max(8, Math.min(stage.width - w - 8, cx - w / 2))}px`;
  bar.style.top = `${Math.max(8, Math.min(stage.height - h - 8, top))}px`;
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

const ANN_PAD = 4;
/** Percorso di un rettangolo con gli angoli arrotondati (archi, che il DXF spezza in segmenti). */
function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h}` +
    ` H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
}

/** Testi e forme: le forme sotto le linee, i testi sopra ai simboli; maniglie della selezione in cima. */
function renderAnnotations() {
  const under = $("#annotations"), over = $("#annotations-top"), handles = $("#ann-handles");
  under.replaceChildren(); over.replaceChildren(); handles.replaceChildren();
  annMeasured.clear();
  const sel = new Set(sim ? [] : selectedAnns());
  for (const a of doc.annotations ?? []) {
    const g = el("g", { class: ["ann", sel.has(a.id) ? "selected" : "", a.locked ? "locked" : ""].filter(Boolean).join(" "), "data-ann": a.id });
    const color = a.color ?? "var(--ink)";
    const sw = strokeUnits(a);
    const lt = dxfLinetype(a.line), aci = aciOf(a.color);
    if (lt) g.dataset.dxfLtype = lt;
    if (aci) g.dataset.dxfColor = String(aci);
    g.dataset.dxfWidth = String(a.weight ?? DEFAULT_WEIGHT);
    (a.kind === "text" ? over : under).append(g);
    const fillCss = a.fill === "tint" ? `fill:${color};fill-opacity:.12` : a.fill === "white" ? "fill:var(--sheet)" : "fill:none";
    /** tratto dell'annotazione; `dash` false per le punte, che restano piene */
    const paint = (e: Element, fill = "fill:none", dash = true) => {
      const d = dash ? dashArray(a.line) : "";
      e.setAttribute("style", `stroke:${color};stroke-width:${sw};${fill}${d ? `;stroke-dasharray:${d}` : ""}`);
      return e;
    };
    /** copia invisibile e più larga del tratto, per prenderlo con il mouse */
    const hit = (e: Element) => { const c = e.cloneNode() as Element; c.removeAttribute("style"); c.setAttribute("class", "ann-hit"); g.append(c); };
    const terminal = (kind: Terminal | undefined, from: APt, tip: APt) => {
      if (!kind || kind === "none") return;
      if (kind === "dot") { g.append(paint(el("circle", { cx: tip[0], cy: tip[1], r: Math.max(3, sw * 1.6) }), `fill:${color}`, false)); return; }
      const len = kind === "open" ? Math.max(12, sw * 6) : Math.max(10, sw * 5);
      const head = arrowHead(from, tip, len, len * (kind === "open" ? 0.45 : 0.32));
      g.append(paint(el("polygon", { points: ptsAttr(head) }), kind === "open" ? "fill:var(--sheet)" : `fill:${color}`, false));
    };
    if (a.kind === "rect" || a.kind === "ellipse") {
      const shape = a.kind === "ellipse"
        ? el("ellipse", { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2 })
        : a.round ? el("path", { d: roundRectPath(a.x, a.y, a.w, a.h, Math.min(14, a.w / 4, a.h / 4)) })
        : el("rect", { x: a.x, y: a.y, width: a.w, height: a.h });
      g.append(paint(shape, fillCss));
      if (a.fill && a.fill !== "none") shape.classList.add("ann-fill");
      hit(shape);
      if (a.kind === "rect" && a.title) {
        const fs = fontUnits(DEFAULT_TEXT_SIZE), pos = a.titlePos ?? "tl";
        const right = pos.endsWith("r"), bottom = pos.startsWith("b");
        const t = el("text", { x: right ? a.x + a.w - 8 : a.x + 8, y: bottom ? a.y + a.h - 8 : a.y + fs + 4, class: "ann-text" });
        t.setAttribute("style", `fill:${color};font-size:${fs}px;font-weight:600;text-anchor:${right ? "end" : "start"}`);
        t.textContent = a.title;
        g.append(t);
      }
      annMeasured.set(a.id, { x: a.x, y: a.y, w: a.w, h: a.h });
    } else if (a.kind === "line") {
      const pts = a.points;
      if (a.line === "double") {
        const gap = Math.max(2.5, sw * 1.8);
        for (const d of [gap, -gap]) g.append(paint(el("polyline", { points: ptsAttr(offsetPolyline(pts, d)) })));
      } else g.append(paint(el("polyline", { points: ptsAttr(pts) })));
      hit(el("polyline", { points: ptsAttr(pts) }));
      terminal(a.start, pts[1]!, pts[0]!);
      terminal(a.end, pts[pts.length - 2]!, pts[pts.length - 1]!);
    } else {
      const fs = fontUnits(a.size ?? DEFAULT_TEXT_SIZE);
      const rot = a.rot ?? 0;
      const inner = el("g", rot ? { transform: `rotate(${-90 * rot} ${a.x} ${a.y})` } : {});
      g.append(inner);
      const anchor = a.align === "center" ? "middle" : a.align === "right" ? "end" : "start";
      a.text.split("\n").forEach((line, i) => {
        const t = el("text", { x: a.x, y: a.y + i * fs * 1.25, class: "ann-text" });
        t.setAttribute("style", `fill:${color};font-size:${fs}px;text-anchor:${anchor};font-weight:${a.bold ? 700 : 400}` +
          (a.italic ? ";font-style:italic" : ""));
        t.textContent = line || "\u00a0";
        inner.append(t);
      });
      let bb: Box;
      try { const r = (inner as SVGGraphicsElement).getBBox(); bb = { x: r.x, y: r.y, w: r.width, h: r.height }; } catch { bb = { x: a.x, y: a.y - fs, w: fs, h: fs }; }
      if (!bb.w) bb = { x: a.x, y: a.y - fs * 0.8, w: fs * 0.6, h: fs };
      const pad = fs * 0.3;
      let frame: Box = { x: bb.x - pad, y: bb.y - pad * 0.5, w: bb.w + 2 * pad, h: bb.h + pad };
      if (a.box === "rect" || a.box === "round") {
        const shape = a.box === "round" ? el("path", { d: roundRectPath(frame.x, frame.y, frame.w, frame.h, frame.h / 3) })
          : el("rect", { x: frame.x, y: frame.y, width: frame.w, height: frame.h });
        inner.prepend(paint(shape, fillCss));
      } else if (a.box === "triangle") {
        const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, s = Math.max(bb.w, bb.h) + pad;
        const tri: APt[] = [[cx, cy - s * 1.05], [cx + s * 0.95, cy + s * 0.6], [cx - s * 0.95, cy + s * 0.6]];
        inner.prepend(paint(el("polygon", { points: ptsAttr(tri) }), fillCss));
        frame = { x: cx - s * 0.95, y: cy - s * 1.05, w: s * 1.9, h: s * 1.65 };
      }
      inner.append(el("rect", { x: frame.x, y: frame.y, width: frame.w, height: frame.h, class: "ann-hit-area" }));
      const box = rotateBox(frame, a.x, a.y, rot);
      const tip = leaderTip(a, compPos);
      if (tip && a.leader) {
        // il richiamo parte dal lato del riquadro più vicino alla punta
        const sides: APt[] = [[frame.x, frame.y + frame.h / 2], [frame.x + frame.w, frame.y + frame.h / 2],
          [frame.x + frame.w / 2, frame.y], [frame.x + frame.w / 2, frame.y + frame.h]].map((p) => rotatePt(p as APt, a.x, a.y, rot));
        const start = sides.reduce((b, p) => (Math.hypot(p[0] - tip[0], p[1] - tip[1]) < Math.hypot(b[0] - tip[0], b[1] - tip[1]) ? p : b));
        const leader = el("polyline", { points: ptsAttr([start, tip]) });
        g.append(paint(leader));
        hit(leader);
        terminal(a.leader.end ?? "arrow", start, tip);
        const x0 = Math.min(box.x, tip[0]), y0 = Math.min(box.y, tip[1]);
        annMeasured.set(a.id, { x: x0, y: y0, w: Math.max(box.x + box.w, tip[0]) - x0, h: Math.max(box.y + box.h, tip[1]) - y0 });
      } else annMeasured.set(a.id, box);
      if (sel.has(a.id)) handles.append(el("rect", { x: box.x - ANN_PAD, y: box.y - ANN_PAD, width: box.w + 2 * ANN_PAD,
                                                     height: box.h + 2 * ANN_PAD, class: "ann-sel" }));
    }
    if (a.kind === "line") annMeasured.set(a.id, annBox(a));
    if (sel.has(a.id) && a.kind !== "text" && (a.kind !== "line" || selection?.kind === "multi")) {
      const b = annMeasured.get(a.id)!;
      handles.append(el("rect", { x: b.x - ANN_PAD, y: b.y - ANN_PAD, width: b.w + 2 * ANN_PAD,
                                  height: b.h + 2 * ANN_PAD, class: "ann-sel" }));
    }
  }
  // maniglie dell'annotazione selezionata da sola
  const one = !sim && selection?.kind === "annotation" ? annById(selection.id) : undefined;
  if (!one || one.locked) return;
  const handle = (x: number, y: number, name: string, tip: string, cls = "ann-handle") => {
    const h = el(name.startsWith("v") || name.startsWith("m") || name === "leader" ? "circle" : "rect",
      name.startsWith("v") || name.startsWith("m") || name === "leader"
        ? { cx: x, cy: y, r: name.startsWith("m") ? 3.5 : 5, class: cls, "data-ann-handle": name }
        : { x: x - 4.5, y: y - 4.5, width: 9, height: 9, rx: 1.5, class: cls, "data-ann-handle": name });
    h.append(svgTitle(tip));
    handles.append(h);
  };
  if (one.kind === "rect" || one.kind === "ellipse") {
    const { x, y, w, h } = one;
    for (const [n, hx, hy] of [["nw", 0, 0], ["n", .5, 0], ["ne", 1, 0], ["w", 0, .5], ["e", 1, .5], ["sw", 0, 1], ["s", .5, 1], ["se", 1, 1]] as const) {
      handle(x + w * hx, y + h * hy, n, "Trascina per ridimensionare");
    }
  } else if (one.kind === "line") {
    one.points.forEach(([x, y], i) => handle(x, y, `v${i}`, one.points.length > 2 ? "Trascina per spostare il punto · doppio clic per toglierlo" : "Trascina per spostare il punto"));
    for (let i = 0; i + 1 < one.points.length; i++) {
      const [x1, y1] = one.points[i]!, [x2, y2] = one.points[i + 1]!;
      handle((x1 + x2) / 2, (y1 + y2) / 2, `m${i}`, "Trascina per aggiungere un punto", "ann-handle mid");
    }
  } else if (one.kind === "text" && one.leader) {
    const tip = leaderTip(one, compPos)!;
    handle(tip[0], tip[1], "leader", one.leader.attach ? `Agganciato a ${one.leader.attach} · trascina per spostare o sganciare`
      : "Trascina sulla punta di un componente per agganciarla");
  }
}

// --- pannelli ------------------------------------------------------------------

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
    ${swatch("lg-exhaust", "scarico")}${swatch("lg-pilot", "pilotaggio")}${swatch("lg-wire", "filo elettrico")}${sim?.s.electric ? swatch("lg-live", "filo sotto tensione") : ""}${swatch("lg-selected", "linea selezionata")}</ul></details>`;
  box.querySelector("details")!.addEventListener("toggle", (e) => {
    try { localStorage.setItem(LEGEND_KEY, (e.target as HTMLDetailsElement).open ? "open" : "closed"); } catch { /* */ }
  });
}

// --- foglio e cartiglio -----------------------------------------------------------
const today = () => new Date().toLocaleDateString("it-IT");
const clipText = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/** Disegna foglio, cornice e cartiglio nel gruppo #sheet (sotto a linee e componenti). */
function renderSheet() {
  const g = $("#sheet");
  g.replaceChildren();
  const sheet = currentSheet();
  if (!sheet) return;
  const u = UNITS_PER_MM;
  const r = sheetRect(sheet);
  g.append(el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, class: "paper" }));
  g.append(el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, class: "paper-grid", fill: "url(#grid-pattern-sheet)" }));
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
  if (pages.length > 1 || pages[0]!.name !== defaultPageName(1)) {
    // più fogli: accanto al titolo il numero e il nome del foglio
    const ws = 60 * u;
    cells.push([tx, ty, tw - ws, "Titolo", doc.name || "Senza nome"],
               [tx + tw - ws, ty, ws, `Foglio ${active + 1} di ${pages.length}`, clipText(pages[active]!.name, 20)]);
  } else cells.push([tx, ty, tw, "Titolo", doc.name || "Senza nome"]);
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
  if (sheet.bom) renderSheetBom(g, tx, ty);
}

/** Distinta sopra il cartiglio (ISO 7573): intestazione in basso, posizioni crescenti verso l'alto. */
function renderSheetBom(g: Element, tx: number, ty: number) {
  const u = UNITS_PER_MM, rh = 6 * u, pad = 1.5 * u, charW = 4.5;
  const cols: [number, number][] = [[10, 0], [30, 1], [85, 2], [45, 4], [10, 5]]; // mm, colonna di bomCells
  const fit = (t: string, w: number) => {
    const n = Math.floor((w - 2 * pad) / charW);
    return t.length > n ? t.slice(0, Math.max(1, n - 1)) + "…" : t;
  };
  const rowAt = (cells: string[], y: number, head: boolean) => {
    let x = tx;
    for (const [mm, i] of cols) {
      const w = mm * u;
      g.append(el("rect", { x, y, width: w, height: rh, class: "cell" }));
      const num = i === 0 || i === 5;
      const t = el("text", { x: num ? x + w - pad : x + pad, y: y + rh - 2 * u, class: head ? "bom-head" : "bom-text",
                             "text-anchor": num ? "end" : "start" });
      t.textContent = fit(cells[i] ?? "", w);
      g.append(t);
      x += w;
    }
  };
  const rows = billOfMaterials(doc);
  let y = ty - rh;
  rowAt(BOM_HEADERS, y, true);
  for (const r of rows) {
    y -= rh;
    const cells = bomCells(r);
    if (r.data) cells[2] = `${r.description} · ${r.data}`;
    rowAt(cells, y, false);
  }
}

/**
 * Rimando: nomi già usati (da scegliere nella descrizione) e rimandi compagni, con il foglio
 * dove si trovano e il collegamento per andarci.
 */
function referenceFields(comp: ComponentData, labIn: HTMLInputElement): HTMLElement[] {
  const domain = REFERENCE_TYPES[comp.type];
  const names = [...new Set(allComponents().filter((c) => REFERENCE_TYPES[c.type] === domain && c.id !== comp.id)
    .map((c) => (c.label ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it", { numeric: true }));
  const out: HTMLElement[] = [];
  const list = document.createElement("datalist");
  list.id = "reference-names";
  for (const n of names) { const o = document.createElement("option"); o.value = n; list.append(o); }
  labIn.setAttribute("list", list.id);
  labIn.placeholder = "nome del rimando, uguale sugli altri fogli";
  out.push(list);
  const targets = referenceTargets(pages).get(comp.id) ?? [];
  const box = document.createElement("div");
  if (!comp.label?.trim()) {
    box.className = "help";
    box.textContent = "Scrivi nella descrizione il nome del rimando: si collega ai rimandi con lo stesso nome, su questo o su altri fogli.";
  } else if (!targets.length) {
    box.className = "help";
    box.textContent = `Nessun altro rimando «${comp.label.trim()}»: aggiungine uno con lo stesso nome sul foglio dove prosegue la linea.`;
  } else {
    const h = document.createElement("h4");
    h.textContent = "Prosegue su";
    const ul = document.createElement("ul");
    ul.className = "sheet-xrefs";
    for (const t of targets) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.className = "link";
      b.textContent = `${t.id} · foglio ${t.page + 1} «${pages[t.page]!.name}»${t.page === active ? " (questo foglio)" : ""}`;
      b.addEventListener("click", () => revealComponent(t.id));
      li.append(b);
      ul.append(li);
    }
    box.append(h, ul);
  }
  out.push(box);
  return out;
}

/** Sezione "Foglio" nel pannello dello schema. */
function renderSheetFields(panel: HTMLElement) {
  heading(panel, pages.length > 1 ? `Foglio ${active + 1} di ${pages.length}` : "Foglio");
  const pageName = document.createElement("input");
  pageName.name = "page-name"; pageName.value = pages[active]!.name;
  pageName.addEventListener("change", () => renamePage(active, pageName.value));
  panel.append(field("Nome del foglio", pageName, FIELD_HELP["page-name"]));
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
  const bomOn = document.createElement("input");
  bomOn.type = "checkbox"; bomOn.name = "sheet-bom"; bomOn.checked = !!doc.sheet.bom;
  bomOn.addEventListener("change", () => mutate(() => { if (bomOn.checked) doc.sheet!.bom = true; else delete doc.sheet!.bom; }));
  panel.append(field("Distinta sul foglio", bomOn, FIELD_HELP["sheet-bom"]));
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
  for (const menu of document.querySelectorAll<HTMLDetailsElement>("details.menu[open]")) {
    if (!menu.contains(e.target as Node)) menu.open = false;
  }
  const issues = $("#issues-panel");
  if (!issues.hidden && !issues.contains(e.target as Node) && !$("#status").contains(e.target as Node)) showIssues(false);
});
// un menu aperto chiude gli altri
for (const menu of document.querySelectorAll<HTMLDetailsElement>("details.menu")) {
  menu.addEventListener("toggle", () => {
    if (menu.open) for (const m of document.querySelectorAll<HTMLDetailsElement>("details.menu[open]")) if (m !== menu) m.open = false;
  });
}
function closePopups() {
  for (const m of document.querySelectorAll<HTMLDetailsElement>("details.menu[open]")) m.open = false;
  showIssues(false);
}
/** Elenco dei problemi, aperto dal bollino di validazione nella barra in alto. */
function showIssues(open: boolean) {
  $("#issues-panel").hidden = !open;
  $("#status").setAttribute("aria-expanded", String(open));
}
$("#issues-panel").addEventListener("click", (e) => {
  if (target(e).closest("[data-iact=close]")) showIssues(false);
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
  const items = paletteItems(catalog);
  const groups: HTMLDetailsElement[] = [];
  for (const cat of paletteCategories(catalog)) {
    const det = document.createElement("details");
    det.className = "palette-group";
    det.dataset.cat = cat;
    det.open = !closed.includes(cat);
    const sum = document.createElement("summary");
    sum.textContent = cat;
    const grid = document.createElement("div");
    grid.className = "palette-grid";
    det.append(sum, grid);
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
      grid.append(b);
    }
    groups.push(det);
    pal.append(det);
  }
  // testi e forme
  for (const cat of [...new Set(ANN_PRESETS.map((p) => p.group))]) {
    const det = document.createElement("details");
    det.className = "palette-group ann-group";
    det.dataset.cat = cat;
    det.open = !closed.includes(cat);
    const sum = document.createElement("summary");
    sum.textContent = cat;
    const grid = document.createElement("div");
    grid.className = "palette-grid";
    det.append(sum, grid);
    det.addEventListener("toggle", () => {
      if (search.value) return;
      const now = groups.filter((g) => !g.open).map((g) => g.dataset.cat!);
      try { localStorage.setItem(PALETTE_KEY, JSON.stringify(now)); } catch { /* non disponibile */ }
    });
    for (const p of ANN_PRESETS.filter((x) => x.group === cat)) {
      const b = document.createElement("button");
      b.className = "palette-item";
      b.draggable = true;
      b.dataset.annotation = p.key;
      b.dataset.search = `${p.label} ${p.doc} annotazione testo forma`.toLowerCase();
      b.title = p.doc;
      b.innerHTML = `<svg viewBox="-22 -22 44 44" width="44" height="44" class="ann-thumb" aria-hidden="true">${p.icon}</svg><span></span>`;
      b.querySelector("span")!.textContent = p.label;
      b.addEventListener("click", () => addAnnotation(p.key, viewCenter()));
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer!.setData("application/x-pneutrack-annotation", p.key);
        e.dataTransfer!.effectAllowed = "copy";
      });
      grid.append(b);
    }
    groups.push(det);
    pal.append(det);
  }
  // valvole del configuratore salvate nel browser
  {
    const valves = valveLibrary();
    const det = document.createElement("details");
    det.className = "palette-group";
    const cat = "Le mie valvole";
    det.dataset.cat = cat;
    det.open = !closed.includes(cat);
    const sum = document.createElement("summary");
    sum.textContent = `${cat} (${valves.length})`;
    const grid = document.createElement("div");
    grid.className = "palette-grid";
    det.append(sum, grid);
    det.addEventListener("toggle", () => {
      if (search.value) return;
      const now = groups.filter((g) => !g.open).map((g) => g.dataset.cat!);
      try { localStorage.setItem(PALETTE_KEY, JSON.stringify(now)); } catch { /* non disponibile */ }
    });
    const add = document.createElement("button");
    add.className = "palette-item";
    add.dataset.search = "nuova valvola configuratore personalizzata distributrice";
    add.title = "Configura una valvola distributrice: vie, caselle, comandi, posizione iniziale e segnale dominante";
    add.innerHTML = `<svg class="thumb" viewBox="0 0 40 30" aria-hidden="true"><rect x="5" y="8" width="14" height="14" fill="none"
      stroke="currentColor"/><rect x="19" y="8" width="14" height="14" fill="none" stroke="currentColor"/>
      <path d="M26 2v8M22 6h8" stroke="currentColor" stroke-width="2"/></svg><span>Nuova valvola…</span>`;
    add.addEventListener("click", newConfiguredValve);
    grid.append(add);
    valves.forEach((v, i) => {
      const data: ComponentData = { ...v.data, id: "", type: "directional_valve" };
      const b = document.createElement("button");
      b.className = "palette-item library-item";
      b.draggable = true;
      b.dataset.search = `${v.name} valvola mia personalizzata`.toLowerCase();
      b.title = `${v.name}\nClic: inserisci · trascina nel foglio`;
      b.innerHTML = `${thumbnail(data)}<span></span>`;
      b.querySelector("span")!.textContent = v.name;
      b.addEventListener("click", (e) => {
        if ((e.target as Element).closest(".remove")) return;
        insertValve(v.data, viewCenter());
      });
      b.addEventListener("dragstart", (e) => {
        e.dataTransfer!.setData("application/x-pneutrack-valve", String(i));
        e.dataTransfer!.effectAllowed = "copy";
      });
      const rm = document.createElement("span");
      rm.className = "remove"; rm.textContent = "×"; rm.title = "Togli da «Le mie valvole»"; rm.setAttribute("role", "button");
      rm.addEventListener("click", (e) => { e.stopPropagation(); removeValveFromLibrary(i); });
      b.append(rm);
      grid.append(b);
    });
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
    const grid = document.createElement("div");
    grid.className = "palette-grid";
    det.append(sum, grid);
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
      grid.append(b);
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
function heading(panel: HTMLElement, text: string, level: "h2" | "h3" | "h4" = "h3") {
  const h = document.createElement(level);
  h.textContent = text;
  panel.append(h);
  return h;
}

/** «· foglio 2» per un componente che non è sul foglio aperto. */
function elsewhere(id: string) {
  const i = pageOfComponent(pages, id);
  return i >= 0 && i !== active ? ` · foglio ${i + 1}` : "";
}

function camField(comp: ComponentData, side: "14" | "12") {
  const key = `cam_${side}` as const;
  const sel = document.createElement("select");
  sel.name = key;
  const choices: [string, string][] = [["", "a mano (clic in simulazione)"]];
  const main = (comp[`actuation_${side}`] ?? "mechanical") as Actuation;
  const what = ACTUATION_SHORT[isMechanical(main) ? main : (comp[`aux_${side}`] ?? "mechanical") as Actuation];
  for (const c of allComponents().filter((x) => x.type.endsWith("_cylinder"))) {
    choices.push([`${c.id}+`, `${c.id} tutto fuori (${c.id}+)${elsewhere(c.id)}`], [`${c.id}-`, `${c.id} tutto dentro (${c.id}-)${elsewhere(c.id)}`]);
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

/** Riassunto delle scelte del configuratore e pulsante che lo apre. */
function valveConfigButton(comp: ComponentData) {
  const box = document.createElement("div");
  box.className = "valve-config";
  const notes: string[] = [];
  if (comp.boxes) notes.push(`caselle personalizzate: ${comp.boxes}`);
  for (const side of ["14", "12"] as const) {
    const aux = comp[`aux_${side}`];
    if (aux) notes.push(`secondo comando ${side}: ${ACTUATION_SHORT[aux as Actuation] ?? aux}`);
  }
  if (comp.initial) notes.push(`parte nella casella ${comp.initial}`);
  if (comp.dominant) notes.push(`segnale dominante ${comp.dominant}`);
  if (notes.length) {
    const p = document.createElement("p");
    p.className = "help";
    p.textContent = notes.join(" · ");
    box.append(p);
  }
  box.append(button("Configura valvola…", () => configureValve(comp.id),
    "Vie e caselle, due comandi per lato, posizione iniziale, segnale dominante e portata, con l'anteprima del simbolo",
    "", "wide"));
  return box;
}

/** Apre il configuratore sulla valvola: le scelte si applicano in un solo passo annullabile. */
function configureValve(id: string) {
  const comp = byId(id);
  if (!comp || sim) return;
  openValveDialog({
    title: `Configura valvola ${id}`, comp: structuredClone(comp), applyLabel: "Applica",
    onApply: (data, saveAs) => {
      mutate(() => {
        const c = byId(id);
        if (!c) return;
        for (const k of Object.keys(c) as (keyof ComponentData)[]) delete c[k];
        Object.assign(c, data);
        pruneConnections(id);
      });
      if (saveAs) saveValveToLibrary(saveAs, data);
    },
  });
}

/** Pulsante del configuratore dei cilindri, con il profilo di forza se c'è. */
function cylinderConfigButton(comp: ComponentData) {
  const box = document.createElement("div");
  box.className = "valve-config";
  if (comp.load_profile) {
    const p = document.createElement("p");
    p.className = "help";
    p.textContent = `profilo di forza: ${comp.load_profile}`;
    box.append(p);
  }
  box.append(button("Configura cilindro…", () => configureCylinder(comp.id),
    "Tipo (semplice effetto in spinta o trazione, doppio effetto, stelo passante, senza stelo), molla, ammortizzo, misure e profilo di forza",
    "", "wide"));
  return box;
}

/** Apre il configuratore sul cilindro: anche il cambio di tipo è un solo passo annullabile. */
function configureCylinder(id: string) {
  const comp = byId(id);
  if (!comp || sim) return;
  openCylinderDialog({
    comp: structuredClone(comp),
    onApply: (data) => {
      mutate(() => {
        const c = byId(id);
        if (!c) return;
        for (const k of Object.keys(c) as (keyof ComponentData)[]) delete c[k];
        Object.assign(c, data);
        pruneConnections(id);
      });
    },
  });
}

/** Nuova valvola dal configuratore, inserita al centro della vista. */
function newConfiguredValve() {
  if (sim) return;
  const meta = catalogEntry("directional_valve");
  const draft: ComponentData = { id: "", type: "directional_valve", params: { ...meta?.defaults } };
  for (const o of meta?.options ?? []) draft[o.name] = o.default;
  openValveDialog({
    title: "Nuova valvola", comp: draft, applyLabel: "Inserisci", saveDefault: true,
    onApply: (data, saveAs) => {
      insertValve(data, viewCenter());
      if (saveAs) saveValveToLibrary(saveAs, data);
    },
  });
}

/** Menu di un riferimento per sigla (bobina → solenoide, contatto → relè, finecorsa → cilindro). */
function refField(comp: ComponentData, key: "drives" | "relay" | "cam", label: string, hint: string,
                  choices: [string, string][], codes: string[]) {
  const sel = document.createElement("select");
  sel.name = key;
  const all: [string, string][] = [["", "nessuno"], ...choices];
  const current = comp[key] ?? "";
  if (current && !all.some(([v]) => v === current)) all.push([current, `${current} (non c'è nello schema)`]);
  for (const [value, text] of all) {
    const o = document.createElement("option");
    o.value = value; o.textContent = text;
    sel.append(o);
  }
  sel.value = current;
  sel.addEventListener("change", () => mutate(() => {
    const c = byId(comp.id)!;
    if (sel.value) c[key] = sel.value; else delete c[key];
  }));
  const f = field(label, sel, hint);
  if (issuesFor(comp.id).some((i) => codes.includes(i.code))) f.classList.add("invalid");
  return f;
}

function electricRefFields(comp: ComponentData): HTMLElement[] {
  const cams = (): [string, string][] => allComponents().filter((x) => x.type.endsWith("_cylinder"))
    .flatMap((c) => [[`${c.id}+`, `${c.id} tutto fuori (${c.id}+)${elsewhere(c.id)}`],
                     [`${c.id}-`, `${c.id} tutto dentro (${c.id}-)${elsewhere(c.id)}`]] as [string, string][]);
  switch (comp.type) {
    case "valve_solenoid": {
      const sides: [string, string][] = allComponents().filter((x) => x.type === "directional_valve").flatMap((v) =>
        (["14", "12"] as const).filter((s) => isElectric((v[`actuation_${s}`] ?? (s === "14" ? "solenoid" : "spring")) as Actuation))
          .map((s) => [`${v.id}.${s}`, `${v.id}, solenoide ${s}${elsewhere(v.id)}`] as [string, string]));
      return [refField(comp, "drives", "Solenoide comandato", FIELD_HELP.drives!, sides,
        ["INVALID_REFERENCE", "NOT_A_SOLENOID", "DUPLICATE_COIL", "UNLINKED_REFERENCE"])];
    }
    case "relay_contact": {
      const RELAYS: Record<string, string> = { relay_coil: "relè", timer_relay: "temporizzatore", pressure_switch: "pressostato" };
      const relays = allComponents().filter((x) => RELAYS[x.type])
        .map((r) => [r.id, `${r.id} (${RELAYS[r.type]})${elsewhere(r.id)}`] as [string, string]);
      return [refField(comp, "relay", "Azionato da", FIELD_HELP.relay!, relays, ["INVALID_REFERENCE", "UNLINKED_REFERENCE"])];
    }
    case "limit_switch":
      return [refField(comp, "cam", "Azionato da", FIELD_HELP["switch-cam"]!, cams(),
        ["INVALID_CAM", "UNLINKED_REFERENCE"])];
    case "proximity_sensor":
      return [refField(comp, "cam", "Cilindro rilevato", FIELD_HELP["sensor-cam"]!, cams(), ["INVALID_CAM", "UNLINKED_REFERENCE"])];
    default:
      return [];
  }
}

/** Codice da catalogo (Festo, SMC): compila insieme parametri e opzioni del componente. */
function partField(comp: ComponentData): HTMLElement[] {
  const sel = document.createElement("select");
  sel.name = "catalog-part";
  const none = document.createElement("option");
  none.value = ""; none.textContent = "Nessuno (valori inseriti a mano)";
  sel.append(none);
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const part of partsFor(comp.type)) {
    const key = `${part.maker} · ${part.series}`;
    let g = groups.get(key);
    if (!g) {
      g = document.createElement("optgroup");
      g.label = key;
      groups.set(key, g);
      sel.append(g);
    }
    const o = document.createElement("option");
    o.value = part.code;
    o.textContent = `${part.code} · ${part.label}`;
    g.append(o);
  }
  const current = partByCode(comp.code);
  sel.value = current?.type === comp.type ? current.code : "";
  sel.addEventListener("change", () => {
    const part = partByCode(sel.value);
    if (!part) return;
    mutate(() => {
      const c = byId(comp.id)!;
      Object.assign(c, applyPart(c, part));
    });
  });
  const out: HTMLElement[] = [field("Codice da catalogo", sel, FIELD_HELP["catalog-part"])];
  if (current?.type === comp.type) {
    const p = document.createElement("p");
    p.className = "help";
    p.append(`${current.maker} ${current.code}. ${current.note ? current.note + " " : ""}`);
    const a = document.createElement("a");
    a.href = current.source; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Scheda tecnica";
    p.append(a);
    out.push(p);
  }
  return out;
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
    button("Specchia ↔", () => mirrorSelection("h"), "Specchia sinistra ↔ destra (H)", "mirror-h"),
    button("Specchia ↕", () => mirrorSelection("v"), "Specchia alto ↕ basso (V)", "mirror-v"),
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

/** Pulsanti a scelta singola (segmentati). */
function segmented<T>(options: [T, string, string?][], current: T, onPick: (v: T) => void, name = "") {
  const box = document.createElement("div");
  box.className = "seg";
  box.setAttribute("role", "group");
  if (name) box.dataset.name = name;
  for (const [value, text, tip] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (tip) b.title = tip;
    b.setAttribute("aria-pressed", String(value === current));
    b.addEventListener("click", () => onPick(value));
    box.append(b);
  }
  return box;
}

/** Campo con etichetta che non è un <label> (per gruppi di pulsanti). */
function fieldBox(label: string, content: HTMLElement, help = "") {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  if (help) wrap.title = help;
  wrap.append(span, content);
  return wrap;
}

/** Pannello di un testo o di una forma: contenuto, stile della linea, disposizione. */
function renderAnnPanel(panel: HTMLElement, title: HTMLElement, id: string) {
  const a = annById(id)!;
  title.textContent = annLabel(a);
  /** modifica con annullamento; `id` resta valido dopo un annulla */
  const upd = (fn: (x: AnnotationData) => void) => mutate(() => { const x = annById(id); if (x) fn(x); });
  const set = <K extends string>(key: K, value: unknown, def?: unknown) => upd((x) => {
    const r = x as unknown as Record<string, unknown>;
    if (value === undefined || value === def || value === "" || value === false) delete r[key]; else r[key] = value;
  });
  /** testo modificato dal vivo, con un solo passo di annullamento al termine */
  const liveText = (input: HTMLInputElement | HTMLTextAreaElement, apply: (x: AnnotationData, v: string) => void) => {
    let before = "";
    input.addEventListener("focus", () => { before = snapshot(); });
    input.addEventListener("input", () => { const x = annById(id); if (x) { apply(x, input.value); render(); } });
    input.addEventListener("change", () => commit(before || undefined));
  };

  if (a.kind === "text") {
    const ta = document.createElement("textarea");
    ta.name = "ann-text"; ta.rows = Math.min(6, Math.max(2, a.text.split("\n").length + 1)); ta.value = a.text;
    ta.placeholder = "Testo (Invio per andare a capo)";
    liveText(ta, (x, v) => { if (x.kind === "text") x.text = v; });
    panel.append(ta);
    panel.append(fieldBox("Altezza", segmented(TEXT_SIZES.map((v) => [v, fmtMm(v) + (v === TEXT_SIZES.at(-1) ? " mm" : "")] as [number, string]),
      a.size ?? DEFAULT_TEXT_SIZE, (v) => set("size", v, DEFAULT_TEXT_SIZE), "ann-size"), "Altezza dei caratteri sulla carta (ISO 3098)"));
    const style = segmented<"bold" | "italic">([["bold", "G", "Grassetto"], ["italic", "C", "Corsivo"]], "bold", (v) => set(v, !a[v]), "ann-style");
    style.querySelectorAll("button").forEach((b, i) => {
      b.setAttribute("aria-pressed", String(i ? !!a.italic : !!a.bold));
      b.style.fontWeight = i ? "" : "800"; b.style.fontStyle = i ? "italic" : "";
    });
    panel.append(fieldBox("Stile", style));
    panel.append(fieldBox("Allineamento", segmented([["left", "Sinistra"], ["center", "Centro"], ["right", "Destra"]] as ["left" | "center" | "right", string][],
      a.align ?? "left", (v) => set("align", v, "left"), "ann-align")));
    panel.append(fieldBox("Rotazione", segmented([0, 1, 2, 3].map((r) => [r, `${r * 90}°`] as [number, string]), a.rot ?? 0,
      (v) => set("rot", v, 0), "ann-rot"), "Gradi in senso antiorario (R ruota di 90°)"));
    const box = document.createElement("select");
    box.name = "ann-box";
    for (const [v, t] of [["none", "Nessuno"], ["rect", "Rettangolo"], ["round", "Arrotondato"], ["triangle", "Triangolo (revisione)"]]) {
      box.append(new Option(t, v));
    }
    box.value = a.box ?? "none";
    box.addEventListener("change", () => set("box", box.value, "none"));
    panel.append(field("Riquadro", box));
  } else if (a.kind === "rect") {
    const t = document.createElement("input");
    t.name = "ann-title"; t.value = a.title ?? ""; t.placeholder = "facoltativo";
    liveText(t, (x, v) => { if (x.kind === "rect") { if (v.trim()) x.title = v; else delete x.title; } });
    panel.append(field("Titolo", t));
    const pos = document.createElement("select");
    pos.name = "ann-title-pos";
    for (const [v, txt] of [["tl", "In alto a sinistra"], ["tr", "In alto a destra"], ["bl", "In basso a sinistra"], ["br", "In basso a destra"]]) {
      pos.append(new Option(txt, v));
    }
    pos.value = a.titlePos ?? "tl";
    pos.addEventListener("change", () => set("titlePos", pos.value, "tl"));
    panel.append(field("Posizione titolo", pos));
  }

  heading(panel, a.kind === "text" ? "Aspetto" : "Linea", "h4");
  // colore: preimpostati e personalizzato
  const sw = document.createElement("div");
  sw.className = "swatches";
  sw.dataset.name = "ann-color";
  for (const c of COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sw" + (c.value ? "" : " auto");
    if (c.value) b.style.background = c.value;
    b.title = c.label;
    b.setAttribute("aria-label", c.label);
    b.setAttribute("aria-pressed", String((a.color ?? undefined) === c.value));
    b.addEventListener("click", () => set("color", c.value));
    sw.append(b);
  }
  const custom = document.createElement("input");
  custom.type = "color";
  custom.className = "sw custom";
  custom.title = "Altro colore…";
  custom.value = a.color ?? "#1d2430";
  if (a.color && !COLORS.some((c) => c.value === a.color)) custom.classList.add("on");
  custom.addEventListener("change", () => set("color", custom.value.toLowerCase()));
  sw.append(custom);
  panel.append(fieldBox("Colore", sw));

  const showLine = a.kind !== "text" || (a.box && a.box !== "none") || a.leader;
  if (showLine) {
    const lt = document.createElement("select");
    lt.name = "ann-line";
    for (const l of LINE_TYPES) {
      if (l.value === "double" && a.kind !== "line") continue;
      lt.append(new Option(`${l.sample}  ${l.label}`, l.value));
    }
    lt.value = a.line ?? "continuous";
    lt.addEventListener("change", () => set("line", lt.value, "continuous"));
    panel.append(field("Tipo linea", lt, "ISO 128: tratto-punto per i contorni di gruppo (ISO 1219-2), tratteggiata per pilotaggi e drenaggi"));
    panel.append(fieldBox("Spessore", segmented(WEIGHTS.map((v) => [v, fmtMm(v)] as [number, string]), a.weight ?? DEFAULT_WEIGHT,
      (v) => set("weight", v, DEFAULT_WEIGHT), "ann-weight"), "Spessore sulla carta in mm (ISO 128)"));
  }
  if (a.kind === "rect" || a.kind === "ellipse" || (a.kind === "text" && a.box && a.box !== "none")) {
    const fill = document.createElement("select");
    fill.name = "ann-fill";
    for (const [v, t] of [["none", "Nessuno"], ["tint", "Colore chiaro"], ["white", "Bianco (copre il disegno)"]]) fill.append(new Option(t, v));
    fill.value = a.fill ?? "none";
    fill.addEventListener("change", () => set("fill", fill.value, "none"));
    panel.append(field("Riempimento", fill));
  }
  if (a.kind === "rect") {
    panel.append(fieldBox("Angoli", segmented([[false, "Vivi"], [true, "Arrotondati"]] as [boolean, string][], !!a.round,
      (v) => set("round", v, false), "ann-round")));
  }
  const terminals: [Terminal, string, string][] = [["none", "—", "Nessuna punta"], ["arrow", "▶", "Freccia piena"],
    ["open", "▷", "Triangolo vuoto: direzione del flusso (ISO 1219)"], ["dot", "●", "Punto"]];
  if (a.kind === "line") {
    panel.append(fieldBox("Inizio", segmented(terminals, a.start ?? "none", (v) => set("start", v, "none"), "ann-start")));
    panel.append(fieldBox("Fine", segmented(terminals, a.end ?? "none", (v) => set("end", v, "none"), "ann-end")));
  }
  if (a.kind === "text") {
    heading(panel, "Richiamo", "h4");
    if (a.leader) {
      panel.append(fieldBox("Punta", segmented(terminals.filter((t) => t[0] !== "open"), a.leader.end ?? "arrow",
        (v) => upd((x) => { if (x.kind === "text" && x.leader) x.leader.end = v; }), "ann-leader-end")));
      const p = document.createElement("p");
      p.className = "help";
      p.textContent = a.leader.attach
        ? `Agganciato a ${a.leader.attach}: la freccia segue il componente. Trascina la punta altrove per sganciarla.`
        : "Trascina la punta della freccia su un componente per agganciarla: poi lo segue quando lo sposti.";
      panel.append(p);
    }
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(a.leader
      ? button("Togli il richiamo", () => upd((x) => { if (x.kind === "text") delete x.leader; }), "", "ann-leader-off")
      : button("Aggiungi richiamo", () => upd((x) => {
        if (x.kind === "text") x.leader = { x: snap(x.x + 80), y: snap(x.y + 50), end: "arrow" };
      }), "", "ann-leader-on"));
    panel.append(actions);
  }

  heading(panel, "Disposizione", "h4");
  if (a.kind === "rect" || a.kind === "ellipse") {
    const num = (label: string, key: "x" | "y" | "w" | "h") => {
      const inp = document.createElement("input");
      inp.name = `ann-${key}`; inp.inputMode = "decimal"; inp.value = String(a[key]);
      inp.addEventListener("change", () => {
        const v = Math.round(Number(inp.value.replace(",", ".")));
        if (!Number.isFinite(v) || ((key === "w" || key === "h") && v < GRID)) { renderProperties(); return; }
        upd((x) => { if (x.kind === "rect" || x.kind === "ellipse") x[key] = v; });
      });
      const wrap = document.createElement("label");
      wrap.className = "mini";
      wrap.append(label, inp);
      return wrap;
    };
    const pair = (a1: HTMLElement, b1: HTMLElement) => { const d = document.createElement("div"); d.className = "pair"; d.append(a1, b1); return d; };
    panel.append(fieldBox("Posizione", pair(num("X", "x"), num("Y", "y"))));
    panel.append(fieldBox("Dimensioni", pair(num("L", "w"), num("A", "h")), "Larghezza e altezza in unità del disegno (3 per mm sulla carta)"));
  }
  const check = (label: string, value: boolean, onChange: (v: boolean) => void, name: string) => {
    const l = document.createElement("label");
    l.className = "check";
    const c = document.createElement("input");
    c.type = "checkbox"; c.checked = value; c.name = name;
    c.addEventListener("change", () => onChange(c.checked));
    l.append(c, " ", label);
    panel.append(l);
  };
  if (a.kind === "rect") {
    const n = doc.components.filter((c) => { const l = layoutOf(c.id); return insideBox(a, l.x, l.y); }).map((c) => c.id);
    check(`Sposta insieme i componenti racchiusi${n.length ? ` (${n.join(", ")})` : ""}`, !!a.carry, (v) => set("carry", v), "ann-carry");
  }
  check("Blocca posizione", !!a.locked, (v) => set("locked", v), "ann-locked");
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(button("Duplica", duplicateSelection, "Ctrl+D", "duplicate"), button("Elimina", deleteSelection, "Canc", "", "danger"));
  panel.append(actions);
  const help = document.createElement("p");
  help.className = "help";
  help.textContent = a.kind === "line"
    ? "Trascina i punti per spostarli; il + a metà di un tratto aggiunge un punto, doppio clic su un punto lo toglie."
    : a.kind === "text" ? "Doppio clic sul testo nel foglio per scriverlo qui. R ruota di 90°."
    : "Trascina il bordo per spostare, le maniglie per ridimensionare.";
  panel.append(help);
}
const fmtMm = (v: number) => String(v).replace(".", ",");

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

/** Un'apertura scritta nel file come frazione (0.3) si mostra in percentuale (30 %). */
function percentText(raw: string | undefined): string {
  if (raw == null || raw === "") return "";
  const t = raw.trim();
  return /^[-+]?[\d.,]+$/.test(t) ? `${fmtG(parseFloat(t.replace(",", ".")) * 100)} %` : raw;
}

function paramInput(comp: ComponentData, p: ParamSpec) {
  const inp = document.createElement("input");
  inp.name = `param-${p.name}`;
  const list = comp.type.endsWith("_cylinder") ? standardList(p.name) : null;
  if (list) inp.setAttribute("list", list);
  inp.value = p.percent ? percentText(comp.params?.[p.name]) : comp.params?.[p.name] ?? "";
  inp.placeholder = p.simDefault ? `predefinito ${p.simDefault}`
    : (p.required ? "obbligatorio, " : "") + `es. ${EXAMPLE_VALUE[p.dimension] ?? `1 ${PREF_UNIT[p.dimension]}`}`;
  inp.spellcheck = false;
  inp.addEventListener("change", () => mutate(() => {
    const c = byId(comp.id)!;
    c.params ??= {};
    const v = inp.value.trim();
    const unit = p.percent ? "%" : PREF_UNIT[p.dimension];
    if (v) c.params[p.name] = /^[-+]?[\d.,]+$/.test(v) && unit ? `${v} ${unit}` : v;
    else delete c.params[p.name];
  }));
  const f = field(p.label + (p.required ? " *" : ""), inp, paramHelp(comp.type, p));
  const bad = issuesFor(comp.id).find((i) => i.code === "INVALID_COMPONENT" &&
    (i.message.includes(`'${p.name}'`) || i.message.includes(`${comp.id}.${p.name}:`)));
  if (bad) f.classList.add("invalid");
  return f;
}

function renderProperties() {
  queuePropsRender();
  updateSide();
  if (sim) return renderSimPanel();
  const panel = $("#properties");
  panel.replaceChildren();
  const title = heading(panel, "", "h2");

  if (selection?.kind === "component" && byId(selection.id)) {
    renderComponentFields(panel, title, byId(selection.id)!);
  } else if (selection?.kind === "block" && doc.blocks?.some((b) => b.id === (selection as { id: string }).id)) {
    renderBlockPanel(panel, title, selection.id);
  } else if (selection?.kind === "annotation" && annById(selection.id)) {
    renderAnnPanel(panel, title, selection.id);
  } else if (selection?.kind === "multi") {
    const nAnn = selection.anns?.length ?? 0;
    title.textContent = [selection.ids.length ? `${selection.ids.length} componenti` : "",
      nAnn ? (nAnn === 1 ? "1 annotazione" : `${nAnn} annotazioni`) : ""].filter(Boolean).join(" e ") + " selezionati";
    const p = document.createElement("p");
    p.className = "help";
    p.textContent = [...selection.ids, ...(selection.anns ?? []).map((id) => { const a = annById(id); return a ? annLabel(a) : id; })].join(", ");
    panel.append(p);
    const actions = document.createElement("div");
    actions.className = "actions";
    const merge = button("Unisci in un blocco", mergeSelection, "Ctrl+G", "merge");
    merge.disabled = !selection.ids.length;
    actions.append(merge);
    panel.append(actions);
    const alignHead = document.createElement("h4");
    alignHead.textContent = "Allinea";
    const align = document.createElement("div");
    align.className = "actions align-grid";
    for (const mode of Object.keys(ALIGN_LABELS) as AlignMode[]) {
      const b = button(ALIGN_LABELS[mode].label, () => alignSelection(mode), ALIGN_LABELS[mode].title, `align-${mode}`);
      if (mode.startsWith("dist") && selection.ids.length < 3) b.disabled = true;
      align.append(b);
    }
    panel.append(alignHead, align);
    const help = document.createElement("p");
    help.className = "help";
    help.textContent = "Trascina uno dei componenti per spostarli tutti. Maiusc+clic aggiunge o toglie un componente, " +
      "trascinando sul vuoto si seleziona con un riquadro. Ctrl+C / Ctrl+X / Ctrl+V copia, taglia e incolla.";
    panel.append(help);
  } else if (selection?.kind === "connection" && doc.connections[selection.index]) {
    const c = doc.connections[selection.index]!;
    const wire = isWire(c);
    title.textContent = wire ? "Filo elettrico" : "Collegamento";
    const p = document.createElement("p");
    const pr = analysis.pressures[c.from];
    p.innerHTML = `<code></code> — <code></code>` + (wire ? "" : `<br>Pressione massima: <b>${pr ? pr.text : "0 bar"}</b>`);
    const codes = p.querySelectorAll("code");
    codes[0]!.textContent = c.from;
    codes[1]!.textContent = c.to;
    panel.append(p);
    if (!wire) renderTubeFields(panel, selection.index);
    const actions = document.createElement("div");
    actions.className = "actions";
    if (c.points?.length) {
      const straight = document.createElement("button");
      straight.textContent = "Raddrizza linea";
      straight.title = "Toglie i gradini fino a due passi di griglia, i tratti allineati e le pieghe che non servono";
      straight.addEventListener("click", () => {
        const index = (selection as { index: number }).index;
        let done = false;
        mutate(() => { done = straightenConnection(doc.connections[index]!, 2 * GRID); });
        if (!done) toast("La linea è già dritta: per rifarla da capo usa «Togli le pieghe».");
      });
      const reset = document.createElement("button");
      reset.textContent = "Togli le pieghe";
      reset.title = "Toglie tutti i punti di piega: la linea torna al percorso automatico";
      reset.addEventListener("click", () => mutate(() => { delete doc.connections[(selection as { index: number }).index]!.points; }));
      actions.append(straight, reset);
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
    const help = document.createElement("div");
    help.className = "help";
    help.innerHTML = `<p>Trascina un componente dalla palette sul foglio, oppure fai clic per inserirlo al centro.</p>
      <p>Per collegare due porte trascina da una porta all'altra. Per diramare una linea trascina una nuova linea sopra di essa: nasce un punto di connessione a cui collegarne altre.</p>
      <p>Con <b>Simula</b> lo schema si anima: azioni pulsanti e solenoidi facendo clic sui comandi delle valvole.</p>
      <ul><li><kbd>R</kbd> ruota · <kbd>H</kbd> / <kbd>V</kbd> specchia ↔ / ↕</li><li><kbd>Canc</kbd> elimina</li>
      <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> annulla / ripeti</li>
      <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplica</li><li><kbd>Ctrl</kbd>+<kbd>S</kbd> salva il progetto</li>
      <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> copia, taglia, incolla (sotto il puntatore)</li>
      <li>Trascina sul vuoto: seleziona con un riquadro (<kbd>Maiusc</kbd> per aggiungere) · <kbd>Ctrl</kbd>+<kbd>A</kbd> tutto</li>
      <li>Rotella: zoom · <kbd>Spazio</kbd>+trascina o tasto centrale: sposta la vista</li></ul>`;
    panel.append(help);
  }
}

/** Dati di un componente: sigla, descrizione, opzioni, configuratori, parametri, porte e valori teorici. */
/** `more` riceve i parametri da catalogo e di simulazione (nella finestra è la colonna di destra). */
function renderComponentFields(panel: HTMLElement, title: HTMLElement, comp: ComponentData, more: HTMLElement = panel) {
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
  if (REFERENCE_TYPES[comp.type]) panel.append(...referenceFields(comp, labIn));
  if (!isJunctionType(comp.type)) {
    const codeIn = document.createElement("input");
    codeIn.value = comp.code || ""; codeIn.name = "code"; codeIn.placeholder = "facoltativo, per la distinta";
    codeIn.addEventListener("change", () => mutate(() => {
      const c = byId(comp.id)!;
      if (codeIn.value.trim()) c.code = codeIn.value.trim(); else delete c.code;
    }));
    panel.append(field("Codice articolo", codeIn, FIELD_HELP.code));
  }
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
    const choices = [...opt.choices];
    // valvola con le caselle del configuratore: la sua funzione n/m non è tra quelle normalizzate
    if (opt.name === "function" && comp.boxes) choices.unshift([comp.function ?? "", `${comp.function} personalizzata (configuratore)`]);
    for (const [value, text] of choices) {
      const o = document.createElement("option");
      o.value = value; o.textContent = text;
      sel.append(o);
    }
    sel.value = comp[opt.name] ?? opt.default;
    sel.addEventListener("change", () => mutate(() => {
      const c = byId(comp.id)!;
      c[opt.name] = sel.value;
      if (opt.name === "actuation_14" || opt.name === "actuation_12") {
        const side = opt.name === "actuation_14" ? "14" : "12";
        if (!isMechanical(sel.value as Actuation) && !isMechanical(c[`aux_${side}`] as Actuation | undefined)) delete c[`cam_${side}`];
      }
      if (c.type === "directional_valve") sanitizeValve(c, opt.name);
      pruneConnections(comp.id);
    }));
    panel.append(field(opt.label, sel, optionHelp(comp.type, opt)));
    // rullo: può essere premuto da un cilindro a fine corsa (anche come secondo comando del lato)
    const side = opt.name === "actuation_14" ? "14" : opt.name === "actuation_12" ? "12" : null;
    if (side && (isMechanical((comp[opt.name] ?? opt.default) as Actuation) ||
        isMechanical(comp[`aux_${side}`] as Actuation | undefined))) panel.append(camField(comp, side));
  }
  if (comp.type === "directional_valve") panel.append(valveConfigButton(comp));
  if (CONFIGURABLE_CYLINDERS.has(comp.type)) panel.append(cylinderConfigButton(comp));

  for (const f of electricRefFields(comp)) panel.append(f);

  const catalogParams = meta?.params.filter((p) => p.group === "catalog") ?? [];
  const simParams = meta?.params.filter((p) => p.group === "sim") ?? [];
  if (catalogParams.length) heading(more, "Parametri da catalogo");
  if (partsFor(comp.type).length) more.append(...partField(comp));
  if (comp.type.endsWith("_cylinder") && !NO_ISO_SIZES.has(comp.type)) more.append(cylinderSizeField(comp));
  for (const p of catalogParams) if (paramApplies(comp, p.name)) more.append(paramInput(comp, p));
  if (simParams.length) heading(more, "Parametri di simulazione");
  for (const p of simParams) if (paramApplies(comp, p.name)) more.append(paramInput(comp, p));

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
}

// --- finestra delle proprietà ---------------------------------------------------------
// I dati di un componente (o dello schema e del foglio) si modificano in una finestra come quelle dei
// configuratori, aperta con il doppio clic. Le modifiche si vedono subito sul foglio; «OK» le tiene in un
// solo passo annullabile, «Annulla» (o Esc) le scarta.

type PropsTarget = { kind: "component"; id: string } | { kind: "schema" };
let propsDlg: { target: PropsTarget; before: string; overlay: HTMLElement; dialog: HTMLElement } | null = null;

function openPropsDialog(target: PropsTarget) {
  if (sim || propsDlg) return;
  if (target.kind === "component" && !byId(target.id)) return;
  const overlay = document.createElement("div");
  overlay.className = "overlay props-overlay";
  const dialog = document.createElement("div");
  dialog.className = "dialog props-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "props-title");
  overlay.append(dialog);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closePropsDialog(false); });
  document.body.append(overlay);
  propsDlg = { target, before: snapshot(), overlay, dialog };
  document.addEventListener("keydown", propsKey, true);
  renderPropsDialog();
  dialog.querySelector<HTMLElement>("input:not([type=checkbox]), select")?.focus();
}

/** OK: le modifiche restano (un passo di annulla). Annulla: si torna a com'era all'apertura. */
function closePropsDialog(keep: boolean) {
  if (!propsDlg) return;
  const { before, overlay } = propsDlg;
  // un campo ancora in modifica (senza Invio) conta come confermato con OK, come uscendo dal campo
  if (keep) (document.activeElement as HTMLElement | null)?.blur?.();
  propsDlg = null;
  overlay.remove();
  document.removeEventListener("keydown", propsKey, true);
  if (keep) commit(before);
  else if (before !== snapshot()) { restore(before); fixSelection(); changed(); }
  svg.focus?.();
}

function propsKey(e: KeyboardEvent) {
  if (!propsDlg) return;
  // un configuratore aperto sopra la finestra gestisce i suoi tasti
  const top = [...document.querySelectorAll(".overlay")].filter((o) => !(o as HTMLElement).hidden).at(-1);
  if (top !== propsDlg.overlay) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePropsDialog(false); return; }
  const t = e.target as HTMLElement;
  // Ctrl+Invio chiude con OK; Invio in un campo lo conferma soltanto
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); closePropsDialog(true); return; }
  // le scorciatoie dello schema (annulla, elimina, ruota…) non passano sotto la finestra
  if (!t.closest("input, select, textarea")) e.stopPropagation();
}

/** Ridisegno della finestra dopo una modifica: a fuoco ormai spostato (Tab), così il campo nuovo resta attivo. */
let propsRenderQueued = false;
function queuePropsRender() {
  if (!propsDlg || propsRenderQueued) return;
  propsRenderQueued = true;
  setTimeout(() => { propsRenderQueued = false; renderPropsDialog(); }, 0);
}

function renderPropsDialog() {
  if (!propsDlg) return;
  const { target, dialog } = propsDlg;
  if (target.kind === "component" && !byId(target.id)) { closePropsDialog(false); return; }
  // il ridisegno non fa perdere il campo su cui si sta scrivendo né lo scorrimento
  const focused = document.activeElement as HTMLElement | null;
  const focusName = focused && dialog.contains(focused) ? focused.getAttribute("name") : null;
  const scroller = dialog.querySelector(".props-body");
  const scrollTop = scroller?.scrollTop ?? 0;
  dialog.replaceChildren();

  const header = document.createElement("header");
  const h = document.createElement("h2");
  h.id = "props-title";
  const closeBtn = document.createElement("button");
  closeBtn.className = "icon"; closeBtn.textContent = "✕"; closeBtn.setAttribute("aria-label", "Chiudi");
  closeBtn.addEventListener("click", () => closePropsDialog(false));
  header.append(h, closeBtn);

  const body = document.createElement("div");
  body.className = "props-body";
  const left = document.createElement("section");
  left.className = "props-col";
  const right = document.createElement("section");
  right.className = "props-col";
  const title = document.createElement("span");
  if (target.kind === "component") {
    const comp = byId(target.id)!;
    const preview = document.createElement("div");
    preview.className = "vc-preview props-preview";
    const g = geometry(comp);
    const pad = 16;
    preview.innerHTML = `<svg class="symbol" viewBox="${-g.w / 2 - pad - 30} ${-g.h / 2 - pad - 10} ${g.w + 2 * pad + 60} ${g.h + 2 * pad + 20}"
      role="img" aria-label="Simbolo">${g.svg}</svg>`;
    left.append(preview);
    renderComponentFields(left, title, comp, right);
    h.textContent = `${title.textContent} ${comp.id}`;
  } else {
    renderSchemaFields(left, title);
    // il foglio va nella seconda colonna: si sposta la sua sezione (dal titolo «Foglio» in poi)
    const sheetHead = left.querySelector("h3");
    if (sheetHead) { const moved: Node[] = []; for (let n: Node | null = sheetHead; n; n = n.nextSibling) moved.push(n); right.append(...moved); }
    h.textContent = "Schema e foglio";
  }
  body.append(left);
  if (right.childElementCount) body.append(right); else body.classList.add("single");

  const footer = document.createElement("div");
  footer.className = "vc-footer";
  const hint = document.createElement("span");
  hint.className = "help";
  hint.textContent = "Le modifiche si vedono subito sul foglio · Ctrl+Invio: OK · Esc: annulla";
  const spacer = document.createElement("span");
  spacer.className = "vc-spacer";
  const cancel = document.createElement("button");
  cancel.textContent = "Annulla";
  cancel.addEventListener("click", () => closePropsDialog(false));
  const ok = document.createElement("button");
  ok.className = "primary"; ok.textContent = "OK"; ok.dataset.act = "props-ok";
  ok.addEventListener("click", () => closePropsDialog(true));
  footer.append(hint, spacer, cancel, ok);
  dialog.append(header, body, footer);

  body.scrollTop = scrollTop;
  if (focusName) dialog.querySelector<HTMLElement>(`[name="${CSS.escape(focusName)}"]`)?.focus();
}

/** La colonna di destra compare solo quando serve: in Simula e per ciò che non ha una finestra. */
function sideNeeded() {
  if (sim) return true;
  const k = selection?.kind;
  // una linea appena disegnata non apre la colonna: il foglio non si restringe mentre si collega
  if (k === "connection") return !selection!.quiet;
  return k === "annotation" || k === "block" || k === "multi";
}
function updateSide() {
  const app = $("#app");
  const hide = !sideNeeded();
  if (app.classList.contains("side-hidden") === hide) return;
  app.classList.toggle("side-hidden", hide);
  $("#side").setAttribute("aria-hidden", String(hide));
  positionSelbar();
}

/** Nome dello schema e foglio aperto. */
function renderSchemaFields(panel: HTMLElement, title: HTMLElement) {
  title.textContent = "Schema";
  const nameIn = document.createElement("input");
  nameIn.value = doc.name || ""; nameIn.name = "circuit-name";
  nameIn.addEventListener("change", () => mutate(() => { setProjectName(nameIn.value); }));
  panel.append(field("Nome", nameIn, FIELD_HELP["circuit-name"]));
  renderSheetFields(panel);
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
      mutate(() => { for (const conn of doc.connections) if (!isPilotLine(conn) && !isWire(conn)) conn.tube = { ...t }; });
      toast("Tubo applicato a tutte le linee di potenza (i pilotaggi restano come sono)");
    });
    panel.append(all);
  }
}
const MIXED_MSG = "Un filo elettrico non si collega a una porta pneumatica";
const isElectricRef = (ref: string) => { const [cid, p] = splitRef(ref); return portKind(cid, p) === "electric"; };
/** Il collegamento è un filo del circuito elettrico. */
const isWire = (c: ConnectionData) => isElectricRef(c.from) || isElectricRef(c.to);
const isPilotLine = (c: ConnectionData) => [c.from, c.to].some((r) => { const [cid, p] = splitRef(r); return portKind(cid, p) === "pilot"; });

function renderIssues() {
  const list = $("#issues");
  list.replaceChildren();
  if (!analysis.issues.length) {
    const li = document.createElement("li");
    li.className = "ok";
    li.textContent = allComponents().length ? "Schema valido: nessun problema." : "Lo schema è vuoto.";
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
    const wirePage = i.code === "INVALID_TUBE"
      ? pages.findIndex((p) => p.doc.connections.some((c) => i.ports.includes(c.from) && i.ports.includes(c.to))) : -1;
    const where = cid ? pageOfComponent(pages, cid) : wirePage;
    if (pages.length > 1 && where >= 0) {
      const tag = document.createElement("span");
      tag.className = "issue-sheet";
      tag.textContent = `foglio ${where + 1}`;
      li.querySelector(".msg")!.append(" ", tag);
    }
    if (wirePage >= 0) {
      li.classList.add("clickable");
      li.addEventListener("click", () => {
        showIssues(false);
        goToPage(wirePage);
        const index = doc.connections.findIndex((c) => i.ports.includes(c.from) && i.ports.includes(c.to));
        if (index >= 0) select({ kind: "connection", index });
      });
    } else if (cid && anyById(cid)) {
      li.classList.add("clickable");
      li.addEventListener("click", () => { showIssues(false); revealComponent(cid); });
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
  const count = selectedIds().length;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#edit-menu [data-act^="align-"]')) {
    b.disabled = !!sim || count < (b.dataset.act!.startsWith("align-dist") ? 3 : 2);
  }
  $("#doc-name").textContent = doc.name || "Senza nome";
  renderSaveState();
}

// --- modifiche -----------------------------------------------------------------

function nextId(type: string) {
  const prefix = designationPrefix(type);
  let n = 1;
  while (anyById(`${prefix}${n}`)) n++;
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

function addAnnotation(key: string, at: { x: number; y: number }) {
  if (sim) return;
  const a = annFromPreset(key, nextAnnId(doc.annotations), { x: snap(at.x), y: snap(at.y) });
  if (!a) return;
  // più inserimenti nello stesso punto: ognuno scala di 20, per non finire uno sopra l'altro
  const same = (x: AnnotationData) => { const p = annBox(x, compPos), q = annBox(a, compPos); return p.x === q.x && p.y === q.y; };
  for (let i = 0; i < 20 && doc.annotations?.some(same); i++) moveAnn(a, 2 * GRID, 2 * GRID);
  mutate(() => { (doc.annotations ??= []).push(a); });
  select({ kind: "annotation", id: a.id });
}

function renameComponent(oldId: string, newId: string) {
  if (!newId || newId === oldId) return renderProperties();
  if (!/^[A-Za-z0-9_-]+$/.test(newId)) { toast("La sigla può contenere solo lettere, numeri, - e _"); return renderProperties(); }
  if (anyById(newId)) {
    const at = pageOfComponent(pages, newId);
    toast(`La sigla ${newId} è già usata${at !== active ? ` sul foglio ${at + 1} «${pages[at]!.name}»` : ""}`);
    return renderProperties();
  }
  mutate(() => {
    byId(oldId)!.id = newId;
    for (const b of doc.blocks ?? []) b.components = b.components.map((c) => (c === oldId ? newId : c));
    for (const a of doc.annotations ?? []) if (a.kind === "text" && a.leader?.attach === oldId) a.leader.attach = newId;
    doc.layout[newId] = layoutOf(oldId);
    delete doc.layout[oldId];
    const fix = (ref: string) => { const [c, p] = splitRef(ref); return c === oldId ? `${newId}.${p}` : ref; };
    doc.connections = doc.connections.map((c) => ({ ...c, from: fix(c.from), to: fix(c.to) }));
    // i finecorsa seguono il cilindro rinominato, anche sugli altri fogli
    for (const c of allComponents()) {
      for (const key of ["cam_14", "cam_12"] as const) {
        const cam = c[key];
        if (cam && cam.slice(0, -1) === oldId) c[key] = newId + cam.slice(-1);
      }
      // riferimenti per sigla del circuito elettrico
      if (c.cam && c.cam.slice(0, -1) === oldId) c.cam = newId + c.cam.slice(-1);
      if (c.relay === oldId) c.relay = newId;
      if (c.drives && splitRef(c.drives)[0] === oldId) c.drives = `${newId}.${splitRef(c.drives)[1]}`;
    }
  });
  if (propsDlg?.target.kind === "component" && propsDlg.target.id === oldId) propsDlg.target = { kind: "component", id: newId };
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
  if (isElectricRef(a) !== isElectricRef(b)) { toast(MIXED_MSG); return; }
  if (doc.connections.some((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a))) {
    toast("Collegamento già presente");
    return;
  }
  const tube = lastTube && !isElectricRef(a) ? lastTube : null;
  mutate(() => doc.connections.push(tube ? { from: a, to: b, tube: { ...tube } } : { from: a, to: b }));
  select({ kind: "connection", index: doc.connections.length - 1, quiet: true });
}

function deleteSelection() {
  const sel = selection;
  if (!sel || sim) return;
  const anns = new Set(selectedAnns());
  mutate(() => {
    if (sel.kind === "connection") {
      doc.connections.splice(sel.index, 1);
      return;
    }
    if (anns.size) {
      doc.annotations = (doc.annotations ?? []).filter((a) => !anns.has(a.id));
      if (!doc.annotations.length) delete doc.annotations;
    }
    if (sel.kind === "annotation") return;
    // un punto di connessione tra due sole linee si toglie ricucendole
    if (sel.kind === "component" && dissolveJunction(doc, sel.id)) { pruneBlocks(doc); return; }
    const ids = new Set(selectedIds());
    for (const id of ids) { const p = compPos(id); if (p) detachFrom(doc.annotations, id, p); }
    doc.components = doc.components.filter((c) => !ids.has(c.id));
    for (const id of ids) delete doc.layout[id];
    doc.connections = doc.connections.filter((c) => !ids.has(splitRef(c.from)[0]) && !ids.has(splitRef(c.to)[0]));
    pruneBlocks(doc);
  });
  select(null);
}

/** Allinea o distribuisce i componenti selezionati (servono almeno 2, o 3 per distribuire). */
function alignSelection(mode: AlignMode) {
  const ids = selectedIds().filter((id) => byId(id));
  if (ids.length < 2 || sim) return;
  if (mode.startsWith("dist") && ids.length < 3) { toast("Per distribuire servono almeno 3 componenti."); return; }
  const size = (id: string) => {
    const g = geometry(byId(id)!), rot = layoutOf(id).rot || 0;
    return rot % 2 ? { hw: g.h / 2, hh: g.w / 2 } : { hw: g.w / 2, hh: g.h / 2 };
  };
  mutate(() => { alignComponents(doc, ids, mode, size, GRID); straightenLines(ids); });
}

/** Specchia la selezione: un componente sul posto, più componenti attorno al centro del gruppo. */
function mirrorSelection(axis: Axis) {
  const ids = selectedIds();
  if (!ids.length || sim) return;
  mutate(() => { mirrorComponents(doc, ids, axis); straightenLines(ids); });
}

function rotateSelection() {
  const sel = selection;
  if (sel?.kind === "annotation") {
    if (annById(sel.id)?.kind !== "text") return;
    mutate(() => { const a = annById(sel.id); if (a?.kind === "text") { a.rot = ((a.rot ?? 0) + 1) % 4; if (!a.rot) delete a.rot; } });
    return;
  }
  if (sel?.kind !== "component") return;
  // ruotando cambiano i lati delle porte: il testo torna nella posizione automatica
  mutate(() => { const l = layoutOf(sel.id); l.rot = ((l.rot || 0) + 1) % 4; delete l.label; });
}

/** Sigla libera per un tipo, saltando anche quelle già scelte in questa operazione. */
function freeId(type: string, taken: Set<string>) {
  const prefix = designationPrefix(type);
  let n = 1;
  while (taken.has(`${prefix}${n}`) || anyById(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Duplica la selezione: componenti, linee tra loro, annotazioni e, per un blocco, il blocco stesso. */
function duplicateSelection() {
  const clip = makeClip();
  if (!clip || sim) return;
  if (clip.block && clip.fragment) clip.fragment.name = `${clip.fragment.name} (copia)`;
  insertClip(clip, { x: clip.origin[0] + 40, y: clip.origin[1] + 40 });
}

// --- appunti: copia, taglia, incolla ------------------------------------------------
const CLIP_KEY = "pneutrack.clipboard.v1"; // ultima copia, condivisa tra progetti e schede
const CLIP_FORMAT = "pneutrack/clipboard";
/**
 * Appunti: componenti (frammento) e annotazioni. `origin` è l'angolo dei componenti, o delle sole
 * annotazioni se non ci sono componenti; le annotazioni sono scritte rispetto a `origin`.
 */
interface Clip { format: typeof CLIP_FORMAT; block: boolean; origin: [number, number]; fragment: Fragment | null; anns?: AnnotationData[] }

/** Copia staccata della selezione (null se non c'è niente da copiare). */
function makeClip(): Clip | null {
  const ids = selectedIds();
  const anns = selectedAnns().map(annById).filter((a): a is AnnotationData => !!a).map((a) => structuredClone(a));
  if (!ids.length && !anns.length) return null;
  const block = selection?.kind === "block" ? doc.blocks?.find((b) => b.id === (selection as { id: string }).id) : undefined;
  const fragment = ids.length ? extractFragment(doc, ids, block?.name ?? "", block?.description) : null;
  const corners = ids.length ? ids.map((id) => [layoutOf(id).x, layoutOf(id).y]) : anns.map((a) => { const b = annBoxOf(a); return [b.x, b.y]; });
  const origin: [number, number] = [snap(Math.min(...corners.map((c) => c[0]!))), snap(Math.min(...corners.map((c) => c[1]!)))];
  const set = new Set(ids);
  for (const a of anns) {
    // un richiamo agganciato a un componente rimasto fuori si scioglie dove si trova
    if (a.kind === "text" && a.leader?.attach && !set.has(a.leader.attach)) {
      const p = compPos(a.leader.attach);
      if (p) detachFrom([a], a.leader.attach, p);
    }
    moveAnn(a, -origin[0], -origin[1]);
  }
  return { format: CLIP_FORMAT, block: !!block, origin, fragment, ...(anns.length ? { anns } : {}) };
}

/** Inserisce gli appunti con l'angolo in `at` e seleziona quello che è stato aggiunto. */
function insertClip(clip: Clip, at: { x: number; y: number }) {
  let added: string[] = [];
  const addedAnns: string[] = [];
  let newBlock: string | undefined;
  mutate(() => {
    if (clip.fragment) {
      added = insertFragment(doc, clip.fragment, at, freeId);
      if (clip.block) newBlock = mergeBlock(doc, added, clip.fragment.name || undefined, clip.fragment.description).id;
    }
    const rename = new Map(clip.fragment?.components.map((c, i) => [c.id, added[i]!]) ?? []);
    const taken = new Set<string>();
    for (const src of clip.anns ?? []) {
      const a = structuredClone(src);
      a.id = nextAnnId(doc.annotations, taken);
      taken.add(a.id);
      moveAnn(a, at.x, at.y);
      if (a.kind === "text" && a.leader?.attach) {
        if (rename.has(a.leader.attach)) a.leader.attach = rename.get(a.leader.attach);
        else delete a.leader.attach;
      }
      (doc.annotations ??= []).push(a);
      addedAnns.push(a.id);
    }
  });
  if (newBlock && !addedAnns.length) select({ kind: "block", id: newBlock });
  else select(selectionOf(added, addedAnns));
}
let clipPastes = 0; // incolla ripetuti senza puntatore sul foglio: ogni copia scala di 40
let pointerWorld: { x: number; y: number } | null = null; // ultimo punto del puntatore sul foglio

function parseClip(text: string | null | undefined): Clip | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<Clip>;
    if (raw?.format !== CLIP_FORMAT) return null;
    const fragment = parseFragment(raw.fragment);
    const anns = normalizeAnnotations(raw.anns);
    if (!fragment && !anns.length) return null;
    const o = Array.isArray(raw.origin) && raw.origin.length === 2 ? raw.origin as [number, number] : [0, 0] as [number, number];
    return { format: CLIP_FORMAT, block: !!raw.block && !!fragment, origin: o, fragment, ...(anns.length ? { anns } : {}) };
  } catch { return null; }
}
function storedClip(): Clip | null {
  try { return parseClip(localStorage.getItem(CLIP_KEY)); } catch { return null; }
}

/** Copia la selezione negli appunti dell'app (e restituisce il testo per quelli del sistema). */
function copySelection(): string | null {
  const clip = makeClip();
  if (!clip) return null;
  const ids = clip.fragment?.components.map((c) => c.id) ?? [];
  const block = clip.block ? clip.fragment : null;
  const text = JSON.stringify(clip);
  try { localStorage.setItem(CLIP_KEY, text); } catch { /* resta solo negli appunti del sistema */ }
  clipPastes = 0;
  renderStatus();
  const n = clip.anns?.length ?? 0;
  toast(!ids.length ? (n === 1 ? "Copiata 1 annotazione" : `Copiate ${n} annotazioni`)
    : (ids.length === 1 ? `Copiato ${ids[0]}` : `Copiati ${ids.length} componenti`) + (block ? ` (blocco «${block.name}»)` : "") +
      (n ? ` e ${n === 1 ? "1 annotazione" : `${n} annotazioni`}` : ""));
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
  insertClip(clip, at);
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

// --- libreria «Le mie valvole» (nel browser, come i blocchi) -------------------------------
const VALVE_LIBRARY_KEY = "pneutrack.valves.v1";
interface SavedValve { name: string; data: Partial<ComponentData> }
function valveLibrary(): SavedValve[] {
  try {
    const raw = JSON.parse(localStorage.getItem(VALVE_LIBRARY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is SavedValve => !!v && typeof v.name === "string" && !!v.data && typeof v.data === "object")
      .filter((v) => { try { buildComponent({ ...v.data, id: "V", type: "directional_valve" }); return true; } catch { return false; } });
  } catch { return []; }
}
function saveValveToLibrary(name: string, data: ComponentData) {
  const list = valveLibrary().filter((v) => v.name !== name);
  list.push({ name, data: valveTemplate(data) });
  try {
    localStorage.setItem(VALVE_LIBRARY_KEY, JSON.stringify(list));
    toast(`"${name}" salvata in «Le mie valvole»`);
    renderPalette();
  } catch { toast("Questo browser non permette di salvare la libreria"); }
}
function removeValveFromLibrary(index: number) {
  const list = valveLibrary();
  const [gone] = list.splice(index, 1);
  try { localStorage.setItem(VALVE_LIBRARY_KEY, JSON.stringify(list)); } catch { /* non disponibile */ }
  renderPalette();
  if (gone) toast(`"${gone.name}" tolta da «Le mie valvole»`);
}
/** Inserisce una valvola con i campi dati (dal configuratore o dalla libreria). */
function insertValve(data: Partial<ComponentData>, at: { x: number; y: number }) {
  if (sim) return;
  const comp: ComponentData = { ...structuredClone(data), id: nextId("directional_valve"), type: "directional_valve" };
  mutate(() => {
    doc.components.push(comp);
    doc.layout[comp.id] = { x: snap(at.x), y: snap(at.y), rot: 0 };
  });
  select({ kind: "component", id: comp.id });
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
  analysis = analyze(structuredClone(mergedCircuit(pages)));
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
  recorder: Recorder;
  /** frazione della velocità scelta che il calcolo riesce a tenere (1 = al passo) */
  pace: number;
}
let sim: SimRun | null = null;
/** tempo di calcolo massimo della simulazione per fotogramma [ms] */
const SIM_BUDGET_MS = 12;
/** componente con la regolazione aperta accanto al simbolo */
let tuneOpen: string | null = null;
/** diagramma delle fasi aperto e asse orizzontale scelto */
let diagramOpen = false;
let diagramMode: DiagramMode = "time";
/** comandi a pressione (pulsante, rullo) tenuti premuti col puntatore */
let held: { id: string; side: "14" | "12"; override?: boolean } | null = null;
let heldSwitch: string | null = null;

function startSim() {
  if (sim) return;
  clearTimeout(analyzeTimer);
  runAnalysis();
  if (!allComponents().length) { toast("Lo schema è vuoto: inserisci dei componenti"); return; }
  const r = compileSim(structuredClone(mergedCircuit(pages)));
  if (!r.ok) {
    toast(`Correggi ${r.errors.length > 1 ? `i ${r.errors.length} errori` : "l'errore"} prima di simulare`);
    return;
  }
  const speed = Number($<HTMLSelectElement>("#sim-speed").value) || 0.25;
  sim = { s: new Simulator(r.network), playing: true, speed, raf: 0, last: performance.now(), lastPanel: 0,
          warnings: r.warnings, recorder: null!, pace: 1 };
  sim.recorder = newRecorder(sim.s);
  sim.recorder.record(0);
  $("#app").classList.add("simulating");
  $("#sim-bar").hidden = false;
  setModeButtons(true);
  closePopups();
  drawView = { page: pages[active]!.id, view: { ...view } };
  renderLegend();
  document.body.dataset.sim = "on";
  updatePlayButton();
  renderProperties();
  showDiagram(true);
  fitView();
  sim.raf = requestAnimationFrame(simFrame);
  if (r.warnings.length) {
    toast(r.warnings.length > 1 ? `${r.warnings.length} avvisi: li trovi nel pannello Simulazione` : r.warnings[0]!);
  }
}

function stopSim() {
  if (!sim) return;
  cancelAnimationFrame(sim.raf);
  sim = null;
  held = null;
  heldSwitch = null;
  tuneOpen = null;
  renderTunePop();
  $("#app").classList.remove("simulating");
  $("#sim-bar").hidden = true;
  showDiagram(false);
  setModeButtons(false);
  if (drawView && drawView.page === pages[active]?.id) view = drawView.view;
  drawView = null;
  delete document.body.dataset.sim;
  render();
  renderProperties();
  renderLegend();
}

/** vista del disegno prima di entrare in Simula, ripristinata all'uscita */
let drawView: { page: string; view: typeof view } | null = null;
function setModeButtons(simulating: boolean) {
  $("#btn-draw").setAttribute("aria-pressed", String(!simulating));
  $("#btn-sim").setAttribute("aria-pressed", String(simulating));
}

function resetSim() {
  if (!sim) return;
  const commands = sim.s.net.valves.flatMap((v) => (["14", "12"] as const)
    .filter((side) => sim!.s.command(v.id, side)).map((side) => [v.id, side] as const));
  const latched = manualSwitches().filter((x) => x.latching && sim!.s.switchState(x.id)).map((x) => x.id);
  const overrides = sim.s.net.valves.flatMap((v) => (["14", "12"] as const)
    .filter((side) => overrideKind(v, side) === "detent" && sim!.s.override(v.id, side)).map((side) => [v.id, side] as const));
  sim.s = new Simulator(sim.s.net);
  for (const [id, side] of overrides) sim.s.setOverride(id, side, true);
  // interruttori con ritenuta e solenoidi restano come li ha lasciati l'utente
  for (const id of latched) sim.s.setSwitch(id, true);
  for (const [id, side] of commands) {
    const v = sim.s.net.valves.find((x) => x.id === id)!;
    if (isLatching(side === "14" ? v.act14 : v.act12)) sim.s.setCommand(id, side, true);
  }
  sim.recorder = newRecorder(sim.s);
  sim.recorder.record(0);
  render();
  renderSimPanel();
  renderDiagramPanel();
}

function newRecorder(s: Simulator): Recorder {
  const labels: Record<string, string> = {};
  for (const c of allComponents()) if (c.label) labels[c.id] = c.label;
  const gauges = allComponents().filter((c) => c.type === "pressure_gauge" || c.type === "pressure_sensor").map((c) => c.id);
  return new Recorder(s, labels, gauges);
}

/** Apre o chiude il diagramma delle fasi (solo durante la simulazione). */
function showDiagram(open: boolean) {
  diagramOpen = open && !!sim;
  $("#diagram").hidden = !diagramOpen;
  $("#btn-diagram").setAttribute("aria-pressed", String(diagramOpen));
  $("#btn-diagram").classList.toggle("on", diagramOpen);
  for (const b of document.querySelectorAll<HTMLElement>("#sim-bar [data-dmode]")) {
    b.setAttribute("aria-pressed", String(b.dataset.dmode === diagramMode));
  }
  renderDiagramPanel();
}

function renderDiagramPanel() {
  if (!sim || !diagramOpen) return;
  const body = $("#diagram-body");
  const r = sim.recorder;
  if (!r.channels.length) {
    body.innerHTML = `<p class="dg-empty">Nello schema non ci sono cilindri, valvole o bobine da tracciare.</p>`;
  } else {
    body.innerHTML = renderDiagram(r.channels, r.samples, diagramMode, Math.max(320, body.clientWidth - 4), r.tracker.cycles);
    body.style.height = `${Math.min(diagramHeight(r.channels), Math.round(window.innerHeight * 0.28))}px`;
  }
}

function updatePlayButton() {
  $("#btn-play").textContent = sim?.playing ? "⏸ Pausa" : "▶ Avvia";
}

function simFrame(ts: number) {
  if (!sim) return;
  const dt = Math.min(0.05, Math.max(0, (ts - sim.last) / 1000));
  sim.last = ts;
  if (sim.playing) {
    const want = dt * sim.speed;
    // al più SIM_BUDGET_MS di calcolo per fotogramma: con schemi grandi la simulazione rallenta, la pagina no
    const done = sim.s.advance(want, SIM_BUDGET_MS);
    // velocità reale rispetto a quella scelta, media sugli ultimi fotogrammi
    if (want > 0) sim.pace = 0.9 * sim.pace + 0.1 * Math.min(1, done / want);
    sim.recorder.record(sim.s.t);
  }
  render();
  if (ts - sim.lastPanel > 120) { sim.lastPanel = ts; updateSimPanel(); if (diagramOpen) renderDiagramPanel(); }
  sim.raf = requestAnimationFrame(simFrame);
}

/**
 * Comando che si aziona a mano accanto a quello principale: il secondo comando manuale del lato (configuratore)
 * o il comando manuale ausiliario del solenoide. A impulso ("push") o con arresto ("detent").
 */
function overrideKind(v: ValveSpec, side: "14" | "12"): "push" | "detent" | null {
  const aux = side === "14" ? v.aux14 : v.aux12;
  if (aux && isManual(aux)) return isManualDetent(aux) ? "detent" : "push";
  // rullo come secondo comando, senza cilindro che lo prema: si tiene premuto a mano
  if (aux && isMechanical(aux) && !(side === "14" ? v.cam14 : v.cam12)) return "push";
  return v.override && isElectric(side === "14" ? v.act14 : v.act12) ? v.override : null;
}

/** Lati di valvola che l'utente può comandare: solenoide (interruttore), pulsante e rullo (a pressione). */
function commandSides() {
  if (!sim) return [];
  return sim.s.net.valves.flatMap((v) => (["14", "12"] as const).flatMap((side) => {
    const act = side === "14" ? v.act14 : v.act12;
    const cam = side === "14" ? v.cam14 : v.cam12;
    const aux = side === "14" ? v.aux14 : v.aux12;
    // comando manuale ausiliario o secondo comando manuale: si aziona anche quando il solenoide segue la bobina
    const ovr = overrideKind(v, side) ? [{ id: v.id, side, act: aux && !isElectric(act) ? aux : act, override: true }] : [];
    if (sim!.s.isDriven(v.id, side)) return ovr; // il solenoide segue la sua bobina
    return [...(isLatching(act) || (isMomentary(act) && !cam) ? [{ id: v.id, side, act, override: false }] : []), ...ovr];
  }));
}

/** Comando manuale ausiliario di un solenoide: a impulso finché si tiene premuto, con arresto a ogni clic. */
function pressOverride(id: string, side: "14" | "12") {
  if (!sim) return;
  const v = sim.s.net.valves.find((x) => x.id === id);
  const kind = v ? overrideKind(v, side) : null;
  if (!kind) return;
  if (kind === "detent") {
    sim.s.setOverride(id, side, !sim.s.override(id, side));
  } else {
    releaseHeld();
    sim.s.setOverride(id, side, true);
    held = { id, side, override: true };
  }
  render();
  updateSimPanel();
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
    if (on && isManualDetent(act) && isManualDetent(other === "14" ? v.act14 : v.act12)) {
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
/** Pulsanti, interruttori e finecorsa senza cilindro: si azionano a mano in simulazione. */
function manualSwitches() {
  if (!sim?.s.electric) return [];
  return sim.s.electric.net.contacts.filter((c) => c.manual).map((c) => {
    const comp = anyById(c.id);
    return { id: c.id, latching: comp?.type === "pushbutton" && comp.operation === "latching",
             label: comp?.type === "limit_switch" ? "finecorsa" : comp?.operation === "latching" ? "interruttore" : "pulsante" };
  });
}

function pressSwitch(id: string) {
  const sw = manualSwitches().find((x) => x.id === id);
  if (!sim || !sw) return;
  if (sw.latching) {
    sim.s.setSwitch(id, !sim.s.switchState(id));
  } else {
    releaseHeld();
    sim.s.setSwitch(id, true);
    heldSwitch = id;
  }
  render();
  updateSimPanel();
}

function releaseHeld() {
  if (sim && held) {
    if (held.override) sim.s.setOverride(held.id, held.side, false);
    else sim.s.setCommand(held.id, held.side, false);
  }
  if (sim && heldSwitch) sim.s.setSwitch(heldSwitch, false);
  held = null;
  heldSwitch = null;
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
    "cambiano stato a ogni clic. Le elettrovalvole servopilotate commutano solo se il pilota ha pressione. " +
    "Nel circuito elettrico si fa clic su pulsanti e interruttori; i solenoidi con una bobina seguono la bobina, " +
    "e i fili sotto tensione diventano rossi. Riduttori, strozzatori e tarature si regolano con i cursori " +
    "qui sotto, con un clic sul simbolo o con la rotellina sopra il simbolo.";
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
      const spec = sim.s.net.valves.find((v) => v.id === c.id);
      const detent = !!spec && overrideKind(spec, c.side) === "detent";
      const aux = c.side === "14" ? spec?.aux14 : spec?.aux12;
      b.dataset.cmd = c.override ? `${c.id}|${c.side}|ovr` : `${c.id}|${c.side}`;
      b.className = `sim-cmd ${c.act}`;
      b.textContent = `${c.id} · ${c.side} · ${c.override ? (aux ? ACTUATION_SHORT[aux] : "comando manuale") : ACTUATION_SHORT[c.act]}`;
      b.title = c.override ? (detent ? "Clic: aziona / rilascia il comando manuale" : "Tieni premuto per azionare")
        : isElectric(c.act) ? "Clic: eccita / diseccita" : isLatching(c.act) ? "Clic: sposta la leva"
        : "Tieni premuto per azionare";
      box.append(b);
    }
    panel.append(box);
  }

  const switches = manualSwitches();
  if (switches.length) {
    heading(panel, "Comandi elettrici");
    const box = document.createElement("div");
    box.className = "sim-commands";
    for (const sw of switches) {
      const b = document.createElement("button");
      b.dataset.switch = sw.id;
      b.className = "sim-cmd";
      b.textContent = `${sw.id} · ${sw.label}`;
      b.title = sw.latching ? "Clic: chiudi / apri" : "Tieni premuto per azionare";
      box.append(b);
    }
    panel.append(box);
  }
  if (sim.s.net.tunables.length) {
    heading(panel, "Regolazioni");
    const box = document.createElement("div");
    box.className = "sim-tuners";
    // quella del componente selezionato in cima
    const sel = selection?.kind === "component" ? selection.id : null;
    const list = [...sim.s.net.tunables].sort((a, b) => Number(b.id === sel) - Number(a.id === sel));
    for (const t of list) box.append(tuner(t));
    const acts = document.createElement("div");
    acts.className = "sim-tune-actions";
    const save = button("Riporta nello schema", saveTunings,
      "Scrive nello schema le regolazioni cambiate in simulazione (si annulla con Ctrl+Z dopo l'uscita)");
    save.dataset.tuneSave = "";
    const back = button("Valori dello schema", resetTunings, "Rimette le regolazioni ai valori dello schema");
    back.dataset.tuneBack = "";
    acts.append(save, back);
    box.append(acts);
    panel.append(box);
  }
  if (sim.s.electric) {
    const fault = document.createElement("p");
    fault.className = "sim-warning";
    fault.dataset.live = "fault:";
    fault.hidden = true;
    panel.append(fault);
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
  for (const r of sim.s.electric?.net.relays ?? []) row(`${anyById(r.id)?.type === "timer_relay" ? "Temporizzatore" : "Relè"} ${r.id}`, `relay:${r.id}`);
  for (const l of sim.s.electric?.net.loads ?? []) {
    if (l.type === "valve_solenoid") row(`Bobina ${l.id}`, `load:${l.id}`);
    if (l.type === "signal_lamp") row(`Lampada ${l.id}`, `load:${l.id}`);
  }
  const comp = selection?.kind === "component" ? byId(selection.id) : undefined;
  if (comp) {
    for (const name of Object.keys(geometry(comp).ports)) row(`${comp.id}.${name}`, `port:${comp.id}.${name}`);
  }
  if (dl.childElementCount) { heading(panel, comp ? `Valori (${comp.id})` : "Valori"); panel.append(dl); }

  // misure: manometri, aria consumata, tempi di corsa e di ciclo
  const ml = document.createElement("dl");
  ml.className = "sim-values sim-measures";
  const measure = (label: string, key: string, help: string) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    dt.title = help;
    const dd = document.createElement("dd");
    dd.dataset.live = key;
    dd.title = help;
    ml.append(dt, dd);
  };
  for (const g of allComponents().filter((c) => c.type === "pressure_gauge" || c.type === "pressure_sensor")) {
    measure(`${g.type === "pressure_sensor" ? "Sensore" : "Manometro"} ${g.id}`, `port:${g.id}.1`, "Pressione relativa letta dal manometro in questo istante; la sua traccia è nel diagramma delle fasi.");
  }
  for (const g of allComponents().filter(hasIntegratedGauge)) {
    measure(`Manometro ${g.id}`, `port:${g.id}.2`, "Pressione regolata, letta dal manometro del gruppo a valle del riduttore (porta 2).");
  }
  measure("Aria consumata", "air:total", "Aria uscita dalle alimentazioni dall'inizio della simulazione, in litri normali (ANR, ISO 8778: 20 °C e 1 bar assoluto). Comprende il riempimento iniziale delle linee.");
  measure("Portata attuale", "air:flow", "Aria che esce adesso dalle alimentazioni, in litri normali al minuto.");
  if (sim.s.net.cylinders.length) {
    measure("Cicli completati", "cycle:count", "Un ciclo va dalla partenza del primo cilindro dalla posizione di riposo (quella all'avvio) al ritorno di tutti i cilindri a riposo.");
    measure("Ultimo ciclo", "cycle:last", "Durata e aria consumata dell'ultimo ciclo completo. Il consumo parte dall'ultimo istante a portata ferma prima della partenza.");
    measure("Media per ciclo", "cycle:mean", "Tempo e aria medi dei cicli completati finora.");
    measure("Consumo medio", "cycle:flow", "Aria dei cicli divisa per la loro durata, in litri normali al minuto: il dato per dimensionare il compressore con il ciclo che gira di continuo.");
    for (const c of sim.s.net.cylinders) {
      measure(`Corse ${c.id}`, `stroke:${c.id}`, `Tempo dell'ultima uscita (+) e dell'ultimo rientro (−) di ${c.id}, dalla partenza dal fine corsa all'arrivo a quello opposto.`);
    }
  }
  heading(panel, "Misure");
  panel.append(ml);
  updateSimPanel();
}

function updateSimPanel() {
  if (!sim) return;
  const s = sim.s;
  const slow = sim.playing && sim.pace < 0.9;
  $("#sim-time").textContent = `t = ${s.t.toFixed(2).replace(".", ",")} s` +
    (slow ? ` · rallentata al ${Math.round(sim.pace * 100)} %` : "");
  $("#sim-time").title = slow
    ? "Lo schema è grande: il calcolo non tiene la velocità scelta e la simulazione va più piano. I risultati non cambiano."
    : "";
  document.body.dataset.simTime = s.t.toFixed(3);
  const POS: Record<string, string> = { "14": "lato 14 (azionata)", "12": "lato 12", "0": "centrale" };
  const el = s.electricState();
  let strokeCache: ReturnType<typeof strokes> | null = null;
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
    } else if (kind === "relay" && el) {
      const left = s.electric!.remaining(key, s.t);
      dd.textContent = (el.switched.has(key) ? "commutato" : "a riposo") +
        (left != null ? ` · ${left.toFixed(1).replace(".", ",")} s` : "") + (el.energized.has(key) ? " · bobina eccitata" : "");
      dd.dataset.value = el.switched.has(key) ? "1" : "0";
    } else if (kind === "load" && el) {
      const on = el.energized.has(key);
      dd.textContent = byId(key)?.type === "signal_lamp" ? (on ? "accesa" : "spenta") : on ? "eccitata" : "diseccitata";
      dd.dataset.value = on ? "1" : "0";
    } else if (kind === "fault" && el) {
      const msg = el.shortCircuit ? "Cortocircuito: il + e il 0V sono uniti da contatti chiusi, nessun carico ha tensione."
        : el.oscillating.length ? `${el.oscillating.join(", ")} continua a commutare: controlla l'autoritenuta o i contatti NC sulla propria bobina.`
        : "";
      dd.textContent = msg;
      dd.hidden = !msg;
    } else if (kind === "port") {
      const bar = s.gauge(key);
      dd.textContent = fmtBar(bar);
      dd.dataset.value = bar.toFixed(3);
    } else if (kind === "air") {
      const v = key === "total" ? s.airUsed() : s.airFlow();
      dd.textContent = key === "total" ? `${fmtNum(v, 2)} Nl` : `${fmtNum(Math.max(0, v), 1)} Nl/min`;
      dd.dataset.value = v.toFixed(4);
    } else if (kind === "cycle") {
      const sum = summarize(sim!.recorder.tracker.cycles);
      dd.dataset.value = String(sum.count);
      dd.textContent = key === "count" ? String(sum.count)
        : key === "last" ? (sum.last ? `${fmtNum(sum.last.end - sum.last.start, 2)} s · ${fmtNum(sum.last.air, 2)} Nl` : "—")
        : key === "mean" ? (sum.count ? `${fmtNum(sum.meanTime!, 2)} s · ${fmtNum(sum.meanAir!, 2)} Nl` : "—")
        : sum.meanFlow !== undefined ? `${fmtNum(sum.meanFlow, 1)} Nl/min` : "—";
      if (key === "last" && sum.last) dd.dataset.value = (sum.last.end - sum.last.start).toFixed(3);
    } else if (kind === "stroke") {
      const r = strokeCache ?? (strokeCache = strokes(sim!.recorder.channels, sim!.recorder.samples));
      const last = (dir: "+" | "-") => r.filter((x) => x.id === key && x.dir === dir).pop();
      const p = last("+"), m = last("-");
      dd.textContent = `+ ${p ? `${fmtNum(p.end - p.start, 2)} s` : "—"} · − ${m ? `${fmtNum(m.end - m.start, 2)} s` : "—"}`;
      dd.dataset.value = p ? (p.end - p.start).toFixed(3) : "";
    }
  }
  for (const b of document.querySelectorAll<HTMLElement>("#properties [data-cmd]")) {
    const [id, side, ovr] = b.dataset.cmd!.split("|") as [string, "14" | "12", string?];
    b.classList.toggle("on", ovr ? s.override(id, side) : s.command(id, side));
  }
  for (const b of document.querySelectorAll<HTMLElement>("#properties [data-switch]")) {
    b.classList.toggle("on", s.switchState(b.dataset.switch!));
  }
  syncTuners();
}

// --- regolazioni in simulazione ----------------------------------------------------

let tunerSeq = 0;
const tunablesOf = (id: string): Tunable[] => sim?.s.net.tunables.filter((t) => t.id === id) ?? [];
/** unità mostrata dai cursori: bar, % e secondi */
const TUNE_UNIT: Record<TunableKind, { k: number; unit: string; digits: number }> = {
  pressure: { k: 1 / BAR, unit: "bar", digits: 1 },
  opening: { k: 100, unit: "%", digits: 0 },
  time: { k: 1, unit: "s", digits: 1 },
};
const tuneText = (t: Tunable, v = t.value) => {
  const u = TUNE_UNIT[t.kind];
  return `${(v * u.k).toFixed(u.digits).replace(".", ",")} ${u.unit}`;
};
/** valore da scrivere nello schema: "6.5 bar", "35 %", "2.5 s" */
const tuneParam = (t: Tunable) => {
  const u = TUNE_UNIT[t.kind];
  return `${+(t.value * u.k).toFixed(u.digits + 1)} ${u.unit}`;
};
const tuneKey = (t: Tunable) => `${t.id}|${t.param}`;
const tuneByKey = (key: string) => {
  const [id, param] = key.split("|") as [string, string];
  return sim?.s.tunable(id, param);
};

/** Cursore di una regolazione, con valore, campo e valore dello schema. */
function tuner(t: Tunable): HTMLElement {
  const u = TUNE_UNIT[t.kind];
  const box = document.createElement("div");
  box.className = "tuner";
  const id = `tuner-${++tunerSeq}`;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = `${t.id} · ${t.label}`;
  const out = document.createElement("output");
  out.htmlFor.add(id);
  out.dataset.tuneOut = tuneKey(t);
  const input = document.createElement("input");
  Object.assign(input, { type: "range", id, min: String(t.min * u.k), max: String(t.max * u.k),
                         step: String(t.step * u.k), value: String(t.value * u.k) });
  input.dataset.tune = tuneKey(t);
  const note = document.createElement("small");
  note.dataset.tuneNote = tuneKey(t);
  box.append(label, out, input, note);
  return box;
}

/** Allinea cursori, valori e pulsanti alle regolazioni attuali. */
function syncTuners() {
  if (!sim) return;
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-tune]")) {
    const t = tuneByKey(input.dataset.tune!);
    if (t && document.activeElement !== input) input.value = String(t.value * TUNE_UNIT[t.kind].k);
  }
  for (const out of document.querySelectorAll<HTMLElement>("[data-tune-out]")) {
    const t = tuneByKey(out.dataset.tuneOut!);
    if (t) out.textContent = tuneText(t);
  }
  for (const note of document.querySelectorAll<HTMLElement>("[data-tune-note]")) {
    const t = tuneByKey(note.dataset.tuneNote!);
    if (t) {
      note.textContent = `${tuneText(t, t.min)} … ${tuneText(t, t.max)}` +
        (Math.abs(t.value - t.initial) > 1e-9 ? ` · nello schema ${tuneText(t, t.initial)}` : "");
    }
  }
  const changedAny = sim.s.net.tunables.some((t) => Math.abs(t.value - t.initial) > 1e-9);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-tune-save], [data-tune-back]")) b.disabled = !changedAny;
}

function setTuning(t: Tunable, value: number) {
  if (!sim) return;
  sim.s.setTunable(t.id, t.param, value);
  syncTuners();
}

/** Rotellina sul simbolo: un passo della prima regolazione (Maiusc: dieci passi). */
function wheelTune(id: string, e: WheelEvent) {
  const t = tunablesOf(id)[0];
  if (!t) return;
  setTuning(t, t.value + Math.sign(-e.deltaY) * t.step * (e.shiftKey ? 10 : 1));
}

/** Scrive nello schema i valori trovati provando, come una modifica annullabile. */
function saveTunings() {
  if (!sim) return;
  const changedT = sim.s.net.tunables.filter((t) => Math.abs(t.value - t.initial) > 1e-9);
  if (!changedT.length) return;
  const before = snapshot();
  for (const t of changedT) {
    const c = anyById(t.id);
    if (!c) continue;
    (c.params ??= {})[t.param] = tuneParam(t);
    t.initial = t.value;
  }
  commit(before);
  syncTuners();
  toast(changedT.length > 1 ? `${changedT.length} regolazioni riportate nello schema` : "Regolazione riportata nello schema");
}

/** Rimette le regolazioni ai valori dello schema. */
function resetTunings() {
  if (!sim) return;
  for (const t of sim.s.net.tunables) sim.s.setTunable(t.id, t.param, t.initial);
  syncTuners();
}

function openTunePop(id: string | null) {
  tuneOpen = id && tunablesOf(id).length ? id : null;
  renderTunePop();
  render();
}

function renderTunePop() {
  const pop = $("#tune-pop");
  const list = tuneOpen ? tunablesOf(tuneOpen) : [];
  if (!sim || !list.length) { pop.hidden = true; pop.replaceChildren(); return; }
  const close = document.createElement("button");
  close.className = "tune-close";
  close.textContent = "✕";
  close.title = "Chiudi";
  close.setAttribute("aria-label", "Chiudi la regolazione");
  close.addEventListener("click", () => openTunePop(null));
  pop.replaceChildren(close, ...list.map(tuner));
  pop.hidden = false;
  syncTuners();
  positionTunePop();
}

/** Riquadro della regolazione accanto al simbolo, dentro l'area di lavoro. */
function positionTunePop() {
  const pop = $("#tune-pop");
  if (!tuneOpen || pop.hidden && !pop.childElementCount) return;
  if (!byId(tuneOpen)) { pop.hidden = true; return; }
  const b = compBox(tuneOpen), stage = $("#stage").getBoundingClientRect();
  const x0 = b.x * view.k + view.x, x1 = (b.x + b.w) * view.k + view.x, y0 = b.y * view.k + view.y;
  if (x1 < 0 || x0 > stage.width || y0 > stage.height || (b.y + b.h) * view.k + view.y < 0) { pop.hidden = true; return; }
  pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = x1 + 12 + w > stage.width - 8 ? x0 - w - 12 : x1 + 12;
  pop.style.left = `${Math.max(8, Math.min(stage.width - w - 8, left))}px`;
  pop.style.top = `${Math.max(8, Math.min(stage.height - h - 8, y0))}px`;
}

document.addEventListener("input", (e) => {
  const input = (e.target as Element).closest<HTMLInputElement>("[data-tune]");
  const t = input && tuneByKey(input.dataset.tune!);
  if (!t) return;
  setTuning(t, Number(input.value) / TUNE_UNIT[t.kind].k);
});

$("#properties").addEventListener("pointerdown", (e) => {
  const sw = target(e).closest("[data-switch]") as HTMLElement | null;
  if (sw && sim) { e.preventDefault(); pressSwitch(sw.dataset.switch!); return; }
  const b = (target(e).closest("[data-cmd]") as HTMLElement | null);
  if (!b || !sim) return;
  e.preventDefault();
  const [id, side, ovr] = b.dataset.cmd!.split("|") as [string, "14" | "12", string?];
  if (ovr) pressOverride(id, side);
  else pressCommand(id, side);
});
window.addEventListener("pointerup", () => { if (held || heldSwitch) releaseHeld(); });
window.addEventListener("pointercancel", () => { if (held || heldSwitch) releaseHeld(); });

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
  if (!doc.components.length && !doc.annotations?.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const a of doc.annotations ?? []) {
    const b = annBoxOf(a);
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
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

/**
 * Parte del foglio non coperta dai pannelli che gli stanno sopra (legenda, barra dello zoom), in coordinate
 * dello schermo relative al foglio. Ogni pannello toglie il lato che lascia più spazio libero.
 */
function freeArea(): { x: number; y: number; w: number; h: number } {
  const r = svg.getBoundingClientRect();
  let x0 = 0, y0 = 0, x1 = r.width, y1 = r.height;
  for (const sel of ["#legend", "#view-tools"]) {
    const e = document.querySelector<HTMLElement>(sel);
    if (!e || e.hidden) continue;
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const bx0 = b.left - r.left, by0 = b.top - r.top, bx1 = b.right - r.left, by1 = b.bottom - r.top;
    // il pannello non tocca l'area ancora libera
    if (bx1 <= x0 || bx0 >= x1 || by1 <= y0 || by0 >= y1) continue;
    const options = [
      { x0: Math.max(x0, bx1), y0, x1, y1 }, // a destra del pannello
      { x0, y0, x1: Math.min(x1, bx0), y1 }, // a sinistra
      { x0, y0: Math.max(y0, by1), x1, y1 }, // sotto
      { x0, y0, x1, y1: Math.min(y1, by0) }, // sopra
    ].filter((o) => o.x1 - o.x0 > r.width * 0.4 && o.y1 - o.y0 > r.height * 0.4);
    if (!options.length) continue; // pannello troppo grande: meglio coperto che minuscolo
    const best = options.reduce((a, o) => ((o.x1 - o.x0) * (o.y1 - o.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? o : a));
    ({ x0, y0, x1, y1 } = best);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function fitView() {
  const r = freeArea();
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const sheet = currentSheet();
  if (sheet) {
    const s = sheetRect(sheet), pad = 30;
    const k = Math.min(r.w / (s.w + 2 * pad), r.h / (s.h + 2 * pad));
    view = { k, x: cx - (s.x + s.w / 2) * k, y: cy - (s.y + s.h / 2) * k };
    return render();
  }
  const box = contentBox();
  if (!box) { view = { x: cx, y: cy, k: 1 }; return render(); }
  const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  const pad = 40;
  const k = Math.max(0.3, Math.min(2, Math.min(r.w / (x1 - x0 + 2 * pad), r.h / (y1 - y0 + 2 * pad))));
  view = { k, x: cx - ((x0 + x1) / 2) * k, y: cy - ((y0 + y1) / 2) * k };
  render();
}

// --- fogli del progetto ------------------------------------------------------------------

/** Apre un foglio: ognuno ha la sua vista, ritrovata tornandoci. */
function goToPage(i: number) {
  if (i < 0 || i >= pages.length || i === active) return;
  releaseHeld();
  pageViews.set(pages[active]!.id, { ...view });
  active = i;
  doc = pages[i]!.doc;
  selection = null;
  closeSheetMenu();
  const v = pageViews.get(pages[i]!.id);
  if (v) { view = { ...v }; render(); } else fitView();
  renderProperties();
  renderStatus();
}

/** Apre il foglio del componente, lo seleziona e lo porta al centro della vista. */
function revealComponent(id: string) {
  const i = pageOfComponent(pages, id);
  if (i < 0) return;
  goToPage(i);
  select({ kind: "component", id });
  centerOn(id);
}

/** Cartiglio del nuovo foglio: stesso formato e stessi dati di quello aperto, numerazione a parte. */
function newPageSheet(): SheetData | undefined {
  const s = doc.sheet;
  if (!s) return undefined;
  const { origin: _o, bom: _b, ...rest } = s;
  return { ...rest, origin: [0, 0] };
}

function addPage() {
  if (sim) return;
  const id = newPageId(pages);
  const sheet = newPageSheet();
  const page: Page = { id, name: defaultPageName(pages.length + 1),
                       doc: { ...emptyCircuit(doc.name), ...(sheet ? { sheet } : {}) } };
  mutate(() => { pages.splice(active + 1, 0, page); });
  goToPage(active + 1);
  toast(`Aggiunto «${page.name}»`);
}

function renamePage(i: number, name: string) {
  const n = name.trim();
  if (!n || n === pages[i]?.name) return;
  mutate(() => { pages[i]!.name = n; });
  renderTabs();
}

function duplicatePageAt(i: number) {
  if (sim) return;
  const src = pages[i];
  if (!src) return;
  mutate(() => {
    const copy = duplicatePage(src, newPageId(pages), `${src.name} (copia)`, freeId);
    pages.splice(i + 1, 0, copy);
  });
  goToPage(i + 1);
  const refs = src.doc.components.some((c) => c.type in REFERENCE_TYPES);
  toast(`Duplicato «${src.name}»: i componenti hanno sigle nuove` +
        (refs ? ", i rimandi finiscono in «(copia)» e restano staccati finché non li rinomini" : ""));
}

function deletePage(i: number) {
  if (sim) return;
  if (pages.length < 2) { toast("Il progetto ha sempre almeno un foglio"); return; }
  const gone = pages[i]!;
  const keep = i === active ? (i > 0 ? i - 1 : 0) : active > i ? active - 1 : active;
  mutate(() => {
    pages.splice(i, 1);
    active = keep;
    doc = pages[active]!.doc;
    selection = null;
  });
  pageViews.delete(gone.id);
  const v = pageViews.get(pages[active]!.id);
  if (v) { view = { ...v }; render(); } else fitView();
  toast(`Eliminato «${gone.name}» (Ctrl+Z per tornare indietro)`);
}

/** Sposta il foglio `from` alla posizione `to`; il foglio aperto resta aperto. */
function movePage(from: number, to: number) {
  if (sim || from === to || to < 0 || to >= pages.length) return;
  const open = pages[active]!;
  mutate(() => {
    const [p] = pages.splice(from, 1);
    pages.splice(to, 0, p!);
    active = pages.indexOf(open);
  });
}

/** Fogli con errori o avvisi di validazione, per il segno sulle schede. */
function pageIssues(): Map<number, "error" | "warning"> {
  const out = new Map<number, "error" | "warning">();
  for (const i of analysis.issues) {
    if (!i.component) continue;
    const p = pageOfComponent(pages, i.component);
    if (p < 0) continue;
    if (i.severity === "error") out.set(p, "error");
    else if (!out.has(p)) out.set(p, "warning");
  }
  return out;
}

let sheetMenuFor = -1; // foglio del menu aperto
function closeSheetMenu() {
  sheetMenuFor = -1;
  const m = document.querySelector("#sheet-menu");
  if (m) (m as HTMLElement).hidden = true;
}

function openSheetMenu(i: number, anchor: HTMLElement) {
  const menu = $("#sheet-menu");
  if (sheetMenuFor === i && !menu.hidden) { closeSheetMenu(); return; }
  sheetMenuFor = i;
  menu.replaceChildren();
  const item = (text: string, act: () => void, disabled = false, cls = "") => {
    const b = document.createElement("button");
    b.textContent = text; b.disabled = disabled;
    if (cls) b.className = cls;
    b.addEventListener("click", () => { closeSheetMenu(); act(); });
    menu.append(b);
  };
  item("Rinomina", () => startPageRename(i), !!sim);
  item("Duplica", () => duplicatePageAt(i), !!sim);
  item("Sposta a sinistra", () => movePage(i, i - 1), !!sim || i === 0);
  item("Sposta a destra", () => movePage(i, i + 1), !!sim || i === pages.length - 1);
  menu.append(document.createElement("hr"));
  item("Elimina il foglio", () => deletePage(i), !!sim || pages.length < 2, "danger");
  menu.hidden = false;
  const stage = $("#stage").getBoundingClientRect(), a = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(stage.width - menu.offsetWidth - 8, a.left - stage.left))}px`;
  menu.style.bottom = `${stage.bottom - a.top + 6}px`;
}

function startPageRename(i: number) {
  const tab = document.querySelector<HTMLElement>(`#sheet-tabs [data-page="${i}"]`);
  if (!tab || sim) return;
  const input = document.createElement("input");
  input.className = "tab-rename";
  input.value = pages[i]!.name;
  input.setAttribute("aria-label", "Nome del foglio");
  input.size = Math.max(8, input.value.length + 2);
  tab.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok: boolean) => {
    if (done) return;
    done = true;
    const value = input.value;
    input.remove();
    if (ok) renamePage(i, value);
    renderTabs(true);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    e.stopPropagation();
  });
  input.addEventListener("blur", () => finish(true));
}

/** scheda trascinata per riordinare i fogli */
let tabDrag: { from: number; x: number; moved: boolean } | null = null;
/** posizione d'arrivo della scheda trascinata, dalla scheda sotto il puntatore */
function tabDropIndex(x: number): number {
  const tabs = [...document.querySelectorAll<HTMLElement>("#sheet-tabs .sheet-tab")];
  for (const [k, t] of tabs.entries()) {
    const r = t.getBoundingClientRect();
    if (x < r.left + r.width / 2) return k;
  }
  return tabs.length - 1;
}
document.addEventListener("pointermove", (e) => {
  if (!tabDrag) return;
  if (!tabDrag.moved && Math.abs(e.clientX - tabDrag.x) < 6) return;
  tabDrag.moved = true;
  const to = tabDropIndex(e.clientX);
  for (const t of document.querySelectorAll<HTMLElement>("#sheet-tabs .sheet-tab")) {
    const k = Number(t.dataset.page);
    t.classList.toggle("dragging", k === tabDrag.from);
    t.classList.toggle("drop", k === to && k !== tabDrag.from);
  }
});
document.addEventListener("pointerup", (e) => {
  const d = tabDrag;
  tabDrag = null;
  if (!d?.moved) return;
  // il clic che segue il trascinamento non deve aprire la scheda
  const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  document.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 0);
  const to = tabDropIndex(e.clientX);
  if (to !== d.from) movePage(d.from, to);
  else renderTabs(true);
});

let tabsKey = "";
/** Schede dei fogli sotto l'area di lavoro. */
function renderTabs(force = false) {
  const bar = document.querySelector<HTMLElement>("#sheet-tabs");
  if (!bar || bar.querySelector(".tab-rename")) return;
  const marks = pageIssues();
  // si ridisegnano solo se cambiano (in simulazione render() gira a ogni fotogramma)
  const key = JSON.stringify([active, !!sim, pages.map((p, i) => [p.name, p.doc.components.length, marks.get(i)])]);
  if (key === tabsKey && !force) return;
  tabsKey = key;
  const list = $("#sheet-tab-list");
  list.replaceChildren();
  pages.forEach((p, i) => {
    const tab = document.createElement("button");
    tab.className = "sheet-tab" + (i === active ? " on" : "");
    tab.dataset.page = String(i);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(i === active));
    tab.title = `Foglio ${i + 1} di ${pages.length}: ${p.name} · ${p.doc.components.length} componenti` +
      (sim ? "" : "\nDoppio clic per rinominare, trascina per spostare, clic destro per il menu");
    const num = document.createElement("span");
    num.className = "tab-num"; num.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "tab-name"; name.textContent = p.name;
    tab.append(num, name);
    const mark = marks.get(i);
    if (mark) {
      const dot = document.createElement("span");
      dot.className = `tab-mark ${mark}`;
      dot.setAttribute("aria-label", mark === "error" ? "con errori" : "con avvisi");
      tab.append(dot);
    }
    if (i === active) {
      const more = document.createElement("span");
      more.className = "tab-more"; more.textContent = "▾";
      more.setAttribute("aria-label", "Menu del foglio");
      more.addEventListener("click", (e) => { e.stopPropagation(); openSheetMenu(i, tab); });
      tab.append(more);
    }
    tab.addEventListener("click", () => goToPage(i));
    tab.addEventListener("dblclick", () => startPageRename(i));
    tab.addEventListener("contextmenu", (e) => { e.preventDefault(); goToPage(i); openSheetMenu(i, tab); });
    tab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || sim || target(e).closest(".tab-more")) return;
      tabDrag = { from: i, x: e.clientX, moved: false };
    });
    list.append(tab);
  });
  $<HTMLButtonElement>("#btn-add-sheet").disabled = !!sim;
}

$("#btn-add-sheet").addEventListener("click", () => addPage());
document.addEventListener("pointerdown", (e) => {
  if (sheetMenuFor >= 0 && !target(e).closest("#sheet-menu, .tab-more")) closeSheetMenu();
});

/** Sigla e fogli dove prosegue ogni rimando (ricalcolati a ogni disegno). */
let refTargets = new Map<string, ReferenceTarget[]>();

// --- interazioni sul foglio ----------------------------------------------------------

type Drag =
  | { mode: "wire"; from: string; start: PortPoint }
  | { mode: "move"; id: string; dx: number; dy: number; before: string; moved: boolean }
  /** sigla e descrizione di un componente, trascinate rispetto al simbolo */
  | { mode: "label"; id: string; dx: number; dy: number; before: string; moved: boolean }
  /** più componenti insieme (selezione multipla o blocco), con le pieghe delle linee tra loro */
  | { mode: "group"; ids: string[]; sx: number; sy: number; start: Record<string, [number, number]>;
      points: Map<number, Pt[]>; before: string; moved: boolean; clicked?: string;
      anns: AnnotationData[]; last: [number, number] }
  | { mode: "marquee"; sx: number; sy: number; add: string[]; addAnns: string[] }
  /** maniglia di un'annotazione: angolo o lato, punto di una linea (v), metà di un tratto (m), punta del richiamo */
  | { mode: "annh"; id: string; handle: string; sx: number; sy: number; start: AnnotationData; before: string; moved: boolean }
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
  const xref = e.button === 0 ? t.closest<SVGElement>("[data-goto]") : null;
  if (xref) {
    // rimando: si va al primo rimando compagno su un altro foglio
    const next = (refTargets.get(xref.dataset.goto!) ?? []).find((x) => x.page !== active);
    if (next) { e.preventDefault(); revealComponent(next.id); return; }
  }
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
      if (side.dataset.override) pressOverride(comp.dataset.component!, side.dataset.side as "14" | "12");
      else pressCommand(comp.dataset.component!, side.dataset.side as "14" | "12");
      return;
    }
    if (comp && manualSwitches().some((x) => x.id === comp.dataset.component)) {
      e.preventDefault();
      pressSwitch(comp.dataset.component!);
      return;
    }
    if (comp) {
      const id = comp.dataset.component!;
      select({ kind: "component", id });
      // regolazione: si apre accanto al simbolo (un secondo clic la chiude)
      if (tunablesOf(id).length) openTunePop(tuneOpen === id ? null : id);
      else if (tuneOpen) openTunePop(null);
      return;
    }
    if (tuneOpen) openTunePop(null);
  }
  svg.setPointerCapture(e.pointerId);

  const bend = t.closest<SVGElement>("[data-bend]");
  const labelEl = t.closest<SVGTextElement>("[data-label-for]");
  const annHandle = t.closest<SVGElement>("[data-ann-handle]");
  const annEl = t.closest<SVGElement>("[data-ann]");
  if (!sim && annHandle && selection?.kind === "annotation" && e.button === 0) {
    const a = annById(selection.id)!;
    drag = { mode: "annh", id: a.id, handle: annHandle.dataset.annHandle!, sx: w.x, sy: w.y,
             start: structuredClone(a), before: snapshot(), moved: false };
  } else if (!sim && annEl && e.button === 0 && !spaceHeld) {
    const id = annEl.dataset.ann!;
    if (e.shiftKey) {
      // Maiusc+clic: aggiunge o toglie l'annotazione dalla selezione
      const anns = selectedAnns();
      select(selectionOf(selectedIds(), anns.includes(id) ? anns.filter((x) => x !== id) : [...anns, id]));
      drag = null;
      return;
    }
    if (!selectedAnns().includes(id)) select({ kind: "annotation", id });
    if (annClicked(id)) { drag = null; return; }
    const a = annById(id)!;
    if (a.locked) { drag = null; return; }
    let ids = selectedIds(), anns = selectedAnns();
    if (selection?.kind === "annotation" && a.kind === "rect" && a.carry) {
      // il contorno porta con sé i componenti (e le altre annotazioni) che racchiude
      const box = { x: a.x, y: a.y, w: a.w, h: a.h };
      ids = doc.components.map((c) => c.id).filter((cid) => { const l = layoutOf(cid); return insideBox(box, l.x, l.y); });
      anns = [id, ...(doc.annotations ?? []).filter((x) => x.id !== id && contains(box, annBoxOf(x))).map((x) => x.id)];
    }
    drag = groupDrag(ids, w, undefined, anns);
  } else if (!sim && labelEl && e.button === 0) {
    const id = labelEl.dataset.labelFor!;
    if (labelClicked(id)) { drag = null; return; }
    // il testo trascinato è centrato sul punto: si parte dal centro di quello che si vede
    const bb = labelEl.getBBox();
    const y = Number(labelEl.getAttribute("y"));
    drag = { mode: "label", id, dx: w.x - (bb.x + bb.width / 2), dy: w.y - y, before: snapshot(), moved: false };
  } else if (!sim && bend && e.button === 0) {
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
  } else if (!sim && comp && e.button === 0 && compClicked(comp.dataset.component!)) {
    // doppio clic sul simbolo: la finestra dei suoi dati
    const id = comp.dataset.component!;
    drag = null;
    select({ kind: "component", id });
    openPropsDialog({ kind: "component", id });
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
    if (ids.length > 1 || selectedAnns().length) drag = groupDrag(ids, w, clicked);
    else {
      const l = layoutOf(id);
      drag = { mode: "move", id, dx: w.x - l.x, dy: w.y - l.y, before: snapshot(), moved: false };
    }
  } else if (!sim && blockEl && e.button === 0) {
    const id = blockEl.dataset.block!;
    if (selection?.kind !== "block" || selection.id !== id) select({ kind: "block", id });
    drag = groupDrag(selectedIds(), w);
  } else if (!sim && e.button === 0 && !line && !spaceHeld && !e.shiftKey && compClicked("")) {
    // doppio clic sul vuoto: la finestra dello schema e del foglio
    drag = null;
    select(null);
    openPropsDialog({ kind: "schema" });
  } else if (!sim && e.button === 0 && !line && !spaceHeld) {
    // trascinando sul vuoto: riquadro di selezione (con Maiusc si aggiunge alla selezione)
    drag = { mode: "marquee", sx: w.x, sy: w.y, add: e.shiftKey ? selectedIds() : [], addAnns: e.shiftKey ? selectedAnns() : [] };
  } else if (!sim && line && e.button === 0) {
    const index = Number(line.dataset.connection);
    if (selection?.kind !== "connection" || selection.index !== index || selection.quiet) select({ kind: "connection", index });
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
    if (drag.last[0] === dx && drag.last[1] === dy) return;
    drag.last = [dx, dy];
    for (const start of drag.anns) {
      const i = doc.annotations?.findIndex((a) => a.id === start.id) ?? -1;
      if (i < 0) continue;
      const copy = structuredClone(start);
      moveAnn(copy, dx, dy);
      doc.annotations![i] = copy;
    }
    for (const id of drag.ids) {
      const [x, y] = drag.start[id]!;
      const l = layoutOf(id);
      l.x = x + dx; l.y = y + dy;
    }
    drag.points.forEach((pts, i) => { doc.connections[i]!.points = pts.map(([x, y]) => [x + dx, y + dy]); });
    drag.moved = true;
    render();
  } else if (drag.mode === "annh") {
    if (dragAnnHandle(drag, w)) { drag.moved = true; render(); }
  } else if (drag.mode === "marquee") {
    const m = $("#marquee");
    m.setAttribute("x", String(Math.min(drag.sx, w.x))); m.setAttribute("y", String(Math.min(drag.sy, w.y)));
    m.setAttribute("width", String(Math.abs(w.x - drag.sx))); m.setAttribute("height", String(Math.abs(w.y - drag.sy)));
    m.style.display = "";
  } else if (drag.mode === "label") {
    const l = layoutOf(drag.id);
    // passo fine (metà griglia): i testi si allineano senza restare legati alla griglia dei simboli
    const half = GRID / 2;
    const nx = Math.round((w.x - drag.dx - l.x) / half) * half, ny = Math.round((w.y - drag.dy - l.y) / half) * half;
    if (!l.label || l.label[0] !== nx || l.label[1] !== ny) { l.label = [nx, ny]; drag.moved = true; render(); }
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
    if (d.moved) { straightenLines(d.ids); commit(d.before); }
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
    const area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const anns = [...new Set([...d.addAnns, ...(doc.annotations ?? []).filter((a) => contains(area, annBoxOf(a))).map((a) => a.id)])];
    select(selectionOf(ids, anns));
    return;
  }
  if (d.mode === "annh") {
    if (d.handle === "leader" && d.moved) attachLeader(d.id, e);
    if (d.moved) commit(d.before);
    else if (d.handle.startsWith("v")) vertexClicked(d.id, Number(d.handle.slice(1)));
    return;
  }
  if (d.mode === "move" || d.mode === "bend" || d.mode === "label") {
    if (d.moved && d.mode === "move") straightenLines([d.id]);
    if (d.moved && d.mode === "bend" && doc.connections[d.index]) straightenConnection(doc.connections[d.index]!);
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
  const type = isWire(c) ? WIRE_JUNCTION : JUNCTION;
  return splitConnection(doc, index, at, nextId(type), bendsBefore, total ? before / total : 0.5, type);
}

/** Collega la porta `from` a una linea esistente, con un punto di connessione dove la si lascia. */
function connectToLine(from: string, index: number, w: { x: number; y: number }) {
  if (sim) return;
  const line = doc.connections[index];
  if (line && isElectricRef(from) !== isWire(line)) { toast(MIXED_MSG); return; }
  mutate(() => {
    const ref = splitLine(index, w);
    if (ref) doc.connections.push(lastTube && !isElectricRef(from) ? { from, to: ref, tube: { ...lastTube } } : { from, to: ref });
  });
  select({ kind: "connection", index: doc.connections.length - 1, quiet: true });
}

/** Trascinamento di più componenti: posizioni di partenza e pieghe delle linee tra loro. */
function groupDrag(ids: string[], w: { x: number; y: number }, clicked?: string, anns: string[] = selectedAnns()): Drag {
  const set = new Set(ids);
  const start: Record<string, [number, number]> = {};
  for (const id of ids) { const l = layoutOf(id); start[id] = [l.x, l.y]; }
  const points = new Map<number, Pt[]>();
  doc.connections.forEach((c, i) => {
    if (c.points && set.has(splitRef(c.from)[0]) && set.has(splitRef(c.to)[0])) points.set(i, c.points.map((p) => [...p] as Pt));
  });
  const annStart = anns.map(annById).filter((a): a is AnnotationData => !!a && !a.locked).map((a) => structuredClone(a));
  return { mode: "group", ids, sx: w.x, sy: w.y, start, points, before: snapshot(), moved: false, clicked,
           anns: annStart, last: [0, 0] };
}

/** Trascina una maniglia di annotazione; true se qualcosa è cambiato. */
function dragAnnHandle(d: Extract<Drag, { mode: "annh" }>, w: { x: number; y: number }): boolean {
  const a = annById(d.id);
  if (!a) return false;
  const before = JSON.stringify(a);
  const s = d.start;
  if ((a.kind === "rect" || a.kind === "ellipse") && (s.kind === "rect" || s.kind === "ellipse")) {
    let x0 = s.x, y0 = s.y, x1 = s.x + s.w, y1 = s.y + s.h;
    const dx = w.x - d.sx, dy = w.y - d.sy, h = d.handle, min = GRID;
    if (h.includes("w")) x0 = Math.min(snap(s.x + dx), x1 - min);
    if (h.includes("e")) x1 = Math.max(snap(s.x + s.w + dx), x0 + min);
    if (h.includes("n")) y0 = Math.min(snap(s.y + dy), y1 - min);
    if (h.includes("s")) y1 = Math.max(snap(s.y + s.h + dy), y0 + min);
    Object.assign(a, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  } else if (a.kind === "line") {
    if (d.handle.startsWith("m")) {
      // dal punto a metà del tratto nasce un nuovo punto, che poi si trascina
      const i = Number(d.handle.slice(1)) + 1;
      a.points.splice(i, 0, [snap(w.x), snap(w.y)]);
      d.handle = `v${i}`;
      d.start = structuredClone(a);
      return true;
    }
    const i = Number(d.handle.slice(1));
    if (a.points[i]) a.points[i] = [snap(w.x), snap(w.y)];
  } else if (a.kind === "text" && a.leader && d.handle === "leader") {
    a.leader = { ...a.leader, x: snap(w.x), y: snap(w.y) };
    delete a.leader.attach;
  }
  return JSON.stringify(a) !== before;
}

/** Al rilascio della punta di un richiamo su un componente, la punta si aggancia al componente. */
function attachLeader(id: string, e: { clientX: number; clientY: number }) {
  const a = annById(id);
  if (a?.kind !== "text" || !a.leader) return;
  const comp = document.elementsFromPoint(e.clientX, e.clientY)
    .map((x) => x.closest<SVGElement>("[data-component]")).find((x) => x)?.dataset.component;
  const p = comp ? compPos(comp) : null;
  if (!comp || !p) return;
  a.leader = { ...a.leader, x: a.leader.x - p[0], y: a.leader.y - p[1], attach: comp };
  toast(`Richiamo agganciato a ${comp}: segue il componente`);
}

// doppio clic su un punto di una linea disegnata: lo toglie (ne restano almeno due)
let lastVertexClick = { key: "", at: 0 };
function vertexClicked(id: string, k: number) {
  const key = `${id}:${k}`, now = performance.now();
  const double = lastVertexClick.key === key && now - lastVertexClick.at < 450;
  lastVertexClick = double ? { key: "", at: 0 } : { key, at: now };
  const a = annById(id);
  if (!double || a?.kind !== "line" || a.points.length <= 2) return;
  mutate(() => { const x = annById(id); if (x?.kind === "line") x.points.splice(k, 1); });
}

// doppio clic su un testo disegnato: si scrive nel pannello
let lastAnnClick = { id: "", at: 0 };
function annClicked(id: string): boolean {
  const now = performance.now();
  const double = lastAnnClick.id === id && now - lastAnnClick.at < 450;
  lastAnnClick = double ? { id: "", at: 0 } : { id, at: now };
  if (!double) return false;
  const field = document.querySelector<HTMLTextAreaElement | HTMLInputElement>('#properties [name="ann-text"], #properties [name="ann-title"]');
  if (!field) return false;
  field.focus(); field.select();
  return true;
}

// doppio clic su un componente (o sul vuoto, id ""): si aprono i suoi dati (la cattura del puntatore assorbe "dblclick")
let lastCompClick = { id: "", at: 0 };
function compClicked(id: string): boolean {
  const now = performance.now();
  const double = lastCompClick.id === id && now - lastCompClick.at < 450;
  lastCompClick = double ? { id: "", at: 0 } : { id, at: now };
  return double;
}

// doppio clic sul testo di un componente: lo rimette nella posizione automatica
let lastLabelClick = { id: "", at: 0 };
function labelClicked(id: string): boolean {
  const now = performance.now();
  const double = lastLabelClick.id === id && now - lastLabelClick.at < 450;
  lastLabelClick = double ? { id: "", at: 0 } : { id, at: now };
  if (!double || !doc.layout[id]?.label) return false;
  mutate(() => { delete layoutOf(id).label; });
  return true;
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
  // in simulazione la rotellina su un riduttore o uno strozzatore ne cambia la regolazione
  const over = sim ? target(e).closest<SVGElement>("[data-component]")?.dataset.component : undefined;
  if (over && tunablesOf(over).length) { wheelTune(over, e); return; }
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
               e.dataTransfer?.types.includes("application/x-pneutrack-annotation") ||
               e.dataTransfer?.types.includes("application/x-pneutrack-block") ||
               e.dataTransfer?.types.includes("application/x-pneutrack-valve"))) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
});
svg.addEventListener("drop", (e) => {
  const annKey = e.dataTransfer?.getData("application/x-pneutrack-annotation");
  if (annKey) { e.preventDefault(); addAnnotation(annKey, toWorld(e)); return; }
  const lib = e.dataTransfer?.getData("application/x-pneutrack-block");
  if (lib) { e.preventDefault(); insertLibraryBlock(Number(lib), toWorld(e)); return; }
  const valve = e.dataTransfer?.getData("application/x-pneutrack-valve");
  if (valve) {
    e.preventDefault();
    const saved = valveLibrary()[Number(valve)];
    if (saved) insertValve(saved.data, toWorld(e));
    return;
  }
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
  if (e.key === "Escape" && !$("#manual-dialog").hidden) { closeManual(); return; }
  if (e.key === "Escape" && !$("#bom-dialog").hidden) { closeBom(); return; }
  if (e.key === "Escape" && !$("#export-dialog").hidden) { closeExportScope(null); return; }
  if (e.key === "Escape" && sheetMenuFor >= 0) { closeSheetMenu(); return; }
  if (e.key === "Escape" && (!$("#issues-panel").hidden || document.querySelector("details.menu[open]"))) { closePopups(); return; }
  if (typing) return;
  // PagSu / PagGiù: foglio precedente e successivo (anche in simulazione)
  if ((e.key === "PageUp" || e.key === "PageDown") && !mod && $("#export-dialog").hidden) {
    e.preventDefault();
    goToPage(active + (e.key === "PageDown" ? 1 : -1));
    return;
  }
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
  else if (mod && key === "a") { e.preventDefault(); selectAll(); }
  else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); }
  else if (key === "r" && !mod) rotateSelection();
  else if (key === "h" && !mod) mirrorSelection("h");
  else if (key === "v" && !mod) mirrorSelection("v");
  else if (e.key === "Escape") select(null);
  else if (e.key === "Enter" && selection?.kind === "component") { e.preventDefault(); openPropsDialog({ kind: "component", id: selection.id }); }
  else if (key === "f" && !mod) fitView();
});

function selectAll() {
  select(selectionOf(doc.components.map((c) => c.id), (doc.annotations ?? []).map((a) => a.id)));
}

/** Zoom attorno al centro del foglio visibile. */
function zoomBy(factor: number) {
  const r = svg.getBoundingClientRect();
  const mx = r.width / 2, my = r.height / 2;
  const k = Math.max(0.25, Math.min(4, factor ? view.k * factor : 1));
  view.x = mx - ((mx - view.x) * k) / view.k;
  view.y = my - ((my - view.y) * k) / view.k;
  view.k = k;
  render();
}

function togglePlay() {
  if (!sim) return;
  sim.playing = !sim.playing;
  sim.last = performance.now();
  updatePlayButton();
}

/** Annotazioni lette da file o archivio: solo voci valide; la chiave sparisce se non ce ne sono. */
function cleanAnnotations() {
  if (doc.annotations === undefined) return;
  const anns = normalizeAnnotations(doc.annotations);
  if (anns.length) doc.annotations = anns; else delete doc.annotations;
}

/** Sostituisce i fogli con quelli di un file e apre il primo (senza toccare la storia). */
function setPages(data: Partial<CircuitDoc>) {
  const name = typeof data.name === "string" ? data.name : "";
  pages = splitPages(JSON.parse(JSON.stringify(data)));
  pageViews.clear();
  for (const p of pages) {
    doc = p.doc;
    doc.name = name;
    let i = 0;
    for (const c of doc.components) {
      upgradeComponent(c); // parametri delle versioni precedenti (vite unica dell'ammortizzo)
      if (!doc.layout[c.id]) doc.layout[c.id] = { x: (i % 5) * 160, y: Math.floor(i / 5) * 140, rot: 0 };
      i++;
    }
    cleanAnnotations();
    straightenLines(); // schemi salvati con le porte di prima: si tolgono i gradini rimasti
  }
  active = 0;
  doc = pages[0]!.doc;
  selection = null;
}

/** Nome del progetto, uguale su tutti i fogli. */
function setProjectName(name: string) {
  for (const p of pages) p.doc.name = name;
}

function loadDoc(data: Partial<CircuitDoc>, { fit = true } = {}) {
  stopSim();
  const before = snapshot();
  setPages(data);
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
/** stato della bozza appena aperta (esempio, file importato, schema nuovo): finché resta così non c'è lavoro da tenere */
let draftBase: string | null = null;

const isDirty = () => fileJson() !== savedSnapshot;
const fileName = () => `${fileBaseName(doc.name)}.pneu.json`;
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
    remember(STORAGE_KEY, fileJson());
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
    text = allComponents().length ? "Bozza non salvata" : "";
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
    if (asNew && doc.name) setProjectName(doc.name.endsWith(" (copia)") ? doc.name : `${doc.name} (copia)`);
  }
  const current = project;
  const snap = fileJson();
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
  const kept = await keepDraft();
  try {
    const p = await store!.get(id);
    clearTimeout(autosaveTimer);
    project = null; // il caricamento non deve finire nel progetto precedente
    loadDoc(p.circuit);
    history.past = []; history.future = [];
    project = { id: p.id, createdAt: p.createdAt };
    savedSnapshot = fileJson();
    lastSavedAt = p.updatedAt;
    saveState = "saved";
    remember(SESSION_KEY, p.id);
    remember(STORAGE_KEY, null);
    closeProjects();
    renderStatus();
    toast(kept ? `Aperto «${p.name}». La bozza di prima è tra i progetti: «${kept}»` : `Aperto «${p.name}»`);
  } catch (err) {
    toast(`Impossibile aprire il progetto: ${(err as Error).message}`);
  }
}

/**
 * Una bozza con lavoro non salvato non si perde aprendo un altro schema: diventa un progetto.
 * Restituisce il nome del progetto creato ("" se non c'era niente da tenere).
 */
async function keepDraft(): Promise<string> {
  if (project || !store || !allComponents().length || fileJson() === draftBase) return "";
  if (!doc.name || doc.name === emptyCircuit().name) setProjectName(`Bozza del ${new Date().toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
  await saveProject({ silent: true });
  return project && saveState === "saved" ? doc.name : "";
}

async function newDocument(data: Partial<CircuitDoc> = emptyCircuit(), message = "Nuovo schema") {
  if (project && isDirty()) await saveProject();
  const kept = await keepDraft();
  project = null;
  savedSnapshot = null;
  saveState = "idle";
  remember(SESSION_KEY, null);
  loadDoc(data);
  draftBase = fileJson();
  toast(kept ? `${message}. La bozza di prima è tra i progetti: «${kept}»` : `${message} (Ctrl+Z per tornare indietro)`);
}

/**
 * Disegno pulito per le esportazioni: tema chiaro, senza selezione, sul foglio dello schema
 * (o sul formato più piccolo che lo contiene). `take` legge #viewport in quello stato.
 * `page` è il foglio da disegnare (quello aperto se manca).
 */
function withPrintView<T>(take: (viewport: SVGGElement, sheet: SheetData & { origin: [number, number] }) => T, page = active): T {
  const saved = { selection, active, doc, theme: document.documentElement.dataset.theme };
  active = page;
  doc = pages[page]!.doc;
  const savedSheet = doc.sheet;
  let sheet = currentSheet();
  if (!sheet) {
    const box = contentBox()!;
    const orientation: Orientation = box.h > box.w ? "portrait" : "landscape";
    const format = smallestFormat(box, orientation);
    sheet = { format, orientation, origin: centeredOrigin({ format, orientation }, box) };
  }
  try {
    selection = null;
    doc.sheet = sheet;
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.print = "1";
    render();
    return take($("#viewport") as unknown as SVGGElement, sheet as SheetData & { origin: [number, number] });
  } finally {
    if (savedSheet) doc.sheet = savedSheet; else delete doc.sheet;
    selection = saved.selection;
    active = saved.active;
    doc = saved.doc;
    if (saved.theme) document.documentElement.dataset.theme = saved.theme;
    else delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.print;
    render();
  }
}

const exportBase = () => fileName().replace(/\.pneu\.json$/, "");
/** un foglio da esportare: con il foglio di disegno scelto, o con qualcosa disegnato sopra */
const printable = (i: number) => { const d = pages[i]!.doc; return !!d.sheet || !!d.components.length || !!d.annotations?.length; };
/** suffisso del file di un foglio: «-F2-Comando» */
const pageSuffix = (i: number) =>
  `-F${i + 1}` + (pages[i]!.name === defaultPageName(i + 1) ? "" : `-${pages[i]!.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_")}`);

/**
 * Fogli da esportare: con un foglio solo quello; con più fogli si chiede se il foglio aperto o
 * tutti (null se si annulla). I fogli vuoti senza cornice restano fuori.
 */
async function exportPages(what: string): Promise<number[] | null> {
  if (pages.length > 1) {
    const scope = await chooseExportScope(what);
    if (!scope) return null;
    if (scope === "all") {
      const list = pages.map((_, i) => i).filter(printable);
      if (!list.length) { toast("I fogli sono vuoti: niente da esportare"); return null; }
      return list;
    }
  }
  if (!doc.components.length && !doc.annotations?.length) { toast("Lo schema è vuoto: niente da esportare"); return null; }
  return [active];
}

let scopeResolve: ((v: "current" | "all" | null) => void) | null = null;
function chooseExportScope(what: string): Promise<"current" | "all" | null> {
  scopeResolve?.(null);
  const dlg = $("#export-dialog");
  $("#export-title").textContent = `Esporta ${what}`;
  $("#export-current").textContent = `Solo il foglio aperto: ${active + 1} «${pages[active]!.name}»`;
  $("#export-all").textContent = `Tutti i fogli (${pages.length})`;
  const note: Record<string, string> = {
    PDF: "Con tutti i fogli il PDF ha una pagina per foglio, ognuna nel formato del suo foglio.",
    SVG: "L'SVG non ha pagine: con tutti i fogli si scarica un file per foglio.",
    DXF: "Con tutti i fogli il DXF li mette affiancati da sinistra a destra, nello stesso file.",
  };
  $("#export-note").textContent = note[what] ?? "";
  dlg.hidden = false;
  $<HTMLButtonElement>("#export-all").focus();
  return new Promise((resolve) => { scopeResolve = resolve; });
}
function closeExportScope(v: "current" | "all" | null) {
  $("#export-dialog").hidden = true;
  const r = scopeResolve;
  scopeResolve = null;
  r?.(v);
}
$("#export-dialog").addEventListener("click", (e) => {
  const t = target(e);
  if (t.closest("#export-current")) closeExportScope("current");
  else if (t.closest("#export-all")) closeExportScope("all");
  else if (t.closest("[data-xact=close]") || t === e.currentTarget) closeExportScope(null);
});

/** SVG vettoriale del foglio, con gli stili scritti sugli elementi (si apre in Inkscape, Illustrator, browser). */
async function exportSvg() {
  const list = await exportPages("SVG");
  if (!list) return;
  for (const i of list) {
    const { svg, format } = withPrintView((vp, sheet) => {
      const out = sheetSvg(vp, sheetRect(sheet), sheetSizeMm(sheet));
      for (const t of out.querySelectorAll("text")) t.setAttribute("font-family", "Helvetica, Arial, sans-serif");
      out.setAttribute("font-family", "Helvetica, Arial, sans-serif");
      return { svg: new XMLSerializer().serializeToString(out), format: sheet.format };
    }, i);
    const name = `${exportBase()}${list.length > 1 ? pageSuffix(i) : ""}.svg`;
    try {
      const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`], { type: "image/svg+xml" });
      if ((await exportFile(name, blob)) === "saved") toast(`Esportato ${name} (${format})`);
      else return;
    } catch (err) {
      toast(`SVG non riuscito: ${(err as Error).message}`);
      return;
    }
  }
}

/** DXF in millimetri per AutoCAD e altri CAD, con un layer per tipo di elemento; più fogli affiancati. */
async function exportDxf() {
  const list = await exportPages("DXF");
  if (!list) return;
  const formats: string[] = [];
  const text = sheetsToDxf(list.length, (k, emit) => withPrintView((vp, sheet) => {
    formats.push(sheet.format);
    emit(vp, sheetRect(sheet));
  }, list[k]!));
  const name = `${exportBase()}.dxf`;
  try {
    const what = list.length > 1 ? `${list.length} fogli` : formats[0];
    if ((await exportFile(name, new Blob([dxfBytes(text)], { type: "application/dxf" }))) === "saved") toast(`Esportato ${name} (${what}, mm)`);
  } catch (err) {
    toast(`DXF non riuscito: ${(err as Error).message}`);
  }
}

/** PDF vettoriale (se il foglio non è scelto, il formato più piccolo che contiene il disegno); una pagina per foglio. */
async function exportPdf() {
  const list = await exportPages("PDF");
  if (!list) return;
  const sheets = list.map((i) => withPrintView((vp, sheet) => ({
    svg: sheetSvg(vp, sheetRect(sheet), sheetSizeMm(sheet)), mm: sheetSizeMm(sheet), format: sheet.format }), i));
  try {
    toast("Preparo il PDF…");
    const blob = await svgsToPdf(sheets, doc.name || "Schema");
    const name = fileName().replace(/\.pneu\.json$/, "") + ".pdf";
    const r = await exportFile(name, blob);
    if (r === "saved") toast(`Esportato ${name} (${list.length > 1 ? `${list.length} fogli` : sheets[0]!.format})`);
  } catch (err) {
    toast(`PDF non riuscito: ${(err as Error).message}`);
  }
}

async function exportCurrent() {
  try {
    const r = await exportFile(fileName(), JSON.stringify(fileDoc(), null, 2) + "\n");
    if (r === "saved") toast(`Esportato ${fileName()}`);
  } catch (err) {
    toast(`Esportazione non riuscita: ${(err as Error).message}`);
  }
}

$<HTMLInputElement>("#file-input").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) await openFile(file);
});

/** Apre un file .pneu.json (progetto o schema): da «Importa file…» o dal sistema con l'app installata. */
async function openFile(file: File) {
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
}

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
          mutate(() => { setProjectName(name); });
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

$("#sim-bar").addEventListener("click", (e) => {
  const mode = target(e).closest<HTMLElement>("button")?.dataset.dmode;
  if (mode === "time" || mode === "step") { diagramMode = mode; showDiagram(true); return; }
  switch (target(e).closest<HTMLElement>("button")?.dataset.act) {
    case "sim-play": togglePlay(); break;
    case "sim-reset": resetSim(); break;
    case "sim-diagram": showDiagram(!diagramOpen); break;
  }
});
$("#selbar").addEventListener("click", (e) => {
  switch (target(e).closest<HTMLElement>("button")?.dataset.act) {
    case "rotate": rotateSelection(); break;
    case "mirror-h": mirrorSelection("h"); break;
    case "mirror-v": mirrorSelection("v"); break;
    case "duplicate": duplicateSelection(); break;
    case "delete": deleteSelection(); break;
    case "props": if (selection?.kind === "component") openPropsDialog({ kind: "component", id: selection.id }); break;
  }
});
$("#view-tools").addEventListener("click", (e) => {
  switch (target(e).closest<HTMLElement>("button")?.dataset.act) {
    case "zoom-in": zoomBy(1.25); break;
    case "zoom-out": zoomBy(0.8); break;
    case "zoom-reset": zoomBy(0); break;
    case "fit": fitView(); break;
  }
});
let railScrollUntil = 0;
const PALETTE_HIDDEN_KEY = "pneutrack.palette-hidden.v1";
const paletteHidden = () => $("#app").classList.contains("palette-hidden");
function setPaletteHidden(hidden: boolean) {
  $("#app").classList.toggle("palette-hidden", hidden);
  for (const b of document.querySelectorAll<HTMLElement>("#rail button[data-rail]:not([data-rail=sheet])")) {
    b.setAttribute("aria-expanded", String(!hidden));
    b.title = (b.title.split(" · ")[0] ?? "") + (hidden ? " · clic per aprire la palette" : " · clic di nuovo per nasconderla");
  }
  try { localStorage.setItem(PALETTE_HIDDEN_KEY, hidden ? "1" : "0"); } catch { /* nessuna memoria */ }
  render();
}
// barra laterale: porta alla sezione della palette (o la nasconde), o al pannello del foglio
$("#rail").addEventListener("click", (e) => {
  const where = target(e).closest<HTMLElement>("button")?.dataset.rail;
  if (!where || sim) return;
  if (where === "sheet") { openPropsDialog({ kind: "schema" }); return; }
  // clic sulla sezione già attiva: la palette si nasconde; con la palette nascosta si riapre
  const active = document.querySelector<HTMLElement>("#rail button.on")?.dataset.rail === where;
  if (!paletteHidden() && active) { setPaletteHidden(true); return; }
  if (paletteHidden()) setPaletteHidden(false);
  for (const b of document.querySelectorAll<HTMLElement>("#rail button")) b.classList.toggle("on", b.dataset.rail === where);
  railScrollUntil = performance.now() + 900; // lo scorrimento che segue non cambia la sezione scelta
  const cat = where === "elec" ? "Elettrico" : where === "blocks" ? "Blocchi salvati" : where === "ann" ? ANN_PRESETS[0]!.group : null;
  const pal = $("#palette");
  const search = $<HTMLInputElement>("#palette-search");
  if (search.value) { search.value = ""; search.dispatchEvent(new Event("input")); }
  if (!cat) { pal.scrollTo({ top: 0, behavior: "smooth" }); return; }
  const g = pal.querySelector<HTMLDetailsElement>(`.palette-group[data-cat="${cat}"]`);
  if (g) { g.open = true; pal.scrollTo({ top: g.offsetTop - pal.offsetTop - 50, behavior: "smooth" }); }
});
// rail attiva seguendo lo scorrimento della palette
$("#palette").addEventListener("scroll", () => {
  if (performance.now() < railScrollUntil) return;
  const pal = $("#palette");
  // in fondo alla palette le ultime sezioni non arrivano in cima: resta la sezione scelta
  if (pal.scrollTop > 0 && pal.scrollTop + pal.clientHeight >= pal.scrollHeight - 4) return;
  let where = "pneu";
  for (const g of pal.querySelectorAll<HTMLElement>(".palette-group")) {
    if (g.offsetTop - pal.offsetTop - 60 > pal.scrollTop) break;
    where = g.dataset.cat === "Elettrico" ? "elec" : g.dataset.cat === "Blocchi salvati" ? "blocks"
      : g.classList.contains("ann-group") ? "ann" : "pneu";
  }
  for (const b of document.querySelectorAll<HTMLElement>("#rail button")) b.classList.toggle("on", b.dataset.rail === where);
}, { passive: true });

$("#toolbar").addEventListener("click", (e) => {
  const act = target(e).closest<HTMLElement>("button")?.dataset.act;
  if (act && target(e).closest(".menu-body")) closePopups();
  if (act?.startsWith("align-")) { alignSelection(act.slice(6) as AlignMode); return; }
  switch (act) {
    case "mode-draw": stopSim(); break;
    case "import": $("#file-input").click(); break;
    case "select-all": if (!sim) selectAll(); break;
    case "issues": { const open = $("#issues-panel").hidden; closePopups(); showIssues(open); break; }
    case "projects": openProjects(); break;
    case "new": newDocument(); break;
    case "save": saveProject(); break;
    case "save-as": saveProject({ asNew: true }); break;
    case "export": exportCurrent(); break;
    case "pdf": exportPdf(); break;
    case "export-svg": exportSvg(); break;
    case "export-dxf": exportDxf(); break;
    case "bom": openBom(); break;
    case "undo": undo(); break;
    case "copy": copySelection(); break;
    case "cut": cutSelection(); break;
    case "paste": pasteClip(); break;
    case "redo": redo(); break;
    case "whats-new": openNews(); break;
    case "manual": openManual(); break;
    case "sim": startSim(); break;
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

// --- manuale d'uso ------------------------------------------------------------------
let manualPart = MANUAL_PARTS[0]!.file;
const manualHtml = new Map<string, string>();

/** Apre il manuale sulla parte `file` (se manca, l'ultima letta) e scorre fino all'ancora. */
function openManual(file = manualPart, anchor = "") {
  const part = MANUAL_PARTS.find((p) => p.file === file) ?? MANUAL_PARTS[0]!;
  manualPart = part.file;
  const tabs = $("#manual-tabs");
  tabs.replaceChildren(...MANUAL_PARTS.map((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.title;
    b.dataset.manualPart = p.file;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(p.file === part.file));
    return b;
  }));
  const body = $("#manual-body");
  if (!manualHtml.has(part.file)) manualHtml.set(part.file, renderManual(part.text));
  body.innerHTML = manualHtml.get(part.file)!;
  $("#manual-dialog").hidden = false;
  const el = anchor ? body.querySelector<HTMLElement>(`[id="${CSS.escape(anchor)}"]`) : null;
  if (el) el.scrollIntoView({ block: "start" }); else body.scrollTop = 0;
}
function closeManual() { $("#manual-dialog").hidden = true; }

// --- distinta componenti --------------------------------------------------------------
/** foglio di ogni sigla per la distinta (solo con più fogli) */
const bomSheetOf = () => (pages.length > 1 ? (id: string) => pageOfComponent(pages, id) + 1 || undefined : undefined);

function openBom() {
  const rows = billOfMaterials(mergedCircuit(pages));
  const sheetOf = bomSheetOf();
  const table = $("#bom-table");
  table.replaceChildren();
  const head = document.createElement("tr");
  BOM_HEADERS.forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    if (i === 0 || i === 5) th.className = "num";
    head.append(th);
  });
  table.append(head);
  for (const r of rows) {
    const tr = document.createElement("tr");
    bomCells(r, sheetOf).forEach((c, i) => {
      const td = document.createElement("td");
      td.textContent = c;
      if (i === 0 || i === 5) td.className = "num";
      tr.append(td);
    });
    table.append(tr);
  }
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6">Nessun componente da ordinare nello schema.</td>`;
    table.append(tr);
  }
  const onSheet = $<HTMLInputElement>("#bom-on-sheet");
  onSheet.checked = !!doc.sheet?.bom;
  onSheet.disabled = !!sim;
  $("#bom-dialog").hidden = false;
}
function closeBom() { $("#bom-dialog").hidden = true; }
const bomBase = () => fileName().replace(/\.pneu\.json$/, "") + "-distinta";
async function downloadBom(kind: "csv" | "pdf") {
  const rows = billOfMaterials(mergedCircuit(pages));
  const sheetOf = bomSheetOf();
  if (!rows.length) { toast("Nessun componente da ordinare nello schema"); return; }
  const name = `${bomBase()}.${kind}`;
  try {
    const blob = kind === "csv"
      ? new Blob([bomCsv(rows, sheetOf)], { type: "text/csv;charset=utf-8" })
      : await bomToPdf(rows.map((r) => bomCells(r, sheetOf)), BOM_HEADERS, doc.name || "Senza nome",
                       `${rows.reduce((n, r) => n + r.qty, 0)} pezzi` + (pages.length > 1 ? ` su ${pages.length} fogli` : "") +
                       ` · ${today()} · Pneutrack v${APP_VERSION}`);
    if ((await exportFile(name, blob)) === "saved") toast(`Esportato ${name}`);
  } catch (err) {
    toast(`Esportazione non riuscita: ${(err as Error).message}`);
  }
}
$("#bom-dialog").addEventListener("click", (e) => {
  const act = target(e).closest<HTMLElement>("[data-bact]")?.dataset.bact;
  if (target(e).id === "bom-dialog" || act === "close") closeBom();
  else if (act === "csv" || act === "pdf") void downloadBom(act);
});
$("#bom-on-sheet").addEventListener("change", () => {
  const on = $<HTMLInputElement>("#bom-on-sheet").checked;
  if (on && !doc.sheet) fitSheetToDrawing();
  mutate(() => { if (!doc.sheet) return; if (on) doc.sheet.bom = true; else delete doc.sheet.bom; });
});
$("#manual-dialog").addEventListener("click", (e) => {
  const t = target(e);
  if (t.id === "manual-dialog" || t.closest("[data-mact=close]")) { closeManual(); return; }
  const link = t.closest<HTMLElement>("[data-manual-part], [data-manual-anchor]");
  if (!link) return;
  e.preventDefault();
  openManual(link.dataset.manualPart || manualPart, link.dataset.manualAnchor ?? "");
});
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

window.addEventListener("resize", () => { positionSelbar(); renderDiagramPanel(); });

async function init() {
  renderPalette();
  $('#rail [data-rail="pneu"]').classList.add("on");
  let palHidden = false;
  try { palHidden = localStorage.getItem(PALETTE_HIDDEN_KEY) === "1"; } catch { /* */ }
  setPaletteHidden(palHidden);
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
  if (restored?.components) setPages(restored);
  history.past = []; history.future = [];
  changed();
  if (allComponents().length) fitView();

  store = await openStore();
  document.body.dataset.store = store.kind;
  let lastId: string | null = null;
  try { lastId = localStorage.getItem(SESSION_KEY); } catch { lastId = null; }
  if (lastId && !restored?.components) {
    try {
      const p = await store.get(lastId);
      setPages(p.circuit);
      project = { id: p.id, createdAt: p.createdAt };
      savedSnapshot = fileJson();
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
  get doc() { return doc; }, get pages() { return pages; }, get active() { return active; },
  get file() { return fileDoc(); }, goToPage: (i: number) => goToPage(i), addPage: () => addPage(),
  get analysis() { return analysis; }, get project() { return project; }, get selection() { return selection; },
  get store() { return store?.kind; }, get sim() { return sim?.s ?? null; },
  isDirty, loadDoc, addComponent, connect: (a: string, b: string) => connect(a, b), saveProject,
  startSim, stopSim, pressCommand, releaseHeld,
};
export type { ConnectionData };
const ready = init();
// app installabile: service worker, «Installa l'app», versioni nuove, file aperti dal sistema
initPwa({ toast, openFile: (file) => ready.then(() => openFile(file)) });
