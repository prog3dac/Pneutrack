/**
 * Annotazioni: testi e forme geometriche disegnati sullo schema (note, richiami, riquadri,
 * contorni di gruppo tratto-punto ISO 1219-2, frecce di flusso, collegamenti meccanici…).
 *
 * Nel file: `"annotations": [{"id": "A1", "kind": "rect", "x": 0, "y": 0, "w": 200, "h": 120,
 * "line": "dashdot", "title": "Gruppo 1"}]`. Come `layout`, non contano per il modello
 * pneumatico: servono al disegno, al PDF, all'SVG e al DXF.
 *
 * Unità: coordinate in unità dello schema (3 per mm di carta, vedi `UNITS_PER_MM`);
 * spessori e altezze del testo in millimetri di carta (ISO 128 e ISO 3098).
 */
import { UNITS_PER_MM } from "./sheet";

export type Pt = [number, number];
export type LineType = "continuous" | "dashed" | "dashdot" | "dashdotdot" | "dotted" | "double";
export type Terminal = "none" | "arrow" | "open" | "dot";
export type Fill = "none" | "tint" | "white";
export type TextBox = "none" | "rect" | "round" | "triangle";
export type Corner = "tl" | "tr" | "bl" | "br";

export interface AnnStyle {
  /** colore "#rrggbb"; senza, «Auto»: nero sul foglio, chiaro nel tema scuro */
  color?: string;
  line?: LineType;
  /** spessore in mm (0,25 / 0,35 / 0,5 / 0,7) */
  weight?: number;
  fill?: Fill;
}
interface Base extends AnnStyle {
  id: string;
  /** non si sposta trascinando */
  locked?: boolean;
}
export interface Leader {
  /** punta del richiamo: assoluta, o scostamento dal centro del componente `attach` */
  x: number;
  y: number;
  end?: Terminal;
  attach?: string;
}
export interface TextAnn extends Base {
  kind: "text";
  /** punto di riferimento: linea di base della prima riga, sul lato dell'allineamento */
  x: number;
  y: number;
  text: string;
  /** altezza dei caratteri in mm */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  /** rotazione in quarti di giro, senso antiorario (testo leggibile da destra) */
  rot?: number;
  box?: TextBox;
  leader?: Leader;
}
export interface LineAnn extends Base {
  kind: "line";
  points: Pt[];
  start?: Terminal;
  end?: Terminal;
}
export interface RectAnn extends Base {
  kind: "rect";
  x: number; y: number; w: number; h: number;
  round?: boolean;
  title?: string;
  titlePos?: Corner;
  /** spostandolo si portano dietro i componenti che racchiude */
  carry?: boolean;
}
export interface EllipseAnn extends Base {
  kind: "ellipse";
  x: number; y: number; w: number; h: number;
}
export type AnnotationData = TextAnn | LineAnn | RectAnn | EllipseAnn;
export interface Box { x: number; y: number; w: number; h: number }

export const WEIGHTS = [0.25, 0.35, 0.5, 0.7];
export const TEXT_SIZES = [2.5, 3.5, 5, 7];
export const DEFAULT_WEIGHT = 0.5;
export const DEFAULT_TEXT_SIZE = 3.5;

export const LINE_TYPES: { value: LineType; label: string; sample: string }[] = [
  { value: "continuous", label: "Continua", sample: "─────" },
  { value: "dashed", label: "Tratteggiata", sample: "– – –" },
  { value: "dashdot", label: "Tratto-punto", sample: "—·—·" },
  { value: "dashdotdot", label: "Tratto-due-punti", sample: "—··—" },
  { value: "dotted", label: "Punteggiata", sample: "·····" },
  { value: "double", label: "Doppia", sample: "═════" },
];

/** Colori proposti: il primo è «Auto». */
export const COLORS: { value: string | undefined; label: string; aci?: number }[] = [
  { value: undefined, label: "Auto (nero)" },
  { value: "#6b7280", label: "Grigio", aci: 8 },
  { value: "#dc2626", label: "Rosso", aci: 1 },
  { value: "#ea580c", label: "Arancio", aci: 30 },
  { value: "#16a34a", label: "Verde", aci: 3 },
  { value: "#2563eb", label: "Blu", aci: 5 },
  { value: "#7c3aed", label: "Viola", aci: 6 },
];

/** Colori AutoCAD (ACI) con cui si approssima un colore qualsiasi nel DXF R12. */
const ACI_RGB: [number, [number, number, number]][] = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 160, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]],
  [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]], [30, [255, 127, 0]],
  [150, [0, 127, 255]], [190, [127, 0, 255]], [94, [0, 129, 0]], [14, [165, 0, 0]],
];

const hexRgb = (hex: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Colore DXF (ACI) per un colore dell'annotazione; undefined = «Auto» (DAL LAYER). */
export function aciOf(color: string | undefined): number | undefined {
  if (!color) return undefined;
  const preset = COLORS.find((c) => c.value?.toLowerCase() === color.toLowerCase());
  if (preset?.aci) return preset.aci;
  const rgb = hexRgb(color);
  if (!rgb) return undefined;
  let best = 7, dist = Infinity;
  for (const [aci, [r, g, b]] of ACI_RGB) {
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (d < dist) { dist = d; best = aci; }
  }
  return best;
}

/** Tratteggio SVG in unità dello schema (vuoto per la linea continua o doppia). */
export function dashArray(line: LineType | undefined): string {
  switch (line) {
    case "dashed": return "9 4.5";
    case "dashdot": return "18 4.5 1.5 4.5";
    case "dashdotdot": return "18 4.5 1.5 4.5 1.5 4.5";
    case "dotted": return "1.5 3.5";
    default: return "";
  }
}

/** Tipo di linea DXF (tabella LTYPE). */
export function dxfLinetype(line: LineType | undefined): string | undefined {
  switch (line) {
    case "dashed": return "DASHED";
    case "dashdot": return "DASHDOT";
    case "dashdotdot": return "DIVIDE";
    case "dotted": return "DOT";
    default: return undefined;
  }
}

/** Spessore del tratto in unità dello schema. */
export const strokeUnits = (a: AnnStyle) => (a.weight ?? DEFAULT_WEIGHT) * UNITS_PER_MM;
/** Corpo del carattere SVG per un'altezza in mm (il DXF usa il 72 % del corpo come altezza). */
export const fontUnits = (sizeMm: number) => (sizeMm * UNITS_PER_MM) / 0.72;

/** Spezzata spostata di `d` sul lato sinistro (raccordi a spigolo vivo). */
export function offsetPolyline(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => [...p] as Pt);
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  return pts.map((p, i) => {
    const n1 = i > 0 ? normal(pts[i - 1]!, p) : null;
    const n2 = i < n - 1 ? normal(p, pts[i + 1]!) : null;
    if (!n1 || !n2) { const m = (n1 ?? n2)!; return [p[0] + m[0] * d, p[1] + m[1] * d]; }
    const sx = n1[0] + n2[0], sy = n1[1] + n2[1], sl = Math.hypot(sx, sy);
    if (sl < 1e-6) return [p[0] + n1[0] * d, p[1] + n1[1] * d];
    const cos = (sx / sl) * n1[0] + (sy / sl) * n1[1];
    const k = d / Math.max(cos, 0.2);
    return [p[0] + (sx / sl) * k, p[1] + (sy / sl) * k];
  });
}

/** Punta di freccia (triangolo) all'estremo `tip`, che arriva da `from`. */
export function arrowHead(from: Pt, tip: Pt, len: number, half: number): Pt[] {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const bx = tip[0] - ux * len, by = tip[1] - uy * len;
  return [tip, [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]];
}

/** Ingombro stimato del testo (senza misurare i caratteri): corpo × 0,55 per carattere. */
export function textBox(a: TextAnn): Box {
  const fs = fontUnits(a.size ?? DEFAULT_TEXT_SIZE);
  const lines = a.text.split("\n");
  const w = Math.max(1, ...lines.map((l) => l.length)) * fs * 0.55;
  const h = fs * (1 + 1.25 * (lines.length - 1)) + fs * 0.25;
  const x = a.align === "center" ? a.x - w / 2 : a.align === "right" ? a.x - w : a.x;
  const local: Box = { x, y: a.y - fs * 0.95, w, h };
  return rotateBox(local, a.x, a.y, a.rot ?? 0);
}

/** Riquadro ruotato di `rot` quarti di giro (antiorario) attorno a (cx, cy). */
export function rotateBox(b: Box, cx: number, cy: number, rot: number): Box {
  const r = ((rot % 4) + 4) % 4;
  if (!r) return b;
  const corners: Pt[] = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
  const pts = corners.map((p) => rotatePt(p, cx, cy, r));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
/** Punto ruotato di `rot` quarti di giro in senso antiorario (sullo schermo, y verso il basso). */
export function rotatePt(p: Pt, cx: number, cy: number, rot: number): Pt {
  let dx = p[0] - cx, dy = p[1] - cy;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) [dx, dy] = [dy, -dx];
  return [cx + dx, cy + dy];
}

/** Ingombro dell'annotazione in unità dello schema (`at` risolve i richiami agganciati). */
export function annBox(a: AnnotationData, at?: (id: string) => Pt | null): Box {
  switch (a.kind) {
    case "rect": case "ellipse": return { x: a.x, y: a.y, w: a.w, h: a.h };
    case "line": {
      const xs = a.points.map((p) => p[0]), ys = a.points.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case "text": {
      const b = textBox(a);
      const tip = a.leader ? leaderTip(a, at) : null;
      if (!tip) return b;
      const x0 = Math.min(b.x, tip[0]), y0 = Math.min(b.y, tip[1]);
      return { x: x0, y: y0, w: Math.max(b.x + b.w, tip[0]) - x0, h: Math.max(b.y + b.h, tip[1]) - y0 };
    }
  }
}

/** Punta del richiamo in coordinate assolute. */
export function leaderTip(a: TextAnn, at?: (id: string) => Pt | null): Pt | null {
  if (!a.leader) return null;
  const base = a.leader.attach ? at?.(a.leader.attach) : null;
  return base ? [base[0] + a.leader.x, base[1] + a.leader.y] : [a.leader.x, a.leader.y];
}

/** Sposta un'annotazione (un richiamo agganciato segue il suo componente, non l'annotazione). */
export function moveAnn(a: AnnotationData, dx: number, dy: number): void {
  switch (a.kind) {
    case "rect": case "ellipse": case "text":
      a.x += dx; a.y += dy;
      if (a.kind === "text" && a.leader && !a.leader.attach) { a.leader.x += dx; a.leader.y += dy; }
      break;
    case "line":
      a.points = a.points.map(([x, y]) => [x + dx, y + dy]);
      break;
  }
}

export const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
export const contains = (outer: Box, b: Box) =>
  b.x >= outer.x && b.y >= outer.y && b.x + b.w <= outer.x + outer.w && b.y + b.h <= outer.y + outer.h;

export function nextAnnId(anns: { id: string }[] | undefined, taken: Set<string> = new Set()): string {
  let n = 1;
  while (taken.has(`A${n}`) || anns?.some((a) => a.id === `A${n}`)) n++;
  return `A${n}`;
}

/** Il richiamo agganciato a un componente eliminato resta dov'era, sciolto. */
export function detachFrom(anns: AnnotationData[] | undefined, compId: string, pos: Pt): void {
  for (const a of anns ?? []) {
    if (a.kind === "text" && a.leader?.attach === compId) {
      a.leader = { ...a.leader, x: pos[0] + a.leader.x, y: pos[1] + a.leader.y };
      delete a.leader.attach;
    }
  }
}

// --- lettura dal file ----------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPt = (v: unknown): v is Pt => Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;
const LINES = LINE_TYPES.map((l) => l.value);
const TERMINALS: Terminal[] = ["none", "arrow", "open", "dot"];

function style(raw: Record<string, unknown>): AnnStyle {
  const s: AnnStyle = {};
  if (typeof raw.color === "string" && hexRgb(raw.color)) s.color = raw.color.toLowerCase();
  const line = oneOf(raw.line, LINES);
  if (line && line !== "continuous") s.line = line;
  if (isNum(raw.weight) && raw.weight > 0 && raw.weight <= 5) s.weight = raw.weight;
  const fill = oneOf(raw.fill, ["none", "tint", "white"] as const);
  if (fill && fill !== "none") s.fill = fill;
  return s;
}

/** Legge `annotations` da un file: tiene solo voci valide, con sigle uniche. */
export function normalizeAnnotations(raw: unknown): AnnotationData[] {
  if (!Array.isArray(raw)) return [];
  const out: AnnotationData[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    let id = typeof o.id === "string" && o.id && !ids.has(o.id) ? o.id : nextAnnId(out, ids);
    ids.add(id);
    const base = { id, ...style(o), ...(o.locked === true ? { locked: true } : {}) };
    if (o.kind === "text" && isNum(o.x) && isNum(o.y) && typeof o.text === "string") {
      const t: TextAnn = { ...base, kind: "text", x: o.x, y: o.y, text: o.text };
      if (isNum(o.size) && o.size > 0 && o.size <= 50) t.size = o.size;
      if (o.bold === true) t.bold = true;
      if (o.italic === true) t.italic = true;
      const align = oneOf(o.align, ["left", "center", "right"] as const);
      if (align && align !== "left") t.align = align;
      if (isNum(o.rot) && ((o.rot % 4) + 4) % 4) t.rot = ((Math.round(o.rot) % 4) + 4) % 4;
      const box = oneOf(o.box, ["none", "rect", "round", "triangle"] as const);
      if (box && box !== "none") t.box = box;
      const l = o.leader as Record<string, unknown> | undefined;
      if (l && typeof l === "object" && isNum(l.x) && isNum(l.y)) {
        t.leader = { x: l.x, y: l.y };
        const end = oneOf(l.end, TERMINALS);
        if (end) t.leader.end = end;
        if (typeof l.attach === "string" && l.attach) t.leader.attach = l.attach;
      }
      out.push(t);
    } else if (o.kind === "line" && Array.isArray(o.points) && o.points.length >= 2 && o.points.every(isPt)) {
      const l: LineAnn = { ...base, kind: "line", points: (o.points as Pt[]).map((p) => [p[0], p[1]]) };
      const start = oneOf(o.start, TERMINALS), end = oneOf(o.end, TERMINALS);
      if (start && start !== "none") l.start = start;
      if (end && end !== "none") l.end = end;
      out.push(l);
    } else if ((o.kind === "rect" || o.kind === "ellipse") && isNum(o.x) && isNum(o.y) && isNum(o.w) && isNum(o.h)
               && o.w > 0 && o.h > 0) {
      if (o.kind === "ellipse") { out.push({ ...base, kind: "ellipse", x: o.x, y: o.y, w: o.w, h: o.h }); continue; }
      const rc: RectAnn = { ...base, kind: "rect", x: o.x, y: o.y, w: o.w, h: o.h };
      if (o.round === true) rc.round = true;
      if (typeof o.title === "string" && o.title) rc.title = o.title;
      const pos = oneOf(o.titlePos, ["tl", "tr", "bl", "br"] as const);
      if (pos && pos !== "tl") rc.titlePos = pos;
      if (o.carry === true) rc.carry = true;
      out.push(rc);
    } else {
      ids.delete(id);
    }
  }
  return out;
}

// --- voci della palette --------------------------------------------------------------

export interface AnnPreset {
  key: string;
  label: string;
  group: "Testo" | "Forme" | "Elementi della norma";
  doc: string;
  /** icona 44×44 centrata in 0,0 */
  icon: string;
  /** annotazione centrata in (0, 0), senza sigla */
  make: () => Omit<TextAnn, "id"> | Omit<LineAnn, "id"> | Omit<RectAnn, "id"> | Omit<EllipseAnn, "id">;
}

const I = (s: string) => `<g fill="none" stroke="currentColor" stroke-width="1.6">${s}</g>`;
export const ANN_PRESETS: AnnPreset[] = [
  { key: "text", label: "Testo", group: "Testo", doc: "Testo libero su una o più righe.",
    icon: `<text x="0" y="9" text-anchor="middle" font-size="26" font-weight="600" fill="currentColor">T</text>`,
    make: () => ({ kind: "text", x: -30, y: 5, text: "Testo" }) },
  { key: "note", label: "Nota in riquadro", group: "Testo", doc: "Testo racchiuso in un riquadro.",
    icon: I(`<rect x="-17" y="-10" width="34" height="20" rx="3"/><path d="M-11,-3 H11 M-11,3 H5" stroke-width="1.2"/>`),
    make: () => ({ kind: "text", x: -30, y: 5, text: "Nota", box: "rect" }) },
  { key: "callout", label: "Richiamo con freccia", group: "Testo",
    doc: "Testo con una freccia; trascina la punta su un componente per agganciarla: segue il componente.",
    icon: I(`<path d="M-16,-10 H-2 L13,9"/><path d="M15,12 l-8,-3 l5,-4 z" fill="currentColor"/>`),
    make: () => ({ kind: "text", x: -60, y: -20, text: "Richiamo", leader: { x: 40, y: 30, end: "arrow" } }) },
  { key: "revision", label: "Indice di revisione", group: "Testo",
    doc: "Lettera di revisione in un triangolo, accanto alla parte modificata.",
    icon: I(`<path d="M0,-13 L13,10 L-13,10 Z"/>`) + `<text x="0" y="7" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">A</text>`,
    make: () => ({ kind: "text", x: 0, y: 5, text: "A", box: "triangle", bold: true, align: "center", color: "#dc2626" }) },
  { key: "line", label: "Linea", group: "Forme", doc: "Segmento di retta.",
    icon: I(`<path d="M-15,12 L15,-12"/>`),
    make: () => ({ kind: "line", points: [[-50, 0], [50, 0]] }) },
  { key: "arrow", label: "Freccia", group: "Forme", doc: "Linea con la punta di freccia.",
    icon: I(`<path d="M-15,12 L11,-9"/><path d="M15,-12 l-9,2 l4,5 z" fill="currentColor"/>`),
    make: () => ({ kind: "line", points: [[-50, 0], [50, 0]], end: "arrow" }) },
  { key: "polyline", label: "Polilinea", group: "Forme",
    doc: "Spezzata: trascina i punti; il + a metà di un tratto aggiunge un punto, doppio clic su un punto lo toglie.",
    icon: I(`<path d="M-16,10 L-6,-8 L4,6 L16,-10"/>`),
    make: () => ({ kind: "line", points: [[-60, 20], [-20, -20], [20, 20], [60, -20]] }) },
  { key: "rect", label: "Rettangolo", group: "Forme", doc: "Rettangolo, anche con gli angoli arrotondati.",
    icon: I(`<rect x="-16" y="-11" width="32" height="22"/>`),
    make: () => ({ kind: "rect", x: -80, y: -50, w: 160, h: 100 }) },
  { key: "circle", label: "Cerchio", group: "Forme", doc: "Cerchio (un'ellisse con larghezza e altezza uguali).",
    icon: I(`<circle r="13"/>`),
    make: () => ({ kind: "ellipse", x: -40, y: -40, w: 80, h: 80 }) },
  { key: "ellipse", label: "Ellisse", group: "Forme", doc: "Ellisse.",
    icon: I(`<ellipse rx="17" ry="10"/>`),
    make: () => ({ kind: "ellipse", x: -70, y: -40, w: 140, h: 80 }) },
  { key: "group", label: "Contorno gruppo (ISO 1219)", group: "Elementi della norma",
    doc: "ISO 1219-2: linea tratto-punto attorno ai componenti di un assieme o di un gruppo funzionale, con titolo. " +
      "Spostandolo si portano dietro i componenti racchiusi.",
    icon: I(`<rect x="-17" y="-13" width="34" height="26" stroke-dasharray="7 2.5 1.5 2.5"/>`),
    make: () => ({ kind: "rect", x: -120, y: -80, w: 240, h: 160, line: "dashdot", title: "Gruppo 1", carry: true }) },
  { key: "dashdot", label: "Linea tratto-punto", group: "Elementi della norma",
    doc: "Linea tratto-punto (ISO 128): contorni, separazioni, assi.",
    icon: I(`<path d="M-17,0 H17" stroke-dasharray="7 2.5 1.5 2.5"/>`),
    make: () => ({ kind: "line", points: [[-80, 0], [80, 0]], line: "dashdot" }) },
  { key: "mechanical", label: "Collegamento meccanico", group: "Elementi della norma",
    doc: "ISO 1219-1: doppia linea per alberi, leve e aste che collegano meccanicamente due componenti.",
    icon: I(`<path d="M-17,-3 H17 M-17,3 H17"/>`),
    make: () => ({ kind: "line", points: [[-60, 0], [60, 0]], line: "double" }) },
  { key: "flow", label: "Direzione del flusso", group: "Elementi della norma",
    doc: "ISO 1219-1: freccia con triangolo vuoto per il verso del flusso d'aria.",
    icon: I(`<path d="M-17,0 H5"/><path d="M4,-6 L16,0 L4,6 Z"/>`),
    make: () => ({ kind: "line", points: [[-40, 0], [40, 0]], end: "open" }) },
];

/** Nuova annotazione da una voce della palette, centrata in `at`. */
export function annFromPreset(key: string, id: string, at: { x: number; y: number }): AnnotationData | null {
  const p = ANN_PRESETS.find((x) => x.key === key);
  if (!p) return null;
  const a = { id, ...structuredClone(p.make()) } as AnnotationData;
  moveAnn(a, at.x, at.y);
  return a;
}

/** Nome mostrato nel pannello. */
export function annLabel(a: AnnotationData): string {
  switch (a.kind) {
    case "text": return a.box === "triangle" ? "Indice di revisione" : a.leader ? "Richiamo" : a.box ? "Nota in riquadro" : "Testo";
    case "line":
      return a.line === "double" ? "Collegamento meccanico" : a.end === "open" || a.start === "open" ? "Direzione del flusso"
        : a.end === "arrow" || a.start === "arrow" ? "Freccia" : a.points.length > 2 ? "Polilinea" : "Linea";
    case "rect": return a.line === "dashdot" ? "Contorno gruppo" : "Rettangolo";
    case "ellipse": return a.w === a.h ? "Cerchio" : "Ellisse";
  }
}
