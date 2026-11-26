/**
 * Esportazione in PDF vettoriale del foglio di disegno.
 *
 * Copia il disegno visibile (#viewport) in un SVG autonomo grande quanto il foglio, con gli
 * stili calcolati scritti sugli elementi (il PDF non conosce il CSS della pagina), e lo
 * converte con jsPDF + svg2pdf.js, caricati solo al momento dell'esportazione.
 */
import type { Rect } from "../model/sheet";

const SVG_NS = "http://www.w3.org/2000/svg";
/** elementi che servono solo all'interazione nell'editor */
export const INTERACTIVE = ".paper-grid, .halo, .port-hit, .hit, .bend-handle, title, #temp-wire, .port.open .port-dot, " +
  ".ann-hit, .ann-hit-area, .ann-sel, .ann-handle";
const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linejoin", "stroke-linecap",
  "fill-opacity", "stroke-opacity", "opacity", "font-size", "font-weight", "font-style", "font-family", "text-anchor",
  "dominant-baseline", "paint-order"];

/** SVG autonomo del foglio: `rect` in unità dello schema, `mm` dimensioni della carta. */
export function sheetSvg(viewport: SVGGElement, rect: Rect, mm: [number, number]): SVGSVGElement {
  const out = document.createElementNS(SVG_NS, "svg");
  out.setAttribute("xmlns", SVG_NS);
  out.setAttribute("viewBox", `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
  out.setAttribute("width", `${mm[0]}mm`);
  out.setAttribute("height", `${mm[1]}mm`);
  const clone = viewport.cloneNode(true) as SVGGElement;
  clone.removeAttribute("transform");
  // stili calcolati, camminando insieme l'originale e la copia
  const src = [viewport, ...viewport.querySelectorAll<SVGElement>("*")];
  const dst = [clone, ...clone.querySelectorAll<SVGElement>("*")];
  const hidden: Element[] = [];
  src.forEach((el, i) => {
    const copy = dst[i]!;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.matches(INTERACTIVE)) { hidden.push(copy); return; }
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) copy.setAttribute(p, v);
    }
    copy.removeAttribute("class");
    // gli stili in linea possono usare variabili CSS (var(--ink)) che PDF e SVG autonomo non conoscono:
    // valgono già i valori calcolati scritti sopra
    copy.removeAttribute("style");
    if (copy.tagName === "text") {
      // il PDF ha solo i caratteri standard; il bordo chiaro dietro al testo (paint-order) non è supportato
      copy.setAttribute("font-family", "helvetica");
      copy.setAttribute("font-weight", parseInt(cs.fontWeight, 10) >= 600 ? "bold" : "normal");
      if (cs.getPropertyValue("paint-order").startsWith("stroke")) {
        copy.removeAttribute("stroke"); copy.removeAttribute("stroke-width"); copy.removeAttribute("paint-order");
      }
    }
  });
  for (const h of hidden) h.remove();
  out.append(clone);
  return out;
}

/** Converte l'SVG in PDF e lo restituisce come Blob. */
export async function svgToPdf(svgEl: SVGSVGElement, mm: [number, number], title: string): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const pdf = new jsPDF({ orientation: mm[0] > mm[1] ? "landscape" : "portrait", unit: "mm", format: [mm[0], mm[1]] });
  pdf.setProperties({ title, creator: "Pneutrack" });
  // svg2pdf ha bisogno dell'SVG nel documento per misurare i testi
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden";
  host.append(svgEl);
  document.body.append(host);
  try {
    await svg2pdf(svgEl, pdf, { x: 0, y: 0, width: mm[0], height: mm[1] });
  } finally {
    host.remove();
  }
  return pdf.output("blob");
}

/** Distinta componenti in PDF (A4 verticale): intestazione, tabella con testo a capo, piè di pagina. */
export async function bomToPdf(rows: string[][], headers: string[], title: string, subtitle: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setProperties({ title: `Distinta componenti · ${title}`, creator: "Pneutrack" });
  const widths = [10, 26, 58, 46, 38, 12]; // somma 190 mm
  const left = 10, top = 14, bottom = 285, pad = 1.5, line = 4;
  let y = top;
  const header = () => {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
    pdf.text(`Distinta componenti · ${title}`, left, y + 5);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(100);
    pdf.text(subtitle, left, y + 10);
    pdf.setTextColor(0);
    y += 15;
    row(headers, true);
  };
  const row = (cells: string[], bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(8.5);
    const wrapped = cells.map((c, i) => pdf.splitTextToSize(c, widths[i]! - 2 * pad) as string[]);
    const h = Math.max(...wrapped.map((w) => w.length)) * line + 2 * pad;
    if (!bold && y + h > bottom) { pdf.addPage(); y = top; header(); }
    let x = left;
    if (bold) { pdf.setFillColor(235, 238, 243); pdf.rect(left, y, 190, h, "F"); }
    wrapped.forEach((w, i) => {
      pdf.rect(x, y, widths[i]!, h);
      const right = i === 0 || i === widths.length - 1;
      pdf.text(w, right ? x + widths[i]! - pad : x + pad, y + pad + 3, { align: right ? "right" : "left" });
      x += widths[i]!;
    });
    y += h;
  };
  header();
  for (const r of rows) row(r);
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text(`Pagina ${p} di ${pages}`, 200, 292, { align: "right" });
  }
  return pdf.output("blob");
}
