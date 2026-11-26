// Simboli grafici dei componenti, nello stile ISO 1219 (disegni originali).
//
// geometry(comp, state) restituisce, in coordinate locali con origine al centro:
//   { w, h, ports: { nome: {x, y, dir} }, svg }
// Le porte coincidono con quelle del modello (numerazione ISO 5599).
// `state` (facoltativo) è lo stato di simulazione: posizione della valvola, corsa del cilindro.
import { isElectric, isMechanical, type Actuation, type ComponentData } from "../model/components";
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
  "4/2": { top: { 4: M, 2: 3 * M }, bottom: { 1: M, 3: 3 * M } },
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
    case "pilot":
      body = line(o(9), y(0), o(20), y(0), "dash") + hollowHead(o(10), y(0), o(1), y(0), 9);
      break;
    case "manual":
      body = line(o(0), y(0), o(14), y(0)) + line(o(14), y(-8), o(14), y(8)) +
        path(`M${o(14)},${y(-8)} Q${o(20)},${y(0)} ${o(14)},${y(8)}`, "nofill");
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
    case "mechanical":
      body = line(o(0), y(0), o(10), y(0)) + circle(o(15), y(0), 5, "nofill");
      break;
    case "plunger":
      // tastatore: asta con testa arrotondata
      body = line(o(0), y(0), o(10), y(0)) +
        path(`M${o(10)},${y(-5)} L${o(14)},${y(-5)} Q${o(19)},${y(0)} ${o(14)},${y(5)} L${o(10)},${y(5)} Z`, "nofill");
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
  }
  return `<g${cls} data-side="${side < 0 ? "14" : "12"}">${body}</g>`;
}

/** dove finisce il disegno di ciascun comando elettrico, dal bordo della valvola */
const ELECTRIC_REACH: Partial<Record<string, number>> = { solenoid: 14, solenoid_pilot: 20, solenoid_pilot_ext: 20 };

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
  if (a14 === "pilot") {
    ports["14"] = { x: x0 - 20, y: ACT_Y, dir: left };
    if (shift > 0) fixedPart += line(x0 - 20, ACT_Y, x0 - 20 + shift, ACT_Y, "dash");
  }
  if (a12 === "pilot") {
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

const filterGeometry = (): Geometry => ({
  w: 64, h: 44, ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 30, y: 0, dir: right } },
  // cartuccia (tratteggio perpendicolare al flusso) e separatore con scarico manuale (ISO 1219-2, all. C)
  svg: line(-30, 0, -16, 0) + line(16, 0, 30, 0) + diamond(0, 0, 16) + line(0, -16, 0, 9, "dash") +
    line(-7, 9, 7, 9) + line(0, 16, 0, 24),
});

const lubricatorGeometry = (): Geometry => ({
  w: 64, h: 44, ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 30, y: 0, dir: right } },
  // tubo di pescaggio: tratto dal vertice superiore verso l'interno (ISO 1219-2, all. C)
  svg: line(-30, 0, -16, 0) + line(16, 0, 30, 0) + diamond(0, 0, 16) + line(0, -16, 0, -6),
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

const checkGeometry = (): Geometry => ({
  w: 30, h: 60,
  ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, 30, 0, 6) + checkElement(0, -2) + line(0, -7, 0, -30),
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

const motorGeometry = (): Geometry => ({
  w: 56, h: 64,
  ports: { 1: { x: -10, y: 30, dir: down }, 2: { x: 10, y: 30, dir: down } },
  svg: circle(0, 0, 18, "body") + path("M0,-9 L-5,-17.3 L5,-17.3 Z", "body") + path("M0,9 L-5,17.3 L5,17.3 Z", "body") +
    line(18, -2, 26, -2) + line(18, 2, 26, 2) + line(-10, 15, -10, 30) + line(10, 15, 10, 30),
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
                          magnet = false): Geometry {
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
    (through ? rect(pistonX - (lo + travel + tip), -3, lo + travel + tip, 6, "rod") : "") +
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

const rotaryGeometry = (): Geometry => ({
  w: 44, h: 64,
  ports: { A: { x: -10, y: 30, dir: down }, B: { x: 10, y: 30, dir: down } },
  svg: circle(0, 0, 20, "body") + path("M-11,-6 A12,12 0 0 1 11,-6", "nofill") + arrowHead(-4, -11, -11, -6) +
    arrowHead(4, -11, 11, -6) + line(-10, 20, -10, 30) + line(10, 20, 10, 30) + line(0, 0, 0, -4),
});


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
const ejectorGeometry = (): Geometry => ({
  w: 64, h: 64,
  ports: { 1: { x: -30, y: 0, dir: left }, 2: { x: 0, y: -30, dir: up }, 3: { x: 30, y: 0, dir: right } },
  svg: rect(-20, -14, 40, 28, "box") + line(-30, 0, 30, 0) + line(0, -14, 0, -30) + line(0, -14, 0, -4.5) +
    path("M-10,-8 Q0,-1 10,-8", "nofill") + path("M-10,8 Q0,1 10,8", "nofill"),
});

/** Ventosa (ISO 1219-1 X12420): campana aperta verso il pezzo. */
const suctionCupGeometry = (): Geometry => ({
  w: 36, h: 40, ports: { 1: { x: 0, y: -20, dir: up } },
  svg: line(0, -20, 0, -4) + path("M-5,-4 L5,-4 L14,8 L-14,8 Z", "nofill") + line(-16, 8, 16, 8, "thick"),
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

function pressureSwitchGeometry(state?: SymbolState): Geometry {
  // pressostato (ISO 1219-1 X11750): riquadro (101V5) con contatto di chiusura (F050V1) e molla regolabile
  // (2002V1, 201V2); l'aria arriva dalla porta con una linea continua
  const on = state?.actuated ? " active" : "";
  const svg = line(0, 16, 0, E) + rect(-14, -16, 28, 32, `body coil${on}`) +
    zigzag(-8, -6, 8, -6, 4, 3) + adjustArrow(-7, 0, 7, -12) +
    line(-8, 7, 0, 7) + line(0, 7, 6, 3);
  return { w: 40, h: 2 * E, ports: { 1: eBottom() }, svg };
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
    case "single_acting_cylinder": return cylinderGeometry(false, state, false, "none", comp.magnet === "yes");
    case "double_acting_cylinder": return cylinderGeometry(true, state, false, comp.cushioning, comp.magnet === "yes");
    case "double_rod_cylinder": return cylinderGeometry(true, state, true, comp.cushioning, comp.magnet === "yes");
    case "rodless_cylinder": return rodlessGeometry(state, comp.cushioning, comp.magnet === "yes");
    case "gripper": return gripperGeometry(comp, state);
    case "shutoff_valve": return shutoffGeometry(state);
    case "lockout_valve": return lockoutGeometry(comp, state);
    case "quick_coupling": return couplingGeometry(comp);
    case "fixed_orifice": return orificeGeometry();
    case "soft_start_valve": return softStartGeometry();
    case "double_pilot_check": return doublePilotCheckGeometry();
    case "vacuum_ejector": return ejectorGeometry();
    case "suction_cup": return suctionCupGeometry();
    case "rotary_actuator": return rotaryGeometry();
    case "air_reservoir": return reservoirGeometry();
    case "air_filter": return filterGeometry();
    case "lubricator": return lubricatorGeometry();
    case "frl_unit": return frlGeometry();
    case "pressure_gauge": return gaugeGeometry();
    case "check_valve": return checkGeometry();
    case "pilot_check_valve": return pilotCheckGeometry();
    case "shuttle_valve": return logicGeometry("or");
    case "and_valve": return logicGeometry("and");
    case "quick_exhaust_valve": return quickExhaustGeometry();
    case "one_way_flow_control": return oneWayFlowGeometry();
    case "relief_valve": return pressureBoxGeometry("relief");
    case "sequence_valve": return pilotedValveGeometry(comp, state, "sequence");
    case "time_delay_valve": return pilotedValveGeometry(comp, state, "delay");
    case "air_motor": return motorGeometry();
    case "wire_junction": return junctionGeometry();
    case "electric_supply": return supplyGeometry(comp);
    case "pushbutton":
    case "relay_contact":
    case "limit_switch": return contactGeometry(comp, state);
    case "relay_coil":
    case "timer_relay":
    case "valve_solenoid": return coilGeometry(comp, state);
    case "signal_lamp": return lampGeometry(comp, state);
    case "proximity_sensor": return proximityGeometry(comp, state);
    case "pressure_switch": return pressureSwitchGeometry(state);
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
