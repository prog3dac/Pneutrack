// Simboli grafici dei componenti, nello stile ISO 1219 (disegni originali).
//
// geometry(comp, state) restituisce, in coordinate locali con origine al centro:
//   { w, h, ports: { nome: {x, y, dir} }, svg }
// Le porte coincidono con quelle del modello (numerazione ISO 5599).
// `state` (facoltativo) è lo stato di simulazione: posizione della valvola, corsa del cilindro.
import { isMechanical, type Actuation, type ComponentData } from "../model/components";
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

// posizione orizzontale delle porte all'interno di una casella (0..1): sempre a quarti, così con
// caselle da 40 le porte cadono sui nodi della griglia (passo 10) e le linee restano dritte
const VALVE_LAYOUT: Record<string, { top: Record<string, number>; bottom: Record<string, number> }> = {
  "2/2": { top: { 2: 0.5 }, bottom: { 1: 0.5 } },
  "3/2": { top: { 2: 0.5 }, bottom: { 1: 0.25, 3: 0.75 } },
  "4/2": { top: { 4: 0.25, 2: 0.75 }, bottom: { 1: 0.25, 3: 0.75 } },
  "5/2": { top: { 4: 0.25, 2: 0.75 }, bottom: { 5: 0.25, 1: 0.5, 3: 0.75 } },
  "5/3": { top: { 4: 0.25, 2: 0.75 }, bottom: { 5: 0.25, 1: 0.5, 3: 0.75 } },
  "5/3E": { top: { 4: 0.25, 2: 0.75 }, bottom: { 5: 0.25, 1: 0.5, 3: 0.75 } },
  "5/3P": { top: { 4: 0.25, 2: 0.75 }, bottom: { 5: 0.25, 1: 0.5, 3: 0.75 } },
};

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

/** tratteggio dell'alimentazione esterna del pilota: dal comando alla porta, che sta su un nodo della griglia */
const extPilotLine = (o: (d: number) => number) =>
  path(`M${o(5)},8 L${o(5)},22 L${o(10)},22 L${o(10)},30`, "nofill dash");

function actuator(kind: string, x0: number, side: -1 | 1, active: boolean) {
  const o = (d: number) => x0 + side * d;
  const cls = active ? ` class="active"` : "";
  let body = "";
  switch (kind) {
    case "solenoid":
      body = line(o(0), 0, o(4), 0) + rect(Math.min(o(4), o(14)), -8, 10, 16) + line(o(4), 8, o(14), -8);
      break;
    case "pilot":
      body = line(o(9), 0, o(20), 0, "dash") + hollowHead(o(10), 0, o(1), 0, 9);
      break;
    case "manual":
      body = line(o(0), 0, o(14), 0) + line(o(14), -8, o(14), 8) +
        path(`M${o(14)},-8 Q${o(20)},0 ${o(14)},8`, "nofill");
      break;
    case "lever":
    case "lever_detent":
      // leva: asta inclinata con impugnatura; con arresto, tacche sopra lo stelo
      body = line(o(0), 0, o(10), 0) + line(o(10), 0, o(18), -11) + circle(o(18.5), -12, 2, "fill");
      if (kind === "lever_detent") body += line(o(1), -7, o(9), -7) + path(`M${o(2)},-7 L${o(3.5)},-4 L${o(5)},-7 L${o(6.5)},-4 L${o(8)},-7`, "nofill");
      break;
    case "pedal":
      body = line(o(0), 0, o(10), 0) + line(o(10), 7, o(20), -7) + line(o(10), 7, o(13), 7);
      break;
    case "mechanical":
      body = line(o(0), 0, o(10), 0) + circle(o(15), 0, 5, "nofill");
      break;
    case "plunger":
      // tastatore: asta con testa arrotondata
      body = line(o(0), 0, o(10), 0) + path(`M${o(10)},-5 L${o(14)},-5 Q${o(19)},0 ${o(14)},5 L${o(10)},5 Z`, "nofill");
      break;
    case "roller_oneway":
      // rullo su leva ribaltabile
      body = line(o(0), 0, o(8), 0) + line(o(8), 0, o(13), -6) + circle(o(16), -9, 4, "nofill") +
        circle(o(8), 0, 1.5, "fill");
      break;
    case "solenoid_pilot":
    case "solenoid_pilot_ext": {
      // valvola pilota (triangolo) comandata dal solenoide
      const xa = Math.min(o(0), o(10));
      body = rect(xa, -8, 10, 16) + path(`M${o(8)},-4 L${o(8)},4 L${o(2)},0 Z`, "body") +
        rect(Math.min(o(10), o(20)), -8, 10, 16) + line(o(10), 8, o(20), -8);
      if (kind === "solenoid_pilot_ext") body += extPilotLine(o);
      break;
    }
    case "air_return":
    case "air_return_ext":
      // molla pneumatica (ISO 1219-1, come in ISO 1219-3 all. D): riquadro con triangolo vuoto verso la valvola;
      // alimentazione interna: tratteggio verso il corpo valvola; esterna: tratteggio verso la porta di pilotaggio
      body = rect(Math.min(o(0), o(10)), -8, 10, 16) + path(`M${o(8)},-4 L${o(8)},4 L${o(2)},0 Z`, "body");
      if (kind === "air_return") body += line(o(5), 8, o(5), 16, "dash") + line(o(5), 16, o(-4), 16, "dash");
      else body += extPilotLine(o);
      break;
    case "spring":
      body = zigzag(o(0), 0, o(18), 0, 6, 6);
      break;
  }
  return `<g${cls} data-side="${side < 0 ? "14" : "12"}">${body}</g>`;
}

function valveGeometry(comp: ComponentData, state?: SymbolState): Geometry {
  const fn = comp.function && VALVE_BOXES[comp.function] ? comp.function : "5/2";
  const boxes = VALVE_BOXES[fn]!;
  const lay = VALVE_LAYOUT[fn]!;
  const n = boxes.length;
  const W = n * S;
  const x0 = -W / 2;
  const rest = x0 + S; // la casella di riposo è la seconda
  const kx = (name: string) => lay.top[name] ?? lay.bottom[name]!;
  const isTop = (name: string) => name in lay.top;

  // in simulazione le caselle scorrono: quella attiva si allinea alle porte
  const activeBox = state?.position === "14" ? 0 : state?.position === "12" ? n - 1 : 1;
  const shift = state?.position ? (1 - activeBox) * S : 0;

  let moving = "";
  boxes.forEach((content, b) => {
    const bx = x0 + b * S;
    moving += rect(bx, -S / 2, S, S, state?.position && b === activeBox ? "box active-box" : "box");
    for (const item of content) {
      if (item[0] === "a") {
        const [, from, to] = item;
        const y1 = isTop(from) ? -S / 2 + 4 : S / 2 - 4;
        const y2 = isTop(to) ? -S / 2 + 4 : S / 2 - 4;
        moving += arrow(bx + kx(from) * S, y1, bx + kx(to) * S, y2);
      } else {
        const x = bx + kx(item[1]) * S;
        const yEdge = isTop(item[1]) ? -S / 2 : S / 2;
        const yIn = isTop(item[1]) ? -S / 2 + 9 : S / 2 - 9;
        moving += line(x, yEdge, x, yIn) + line(x - 5, yIn, x + 5, yIn);
      }
    }
  });
  const a14 = comp.actuation_14 ?? "solenoid";
  const a12 = comp.actuation_12 ?? "spring";
  moving += actuator(a14, x0, -1, !!state?.active14) + actuator(a12, -x0, 1, !!state?.active12);
  // finecorsa: sigla del cilindro che preme il rullo
  if (comp.cam_14 && isMechanical(a14 as Actuation)) moving += text(x0 - 15, -16, comp.cam_14, "cam-label");
  if (comp.cam_12 && isMechanical(a12 as Actuation)) moving += text(-x0 + 15, -16, comp.cam_12, "cam-label");
  // bobine del circuito elettrico che eccitano i solenoidi
  if (state?.coil14) moving += text(x0 - 15, -16, state.coil14, "cam-label coil-label");
  if (state?.coil12) moving += text(-x0 + 15, -16, state.coil12, "cam-label coil-label");

  let fixedPart = "";
  const ports: Record<string, PortGeom> = {};
  for (const [name, k] of Object.entries(lay.top)) {
    const x = rest + k * S;
    fixedPart += line(x, -S / 2, x, -S / 2 - STUB);
    ports[name] = { x, y: -S / 2 - STUB, dir: up };
  }
  for (const [name, k] of Object.entries(lay.bottom)) {
    const x = rest + k * S;
    fixedPart += line(x, S / 2, x, S / 2 + STUB);
    ports[name] = { x, y: S / 2 + STUB, dir: down };
  }
  // i pilotaggi restano fissi: una linea li collega al comando che si sposta
  if (a14 === "pilot") {
    ports["14"] = { x: x0 - 20, y: 0, dir: left };
    if (shift > 0) fixedPart += line(x0 - 20, 0, x0 - 20 + shift, 0, "dash");
  }
  if (a12 === "pilot") {
    ports["12"] = { x: -x0 + 20, y: 0, dir: right };
    if (shift < 0) fixedPart += line(-x0 + 20 + shift, 0, -x0 + 20, 0, "dash");
  }
  // alimentazione esterna della valvola pilota: porta sotto il comando
  if (a14 === "solenoid_pilot_ext" || a14 === "air_return_ext") {
    ports["14"] = { x: x0 - 10, y: 30, dir: down };
    if (shift) fixedPart += line(x0 - 10, 30, x0 - 10 + shift, 30, "dash");
  }
  if (a12 === "solenoid_pilot_ext" || a12 === "air_return_ext") {
    ports["12"] = { x: -x0 + 10, y: 30, dir: down };
    if (shift) fixedPart += line(-x0 + 10 + shift, 30, -x0 + 10, 30, "dash");
  }
  const svg = `<g transform="translate(${shift},0)" class="valve-body">${moving}</g>${fixedPart}`;
  return { w: W + 44, h: S + 2 * STUB, ports, svg };
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
  svg: rect(-14, -14, 28, 30, "box") + line(0, 30, 0, 6) + checkElement(0, -2) +
    line(0, -7, 0, -30) + line(30, 0, 6, 0, "dash"),
});

function logicGeometry(kind: "or" | "and"): Geometry {
  let inner: string;
  if (kind === "or") {
    inner = path("M-11,-7 L-18,0 L-11,7", "nofill") + path("M11,-7 L18,0 L11,7", "nofill") + circle(-12.5, 0, 4, "body");
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
    // strozzatore e non ritorno nello stesso corpo: cornice a tratto e punto (ISO 1219-1, 5.10)
    svg: line(0, -30, 0, 30) + throttle + bypass + rect(-16, -22, 52, 44, "nofill dashdot"),
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
      line(x, -16, x, -2, "dash")
    // strozzatore e piccolo serbatoio sul pilotaggio
    : `<rect x="${x - 8}" y="-34" width="16" height="10" rx="4" class="body"/>` +
      path(`M${x - 4},-20 Q${x},-16 ${x - 4},-12`, "nofill") + path(`M${x + 4},-20 Q${x},-16 ${x + 4},-12`, "nofill") +
      line(x, -24, x, -2, "dash");
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
  // sorgente di energia pneumatica (ISO 1219-1 F071V1; esempi in ISO 1219-2 e 1219-3): triangolo vuoto con la punta sulla linea
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
  svg: line(0, -10, 0, 0) + line(-7, 0, 7, 0, "thick"),
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

const flowControlGeometry = (): Geometry => ({
  w: 30, h: 60,
  ports: { 1: { x: 0, y: 30, dir: down }, 2: { x: 0, y: -30, dir: up } },
  svg: line(0, -30, 0, 30) + path("M-8,-10 Q-1,0 -8,10", "nofill") + path("M8,-10 Q1,0 8,10", "nofill") +
    arrow(-12, 12, 12, -12),
});

/** Ammortizzo regolabile (ISO 1219): tampone sul pistone che entra nella testata, con freccia di regolazione. */
function cushionMark(pistonX: number, end: "cap" | "rod") {
  const plug = end === "cap" ? rect(pistonX - 10, -6, 10, 12, "body") : rect(pistonX + 2, -6, 10, 12, "body");
  const cx = end === "cap" ? -54 : 54;
  return plug + line(cx - 9, 13, cx + 9, -13) + arrowHead(cx - 9, 13, cx + 9, -13, 5);
}

function cylinderGeometry(double: boolean, state?: SymbolState, through = false, cushioning = "none"): Geometry {
  // Camicia da -60 a 60. Il pistone (con i tamponi degli ammortizzi) resta sempre dentro la camicia
  // per tutta la corsa; lo stelo sporge sempre dalla testata (e dal fondello, se passante).
  const capCushion = cushioning === "cap" || cushioning === "both";
  const lo = capCushion ? -44 : -56; // pistone a corsa 0: il tampone lato fondello sta dentro la camicia
  const travel = 80;
  const tip = 68; // estremità dello stelo a pistone rientrato (8 oltre la testata)
  // senza simulazione il pistone è disegnato a un quarto di corsa
  const frac = Math.min(1, Math.max(0, state?.stroke ?? 0.35));
  const pistonX = lo + frac * travel;
  let svg = rect(-60, -15, 120, 30, "body") +
    rect(pistonX, -3, tip - lo, 6, "rod") +
    (through ? rect(pistonX - (lo + travel + tip), -3, lo + travel + tip, 6, "rod") : "") +
    line(pistonX, -15, pistonX, 15, "thick");
  if (cushioning === "cap" || cushioning === "both") svg += cushionMark(pistonX, "cap");
  if (cushioning === "rod" || cushioning === "both") svg += cushionMark(pistonX, "rod");
  const ports: Record<string, PortGeom> = { A: { x: -50, y: 30, dir: down } };
  svg += line(-50, 15, -50, 30);
  if (double) {
    svg += line(50, 15, 50, 30);
    ports.B = { x: 50, y: 30, dir: down };
  } else {
    // molla a tutta altezza nella camera stelo e sfiato senza raccordo (triangolo) come in ISO 1219-3, all. C
    svg += zigzag(pistonX + 2, 0, 58, 0, 8, 13);
    svg += path("M46,15 L54,15 L50,22 Z", "body");
  }
  return { w: through ? 250 : 152, h: 62, ports, svg };
}

const rotaryGeometry = (): Geometry => ({
  w: 44, h: 64,
  ports: { A: { x: -10, y: 30, dir: down }, B: { x: 10, y: 30, dir: down } },
  svg: circle(0, 0, 20, "body") + path("M-11,-6 A12,12 0 0 1 11,-6", "nofill") + arrowHead(-4, -11, -11, -6) +
    arrowHead(4, -11, 11, -6) + line(-10, 20, -10, 30) + line(10, 20, 10, 30) + line(0, 0, 0, -4),
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
  // pressostato: pilotaggio dal basso su una molla regolabile, con contatto elettrico
  const on = state?.actuated ? " active" : "";
  const svg = line(0, 25, 0, E, "dash") + hollowHead(0, 26, 0, 17, 8) + rect(-14, -16, 28, 32, `body coil${on}`) +
    zigzag(-8, -4, 8, -4, 4, 3) + line(10, -10, 10, -2) + line(6, -12, 12, -6) +
    line(-8, 6, 0, 6) + line(0, 6, 6, 2);
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
    case "single_acting_cylinder": return cylinderGeometry(false, state);
    case "double_acting_cylinder": return cylinderGeometry(true, state, false, comp.cushioning);
    case "double_rod_cylinder": return cylinderGeometry(true, state, true, comp.cushioning);
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
