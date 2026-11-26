/**
 * Esportazione DXF del foglio: si percorre il disegno visibile (#viewport) e ogni elemento
 * SVG diventa un'entità DXF in millimetri, con l'origine nell'angolo in basso a sinistra del
 * foglio e i layer per tipo (cornice, linee, pilotaggi, fili, simboli, testi, blocchi).
 */
import { DxfWriter, flattenPath, type Layer, type Pt } from "../model/dxf";
export { dxfBytes } from "../model/dxf";
import { UNITS_PER_MM, type Rect } from "../model/sheet";
import { INTERACTIVE } from "./pdf";

export const DXF_LAYERS: Layer[] = [
  { name: "CORNICE", color: 7 },
  { name: "LINEE", color: 5 },
  { name: "PILOTAGGI", color: 5, linetype: "DASHED" },
  { name: "SCARICHI", color: 8 },
  { name: "FILI", color: 30 },
  { name: "SIMBOLI", color: 7 },
  { name: "TESTI", color: 7 },
  { name: "BLOCCHI", color: 8, linetype: "DASHED" },
  { name: "ANNOTAZIONI", color: 7 },
];

function layerOf(el: Element): string {
  const inText = el.tagName === "text";
  for (let e: Element | null = el; e; e = e.parentElement) {
    const id = e.id, cls = e.classList;
    if (id === "sheet") return "CORNICE";
    if (id === "annotations" || id === "annotations-top") return "ANNOTAZIONI";
    if (id === "blocks") return inText ? "TESTI" : "BLOCCHI";
    if (cls?.contains("line")) {
      if (inText) return "TESTI";
      return cls.contains("pilot") ? "PILOTAGGI" : cls.contains("wire") ? "FILI" : cls.contains("exhaust") ? "SCARICHI" : "LINEE";
    }
    if (id === "labels" || id === "ports") return "TESTI";
    if (id === "components") return inText ? "TESTI" : "SIMBOLI";
  }
  return "SIMBOLI";
}

/** Colore scuro (testo, tratti pieni) e non trasparente. */
function darkFill(v: string, opacity: string): boolean {
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (!m || Number(opacity) === 0) return false;
  const [r, g, b, a = 1] = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number) as number[];
  if (a === 0) return false;
  return 0.299 * r! + 0.587 * g! + 0.114 * b! < 128;
}

const nums = (s: string | null) => (s ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);

/** DXF del disegno in `viewport`, ritagliato sul foglio `rect` (unità dello schema). */
export function viewportToDxf(viewport: SVGGraphicsElement, rect: Rect): string {
  const dxf = new DxfWriter(DXF_LAYERS);
  const base = viewport.getCTM()!.inverse();
  const U = UNITS_PER_MM;

  const visit = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.matches(INTERACTIVE)) return;
    if (el.tagName === "g" || el.tagName === "svg") { for (const c of el.children) visit(c); return; }
    const g = el as SVGGraphicsElement;
    const ctm = g.getCTM?.();
    if (!ctm) return;
    const m = base.multiply(ctm);
    const P = (x: number, y: number): Pt => {
      const p = new DOMPoint(x, y).matrixTransform(m);
      return [(p.x - rect.x) / U, (rect.y + rect.h - p.y) / U];
    };
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / U;
    const layer = layerOf(el);
    const stroke = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0 && Number(cs.strokeOpacity) !== 0;
    const ann = el.closest<SVGElement>("[data-ann]");
    // testi e forme disegnati: pieni solo se riempiti del colore del tratto (non la tinta chiara)
    const filled = ann ? cs.fill !== "none" && Number(cs.fillOpacity) === 1 && cs.fill === cs.stroke
      : darkFill(cs.fill, cs.fillOpacity);
    const dashed = cs.strokeDasharray !== "none" && cs.strokeDasharray !== "";
    const n = (a: string) => Number(el.getAttribute(a) ?? 0);
    // colore, tipo di linea e spessore scelti dall'utente
    dxf.style = ann ? { color: Number(ann.dataset.dxfColor) || undefined, linetype: ann.dataset.dxfLtype } : {};
    const width = ann && stroke && !filled ? Number(ann.dataset.dxfWidth) || 0 : 0;

    const shape = (pts: Pt[], closed: boolean) => {
      if (filled && closed && (pts.length === 3 || pts.length === 4)) dxf.solid(pts, layer);
      if (stroke || filled) dxf.polyline(pts, closed, layer, dashed, width);
    };

    switch (el.tagName) {
      case "line":
        if (stroke) dxf.polyline([P(n("x1"), n("y1")), P(n("x2"), n("y2"))], false, layer, dashed, width);
        break;
      case "polyline":
      case "polygon": {
        const v = nums(el.getAttribute("points"));
        const pts: Pt[] = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push(P(v[i]!, v[i + 1]!));
        shape(pts, el.tagName === "polygon");
        break;
      }
      case "rect": {
        const x = n("x"), y = n("y"), w = n("width"), h = n("height");
        if (w > 0 && h > 0) shape([P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], true);
        break;
      }
      case "circle": {
        const c = P(n("cx"), n("cy")), r = n("r") * scale;
        if (r <= 0) break;
        if (filled) dxf.disc(c, r, layer);
        else if (stroke) dxf.circle(c, r, layer, dashed);
        break;
      }
      case "ellipse": {
        const cx = n("cx"), cy = n("cy"), rx = n("rx"), ry = n("ry");
        const pts: Pt[] = [];
        for (let k = 0; k < 48; k++) { const t = (k / 48) * 2 * Math.PI; pts.push(P(cx + rx * Math.cos(t), cy + ry * Math.sin(t))); }
        if (stroke || filled) dxf.polyline(pts, true, layer, dashed, width);
        break;
      }
      case "path":
        for (const sp of flattenPath(el.getAttribute("d") ?? "")) shape(sp.pts.map(([x, y]) => P(x, y)), sp.closed);
        break;
      case "text": {
        const value = (el.textContent ?? "").trim();
        if (!value) break;
        const at = P(nums(el.getAttribute("x"))[0] ?? 0, nums(el.getAttribute("y"))[0] ?? 0);
        const anchor = cs.textAnchor === "middle" ? 1 : cs.textAnchor === "end" ? 2 : 0;
        const mid = /middle|central/.test(cs.dominantBaseline) ? 2 : 0;
        const rotation = -Math.atan2(m.b, m.a) * 180 / Math.PI;
        dxf.text(at, value, layer, { height: parseFloat(cs.fontSize) * 0.72 * scale, align: anchor, valign: mid, rotation });
        break;
      }
    }
  };
  for (const c of viewport.children) visit(c);
  dxf.style = {};
  return dxf.toString();
}
