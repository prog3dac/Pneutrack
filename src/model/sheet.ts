/**
 * Foglio di disegno: formato ISO 216 (A4–A0), orientamento e dati del cartiglio.
 *
 * Nel file: `"sheet": {"format": "A3", "orientation": "landscape", "origin": [x, y],
 * "author": "…", "number": "…", "revision": "…"}`. Come `layout`, non conta per il modello.
 */

export type SheetFormat = "A4" | "A3" | "A2" | "A1" | "A0";
export type Orientation = "landscape" | "portrait";

export interface SheetData {
  format: SheetFormat;
  orientation?: Orientation;
  /** angolo in alto a sinistra del foglio, in unità dello schema */
  origin?: [number, number];
  author?: string;
  number?: string;
  revision?: string;
}

/** Dimensioni ISO 216 in mm (lato corto × lato lungo). */
export const SHEET_SIZES: Record<SheetFormat, [number, number]> = {
  A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189],
};
export const SHEET_FORMATS = Object.keys(SHEET_SIZES) as SheetFormat[];

/** Unità dello schema per millimetro di carta (un simbolo di valvola 5/2 è largo circa 35 mm). */
export const UNITS_PER_MM = 3;
/** Margini della cornice (ISO 5457): 20 mm a sinistra per la rilegatura, 10 mm sugli altri lati. */
export const FRAME = { left: 20, top: 10, right: 10, bottom: 10 };
/** Cartiglio (ISO 7200): 180 mm × 32 mm nell'angolo in basso a destra. */
export const TITLE_BLOCK = { w: 180, h: 32 };

/** Dimensioni del foglio in mm, secondo l'orientamento. */
export function sheetSizeMm(s: Pick<SheetData, "format" | "orientation">): [number, number] {
  const [a, b] = SHEET_SIZES[s.format];
  return (s.orientation ?? "landscape") === "landscape" ? [b, a] : [a, b];
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Foglio in unità dello schema. */
export function sheetRect(s: SheetData): Rect {
  const [w, h] = sheetSizeMm(s);
  const [x, y] = s.origin ?? [0, 0];
  return { x, y, w: w * UNITS_PER_MM, h: h * UNITS_PER_MM };
}

/** Area utile per il disegno (dentro la cornice, sopra il cartiglio) in unità dello schema. */
export function drawingArea(s: SheetData): Rect {
  const r = sheetRect(s), u = UNITS_PER_MM;
  return { x: r.x + FRAME.left * u, y: r.y + FRAME.top * u,
           w: r.w - (FRAME.left + FRAME.right) * u, h: r.h - (FRAME.top + FRAME.bottom + TITLE_BLOCK.h) * u };
}

/** Il formato più piccolo in cui il disegno (riquadro in unità dello schema) entra nell'area utile. */
export function smallestFormat(box: Rect, orientation: Orientation = "landscape"): SheetFormat {
  for (const f of SHEET_FORMATS) {
    const a = drawingArea({ format: f, orientation });
    if (box.w <= a.w && box.h <= a.h) return f;
  }
  return "A0";
}

/** Origine che centra il disegno nell'area utile del foglio. */
export function centeredOrigin(s: SheetData, box: Rect): [number, number] {
  const a = drawingArea({ ...s, origin: [0, 0] });
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  // griglia di 20 unità, come i componenti
  const snap = (v: number) => Math.round(v / 20) * 20;
  return [snap(cx - (a.x + a.w / 2)), snap(cy - (a.y + a.h / 2))];
}

/** Legge e controlla la chiave `sheet` di un file; null se manca o non è valida. */
export function parseSheet(raw: unknown): SheetData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!SHEET_FORMATS.includes(d.format as SheetFormat)) return null;
  const s: SheetData = { format: d.format as SheetFormat };
  if (d.orientation === "portrait" || d.orientation === "landscape") s.orientation = d.orientation;
  if (Array.isArray(d.origin) && d.origin.length === 2 && d.origin.every((v) => typeof v === "number" && isFinite(v))) {
    s.origin = [d.origin[0] as number, d.origin[1] as number];
  }
  for (const k of ["author", "number", "revision"] as const) if (typeof d[k] === "string") s[k] = d[k] as string;
  return s;
}
