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
export const INTERACTIVE = ".paper-grid, .halo, .port-hit, .hit, .bend-handle, title, #temp-wire, .port.open .port-dot";
const STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linejoin", "stroke-linecap",
  "fill-opacity", "stroke-opacity", "opacity", "font-size", "font-weight", "font-family", "text-anchor",
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
