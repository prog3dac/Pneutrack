/**
 * Scrittura di file DXF (formato R12, AC1009: lo aprono AutoCAD, LibreCAD, DraftSight, QCAD).
 *
 * Coordinate in millimetri, asse y verso l'alto. Le curve dei tracciati SVG si spezzano in
 * segmenti (`flattenPath`); cerchi e testi restano entità native. Ogni entità sta su un
 * layer con colore e tipo di linea propri, così in CAD si possono spegnere o ricolorare.
 */

export type Pt = [number, number];

export interface Layer { name: string; color: number; linetype?: "CONTINUOUS" | "DASHED" }

export interface TextOpts {
  height: number;
  /** 0 sinistra, 1 centro, 2 destra */
  align?: 0 | 1 | 2;
  /** 0 linea di base, 2 a metà altezza */
  valign?: 0 | 2;
  /** gradi, antiorario */
  rotation?: number;
}

const num = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Caratteri Windows-1252 tra 0x80 e 0x9F (gli altri coincidono con Unicode). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const inCp1252 = (cp: number) => cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) || cp in CP1252;

/** Testo DXF: i caratteri di Windows-1252 restano tali, gli altri diventano \U+XXXX. */
export function dxfText(s: string): string {
  let out = "";
  for (const ch of s.replace(/[\r\n]+/g, " ")) {
    const cp = ch.codePointAt(0)!;
    out += inCp1252(cp) ? ch : cp <= 0xffff ? `\\U+${cp.toString(16).toUpperCase().padStart(4, "0")}` : "?";
  }
  return out;
}

/** Byte del file in Windows-1252, la codifica dichiarata nell'intestazione ($DWGCODEPAGE). */
export function dxfBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    out[i] = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : CP1252[cp] ?? 0x3f;
  }
  return out;
}

export class DxfWriter {
  private out: string[] = [];
  private used = new Set<string>();
  private lo: Pt = [Infinity, Infinity];
  private hi: Pt = [-Infinity, -Infinity];

  constructor(private layers: Layer[]) {}

  private pair(code: number, value: string | number) {
    this.out.push(String(code), typeof value === "number" ? num(value) : value);
  }
  private grow(...pts: Pt[]) {
    for (const [x, y] of pts) {
      this.lo = [Math.min(this.lo[0], x), Math.min(this.lo[1], y)];
      this.hi = [Math.max(this.hi[0], x), Math.max(this.hi[1], y)];
    }
  }
  private head(type: string, layer: string, dashed?: boolean) {
    this.used.add(layer);
    this.pair(0, type);
    this.pair(8, layer);
    if (dashed) this.pair(6, "DASHED");
  }

  line(a: Pt, b: Pt, layer: string, dashed = false) {
    this.head("LINE", layer, dashed);
    this.pair(10, a[0]); this.pair(20, a[1]); this.pair(30, 0);
    this.pair(11, b[0]); this.pair(21, b[1]); this.pair(31, 0);
    this.grow(a, b);
  }

  /** Spezzata; con due punti diventa una LINE. `width` costante (mm) per i tratti pieni. */
  polyline(pts: Pt[], closed: boolean, layer: string, dashed = false, width = 0, bulges?: number[]) {
    if (pts.length < 2) return;
    if (pts.length === 2 && !closed && !width && !bulges) { this.line(pts[0]!, pts[1]!, layer, dashed); return; }
    this.head("POLYLINE", layer, dashed);
    this.pair(66, 1);
    this.pair(10, 0); this.pair(20, 0); this.pair(30, 0);
    this.pair(70, closed ? 1 : 0);
    if (width) { this.pair(40, width); this.pair(41, width); }
    pts.forEach((p, i) => {
      this.pair(0, "VERTEX"); this.pair(8, layer);
      this.pair(10, p[0]); this.pair(20, p[1]); this.pair(30, 0);
      if (bulges?.[i]) this.pair(42, bulges[i]!);
    });
    this.pair(0, "SEQEND"); this.pair(8, layer);
    this.grow(...pts);
  }

  circle(c: Pt, r: number, layer: string, dashed = false) {
    this.head("CIRCLE", layer, dashed);
    this.pair(10, c[0]); this.pair(20, c[1]); this.pair(30, 0); this.pair(40, r);
    this.grow([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]);
  }

  /** Cerchio pieno (come il comando ANELLO di AutoCAD): polilinea di due semicerchi larga r. */
  disc(c: Pt, r: number, layer: string) {
    this.polyline([[c[0] - r / 2, c[1]], [c[0] + r / 2, c[1]]], true, layer, false, r, [1, 1]);
    this.grow([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]);
  }

  /** Triangolo o quadrilatero pieno. */
  solid(pts: Pt[], layer: string) {
    if (pts.length < 3 || pts.length > 4) return;
    // ordine dei vertici del SOLID: 1, 2, 4, 3
    const [a, b, c, d = pts[2]!] = pts as [Pt, Pt, Pt, Pt?];
    const order = [a, b, d, c];
    this.head("SOLID", layer);
    order.forEach((p, i) => { this.pair(10 + i, p[0]); this.pair(20 + i, p[1]); this.pair(30 + i, 0); });
    this.grow(...pts);
  }

  text(at: Pt, value: string, layer: string, o: TextOpts) {
    const align = o.align ?? 0, valign = o.valign ?? 0;
    this.head("TEXT", layer);
    this.pair(10, at[0]); this.pair(20, at[1]); this.pair(30, 0);
    this.pair(40, o.height);
    this.pair(1, dxfText(value));
    if (o.rotation) this.pair(50, o.rotation);
    if (align || valign) {
      this.pair(72, align);
      this.pair(11, at[0]); this.pair(21, at[1]); this.pair(31, 0);
      this.pair(73, valign);
    }
    this.grow(at);
  }

  toString(): string {
    const body = this.out;
    this.out = [];
    const lo = isFinite(this.lo[0]) ? this.lo : [0, 0] as Pt, hi = isFinite(this.hi[0]) ? this.hi : [0, 0] as Pt;
    this.pair(0, "SECTION"); this.pair(2, "HEADER");
    this.pair(9, "$ACADVER"); this.pair(1, "AC1009");
    this.pair(9, "$DWGCODEPAGE"); this.pair(3, "ANSI_1252");
    this.pair(9, "$INSUNITS"); this.pair(70, 4);
    this.pair(9, "$MEASUREMENT"); this.pair(70, 1);
    this.pair(9, "$EXTMIN"); this.pair(10, lo[0]); this.pair(20, lo[1]); this.pair(30, 0);
    this.pair(9, "$EXTMAX"); this.pair(10, hi[0]); this.pair(20, hi[1]); this.pair(30, 0);
    this.pair(9, "$LTSCALE"); this.pair(40, 1);
    this.pair(0, "ENDSEC");
    this.pair(0, "SECTION"); this.pair(2, "TABLES");
    this.pair(0, "TABLE"); this.pair(2, "LTYPE"); this.pair(70, 2);
    this.pair(0, "LTYPE"); this.pair(2, "CONTINUOUS"); this.pair(70, 0); this.pair(3, "Solid line");
    this.pair(72, 65); this.pair(73, 0); this.pair(40, 0);
    this.pair(0, "LTYPE"); this.pair(2, "DASHED"); this.pair(70, 0); this.pair(3, "__ __ __ __");
    this.pair(72, 65); this.pair(73, 2); this.pair(40, 3); this.pair(49, 2); this.pair(49, -1);
    this.pair(0, "ENDTAB");
    const layers = this.layers.filter((l) => this.used.has(l.name));
    this.pair(0, "TABLE"); this.pair(2, "LAYER"); this.pair(70, layers.length + 1);
    for (const l of [{ name: "0", color: 7 } as Layer, ...layers]) {
      this.pair(0, "LAYER"); this.pair(2, l.name); this.pair(70, 0); this.pair(62, l.color);
      this.pair(6, l.linetype ?? "CONTINUOUS");
    }
    this.pair(0, "ENDTAB");
    this.pair(0, "TABLE"); this.pair(2, "STYLE"); this.pair(70, 1);
    this.pair(0, "STYLE"); this.pair(2, "STANDARD"); this.pair(70, 0); this.pair(40, 0); this.pair(41, 1);
    this.pair(50, 0); this.pair(71, 0); this.pair(42, 2.5); this.pair(3, "txt"); this.pair(4, "");
    this.pair(0, "ENDTAB");
    this.pair(0, "ENDSEC");
    const head = this.out;
    this.out = [];
    return [...head, "0", "SECTION", "2", "ENTITIES", ...body, "0", "ENDSEC", "0", "EOF", ""].join("\r\n");
  }
}

// --- tracciati SVG -------------------------------------------------------------------------

export interface SubPath { pts: Pt[]; closed: boolean }

/** Segmenti per curva di Bézier e per arco (un quarto di giro). */
const CURVE_STEPS = 12;

/** Spezza un attributo `d` SVG in sottotracciati di soli punti (curve e archi approssimati). */
export function flattenPath(d: string): SubPath[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  let cx2 = 0, cy2 = 0, qx = 0, qy = 0, prev = "";
  const n = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  const push = (px: number, py: number) => { cur!.pts.push([px, py]); x = px; y = py; };
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    const x0 = x, y0 = y;
    for (let k = 1; k <= CURVE_STEPS; k++) {
      const t = k / CURVE_STEPS, u = 1 - t;
      push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
           u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
    }
  };
  const quad = (x1: number, y1: number, ex: number, ey: number) => {
    const x0 = x, y0 = y;
    for (let k = 1; k <= CURVE_STEPS; k++) {
      const t = k / CURVE_STEPS, u = 1 - t;
      push(u * u * x0 + 2 * u * t * x1 + t * t * ex, u * u * y0 + 2 * u * t * y1 + t * t * ey);
    }
  };
  const arc = (rx: number, ry: number, phi: number, large: number, sweep: number, ex: number, ey: number) => {
    // conversione da estremi a centro (SVG 1.1, appendice F.6)
    const x0 = x, y0 = y;
    if (!rx || !ry || (x0 === ex && y0 === ey)) { push(ex, ey); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const c = Math.cos(phi * Math.PI / 180), s = Math.sin(phi * Math.PI / 180);
    const dx = (x0 - ex) / 2, dy = (y0 - ey) / 2;
    const x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sign = large === sweep ? -1 : 1;
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const coef = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    const cxp = coef * (rx * y1) / ry, cyp = coef * -(ry * x1) / rx;
    const ccx = c * cxp - s * cyp + (x0 + ex) / 2, ccy = s * cxp + c * cyp + (y0 + ey) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) =>
      Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 2) * CURVE_STEPS / 2));
    for (let k = 1; k <= steps; k++) {
      const t = t1 + (dt * k) / steps;
      if (k === steps) { push(ex, ey); break; }
      push(ccx + c * rx * Math.cos(t) - s * ry * Math.sin(t), ccy + s * rx * Math.cos(t) + c * ry * Math.sin(t));
    }
  };

  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++]!;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const C = cmd.toUpperCase();
    if (C !== "M" && C !== "Z" && !cur) { cur = { pts: [[x, y]], closed: false }; out.push(cur); }
    switch (C) {
      case "M": {
        const px = n() + ox, py = n() + oy;
        cur = { pts: [[px, py]], closed: false }; out.push(cur);
        x = sx = px; y = sy = py;
        cmd = rel ? "l" : "L"; // coppie successive = linee
        break;
      }
      case "L": push(n() + ox, n() + oy); break;
      case "H": push(n() + ox, y); break;
      case "V": push(x, n() + (rel ? y : 0)); break;
      case "C": {
        const a = n() + ox, b = n() + oy, c2 = n() + ox, d2 = n() + oy, e = n() + ox, f = n() + oy;
        cubic(a, b, c2, d2, e, f); cx2 = c2; cy2 = d2; break;
      }
      case "S": {
        const [a, b] = /[CS]/i.test(prev) ? [2 * x - cx2, 2 * y - cy2] : [x, y];
        const c2 = n() + ox, d2 = n() + oy, e = n() + ox, f = n() + oy;
        cubic(a, b, c2, d2, e, f); cx2 = c2; cy2 = d2; break;
      }
      case "Q": {
        const a = n() + ox, b = n() + oy, e = n() + ox, f = n() + oy;
        quad(a, b, e, f); qx = a; qy = b; break;
      }
      case "T": {
        const [a, b] = /[QT]/i.test(prev) ? [2 * x - qx, 2 * y - qy] : [x, y];
        const e = n() + ox, f = n() + oy;
        quad(a, b, e, f); qx = a; qy = b; break;
      }
      case "A": {
        const rx = n(), ry = n(), phi = n(), large = n(), sweep = n(), e = n() + ox, f = n() + oy;
        arc(rx, ry, phi, large, sweep, e, f); break;
      }
      case "Z":
        if (cur) cur.closed = true;
        x = sx; y = sy; cur = null;
        break;
      default:
        return out; // comando sconosciuto: si tiene quel che c'è
    }
    prev = C;
  }
  return out.filter((p) => p.pts.length > 1);
}
