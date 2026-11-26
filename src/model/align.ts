/**
 * Allineamento e distribuzione dei componenti selezionati.
 *
 * Si lavora sugli ingombri dei simboli (centro = posizione nel layout, `hw`/`hh` metà
 * larghezza e altezza già ruotate). I bordi si allineano al componente più esterno, i
 * centri alla media tra i due estremi; la distribuzione lascia fermi il primo e l'ultimo
 * e spazia gli altri con lo stesso intervallo tra i centri. Le nuove posizioni restano sulla
 * griglia `grid`, così le porte continuano a cadere sui nodi e le linee restano dritte.
 * Le pieghe delle linee non si toccano, come quando si sposta un componente a mano.
 */
import type { CircuitDoc } from "./circuit";

export type AlignMode = "left" | "center-x" | "right" | "top" | "center-y" | "bottom" | "dist-h" | "dist-v";

export interface HalfSize { hw: number; hh: number }

export const ALIGN_LABELS: Record<AlignMode, { label: string; title: string }> = {
  "left": { label: "⇤ Sinistra", title: "Allinea i bordi sinistri al componente più a sinistra" },
  "center-x": { label: "↕ Centri vert.", title: "Mette i centri sulla stessa verticale (es. valvola sotto il suo cilindro)" },
  "right": { label: "⇥ Destra", title: "Allinea i bordi destri al componente più a destra" },
  "top": { label: "⤒ Sopra", title: "Allinea i bordi superiori al componente più in alto" },
  "center-y": { label: "↔ Centri oriz.", title: "Mette i centri sulla stessa orizzontale (es. una fila di valvole)" },
  "bottom": { label: "⤓ Sotto", title: "Allinea i bordi inferiori al componente più in basso" },
  "dist-h": { label: "⇹ Distribuisci oriz.", title: "Stesso passo orizzontale tra i centri; il primo e l'ultimo restano fermi (servono 3 componenti)" },
  "dist-v": { label: "⇳ Distribuisci vert.", title: "Stesso passo verticale tra i centri; il primo e l'ultimo restano fermi (servono 3 componenti)" },
};

/** Sposta i componenti `ids`; restituisce quanti ne ha mossi. */
export function alignComponents(doc: CircuitDoc, ids: string[], mode: AlignMode,
                                size: (id: string) => HalfSize, grid = 10): number {
  const list = ids.filter((id) => doc.components.some((c) => c.id === id));
  if (list.length < 2) return 0;
  for (const id of list) doc.layout[id] ??= { x: 0, y: 0, rot: 0 };
  const snap = (v: number) => Math.round(v / grid) * grid;
  const items = list.map((id) => ({ l: doc.layout[id]!, ...size(id) }));
  const before = items.map((i) => [i.l.x, i.l.y]);

  if (mode === "dist-h" || mode === "dist-v") {
    if (items.length < 3) return 0;
    const key = mode === "dist-h" ? "x" : "y";
    items.sort((a, b) => a.l[key] - b.l[key]);
    const first = items[0]!.l[key], last = items[items.length - 1]!.l[key];
    const step = (last - first) / (items.length - 1);
    items.forEach((it, i) => { if (i > 0 && i < items.length - 1) it.l[key] = snap(first + step * i); });
  } else {
    const xs0 = items.map((i) => i.l.x - i.hw), xs1 = items.map((i) => i.l.x + i.hw);
    const ys0 = items.map((i) => i.l.y - i.hh), ys1 = items.map((i) => i.l.y + i.hh);
    const left = Math.min(...xs0), right = Math.max(...xs1), top = Math.min(...ys0), bottom = Math.max(...ys1);
    const cx = (Math.min(...items.map((i) => i.l.x)) + Math.max(...items.map((i) => i.l.x))) / 2;
    const cy = (Math.min(...items.map((i) => i.l.y)) + Math.max(...items.map((i) => i.l.y))) / 2;
    for (const it of items) {
      if (mode === "left") it.l.x = snap(left + it.hw);
      else if (mode === "right") it.l.x = snap(right - it.hw);
      else if (mode === "center-x") it.l.x = snap(cx);
      else if (mode === "top") it.l.y = snap(top + it.hh);
      else if (mode === "bottom") it.l.y = snap(bottom - it.hh);
      else it.l.y = snap(cy);
    }
  }
  // gli ordinamenti cambiano l'ordine: si conta confrontando per componente
  return list.filter((id, i) => doc.layout[id]!.x !== before[i]![0] || doc.layout[id]!.y !== before[i]![1]).length;
}
