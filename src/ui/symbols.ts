// Simboli grafici dei componenti, nello stile ISO 1219 (disegni originali).
//
// geometry(comp, state) restituisce, in coordinate locali con origine al centro:
//   { w, h, ports: { nome: {x, y, dir} }, svg }
// Le porte coincidono con quelle del modello (numerazione ISO 5599).
// `state` (facoltativo) è lo stato di simulazione: posizione della valvola, corsa del cilindro.
import { isElectric, isMechanical, isPilot, type Actuation, type ComponentData } from "../model/components";
import { Quantity } from "../model/units";
import type { Position } from "../sim/network";

export type Dir = [number, number];
export interface PortGeom { x: number; y: number; dir: Dir }
export interface Geometry { w: number; h: number; ports: Record<string, PortGeom>; svg: string }
export interface SymbolState {
  /** posizione della valvola */
  position?: Position;
  /** frazione di corsa del cilindro 0..1 */
  stroke?: number;
  /** lati della valvola comandati in questo momento */
  active14?: boolean;
  active12?: boolean;
  /** comando manuale ausiliario azionato, per lato */
  override14?: boolean;
  override12?: boolean;
  /** contatto azionato (pulsante premuto, finecorsa o sensore attivo, relè commutato) */
  actuated?: boolean;
  /** bobina eccitata, lampada accesa */
  energized?: boolean;
  /** sigle delle bobine che eccitano i solenoidi della valvola */
  coil14?: string;
  coil12?: string;
}

const S = 40; // lato di una casella di valvola
const STUB = 10; // tratto di linea tra simbolo e porta

const up: Dir = [0, -1], down: Dir = [0, 1], left: Dir = [-1, 0], right: Dir = [1, 0];

const line = (x1: number, y1: number, x2: number, y2: number, cls = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${cls ? ` class="${cls}"` : ""}/>`;
const rect = (x: number, y: number, w: number, h: number, cls = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"${cls ? ` class="${cls}"` : ""}/>`;
const path = (d: string, cls = "") => `<path d="${d}"${cls ? ` class="${cls}"` : ""}/>`;
const circle = (cx: number, cy: number, r: number, cls = "") =>
  `<circle cx="${cx}" cy="${cy}" r="${r}"${cls ? ` class="${cls}"` : ""}/>`;

const esc = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const text = (x: number, y: number, t: string, cls: string) =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="middle">${esc(t)}</text>`;

function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 6) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p1 = [x2 - size * Math.cos(a - 0.4), y2 - size * Math.sin(a - 0.4)];
  const p2 = [x2 - size * Math.cos(a + 0.4), y2 - size * Math.sin(a + 0.4)];
  return path(`M${x2},${y2} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]} Z`, "fill");
}
/** Triangolo vuoto (ISO 1219: mezzo pneumatico), punta in (x2, y2) nella direzione x1,y1 → x2,y2. */
function hollowHead(x1: number, y1: number, x2: number, y2: number, size = 7) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p1 = [x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45)];
  const p2 = [x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45)];
  return path(`M${x2},${y2} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]} Z`, "body");
}
/** Molla regolabile: freccia obliqua che attraversa la molla (ISO 1219). */
const adjustArrow = (x1: number, y1: number, x2: number, y2: number) => line(x1, y1, x2, y2) + arrowHead(x1, y1, x2, y2, 5);
const arrow = (x1: number, y1: number, x2: number, y2: number) => line(x1, y1, x2, y2) + arrowHead(x1, y1, x2, y2);

function zigzag(x1: number, y1: number, x2: number, y2: number, n = 6, amp = 5) {
  const dx = (x2 - x1) / n, dy = (y2 - y1) / n;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  let d = `M${x1},${y1}`;
  for (let i = 1; i < n; i++) {
    const s = i % 2 ? amp : -amp;
    d += ` L${x1 + dx * i + nx * s},${y1 + dy * i + ny * s}`;
  }
  return path(`${d} L${x2},${y2}`, "nofill");
}

// --- valvole distributrici -------------------------------------------------

// Modulo ISO 1219-1 (5.12): M = 10 unità di disegno; la casella di una valvola è alta 4M.
const M = 10;
// Posizione orizzontale delle porte dal bordo sinistro della casella. ISO 1219-1 RF020: porte adiacenti a 2M
// l'una dall'altra, sul reticolo. Fino a quattro vie la casella è un quadrato 4M × 4M (101V7); con cinque vie è
// il rettangolo 6M × 4M (101V8), l'unico in cui tre porte stanno a 2M.
const FIVE_PORT = { top: { 4: 2 * M, 2: 4 * M }, bottom: { 5: M, 1: 3 * M, 3: 5 * M } };
const VALVE_LAYOUT: Record<string, { top: Record<string, number>; bottom: Record<string, number> }> = {
  "2/2": { top: { 2: 2 * M }, bottom: { 1: 2 * M } },
  "3/2": { top: { 2: 2 * M }, bottom: { 1: M, 3: 3 * M } },
  "3/3": { top: { 2: 2 * M }, bottom: { 1: M, 3: 3 * M } },
  "4/2": { top: { 4: M, 2: 3 * M }, bottom: { 1: M, 3: 3 * M } },
  "4/3": { top: { 4: M, 2: 3 * M }, bottom: { 1: M, 3: 3 * M } },
  "4/3E": { top: { 4: M, 2: 3 * M }, bottom: { 1: M, 3: 3 * M } },
  "5/2": FIVE_PORT, "5/3": FIVE_PORT, "5/3E": FIVE_PORT, "5/3P": FIVE_PORT,
};
/** larghezza della casella: 4M fino a quattro vie (101V7), 6M con cinque (101V8) */
const boxWidth = (fn: string) => (fn.startsWith("5/") ? 6 * M : S);
/** ISO 1219-1 RF004: l'asse dei comandi sta 1M sopra il bordo inferiore della casella */
const ACT_Y = S / 2 - M;

type BoxItem = ["a", string, string] | ["x", string];
// contenuto delle caselle, da sinistra (lato 14) a destra (lato 12)
const VALVE_BOXES: Record<string, BoxItem[][]> = {
  "2/2": [[["a", "1", "2"]], [["x", "1"], ["x", "2"]]],
  "3/2": [[["a", "1", "2"], ["x", "3"]], [["a", "2", "3"], ["x", "1"]]],
  "4/2": [[["a", "1", "4"], ["a", "2", "3"]], [["a", "1", "2"], ["a", "4", "3"]]],
  // tre posizioni: la centrale è quella di riposo (centro chiuso, o utilizzi in scarico)
  "3/3": [[["a", "1", "2"], ["x", "3"]], [["x", "1"], ["x", "2"], ["x", "3"]], [["a", "2", "3"], ["x", "1"]]],
  "4/3": [
    [["a", "1", "4"], ["a", "2", "3"]],
    [["x", "1"], ["x", "2"], ["x", "3"], ["x", "4"]],
    [["a", "1", "2"], ["a", "4", "3"]],
  ],
  "4/3E": [
    [["a", "1", "4"], ["a", "2", "3"]],
    [["a", "4", "3"], ["a", "2", "3"], ["x", "1"]],
    [["a", "1", "2"], ["a", "4", "3"]],
  ],
  // nelle 5 vie lo scarico che non lavora in una posizione è chiuso: 5 col lato 14, 3 col lato 12 (ISO 1219-1)
  "5/2": [[["a", "1", "4"], ["a", "2", "3"], ["x", "5"]], [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]]],
  "5/3": [
    [["a", "1", "4"], ["a", "2", "3"], ["x", "5"]],
    [["x", "1"], ["x", "2"], ["x", "3"], ["x", "4"], ["x", "5"]],
    [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]],
  ],
  "5/3E": [
    [["a", "1", "4"], ["a", "2", "3"], ["x", "5"]],
    [["a", "4", "5"], ["a", "2", "3"], ["x", "1"]],
    [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]],
  ],
  "5/3P": [
    [["a", "1", "4"], ["a", "2", "3"], ["x", "5"]],
    [["a", "1", "4"], ["a", "1", "2"], ["x", "3"], ["x", "5"]],
    [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]],
  ],
};

/** tratteggio dell'alimentazione esterna del pilota (422V1): dal comando alla porta, sotto, sul reticolo */
const extPilotLine = (o: (d: number) => number) =>
  path(`M${o(5)},${ACT_Y + 8} L${o(5)},${S / 2 + 4} L${o(10)},${S / 2 + 4} L${o(10)},${S / 2 + STUB}`, "nofill dash");

function actuator(kind: string, x0: number, side: -1 | 1, active: boolean) {
  const o = (d: number) => x0 + side * d;
  // i disegni sono scritti attorno all'asse y = 0 e spostati sull'asse dei comandi (RF004)
  const y = (v: number) => ACT_Y + v;
  const cls = active ? ` class="active"` : "";
  let body = "";
  switch (kind) {
    case "solenoid":
      body = line(o(0), y(0), o(4), y(0)) + rect(Math.min(o(4), o(14)), y(-8), 10, 16) + line(o(4), y(8), o(14), y(-8));
      break;
    case "proportional":
      // solenoide proporzionale (X10170): solenoide attraversato dalla freccia obliqua di regolazione
      body = line(o(0), y(0), o(4), y(0)) + rect(Math.min(o(4), o(14)), y(-8), 10, 16) + line(o(4), y(8), o(14), y(-8)) +
        adjustArrow(o(2), y(10), o(16), y(-10));
      break;
    case "piezo":
      // attuatore piezoelettrico: rettangolo con la pila di dischi (tratti paralleli)
      body = line(o(0), y(0), o(4), y(0)) + rect(Math.min(o(4), o(14)), y(-8), 10, 16) +
        line(o(7), y(-8), o(7), y(8)) + line(o(9), y(-8), o(9), y(8)) + line(o(11), y(-8), o(11), y(8));
      break;
    case "stepper":
      // motore passo passo: cerchio del motore con il gradino
      body = line(o(0), y(0), o(6), y(0)) + circle(o(13), y(0), 7, "nofill") +
        path(`M${o(9)},${y(3)} L${o(11)},${y(3)} L${o(11)},${y(0)} L${o(14)},${y(0)} L${o(14)},${y(-3)} L${o(17)},${y(-3)}`, "nofill");
      break;
    case "pilot":
      body = line(o(9), y(0), o(20), y(0), "dash") + hollowHead(o(10), y(0), o(1), y(0), 9);
      break;
    case "pilot_differential":
      // pilotaggio differenziale: due superfici di area diversa sullo stesso lato
      body = hollowHead(o(9), y(0), o(1), y(0), 8) + rect(Math.min(o(9), o(12)), y(-7), 3, 14) +
        rect(Math.min(o(12), o(17)), y(-4), 5, 8) + line(o(17), y(0), o(20), y(0), "dash");
      break;
    case "manual":
      body = line(o(0), y(0), o(14), y(0)) + line(o(14), y(-8), o(14), y(8)) +
        path(`M${o(14)},${y(-8)} Q${o(20)},${y(0)} ${o(14)},${y(8)}`, "nofill");
      break;
    case "pushpull_detent":
      // pulsante a tirare e spingere (X10030) con le tacche di arresto
      body = line(o(0), y(0), o(14), y(0)) + line(o(14), y(-8), o(14), y(8)) +
        line(o(14), y(-8), o(19), y(-8)) + line(o(14), y(8), o(19), y(8)) +
        line(o(1), y(-5), o(9), y(-5)) +
        path(`M${o(2)},${y(-5)} L${o(3.5)},${y(-2)} L${o(5)},${y(-5)} L${o(6.5)},${y(-2)} L${o(8)},${y(-5)}`, "nofill");
      break;
    case "rotary_knob":
      // selettore rotativo: manopola con l'indice, e le tacche delle posizioni
      body = line(o(0), y(0), o(9), y(0)) + circle(o(14), y(0), 5, "nofill") + line(o(14), y(-5), o(14), y(1)) +
        line(o(1), y(-5), o(8), y(-5)) +
        path(`M${o(2)},${y(-5)} L${o(3.5)},${y(-2)} L${o(5)},${y(-5)} L${o(6.5)},${y(-2)} L${o(8)},${y(-5)}`, "nofill");
      break;
    case "key":
      // chiave (X10060): stelo con i denti e l'impugnatura ad anello
      body = line(o(0), y(0), o(13), y(0)) + line(o(4), y(0), o(4), y(4)) + line(o(7), y(0), o(7), y(3)) +
        circle(o(17), y(0), 4, "nofill");
      break;
    case "lever":
    case "lever_detent":
      // leva: asta inclinata con impugnatura; con arresto, le tacche 0,5M sopra lo stelo (RF006)
      body = line(o(0), y(0), o(10), y(0)) + line(o(10), y(0), o(18), y(-11)) + circle(o(18.5), y(-12), 2, "fill");
      if (kind === "lever_detent") {
        body += line(o(1), y(-5), o(9), y(-5)) +
          path(`M${o(2)},${y(-5)} L${o(3.5)},${y(-2)} L${o(5)},${y(-5)} L${o(6.5)},${y(-2)} L${o(8)},${y(-5)}`, "nofill");
      }
      break;
    case "pedal":
      body = line(o(0), y(0), o(10), y(0)) + line(o(10), y(7), o(20), y(-7)) + line(o(10), y(7), o(13), y(7));
      break;
    case "pedal_double":
      // pedale a bilanciere: imperniato al centro, si aziona nei due versi
      body = line(o(0), y(0), o(14), y(0)) + line(o(8), y(7), o(20), y(-7)) + circle(o(14), y(0), 1.5, "fill");
      break;
    case "mechanical":
      body = line(o(0), y(0), o(10), y(0)) + circle(o(15), y(0), 5, "nofill");
      break;
    case "plunger":
      // tastatore: asta con testa arrotondata
      body = line(o(0), y(0), o(10), y(0)) +
        path(`M${o(10)},${y(-5)} L${o(14)},${y(-5)} Q${o(19)},${y(0)} ${o(14)},${y(5)} L${o(10)},${y(5)} Z`, "nofill");
      break;
    case "plunger_adjustable":
      // tastatore a corsa regolabile: tastatore attraversato dalla freccia di regolazione
      body = line(o(0), y(0), o(10), y(0)) +
        path(`M${o(10)},${y(-5)} L${o(14)},${y(-5)} Q${o(19)},${y(0)} ${o(14)},${y(5)} L${o(10)},${y(5)} Z`, "nofill") +
        adjustArrow(o(6), y(8), o(19), y(-9));
      break;
    case "roller_oneway":
      // rullo su leva ribaltabile
      body = line(o(0), y(0), o(8), y(0)) + line(o(8), y(0), o(13), y(-6)) + circle(o(16), y(-9), 4, "nofill") +
        circle(o(8), y(0), 1.5, "fill");
      break;
    case "solenoid_pilot":
    case "solenoid_pilot_ext": {
      // valvola pilota (triangolo) comandata dal solenoide
      const xa = Math.min(o(0), o(10));
      body = rect(xa, y(-8), 10, 16) + path(`M${o(8)},${y(-4)} L${o(8)},${y(4)} L${o(2)},${y(0)} Z`, "body") +
        rect(Math.min(o(10), o(20)), y(-8), 10, 16) + line(o(10), y(8), o(20), y(-8));
      if (kind === "solenoid_pilot_ext") body += extPilotLine(o);
      break;
    }
    case "air_return":
    case "air_return_ext":
      // molla pneumatica (ISO 1219-1 X10080, X10100): riquadro con triangolo vuoto verso la valvola. La sua
      // alimentazione è una linea continua (401V1), non un pilotaggio: interna, entra nel corpo valvola;
      // esterna, scende alla porta
      body = rect(Math.min(o(0), o(10)), y(-8), 10, 16) + path(`M${o(8)},${y(-4)} L${o(8)},${y(4)} L${o(2)},${y(0)} Z`, "body");
      if (kind === "air_return") body += path(`M${o(5)},${y(-8)} L${o(5)},${y(-14)} L${o(-4)},${y(-14)}`, "nofill");
      else body += path(`M${o(5)},${y(8)} L${o(5)},${S / 2 + 4} L${o(10)},${S / 2 + 4} L${o(10)},${S / 2 + STUB}`, "nofill");
      break;
    case "spring":
      body = zigzag(o(0), y(0), o(18), y(0), 6, 6);
      break;
    case "spring_air_return":
      // molla e molla pneumatica insieme: la molla meccanica oltre il riquadro della molla pneumatica
      body = rect(Math.min(o(0), o(10)), y(-8), 10, 16) + path(`M${o(8)},${y(-4)} L${o(8)},${y(4)} L${o(2)},${y(0)} Z`, "body") +
        path(`M${o(5)},${y(-8)} L${o(5)},${y(-14)} L${o(-4)},${y(-14)}`, "nofill") + zigzag(o(10), y(0), o(22), y(0), 4, 5);
      break;
  }
  return `<g${cls} data-side="${side < 0 ? "14" : "12"}">${body}</g>`;
}

/** dove finisce il disegno di ciascun comando elettrico, dal bordo della valvola */
const ELECTRIC_REACH: Partial<Record<string, number>> = {
  solenoid: 14, solenoid_pilot: 20, solenoid_pilot_ext: 20, proportional: 16, piezo: 14, stepper: 20,
};

/**
 * Comando manuale ausiliario (ISO 1219-1 X10040, X10290): pulsante in serie al solenoide, sul lato esterno;
 * con arresto, la tacca che lo tiene premuto. È un gruppo a sé, così in simulazione si aziona con un clic.
 */
function overrideMark(kind: string, act: string, x0: number, side: -1 | 1, active: boolean) {
  const reach = ELECTRIC_REACH[act];
  if (reach === undefined || (kind !== "push" && kind !== "detent")) return "";
  const o = (d: number) => x0 + side * d;
  const y = (v: number) => ACT_Y + v;
  let body = line(o(reach), y(0), o(reach + 5), y(0)) + line(o(reach + 5), y(-5), o(reach + 5), y(5)) +
    path(`M${o(reach + 5)},${y(-5)} Q${o(reach + 9)},${y(0)} ${o(reach + 5)},${y(5)}`, "nofill");
  if (kind === "detent") {
    body += path(`M${o(reach + 0.5)},${y(-5)} L${o(reach + 2)},${y(-2)} L${o(reach + 3.5)},${y(-5)}`, "nofill");
  }
  return `<g${active ? ` class="active"` : ""} data-side="${side < 0 ? "14" : "12"}" data-override="1">${body}</g>`;
}

function valveGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const fn = comp.function && VALVE_BOXES[comp.function] ? comp.function : "5/2";
  const boxes = VALVE_BOXES[fn]!;
  const lay = VALVE_LAYOUT[fn]!;
  const n = boxes.length;
  const B = boxWidth(fn);
  const W = n * B;
  const x0 = -W / 2;
  const rest = x0 + B; // la casella di riposo è la seconda
  const kx = (name: string) => lay.top[name] ?? lay.bottom[name]!;
  const isTop = (name: string) => name in lay.top;

  // in simulazione le caselle scorrono: quella attiva si allinea alle porte
  const activeBox = state?.position === "14" ? 0 : state?.position === "12" ? n - 1 : 1;
  const shift = state?.position ? (1 - activeBox) * B : 0;

  let moving = "";
  boxes.forEach((content, b) => {
    const bx = x0 + b * B;
    moving += rect(bx, -S / 2, B, S, state?.position && b === activeBox ? "box active-box" : "box");
    for (const item of content) {
      if (item[0] === "a") {
        const [, from, to] = item;
        const y1 = isTop(from) ? -S / 2 + 4 : S / 2 - 4;
        const y2 = isTop(to) ? -S / 2 + 4 : S / 2 - 4;
        moving += arrow(bx + kx(from), y1, bx + kx(to), y2);
      } else {
        const x = bx + kx(item[1]);
        const yEdge = isTop(item[1]) ? -S / 2 : S / 2;
        const yIn = isTop(item[1]) ? -S / 2 + 9 : S / 2 - 9;
        moving += line(x, yEdge, x, yIn) + line(x - 5, yIn, x + 5, yIn);
      }
    }
  });
  const a14 = comp.actuation_14 ?? "solenoid";
  const a12 = comp.actuation_12 ?? "spring";
  moving += actuator(a14, x0, -1, !!state?.active14) + actuator(a12, -x0, 1, !!state?.active12);
  const ovr = comp.override ?? "none";
  const hasOverride = ovr !== "none" && (isElectric(a14 as Actuation) || isElectric(a12 as Actuation));
  if (hasOverride) {
    moving += overrideMark(ovr, a14, x0, -1, !!state?.override14) + overrideMark(ovr, a12, -x0, 1, !!state?.override12);
  }
  // finecorsa: sigla del cilindro che preme il rullo
  if (comp.cam_14 && isMechanical(a14 as Actuation)) moving += text(x0 - 15, -16, comp.cam_14, "cam-label");
  if (comp.cam_12 && isMechanical(a12 as Actuation)) moving += text(-x0 + 15, -16, comp.cam_12, "cam-label");
  // bobine del circuito elettrico che eccitano i solenoidi
  if (state?.coil14) moving += text(x0 - 15, -16, state.coil14, "cam-label coil-label");
  if (state?.coil12) moving += text(-x0 + 15, -16, state.coil12, "cam-label coil-label");

  let fixedPart = "";
  const ports: Record<string, PortGeom> = {};
  for (const [name, k] of Object.entries(lay.top)) {
    const x = rest + k;
    fixedPart += line(x, -S / 2, x, -S / 2 - STUB);
    ports[name] = { x, y: -S / 2 - STUB, dir: up };
  }
  for (const [name, k] of Object.entries(lay.bottom)) {
    const x = rest + k;
    fixedPart += line(x, S / 2, x, S / 2 + STUB);
    ports[name] = { x, y: S / 2 + STUB, dir: down };
  }
  // i pilotaggi restano fissi: una linea li collega al comando che si sposta
  if (isPilot(a14 as Actuation)) {
    ports["14"] = { x: x0 - 20, y: ACT_Y, dir: left };
    if (shift > 0) fixedPart += line(x0 - 20, ACT_Y, x0 - 20 + shift, ACT_Y, "dash");
  }
  if (isPilot(a12 as Actuation)) {
    ports["12"] = { x: -x0 + 20, y: ACT_Y, dir: right };
    if (shift < 0) fixedPart += line(-x0 + 20 + shift, ACT_Y, -x0 + 20, ACT_Y, "dash");
  }
  // alimentazione esterna della valvola pilota: porta sotto il comando
  if (a14 === "solenoid_pilot_ext" || a14 === "air_return_ext") {
    ports["14"] = { x: x0 - 10, y: 30, dir: down };
    if (shift) fixedPart += line(x0 - 10, 30, x0 - 10 + shift, 30, a14 === "air_return_ext" ? "" : "dash");
  }
  if (a12 === "solenoid_pilot_ext" || a12 === "air_return_ext") {
    ports["12"] = { x: -x0 + 10, y: 30, dir: down };
    if (shift) fixedPart += line(-x0 + 10 + shift, 30, -x0 + 10, 30, a12 === "air_return_ext" ? "" : "dash");
  }
  const svg = `<g transform="translate(${shift},0)" class="valve-body">${moving}</g>${fixedPart}`;
  return { w: W + 44 + (hasOverride ? 24 : 0), h: S + 2 * STUB, ports, svg };
}


// --- trattamento aria ----------------------------------------------------------

const diamond = (cx: number, cy: number, r: number) =>
  path(`M${cx - r},${cy} L${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} Z`, "body");

const reservoirGeometry = (): Geometry => ({
  w: 56, h: 64, ports: { 1: { x: 0, y: -30, dir: up }, 2: { x: 0, y: 30, dir: down } },
  svg: line(0, -30, 0, -15) + line(0, 15, 0, 30) + `<rect x="-26" y="-15" width="52" height="30" rx="13" class="body"/>`,
});

/**
 * Filtri e separatori (ISO 1219-1 X12100–X12280): rombo dell'elemento di trattamento. La cartuccia è il
 * tratteggio perpendicolare al flusso; il tratto orizzontale in basso è il separatore di condensa, con lo scarico
 * dal vertice inferiore: manuale (tratto libero) o automatico (galleggiante).
 */
function filterGeometry(kind = "manual"): Geometry {
  let svg = line(-30, 0, -16, 0) + line(16, 0, 30, 0) + diamond(0, 0, 16);
  const drain = line(-7, 9, 7, 9) + line(0, 16, 0, 24);
  let h = 44;
  switch (kind) {
    case "auto":
      // scarico automatico: galleggiante sotto il separatore
      svg += line(0, -16, 0, 9, "dash") + line(-7, 9, 7, 9) + line(0, 16, 0, 18) + circle(0, 21, 3, "nofill") + line(0, 24, 0, 28);
      break;
    case "coalescing":
      // a coalescenza: doppia cartuccia fitta e scarico
      svg += line(-3, -13, -3, 9, "dash") + line(3, -13, 3, 9, "dash") + drain;
      break;
    case "carbon":
      // a carboni attivi: cartuccia piena, senza separatore
      svg += rect(-4, -10, 8, 20, "hatch");
      break;
    case "separator":
      // separatore di condensa: niente cartuccia, solo il separatore e lo scarico
      svg += drain;
      break;
    case "centrifugal":
      // separatore centrifugo: freccia curva del moto a ciclone
      svg += path("M-7,-4 A7,5 0 1 1 5,2", "nofill") + arrowHead(1, 4, 5, 2, 5) + drain;
      break;
    case "indicator":
      // indicatore di intasamento: piccolo strumento differenziale collegato a monte e a valle della cartuccia
      svg += line(0, -16, 0, 9, "dash") + drain + circle(0, -26, 5, "body") + arrow(-3, -23, 3, -29) +
        line(-5, -26, -16, -26, "dash") + line(-16, -26, -16, 0, "dash") + line(5, -26, 16, -26, "dash") +
        line(16, -26, 16, 0, "dash");
      h = 64;
      break;
    case "double":
      // doppio: prefiltro e filtro fine in serie
      svg += line(-5, -11, -5, 9, "dash") + line(5, -11, 5, 9, "dash") + line(0, -16, 0, -4) + drain;
      break;
    default:
      svg += line(0, -16, 0, 9, "dash") + drain;
  }
  return { w: 64, h, ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 30, y: 0, dir: right } }, svg };
}

/** Lubrificatore (X12290): tubo di pescaggio dal vertice superiore; con scarico, il tratto dal vertice inferiore. */
const lubricatorGeometry = (drain = false): Geometry => ({
  w: 64, h: 44, ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 30, y: 0, dir: right } },
  svg: line(-30, 0, -16, 0) + line(16, 0, 30, 0) + diamond(0, 0, 16) + line(0, -16, 0, -6) +
    (drain ? line(0, 16, 0, 24) + line(-4, 24, 4, 24) : ""),
});

/** Essiccatore (X12300): rombo con i due triangoli pieni dell'essiccante, affacciati. */
const dryerGeometry = (): Geometry => ({
  w: 64, h: 44, ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 30, y: 0, dir: right } },
  svg: line(-30, 0, -16, 0) + line(16, 0, 30, 0) + diamond(0, 0, 16) +
    path("M-5,-9 L5,-9 L0,-2 Z", "fill") + path("M-5,9 L5,9 L0,2 Z", "fill"),
});

/**
 * Filtro riduttore: filtro e riduttore nello stesso corpo, quindi cornice continua (5.9), non a tratto e punto.
 */
function filterRegulatorGeometry(): Geometry {
  const filter = diamond(-16, 0, 10) + line(-16, -10, -16, 5, "dash") + line(-20, 5, -12, 5) + line(-16, 10, -16, 16);
  const reg = rect(4, -10, 16, 20, "box") + arrow(12, 8, 12, -8) + zigzag(20, 4, 27, 4, 4, 3) + adjustArrow(20, 10, 27, -2);
  return {
    w: 84, h: 48, ports: { 1: { x: -40, y: 0, dir: left }, 2: { x: 40, y: 0, dir: right } },
    svg: line(-40, 0, -26, 0) + line(-6, 0, 4, 0) + line(20, 0, 40, 0) + filter + reg + rect(-30, -18, 60, 38, "nofill"),
  };
}

/** Gruppo FRL, simbolo semplificato (X12330): una casella con il rombo del trattamento e la freccia della regolazione. */
const frlSimplifiedGeometry = (): Geometry => ({
  w: 84, h: 44, ports: { 1: { x: -40, y: 0, dir: left }, 2: { x: 40, y: 0, dir: right } },
  svg: line(-40, 0, -20, 0) + line(20, 0, 40, 0) + rect(-20, -16, 40, 32, "box") + diamond(-6, 0, 8) +
    line(-6, -8, -6, 4, "dash") + arrow(9, 10, 9, -10),
});

function frlGeometry(): Geometry {
  // linea di flusso a y = 0, porte a ±60: sui nodi della griglia
  const box = `<rect x="-46" y="-22" width="92" height="40" class="nofill dashdot"/>`;
  const filter = diamond(-28, 0, 10) + line(-28, -10, -28, 5, "dash") + line(-32, 5, -24, 5);
  const reg = rect(-9, -10, 18, 20, "box") + arrow(0, 8, 0, -8) + zigzag(9, 4, 16, 4, 4, 3) + adjustArrow(9, 10, 16, -2);
  const gauge = circle(0, -17, 5, "body") + line(0, -17, 3, -20);
  const lub = diamond(28, 0, 10) + line(28, -10, 28, -4);
  const flow = line(-60, 0, -38, 0) + line(-18, 0, -9, 0) + line(9, 0, 18, 0) + line(38, 0, 60, 0);
  return {
    w: 124, h: 48, ports: { 1: { x: -60, y: 0, dir: left }, 2: { x: 60, y: 0, dir: right } },
    svg: box + flow + filter + reg + gauge + lub,
  };
}

const gaugeGeometry = (): Geometry => ({
  w: 32, h: 44, ports: { 1: { x: 0, y: 20, dir: down } },
  svg: circle(0, -2, 13, "body") + arrow(-7, 5, 7, -9) + line(0, 11, 0, 20),
});

// --- valvole di blocco e logiche -------------------------------------------------

/**
 * Sfera e sede di un non ritorno (ISO 1219): la sfera è appoggiata dentro la sede a V.
 * dir = 1: passa dal basso verso l'alto (vertice della sede in basso); dir = -1: dall'alto verso il basso.
 * (x, y) è il centro della sfera; il vertice della sede è a y + 8·dir.
 */
const checkElement = (x: number, y: number, dir: 1 | -1 = 1) =>
  path(`M${x - 10},${y - 5 * dir} L${x},${y + 8 * dir} L${x + 10},${y - 5 * dir}`, "nofill") + circle(x, y, 5, "body");

/**
 * Non ritorno (X10690); con la molla (X10700) la molla sta sull'asse della linea, sopra la sfera, e la preme
 * sulla sede.
 */
const checkGeometry = (spring = false): Geometry => ({
  w: 30, h: 60,
  ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: spring
    // X10700: la linea attraversa tutto il simbolo; la sfera poggia nella sede a V aperta verso l'alto e la
    // molla, a tratti quasi orizzontali attorno alla linea, la preme dall'alto
    ? line(0, 30, 0, -30) + path("M-9,1.5 L0,10.5 L9,1.5", "nofill") + circle(0, 5, 4, "body") +
      path("M-8,-19.6 L8,-16 L-8,-12.4 L8,-8.8 L-8,-5.2 L8,-1.6", "nofill")
    : line(0, 30, 0, 6) + checkElement(0, -2) + line(0, -7, 0, -30),
});

const pilotCheckGeometry = (): Geometry => ({
  w: 64, h: 60,
  ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up }, 21: { x: 30, y: 0, dir: right } },
  // ISO 1219-1 X10720: corpo (101V1), sede e sfera, molla (2002V1) sulla sfera, pilotaggio tratteggiato (422V1)
  svg: rect(-14, -14, 28, 30, "box") + line(0, 30, 0, 6) + checkElement(0, -2) + zigzag(-3.5, -5.5, -11, -12, 4, 2.5) +
    line(0, -7, 0, -30) + line(30, 0, 6, 0, "dash"),
});

function logicGeometry(kind: "or" | "and"): Geometry {
  let inner: string;
  if (kind === "or") {
    // ISO 1219-1 X10740: due sedi (2162V1) e la sfera (2163V1); l'uscita si innesta sulla via interna con il punto
    // di connessione dentro il simbolo (501V2)
    inner = line(-8.5, 0, 11, 0) + line(0, 0, 0, -9) + circle(0, 0, 2, "fill") +
      path("M-11,-7 L-18,0 L-11,7", "nofill") + path("M11,-7 L18,0 L11,7", "nofill") + circle(-12.5, 0, 4, "body");
  } else {
    inner = line(-16, -7, -16, 7) + line(16, -7, 16, 7) + rect(-12, -4, 24, 8, "body") +
      line(-16, 0, -12, 0) + line(12, 0, 16, 0);
  }
  return {
    w: 64, h: 40,
    ports: { 1: { x: -30, y: 0, dir: left }, 3: { x: 30, y: 0, dir: right }, 2: { x: 0, y: -20, dir: up } },
    svg: rect(-20, -9, 40, 18, "box") + line(-30, 0, -20, 0) + line(20, 0, 30, 0) + line(0, -9, 0, -20) + inner,
  };
}

const quickExhaustGeometry = (): Geometry => ({
  w: 64, h: 60,
  ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 0, y: -30, dir: up }, 3: { x: 0, y: 30, dir: down } },
  svg: rect(-18, -12, 36, 24, "box") + line(-30, 0, -18, 0) + line(0, -12, 0, -30) + line(0, 12, 0, 30) +
    // ISO 1219-1 X10750: vie interne riunite nel punto di connessione (501V2)
    line(-8.5, 0, 0, 0) + line(0, 0, 0, -12) + line(0, 0, 0, 5) + circle(0, 0, 2, "fill") +
    path("M-11,-7 L-18,0 L-11,7", "nofill") + circle(-12.5, 0, 4, "body") + path("M-6,5 L0,12 L6,5", "nofill"),
});

// --- regolazione -------------------------------------------------------------------

function oneWayFlowGeometry(): Geometry {
  const throttle = path("M-8,-10 Q-1,0 -8,10", "nofill") + path("M8,-10 Q1,0 8,10", "nofill") + arrow(-12, 12, 12, -12);
  const bypass = line(0, -18, 22, -18) + line(22, -18, 22, -6) + line(22, 7, 22, 18) + line(22, 18, 0, 18) +
    checkElement(22, 2, -1);
  return {
    w: 76, h: 60,
    ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
    // ISO 1219-1 X10640: strozzatore e non ritorno sono due funzioni principali dello stesso componente, quindi
    // cornice continua (5.9; il tratto e punto, 5.10, è per più componenti in un gruppo); punti di connessione (501V1)
    svg: line(0, -30, 0, 30) + throttle + bypass + circle(0, -18, 2.5, "fill") + circle(0, 18, 2.5, "fill") +
      rect(-16, -22, 52, 44, "nofill"),
  };
}

function pressureBoxGeometry(kind: "relief"): Geometry {
  void kind;
  const svg = rect(-18, -18, 36, 36, "box") + line(0, 18, 0, 30) + line(18, 0, 30, 0) +
    arrow(6, 12, 6, -12) + zigzag(0, -18, 0, -34, 5, 5) + arrow(-9, -22, 9, -30) +
    line(0, 23, -11, 23, "dash") + line(-11, 23, -11, 18, "dash");
  return {
    w: 64, h: 70,
    ports: { 1: { x: 0, y: 30, dir: down }, 3: { x: 30, y: 0, dir: right } },
    svg,
  };
}

/** valvola 3/2 NC pilotata sul lato 12 con taratura (sequenza) o ritardo (temporizzatore) */
function pilotedValveGeometry(comp: ComponentData, state: SymbolState | undefined, kind: "sequence" | "delay"): Geometry {
  const g = valveGeometry({ ...comp, type: "directional_valve", function: "3/2", actuation_14: "pilot", actuation_12: "spring",
                            cam_14: undefined, cam_12: undefined }, state);
  const p14 = g.ports["14"]!;
  delete g.ports["14"];
  g.ports["12"] = p14;
  const x = p14.x + 8;
  const extra = kind === "sequence"
    // elemento di misura tarabile sopra il pilotaggio
    ? rect(x - 6, -30, 12, 14, "box") + zigzag(x, -30, x, -40, 4, 3) + adjustArrow(x - 6, -32, x + 6, -40) +
      line(x, -16, x, ACT_Y, "dash")
    // strozzatore e piccolo serbatoio sul pilotaggio
    : `<rect x="${x - 8}" y="-34" width="16" height="10" rx="4" class="body"/>` +
      path(`M${x - 4},-20 Q${x},-16 ${x - 4},-12`, "nofill") + path(`M${x + 4},-20 Q${x},-16 ${x + 4},-12`, "nofill") +
      line(x, -24, x, ACT_Y, "dash");
  return { ...g, h: g.h + 30, svg: g.svg + extra };
}

/** Motore pneumatico: un triangolo vuoto rivolto all'interno per ogni senso di rotazione (X11400, X11410). */
const motorGeometry = (oneWay = false): Geometry => ({
  w: 56, h: 64,
  ports: { 1: { x: -10, y: 30, dir: down }, 2: { x: 10, y: 30, dir: down } },
  svg: circle(0, 0, 18, "body") + path("M0,-9 L-5,-17.3 L5,-17.3 Z", "body") +
    (oneWay ? "" : path("M0,9 L-5,17.3 L5,17.3 Z", "body")) +
    line(18, -2, 26, -2) + line(18, 2, 26, 2) + line(-10, 15, -10, 30) + line(10, 15, 10, 30),
});

/** Compressore (X11380): cerchio con il triangolo vuoto rivolto verso l'esterno, sulla mandata, e l'albero. */
const compressorGeometry = (): Geometry => ({
  w: 56, h: 60, ports: { 1: { x: 0, y: -30, dir: up } },
  svg: circle(0, 0, 18, "body") + path("M0,-17.3 L-5,-8 L5,-8 Z", "body") + line(0, -18, 0, -30) +
    line(18, -2, 26, -2) + line(18, 2, 26, 2),
});

/** Pompa del vuoto (X12370): come il compressore, con il triangolo verso lo scarico e l'aspirazione in alto. */
const vacuumPumpGeometry = (): Geometry => ({
  w: 56, h: 60, ports: { 1: { x: 0, y: -30, dir: up } },
  svg: circle(0, 0, 18, "body") + path("M0,17.3 L-5,8 L5,8 Z", "body") + line(0, -18, 0, -30) +
    line(18, -2, 26, -2) + line(18, 2, 26, 2),
});

// --- altri componenti -------------------------------------------------------

const sourceGeometry = (): Geometry => ({
  w: 30, h: 50, ports: { 1: { x: 0, y: -20, dir: up } },
  // sorgente di energia pneumatica (ISO 1219-1 F070V1, RF059; F071V1 è quella idraulica): triangolo vuoto con la punta sulla linea
  svg: path("M0,-10 L-9,6 L9,6 Z", "body") + line(0, -10, 0, -20),
});

const silencerGeometry = (): Geometry => ({
  w: 22, h: 40, ports: { 1: { x: 0, y: -20, dir: up } },
  svg: line(0, -20, 0, -6) + path("M0,-6 L9,6 L-9,6 Z", "nofill") + rect(-9, 6, 18, 6, "hatch"),
});

/** Scarico in atmosfera (ISO 1219): triangolo vuoto con la punta verso la linea. */
const exhaustGeometry = (): Geometry => ({
  w: 22, h: 26, ports: { 1: { x: 0, y: -10, dir: up } },
  svg: line(0, -10, 0, -2) + path("M0,-2 L9,10 L-9,10 Z", "nofill"),
});

/** Punto di connessione: il pallino pieno degli incroci collegati (ISO 1219). */
const junctionGeometry = (): Geometry => ({
  w: 12, h: 12, ports: { 1: { x: 0, y: 0, dir: up } },
  svg: circle(0, 0, 4, "junction-dot"),
});

const plugGeometry = (): Geometry => ({
  w: 16, h: 14, ports: { 1: { x: 0, y: -10, dir: up } },
  // via chiusa (ISO 1219-1 2172V1): tratto trasversale con lo spessore di tutte le altre linee (5.12)
  svg: line(0, -10, 0, 0) + line(-7, 0, 7, 0),
});

function regulatorGeometry(): Geometry {
  const h = S / 2;
  const svg = rect(-h, -h, S, S, "box") +
    line(0, h, 0, h + STUB) + line(0, -h, 0, -h - STUB) +
    arrow(0, h - 2, 0, -h + 2) +
    zigzag(h, 6, h + 16, 6, 5, 5) + adjustArrow(h + 2, 16, h + 14, -4) +
    line(-h, -h + 8, -h - 8, -h + 8, "dash") + line(-h - 8, -h + 8, -h - 8, -h - STUB + 2, "dash") +
    line(-h - 8, -h - STUB + 2, 0, -h - STUB + 2, "dash");
  return {
    w: S + 30, h: S + 2 * STUB,
    ports: { 1: { x: 0, y: h + STUB, dir: down }, 2: { x: 0, y: -h - STUB, dir: up } },
    svg,
  };
}

/** Strozzatore fisso (come nella ISO 1219-3, all. C): i due archi senza la freccia di regolazione. */
const orificeGeometry = (): Geometry => ({
  w: 30, h: 60,
  ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, -30, 0, 30) + path("M-8,-10 Q-1,0 -8,10", "nofill") + path("M8,-10 Q1,0 8,10", "nofill"),
});

/**
 * Valvola di avviamento progressivo (ISO 1219-1 X10250): 2/2 normalmente chiusa pilotata dall'uscita contro una
 * molla, con lo strozzatore regolabile di riempimento in parallelo, nello stesso corpo: due funzioni principali,
 * quindi cornice continua (5.9), e punti di connessione (501V1) dove il ramo dello strozzatore si stacca.
 */
function softStartGeometry(): Geometry {
  const valve = rect(-12, -12, 24, 24, "box") + arrow(5, 10, 5, -10) + line(0, 12, 0, 30) + line(0, -12, 0, -30) +
    zigzag(12, 0, 22, 0, 4, 4) + line(0, -17, -20, -17, "dash") + line(-20, -17, -20, 0, "dash") + hollowHead(-20, 0, -12, 0, 7);
  const bypass = line(0, 23, 32, 23) + line(32, 23, 32, -23) + line(32, -23, 0, -23) +
    path("M26,-8 Q31,0 26,8", "nofill") + path("M38,-8 Q33,0 38,8", "nofill") + arrow(24, 10, 40, -10);
  return {
    w: 96, h: 60,
    ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
    svg: valve + bypass + circle(0, 23, 2.5, "fill") + circle(0, -23, 2.5, "fill") + rect(-28, -26, 74, 52, "nofill"),
  };
}

/** Doppia non ritorno pilotata (ISO 1219-1 X10730): due non ritorno nello stesso corpo, pilotate a croce. */
const doublePilotCheckGeometry = (): Geometry => ({
  w: 72, h: 60,
  ports: { 1: { x: -20, y: 30, dir: down }, 2: { x: -20, y: -30, dir: up }, 3: { x: 20, y: 30, dir: down }, 4: { x: 20, y: -30, dir: up } },
  svg: rect(-34, -16, 68, 34, "box") +
    line(-20, 30, -20, 6) + checkElement(-20, -2) + line(-20, -7, -20, -30) +
    line(20, 30, 20, 6) + checkElement(20, -2) + line(20, -7, 20, -30) +
    // pilotaggio a croce: la linea di ciascun ingresso solleva la sfera dell'altro lato
    line(-20, 13, 13, 3, "dash") + line(20, 13, -13, 3, "dash"),
});

const flowControlGeometry = (): Geometry => ({
  w: 30, h: 60,
  ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, -30, 0, 30) + path("M-8,-10 Q-1,0 -8,10", "nofill") + path("M8,-10 Q1,0 8,10", "nofill") +
    arrow(-12, 12, 12, -12),
});

/** Ammortizzo regolabile (ISO 1219): tampone sul pistone che entra nella testata, con freccia di regolazione. */
function cushionMark(pistonX: number, end: "cap" | "rod") {
  const plug = end === "cap" ? rect(pistonX - 9, -6, 8, 12, "body") : rect(pistonX + 1, -6, 8, 12, "body");
  // freccia di regolazione attraverso l'ammortizzo, dove il tampone entra nella testata (RF048)
  const cx = end === "cap" ? -CYL_END + 5 : CYL_END - 5;
  return plug + line(cx - 9, 13, cx + 9, -13) + arrowHead(cx - 9, 13, cx + 9, -13, 5);
}

/** Pistone magnetico (ISO 1219-1 8.4.28): due piccoli magneti sul bordo del pistone, contro la canna. */
const magnetMark = (x: number, top = -15, bottom = 15) =>
  rect(x - 3, top, 6, 4, "magnet") + rect(x - 3, bottom - 4, 6, 4, "magnet");

/**
 * Camicia del cilindro (101V13) da -CYL_END a CYL_END. ISO 1219-1 RF044: le linee delle porte stanno 0,5M dalle
 * estremità della camicia (qui le porte a ±50, sul reticolo) e il pistone, a riposo, 1M dal fondello.
 */
const CYL_END = 55;
const PISTON_LO = -CYL_END + M, PISTON_HI = CYL_END - M;

function cylinderGeometry(double: boolean, state?: SymbolState, through = false, cushioning = "none",
                          magnet = false, rod2 = 6): Geometry {
  // Il pistone (con i tamponi degli ammortizzi) resta sempre dentro la camicia per tutta la corsa; lo stelo sporge
  // sempre dalla testata (e dal fondello, se passante): la camicia resta aperta dove passa lo stelo (RF045),
  // perché lo stelo, disegnato sopra, ne copre il bordo.
  const lo = PISTON_LO;
  const travel = PISTON_HI - PISTON_LO;
  const tip = CYL_END + M; // estremità dello stelo a pistone rientrato (1M oltre la testata)
  // senza simulazione il simbolo mostra la posizione di riposo (5.4): pistone rientrato
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0));
  const pistonX = lo + frac * travel;
  let svg = rect(-CYL_END, -15, 2 * CYL_END, 30, "body") +
    rect(pistonX, -3, tip - lo, 6, "rod") +
    (through ? rect(pistonX - (lo + travel + tip), -rod2 / 2, lo + travel + tip, rod2, "rod") : "") +
    line(pistonX, -15, pistonX, 15, "thick");
  if (cushioning === "cap" || cushioning === "both") svg += cushionMark(pistonX, "cap");
  if (cushioning === "rod" || cushioning === "both") svg += cushionMark(pistonX, "rod");
  if (magnet) svg += magnetMark(pistonX);
  const ports: Record<string, PortGeom> = { A: { x: -50, y: 30, dir: down } };
  svg += line(-50, 15, -50, 30);
  if (double) {
    svg += line(50, 15, 50, 30);
    ports.B = { x: 50, y: 30, dir: down };
  } else {
    // molla (2002V3) a tutta altezza nella camera stelo e sfiato senza raccordo (2174V1, RF002)
    svg += zigzag(pistonX + 2, 0, CYL_END - 2, 0, 8, 13);
    svg += path("M46,15 L54,15 L50,22 Z", "body");
  }
  return { w: through ? 250 : 152, h: 62, ports, svg };
}

/** Cilindro senza stelo (ISO 1219-1 X11520, X11530): canna chiusa ai due lati e carrello (101V20) trascinato dal pistone. */
function rodlessGeometry(state?: SymbolState, cushioning = "none", magnet = false): Geometry {
  const capCushion = cushioning === "cap" || cushioning === "both";
  const rodCushion = cushioning === "rod" || cushioning === "both";
  const lo = PISTON_LO, hi = PISTON_HI;
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0));
  const pistonX = lo + frac * (hi - lo);
  let svg = rect(-CYL_END, -15, 2 * CYL_END, 30, "body") + line(pistonX, -15, pistonX, 15, "thick") +
    line(pistonX, -15, pistonX, -21) + rect(pistonX - 14, -27, 28, 6, "body");
  if (capCushion) svg += cushionMark(pistonX, "cap");
  if (rodCushion) svg += cushionMark(pistonX, "rod");
  if (magnet) svg += magnetMark(pistonX, -15, 15);
  svg += line(-50, 15, -50, 30) + line(50, 15, 50, 30);
  return { w: 152, h: 70, ports: { A: { x: -50, y: 30, dir: down }, B: { x: 50, y: 30, dir: down } }, svg };
}

/**
 * Pinza a griffe parallele (ISO 1219-1 X11630–X11660): corpo con le due griffe in alto (8.4.18, 8.4.32),
 * che si chiudono con la corsa. Semplice effetto: molla di apertura nel corpo e una sola porta.
 */
function gripperGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const single = comp.gripper_kind === "single";
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0));
  const j = 24 - 12 * frac; // griffe: aperte a ±24, chiuse a ±12
  let svg = rect(-32, -10, 64, 24, "body") + line(0, -10, 0, 14, "thick");
  svg += path(`M${-j},-10 L${-j},-30 L${-j + 7},-30`, "nofill thick-jaw") + path(`M${j},-10 L${j},-30 L${j - 7},-30`, "nofill thick-jaw");
  if (single) svg += zigzag(4, 2, 30, 2, 6, 6);
  if (comp.magnet === "yes") svg += rect(-3, -10, 6, 4, "magnet") + rect(-3, 10, 6, 4, "magnet");
  const ports: Record<string, PortGeom> = { A: { x: -20, y: 30, dir: down } };
  svg += line(-20, 14, -20, 30);
  if (!single) {
    svg += line(20, 14, 20, 30);
    ports.B = { x: 20, y: 30, dir: down };
  }
  return { w: 72, h: 70, ports, svg };
}

/** Attuatore rotante: a doppio effetto la freccia curva ha due punte; a semplice effetto una, con la molla. */
function rotaryGeometry(single = false): Geometry {
  let svg = circle(0, 0, 20, "body") + path("M-11,-6 A12,12 0 0 1 11,-6", "nofill") + arrowHead(4, -11, 11, -6) +
    line(-10, 20, -10, 30) + line(0, 0, 0, -4);
  const ports: Record<string, PortGeom> = { A: { x: -10, y: 30, dir: down } };
  if (single) svg += zigzag(4, 8, 16, 8, 4, 3);
  else {
    svg += arrowHead(-4, -11, -11, -6) + line(10, 20, 10, 30);
    ports.B = { x: 10, y: 30, dir: down };
  }
  return { w: 44, h: 64, ports, svg };
}


// --- intercettazione e collegamenti -----------------------------------------------------

/**
 * Rubinetto di intercettazione (ISO 1219-1 8.7.23): due triangoli con i vertici affacciati sulla linea, con la
 * leva di comando. In simulazione, chiuso, la leva è di traverso e un tratto spesso sbarra il passaggio.
 */
function shutoffGeometry(state?: SymbolState): Geometry {
  const closed = state?.position === "12";
  const handle = closed ? line(0, 0, 0, -14) + line(-4, -14, 4, -14) : line(0, 0, 16, 0) + line(16, -4, 16, 4);
  const svg = line(0, 30, 0, 10) + line(0, -10, 0, -30) +
    path("M-8,-10 L8,-10 L0,0 Z", "body") + path("M-8,10 L8,10 L0,0 Z", "body") +
    (closed ? line(-6, 0, 6, 0, "thick") : "") +
    `<g${state?.active14 ? ` class="active"` : ""} data-side="14">${handle}${circle(0, 0, 1.5, "fill")}</g>`;
  return { w: 40, h: 60, ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } }, svg };
}

/** Valvola 3/2 di sezionamento (ISO 1219-1 X10260): leva con arresto e lucchetto, ritorno a molla nello scarico. */
function lockoutGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const g = valveGeometry({ ...comp, type: "directional_valve", function: "3/2", actuation_14: "lever_detent",
                            actuation_12: "spring", override: undefined, cam_14: undefined, cam_12: undefined }, state);
  // lucchetto (F039V1) 1M sopra l'impugnatura della leva (RF014)
  const x = -S - 12, y = -20;
  const lock = rect(x - 5, y, 10, 7, "body") + path(`M${x - 3},${y} L${x - 3},${y - 3} A3,3 0 0 1 ${x + 3},${y - 3} L${x + 3},${y}`, "nofill");
  return { ...g, h: g.h + 6, svg: g.svg + lock };
}

/**
 * Innesto rapido (ISO 1219-1 X11690–X11740): ogni metà ha una punta rivolta verso l'altra e, oltre la punta, il
 * tratto della faccia di accoppiamento. Staccate, le due facce sono separate e la linea è interrotta; innestate,
 * la linea è continua e le facce coincidono in un solo tratto al centro. Nella metà con la valvola di non ritorno
 * la sfera sta dentro la punta, che fa da sede. Presa (1) in basso, spina (2) in alto.
 */
function couplingGeometry(comp: ComponentData): Geometry {
  const coupled = comp.coupling_state !== "uncoupled";
  const check = comp.coupling ?? "check_one";
  const tip = 9; // distanza della punta dal centro
  const face = coupled ? 0 : 4; // distanza della faccia di accoppiamento dal centro
  /** metà verso la porta in y = 30·s (s = 1 presa in basso, -1 spina in alto) */
  const half = (s: 1 | -1, withCheck: boolean) => {
    const t = s * tip;
    let svg = path(`M-6,${t + s * 7} L0,${t} L6,${t + s * 7}`, "nofill") + line(0, t, 0, s * face);
    if (withCheck) {
      const ball = t + s * 4.5;
      svg += line(0, 30 * s, 0, ball + s * 3) + circle(0, ball, 3, "body");
    } else {
      svg += line(0, 30 * s, 0, t);
    }
    if (!coupled) svg += line(-4, s * face, 4, s * face);
    return svg;
  };
  const svg = half(1, check !== "plain") + half(-1, check === "check_both") + (coupled ? line(-4, 0, 4, 0) : "");
  return { w: 30, h: 60, ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } }, svg };
}

// --- vuoto ---------------------------------------------------------------------------

/**
 * Generatore di vuoto (ISO 1219-1 X12380): corpo (101V1) con lo strozzatore (2031V1) sulla via 1 → 3; l'aspirazione
 * da 2 arriva alla strozzatura.
 */
function ejectorGeometry(blowoff = false): Geometry {
  let svg = rect(-20, -14, 40, 28, "box") + line(-30, 0, 30, 0) + line(0, -14, 0, -30) + line(0, -14, 0, -4.5) +
    path("M-10,-8 Q0,-1 10,-8", "nofill") + path("M-10,8 Q0,1 10,8", "nofill");
  const ports: Record<string, PortGeom> = {
    1: { x: -30, y: 0, dir: left }, 2: { x: 0, y: -30, dir: up }, 3: { x: 30, y: 0, dir: right },
  };
  if (blowoff) {
    // soffio di distacco (X12390): dalla porta 4, attraverso un non ritorno, nella linea del vuoto
    svg += line(20, -30, 20, -22) + line(20, -22, 0, -22) + circle(0, -22, 2.5, "fill") +
      `<g transform="translate(11,-22) rotate(-90) scale(0.55)">${checkElement(0, 0, 1)}</g>`;
    ports[4] = { x: 20, y: -30, dir: up };
  }
  return { w: 64, h: 64, ports, svg };
}

/** Ventosa (ISO 1219-1 X12420): campana aperta verso il pezzo. */
const suctionCupGeometry = (): Geometry => ({
  w: 36, h: 40, ports: { 1: { x: 0, y: -20, dir: up } },
  svg: line(0, -20, 0, -4) + path("M-5,-4 L5,-4 L14,8 L-14,8 Z", "nofill") + line(-16, 8, 16, 8, "thick"),
});

// --- regolazione: altri componenti ---------------------------------------------------

/**
 * Strozzatore a comando meccanico (X10660): strozzatore regolabile sulla linea, con il rullo che lo chiude e la
 * molla che lo riapre. In simulazione il rullo si illumina quando è premuto.
 */
function rollerThrottleGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const throttle = path("M-8,-10 Q-1,0 -8,10", "nofill") + path("M8,-10 Q1,0 8,10", "nofill") + arrow(-12, 12, 12, -12);
  const roller = `<g${state?.active14 ? ` class="active"` : ""} data-side="14">` +
    line(-9, 0, -20, 0) + circle(-25, 0, 5, "nofill") + "</g>";
  const svg = line(0, -30, 0, 30) + throttle + roller + zigzag(9, 0, 24, 0, 5, 4) +
    (comp.cam_14 ? text(-25, -10, comp.cam_14, "cam-label") : "");
  return { w: 70, h: 60, ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } }, svg };
}

/**
 * Riduttore a tre vie, con scarico (X10520): la freccia 1 → 2 e quella 2 → 3 dello scarico nella stessa casella,
 * il pilotaggio dall'uscita contro la molla regolabile; nel regolatore proporzionale (X10560) il solenoide
 * proporzionale prende il posto della molla.
 */
function relievingRegulatorGeometry(proportional: boolean): Geometry {
  const h = S / 2;
  let svg = rect(-h, -h, S, S, "box") + line(-10, h, -10, h + STUB) + line(-10, -h, -10, -h - STUB) +
    line(10, h, 10, h + STUB) + arrow(-10, h - 2, -10, -h + 2) + arrow(-6, -h + 4, 10, h - 2) +
    line(-h, -h + 8, -h - 8, -h + 8, "dash") + line(-h - 8, -h + 8, -h - 8, -h - STUB + 2, "dash") +
    line(-h - 8, -h - STUB + 2, -10, -h - STUB + 2, "dash");
  svg += proportional
    ? rect(h, -2, 10, 16) + line(h, 14, h + 10, -2) + adjustArrow(h - 2, 18, h + 12, -6)
    : zigzag(h, 6, h + 16, 6, 5, 5) + adjustArrow(h + 2, 16, h + 14, -4);
  return {
    w: S + 40, h: S + 2 * STUB,
    ports: { 1: { x: -10, y: h + STUB, dir: down }, 2: { x: -10, y: -h - STUB, dir: up }, 3: { x: 10, y: h + STUB, dir: down } },
    svg,
  };
}

/** Riduttore pilotato a distanza (X10540): il pilotaggio esterno 12 prende il posto della molla. */
function pilotedRegulatorGeometry(): Geometry {
  const h = S / 2;
  const svg = rect(-h, -h, S, S, "box") + line(0, h, 0, h + STUB) + line(0, -h, 0, -h - STUB) + arrow(0, h - 2, 0, -h + 2) +
    line(-h, -h + 8, -h - 8, -h + 8, "dash") + line(-h - 8, -h + 8, -h - 8, -h - STUB + 2, "dash") +
    line(-h - 8, -h - STUB + 2, 0, -h - STUB + 2, "dash") +
    line(40, 0, h + 8, 0, "dash") + hollowHead(h + 9, 0, h + 1, 0, 8);
  return {
    w: S + 50, h: S + 2 * STUB,
    ports: { 1: { x: 0, y: h + STUB, dir: down }, 2: { x: 0, y: -h - STUB, dir: up }, 12: { x: 40, y: 0, dir: right } },
    svg,
  };
}

/** Moltiplicatore di pressione (X11590): la camera grande dell'aria spinge il pistone della camera piccola. */
const intensifierGeometry = (): Geometry => ({
  w: 76, h: 60,
  ports: { 1: { x: -20, y: 30, dir: down }, 2: { x: 30, y: 0, dir: right } },
  svg: rect(-34, -16, 34, 32, "body") + rect(0, -8, 22, 16, "body") + line(-24, -16, -24, 16, "thick") +
    rect(-24, -3, 34, 6, "rod") + line(10, -8, 10, 8, "thick") + line(-20, 16, -20, 30) + line(22, 0, 30, 0),
});

// --- attuatori: altri componenti ---------------------------------------------------

/**
 * Bloccaggio dello stelo (X11580): unità sulla testata con i due ceppi che stringono lo stelo, comandata dal
 * pilotaggio L. Bloccaggio di fine corsa: l'aggancio nel fondello che trattiene il pistone a riposo.
 */
function lockingCylinderGeometry(comp: ComponentData, state?: SymbolState, end = false): Geometry {
  const g = cylinderGeometry(true, state, false, "none", comp.magnet === "yes");
  if (end) {
    g.svg += path(`M${-CYL_END},-7 L${-CYL_END + 6},0 L${-CYL_END},7 Z`, "fill") + line(-CYL_END + 2, -13, -CYL_END + 2, -7);
    return g;
  }
  g.svg += rect(CYL_END, -9, 10, 18, "nofill") + path(`M${CYL_END + 1},-9 L${CYL_END + 9},-9 L${CYL_END + 5},-3 Z`, "fill") +
    path(`M${CYL_END + 1},9 L${CYL_END + 9},9 L${CYL_END + 5},3 Z`, "fill") + line(60, -9, 60, -30, "dash");
  g.ports.L = { x: 60, y: -30, dir: up };
  return { ...g, h: g.h + 20 };
}

/** Attuatore a soffietto (X11610): le pieghe del soffietto tra il fondo fisso e il piatto mobile. */
function bellowsGeometry(state?: SymbolState): Geometry {
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0));
  const xr = -10 + 30 * frac;
  const folds = (yy: number, s: number) => {
    const n = 6, dx = (xr + 30) / n;
    let d = `M-30,${yy}`;
    for (let i = 1; i <= n; i++) d += ` L${-30 + dx * i - dx / 2},${yy + s * 5} L${-30 + dx * i},${yy}`;
    return path(d, "nofill");
  };
  const svg = line(-30, -15, -30, 15, "thick") + line(xr, -15, xr, 15, "thick") + folds(-15, 1) + folds(15, -1) +
    rect(xr, -3, 25, 6, "rod") + line(-20, 15, -20, 30);
  return { w: 100, h: 62, ports: { A: { x: -20, y: 30, dir: down } }, svg };
}

/** Cilindro a membrana: la membrana (linea curva) al posto del pistone, con la molla di ritorno. */
function diaphragmGeometry(state?: SymbolState): Geometry {
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0));
  const m = -15 + 10 * frac;
  const svg = rect(-35, -15, 70, 30, "body") + path(`M${m},-15 Q${m + 9},0 ${m},15`, "nofill thick") +
    rect(m + 4, -3, 56 - m, 6, "rod") + zigzag(m + 6, 0, 33, 0, 6, 10) + line(-30, 15, -30, 30) +
    path("M26,15 L34,15 L30,22 Z", "body");
  return { w: 112, h: 62, ports: { A: { x: -30, y: 30, dir: down } }, svg };
}

/** Muscolo pneumatico: tubo con la calza intrecciata (tratti incrociati) che si accorcia in pressione. */
function muscleGeometry(state?: SymbolState): Geometry {
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0));
  const r = 40 - 12 * frac;
  let mesh = "";
  for (let x = -r + 8; x < r - 4; x += 10) mesh += line(x - 4, -8, x + 4, 8) + line(x - 4, 8, x + 4, -8);
  const svg = line(-50, 0, -r, 0) + `<rect x="${-r}" y="-10" width="${2 * r}" height="20" rx="8" class="body"/>` +
    mesh + line(r, 0, r + 8, 0) + circle(r + 11, 0, 3, "nofill");
  return { w: 110, h: 40, ports: { A: { x: -50, y: 0, dir: left } }, svg };
}

// --- collegamenti: altri componenti ----------------------------------------------------

/**
 * Rubinetto a tre vie: tre triangoli con i vertici al centro (come il rubinetto, 8.7.23). Il tratto spesso
 * indica l'uscita aperta: 2 con il lato 14, 4 con il lato 12.
 */
function threeWayCockGeometry(state?: SymbolState): Geometry {
  const to4 = state?.position === "12";
  const svg = line(0, 30, 0, 10) + line(0, -10, 0, -30) + line(10, 0, 30, 0) +
    path("M-8,10 L8,10 L0,0 Z", "body") + path("M-8,-10 L8,-10 L0,0 Z", "body") + path("M10,-8 L10,8 L0,0 Z", "body") +
    `<g${state?.active14 ? ` class="active"` : ""} data-side="14">` +
    (to4 ? line(0, 0, -12, 12) + line(-15, 9, -9, 15) : line(0, 0, -16, 0) + line(-16, -4, -16, 4)) +
    circle(0, 0, 1.5, "fill") + "</g>";
  return { w: 70, h: 60,
    ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up }, 4: { x: 30, y: 0, dir: right } }, svg };
}

/** Tubo flessibile (X10630): linea curva tra le due porte. */
const flexibleHoseGeometry = (): Geometry => ({
  w: 40, h: 60, ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, 30, 0, 20) + path("M0,20 C18,10 -18,-10 0,-20", "nofill") + line(0, -20, 0, -30),
});

/** Giunto rotante a una via (X11680): i due cerchi concentrici sulla linea. */
const rotaryJointGeometry = (): Geometry => ({
  w: 30, h: 60, ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, 30, 0, 10) + line(0, -10, 0, -30) + circle(0, 0, 10, "body") + circle(0, 0, 5, "nofill") + line(0, -10, 0, 10),
});

/** Basetta di distribuzione: canale comune (ISO 1219-3, moduli dei simboli) con le uscite sui punti di connessione. */
function manifoldGeometry(): Geometry {
  const outs = ["21", "22", "23", "24"];
  let svg = rect(-44, -10, 88, 20, "body") + line(-50, 0, 30, 0);
  const ports: Record<string, PortGeom> = { 1: { x: -50, y: 0, dir: left } };
  outs.forEach((n, i) => {
    const x = -30 + 20 * i;
    svg += line(x, 0, x, -20) + circle(x, 0, 2.5, "fill");
    ports[n] = { x, y: -20, dir: up };
  });
  return { w: 104, h: 44, ports, svg };
}

/** Rimando ad altro foglio: freccia che indica dove prosegue la linea; il nome è nella descrizione. */
const sheetReferenceGeometry = (): Geometry => ({
  w: 40, h: 40, ports: { 1: { x: 0, y: -20, dir: up } },
  svg: line(0, -20, 0, -10) + path("M-14,-10 L14,-10 L14,6 L0,16 L-14,6 Z", "nofill"),
});

/** Rimando elettrico: la stessa freccia, più piccola, in fondo al filo. */
const wireReferenceGeometry = (): Geometry => ({
  w: 30, h: 30, ports: { 1: { x: 0, y: -10, dir: up } },
  svg: line(0, -10, 0, -4) + path("M-9,-4 L9,-4 L9,5 L0,11 L-9,5 Z", "nofill"),
});

// --- misura e segnalazione -----------------------------------------------------------------

/** Sensore di pressione analogico (X11780): riquadro con il segno P e l'uscita del segnale. */
const pressureSensorGeometry = (): Geometry => ({
  w: 52, h: 60, ports: { 1: { x: 0, y: 30, dir: down } },
  svg: line(0, 16, 0, 30) + rect(-14, -16, 28, 32, "body") + text(0, 5, "P", "sym-note") +
    line(14, 0, 24, 0) + arrowHead(14, 0, 24, 0, 5),
});

/** Indicatore di pressione: ottico (X11820, cerchio con la croce), digitale (display) o acustico (tromba). */
function indicatorGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const on = !!state?.energized;
  let svg = line(0, 10, 0, 20);
  switch (comp.indicator_kind ?? "optical") {
    case "digital":
      svg = line(0, 8, 0, 20) + rect(-14, -10, 28, 18, `body coil${on ? " active" : ""}`) + text(0, 3, "8.8", "sym-note");
      break;
    case "acoustic":
      svg += path("M-5,10 L-5,-2 L-12,-10 L12,-10 L5,-2 L5,10 Z", `body coil${on ? " active" : ""}`);
      break;
    default:
      svg += circle(0, 0, 10, `body lamp lamp-green${on ? " lit" : ""}`) + line(-7, -7, 7, 7) + line(-7, 7, 7, -7);
  }
  return { w: 36, h: 40, ports: { 1: { x: 0, y: 20, dir: down } }, svg };
}

/** Misuratore di portata (X11850): cerchio sulla linea con la freccia del flusso. */
const flowMeterGeometry = (): Geometry => ({
  w: 34, h: 60, ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, 30, 0, 12) + line(0, -12, 0, -30) + circle(0, 0, 12, "body") + arrow(0, 8, 0, -8) + line(-6, 10, 6, -10),
});

/** Manometro differenziale (X11800): lo strumento con due attacchi. */
const differentialGaugeGeometry = (): Geometry => ({
  w: 40, h: 44, ports: { 1: { x: -10, y: 20, dir: down }, 2: { x: 10, y: 20, dir: down } },
  svg: circle(0, -2, 13, "body") + arrow(-7, 5, 7, -9) + line(-10, 6.5, -10, 20) + line(10, 6.5, 10, 20),
});

/** Termometro (X11830): cerchio con il bulbo del termometro. */
const thermometerGeometry = (): Geometry => ({
  w: 32, h: 44, ports: { 1: { x: 0, y: 20, dir: down } },
  svg: circle(0, -2, 13, "body") + line(0, -11, 0, 2) + circle(0, 5, 3, "fill") + line(0, 11, 0, 20),
});

// --- circuito elettrico (CEI EN 60617, contatti verticali come negli schemi a scala) ----------

const E = 30; // distanza dei morsetti dal centro
const eTop = (x = 0): PortGeom => ({ x, y: -E, dir: up });
const eBottom = (x = 0): PortGeom => ({ x, y: E, dir: down });
const sideText = (x: number, y: number, t: string | undefined, cls = "cam-label") =>
  t ? `<text x="${x}" y="${y}" class="${cls}" text-anchor="start">${esc(t)}</text>` : "";

/** Segno del comando sul contatto, a sinistra della lama (x0: punto di attacco della linea di comando). */
function contactOperator(type: string, comp: ComponentData, x0: number, y0: number): string {
  if (type === "relay_contact") return "";
  const xo = -22;
  let svg = line(x0, y0, xo, y0, "dash");
  if (type === "pushbutton") {
    svg += line(xo, y0 - 6, xo, y0 + 6) + line(xo, y0 - 6, xo + 3, y0 - 6) + line(xo, y0 + 6, xo + 3, y0 + 6);
    // con ritenuta: tacca di arresto sulla linea di comando
    if (comp.operation === "latching") svg += path(`M${xo + 5},${y0 - 5} L${xo + 8},${y0} L${xo + 11},${y0 - 5}`, "nofill");
  } else if (type === "limit_switch") {
    if (comp.switch_actuation === "roller_oneway") {
      svg += line(xo, y0, xo - 4, y0 - 5) + circle(xo - 6, y0 - 8, 3.5, "nofill") + circle(xo, y0, 1.3, "fill");
    } else {
      svg += circle(xo - 4, y0, 4, "nofill");
    }
  }
  return svg;
}

/** Contatto NA (13-14), NC (11-12) o in scambio (11 comune in basso, 14 NA a sinistra, 12 NC a destra). */
function contactGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const kind = comp.contact ?? "no";
  const on = !!state?.actuated;
  const cls = on ? "blade active" : "blade";
  const label = comp.type === "relay_contact" ? comp.relay : comp.type === "limit_switch" ? comp.cam : undefined;
  let svg = "", ports: Record<string, PortGeom>;
  if (kind === "co") {
    svg += line(-10, -E, -10, -12) + line(10, -E, 10, -12) + line(10, -12, 4, -12) + line(0, E, 0, 12);
    svg += on ? line(0, 12, -10, -12, cls) : line(0, 12, 6, -13, cls);
    svg += contactOperator(comp.type, comp, on ? -5 : 2, 0);
    ports = { 11: eBottom(), 14: eTop(-10), 12: eTop(10) };
  } else if (kind === "nc") {
    svg += line(0, -E, 0, -12) + line(0, -12, 7, -12) + line(0, E, 0, 12);
    svg += on ? line(0, 12, -10, -13, cls) : line(0, 12, 9, -14, cls);
    svg += contactOperator(comp.type, comp, on ? -5 : 4, -1);
    ports = { 11: eTop(), 12: eBottom() };
  } else {
    svg += line(0, -E, 0, -12) + line(0, E, 0, 12);
    svg += on ? line(0, 12, 0, -12, cls) : line(0, 12, -10, -13, cls);
    svg += contactOperator(comp.type, comp, on ? 0 : -5, -1);
    ports = { 13: eTop(), 14: eBottom() };
  }
  svg += sideText(kind === "co" ? 14 : 8, 4, label);
  return { w: 52, h: 2 * E, ports, svg };
}

/** Bobina (rettangolo) di relè, temporizzatore o elettrovalvola: A1 in alto, A2 in basso. */
function coilGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const on = state?.energized ? " active" : "";
  let svg = line(0, -E, 0, -8) + line(0, 8, 0, E) + rect(-12, -8, 24, 16, `body coil${on}`);
  if (comp.type === "valve_solenoid") svg += line(-12, 8, 12, -8);
  if (comp.type === "timer_relay") {
    // ritardato all'eccitazione: casella piena; alla diseccitazione: casella con la croce
    svg += comp.timer_mode === "off_delay"
      ? rect(-24, -8, 12, 16, "body") + line(-24, -8, -12, 8) + line(-24, 8, -12, -8)
      : rect(-24, -8, 12, 16, "fill");
  }
  if (comp.type === "valve_solenoid") svg += sideText(15, 4, comp.drives);
  return { w: 52, h: 2 * E, ports: { A1: eTop(), A2: eBottom() }, svg };
}

const LAMP_COLORS: Record<string, string> = { green: "VE", red: "RD", yellow: "YE", white: "WH", blue: "BU" };
function lampGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const color = comp.lamp_color ?? "green";
  const svg = line(0, -E, 0, -10) + line(0, 10, 0, E) +
    circle(0, 0, 10, `body lamp lamp-${color}${state?.energized ? " lit" : ""}`) +
    line(-7, -7, 7, 7) + line(-7, 7, 7, -7) + sideText(13, 4, LAMP_COLORS[color], "sym-note");
  return { w: 48, h: 2 * E, ports: { X1: eTop(), X2: eBottom() }, svg };
}

function supplyGeometry(comp: ComponentData): Geometry {
  // simbolo di sorgente in continua: tratto lungo (+) e tratto corto (0V)
  const svg = line(0, -E, 0, -4) + line(0, 4, 0, E) + line(-12, -4, 12, -4) + line(-6, 4, 6, 4, "thick") +
    sideText(16, 3, comp.params?.voltage ?? "", "sym-note");
  return { w: 60, h: 2 * E, ports: { "+": eTop(), "0V": eBottom() }, svg };
}

function proximityGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const on = state?.actuated ? " active" : "";
  const svg = line(0, -E, 0, -16) + line(0, 16, 0, E) + line(14, 0, 30, 0) +
    rect(-14, -16, 28, 32, `body coil${on}`) + diamond(0, 0, 9) + line(-4, 0, 4, 0) +
    (comp.sensor_kind === "reed" || !comp.sensor_kind ? "" : line(-4, 4, 4, 4)) +
    sideText(-14, -20, comp.cam ?? "") ;
  return { w: 64, h: 2 * E, ports: { BN: eTop(), BU: eBottom(), BK: { x: 30, y: 0, dir: right } }, svg };
}

function pressureSwitchGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  // pressostato (ISO 1219-1 X11750): riquadro (101V5) con contatto di chiusura (F050V1) e molla regolabile
  // (2002V1, 201V2); l'aria arriva dalla porta con una linea continua. Elettronico (X11760): l'amplificatore
  // (triangolo) al posto della molla. Vacuostato: il segno meno del vuoto accanto alla molla
  const on = state?.actuated ? " active" : "";
  const kind = comp.switch_kind ?? "mechanical";
  let svg = line(0, 16, 0, E) + rect(-14, -16, 28, 32, `body coil${on}`) + line(-8, 7, 0, 7) + line(0, 7, 6, 3);
  if (kind === "electronic") svg += path("M-7,-12 L-7,-1 L4,-6.5 Z", "nofill") + line(4, -6.5, 8, -6.5);
  else svg += zigzag(-8, -6, 8, -6, 4, 3) + adjustArrow(-7, 0, 7, -12);
  if (kind === "vacuum") svg += line(4, 11, 10, 11);
  return { w: 40, h: 2 * E, ports: { 1: eBottom() }, svg };
}

/** Spessore del secondo stelo del cilindro a doppio stelo: più sottile o più grosso del primo, se è diverso. */
function rod2Height(comp: ComponentData): number {
  try {
    const r1 = comp.params?.rod ? Quantity.coerce(comp.params.rod).si : 0;
    const r2 = comp.params?.rod2 ? Quantity.coerce(comp.params.rod2).si : 0;
    if (!r1 || !r2 || Math.abs(r1 - r2) < 1e-9) return 6;
    return r2 < r1 ? 4 : 8;
  } catch {
    return 6;
  }
}

export function geometry(comp: ComponentData, state?: SymbolState): Geometry {
  switch (comp.type) {
    case "directional_valve": return valveGeometry(comp, state);
    case "pressure_source": return sourceGeometry();
    case "silencer": return silencerGeometry();
    case "plug": return plugGeometry();
    case "junction": return junctionGeometry();
    case "exhaust": return exhaustGeometry();
    case "pressure_regulator": return regulatorGeometry();
    case "flow_control_valve": return flowControlGeometry();
    case "compressor": return compressorGeometry();
    case "vacuum_pump": return vacuumPumpGeometry();
    case "filter_regulator": return filterRegulatorGeometry();
    case "air_dryer": return dryerGeometry();
    case "roller_flow_control": return rollerThrottleGeometry(comp, state);
    case "relieving_regulator": return relievingRegulatorGeometry(false);
    case "proportional_regulator": return relievingRegulatorGeometry(true);
    case "piloted_regulator": return pilotedRegulatorGeometry();
    case "pressure_intensifier": return intensifierGeometry();
    case "locking_cylinder": return lockingCylinderGeometry(comp, state);
    case "end_lock_cylinder": return lockingCylinderGeometry(comp, state, true);
    case "bellows_cylinder": return bellowsGeometry(state);
    case "diaphragm_cylinder": return diaphragmGeometry(state);
    case "pneumatic_muscle": return muscleGeometry(state);
    case "three_way_cock": return threeWayCockGeometry(state);
    case "flexible_hose": return flexibleHoseGeometry();
    case "rotary_joint": return rotaryJointGeometry();
    case "manifold": return manifoldGeometry();
    case "sheet_reference": return sheetReferenceGeometry();
    case "pressure_sensor": return pressureSensorGeometry();
    case "pressure_indicator": return indicatorGeometry(comp, state);
    case "flow_meter": return flowMeterGeometry();
    case "differential_gauge": return differentialGaugeGeometry();
    case "thermometer": return thermometerGeometry();
    case "single_acting_cylinder": return cylinderGeometry(false, state, false, "none", comp.magnet === "yes");
    case "double_acting_cylinder": return cylinderGeometry(true, state, false, comp.cushioning, comp.magnet === "yes");
    case "double_rod_cylinder":
      return cylinderGeometry(true, state, true, comp.cushioning, comp.magnet === "yes", rod2Height(comp));
    case "rodless_cylinder": return rodlessGeometry(state, comp.cushioning, comp.magnet === "yes");
    case "gripper": return gripperGeometry(comp, state);
    case "shutoff_valve": return shutoffGeometry(state);
    case "lockout_valve": return lockoutGeometry(comp, state);
    case "quick_coupling": return couplingGeometry(comp);
    case "fixed_orifice": return orificeGeometry();
    case "soft_start_valve": return softStartGeometry();
    case "double_pilot_check": return doublePilotCheckGeometry();
    case "vacuum_ejector": return ejectorGeometry(comp.blowoff === "yes");
    case "suction_cup": return suctionCupGeometry();
    case "rotary_actuator": return rotaryGeometry(comp.rotary_kind === "single");
    case "air_reservoir": return reservoirGeometry();
    case "air_filter": return filterGeometry(comp.filter_kind);
    case "lubricator": return lubricatorGeometry(comp.lub_drain === "yes");
    case "frl_unit": return comp.frl_style === "simplified" ? frlSimplifiedGeometry() : frlGeometry();
    case "pressure_gauge": return gaugeGeometry();
    case "check_valve": return checkGeometry(comp.check_spring === "yes");
    case "pilot_check_valve": return pilotCheckGeometry();
    case "shuttle_valve": return logicGeometry("or");
    case "and_valve": return logicGeometry("and");
    case "quick_exhaust_valve": return quickExhaustGeometry();
    case "one_way_flow_control": return oneWayFlowGeometry();
    case "relief_valve": return pressureBoxGeometry("relief");
    case "sequence_valve": return pilotedValveGeometry(comp, state, "sequence");
    case "time_delay_valve": return pilotedValveGeometry(comp, state, "delay");
    case "air_motor": return motorGeometry(comp.motor_kind === "one_way");
    case "wire_junction": return junctionGeometry();
    case "wire_reference": return wireReferenceGeometry();
    case "electric_supply": return supplyGeometry(comp);
    case "pushbutton":
    case "relay_contact":
    case "limit_switch": return contactGeometry(comp, state);
    case "relay_coil":
    case "timer_relay":
    case "valve_solenoid": return coilGeometry(comp, state);
    case "signal_lamp": return lampGeometry(comp, state);
    case "proximity_sensor": return proximityGeometry(comp, state);
    case "pressure_switch": return pressureSwitchGeometry(comp, state);
    default:
      return { w: 40, h: 40, ports: {}, svg: rect(-20, -20, 40, 40, "box") + `<text x="0" y="4" class="unknown">?</text>` };
  }
}

/** Ruota un punto o una direzione di rot·90° in senso orario. */
export function rotate([x, y]: [number, number], rot: number): [number, number] {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
}

/** Miniatura per la palette. */
export function thumbnail(comp: ComponentData, size = 44): string {
  const g = geometry(comp);
  const scale = Math.min(size / g.w, size / g.h, 1);
  return `<svg viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" class="symbol">` +
    `<g transform="scale(${scale})">${g.svg}</g></svg>`;
}
