/**
 * Specchiatura dei componenti nel disegno.
 *
 * Un simbolo è disegnato come `rotate(rot·90°) · scale(mirror ? −1 : 1, 1)`: prima si
 * specchia nel suo riferimento, poi si ruota. Specchiare nel foglio equivale a cambiare
 * entrambi: con F = specchio orizzontale, F·R(r) = R(−r)·F, quindi
 *   - specchio orizzontale (sinistra ↔ destra): rot → −rot, mirror invertito;
 *   - specchio verticale (alto ↔ basso) = R(2)·F: rot → 2 − rot, mirror invertito.
 * Con più componenti si specchiano anche le posizioni attorno al centro del gruppo e i
 * punti di piega delle linee tra loro. Il modello pneumatico non cambia.
 */
import type { CircuitDoc } from "./circuit";

export type Axis = "h" | "v";

const compOf = (ref: string) => ref.slice(0, ref.lastIndexOf("."));
const mod4 = (n: number) => ((n % 4) + 4) % 4;

export function mirrorComponents(doc: CircuitDoc, ids: string[], axis: Axis): void {
  const set = new Set(ids.filter((id) => doc.layout[id] || doc.components.some((c) => c.id === id)));
  if (!set.size) return;
  for (const id of set) doc.layout[id] ??= { x: 0, y: 0, rot: 0 };
  const places = [...set].map((id) => doc.layout[id]!);
  const xs = places.map((p) => p.x), ys = places.map((p) => p.y);
  // asse di specchiatura: centro del gruppo (per un solo componente, il suo centro)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const flip = ([x, y]: [number, number]): [number, number] => (axis === "h" ? [2 * cx - x, y] : [x, 2 * cy - y]);
  for (const p of places) {
    [p.x, p.y] = flip([p.x, p.y]);
    p.rot = mod4(axis === "h" ? -(p.rot || 0) : 2 - (p.rot || 0));
    if (p.mirror) delete p.mirror; else p.mirror = true;
  }
  for (const c of doc.connections) {
    if (c.points && set.has(compOf(c.from)) && set.has(compOf(c.to))) c.points = c.points.map(flip);
  }
}
