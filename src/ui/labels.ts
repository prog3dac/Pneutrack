/**
 * Posizione della sigla e della descrizione di un componente.
 *
 * Senza indicazioni il testo va sul lato del simbolo da cui non escono porte, così non si
 * sovrappone alle linee che vi arrivano. Se l'utente l'ha trascinato, la posizione scelta è
 * salvata nel layout come scostamento dal centro del componente (`label: [dx, dy]`).
 */
import type { Placement } from "../model/circuit";
import { rotate, type Geometry } from "./symbols";

export interface LabelSpot {
  /** scostamento dal centro del componente, in coordinate dello schema */
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
}

type Side = "top" | "left" | "right" | "bottom";
const GAP = 10;
/** tratto di linea, uscendo dalla porta, che il testo non deve coprire */
const RAY = 40;
/** larghezza media di un carattere dell'etichetta (12 px, grassetto) */
const CHAR = 6.8;

/** Lato del simbolo (già ruotato e specchiato) verso cui punta ciascuna porta. */
export function portSides(g: Geometry, l: Pick<Placement, "rot" | "mirror">): Side[] {
  return portRays(g, l).map(({ d }) => (d[0] < 0 ? "left" : d[0] > 0 ? "right" : d[1] < 0 ? "top" : "bottom"));
}

function portRays(g: Geometry, l: Pick<Placement, "rot" | "mirror">) {
  const m = l.mirror ? -1 : 1;
  return Object.values(g.ports).map((p) => ({
    p: rotate([m * p.x, p.y], l.rot || 0),
    d: rotate([m * p.dir[0], p.dir[1]], l.rot || 0),
  }));
}

/**
 * Posizione automatica: sopra, a sinistra, a destra, sotto e poi negli angoli, la prima in cui
 * il testo non copre il primo tratto delle linee che escono dalle porte.
 */
export function autoLabelSpot(g: Geometry, l: Pick<Placement, "rot" | "mirror">, text = "XX"): LabelSpot {
  const turned = (l.rot || 0) % 2 === 1;
  const hw = (turned ? g.h : g.w) / 2, hh = (turned ? g.w : g.h) / 2;
  const candidates: LabelSpot[] = [
    { dx: 0, dy: -hh - GAP, anchor: "middle" },
    { dx: -hw - GAP, dy: 4, anchor: "end" },
    { dx: hw + GAP, dy: 4, anchor: "start" },
    { dx: 0, dy: hh + GAP + 10, anchor: "middle" },
    { dx: -hw, dy: -hh - GAP, anchor: "end" },
    { dx: hw, dy: -hh - GAP, anchor: "start" },
    { dx: -hw, dy: hh + GAP + 10, anchor: "end" },
    { dx: hw, dy: hh + GAP + 10, anchor: "start" },
  ];
  const w = text.length * CHAR;
  const rays = portRays(g, l).map(({ p, d }) => [p[0], p[1], p[0] + d[0] * RAY, p[1] + d[1] * RAY] as const);
  const hits = (c: LabelSpot) => {
    const x0 = c.anchor === "start" ? c.dx : c.anchor === "end" ? c.dx - w : c.dx - w / 2;
    const x1 = x0 + w, y0 = c.dy - 12, y1 = c.dy + 4;
    return rays.filter(([ax, ay, bx, by]) =>
      Math.max(ax, bx) >= x0 - 3 && Math.min(ax, bx) <= x1 + 3 && Math.max(ay, by) >= y0 - 3 && Math.min(ay, by) <= y1 + 3).length;
  };
  return candidates.reduce((best, c) => (hits(c) < hits(best) ? c : best), candidates[0]!);
}

/** Posizione del testo: quella scelta dall'utente se c'è, altrimenti quella automatica. */
export function labelSpot(g: Geometry, l: Placement, text?: string): LabelSpot {
  if (l.label) return { dx: l.label[0], dy: l.label[1], anchor: "middle" };
  return autoLabelSpot(g, l, text);
}
