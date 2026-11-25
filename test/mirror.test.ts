import { describe, expect, it } from "vitest";
import { normalizeCircuit, type CircuitDoc } from "../src/model/circuit";
import { mirrorComponents } from "../src/model/mirror";
import { rotate } from "../src/ui/symbols";

const base = (): CircuitDoc => normalizeCircuit({
  components: [
    { id: "V1", type: "directional_valve", function: "5/2" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
  ],
  connections: [{ from: "V1.4", to: "C1.A", points: [[40, 50]] }, { from: "P.1", to: "V1.1", points: [[0, 200]] }],
  layout: { V1: { x: 0, y: 100, rot: 0 }, C1: { x: 100, y: 0, rot: 1 }, P: { x: 0, y: 300, rot: 0 } },
});

/** posizione nel foglio di un punto locale del simbolo, come in ui/app.ts */
const world = (l: { x: number; y: number; rot: number; mirror?: boolean }, p: [number, number]) => {
  const [rx, ry] = rotate([(l.mirror ? -1 : 1) * p[0], p[1]], l.rot);
  return [l.x + rx, l.y + ry];
};

describe("specchiatura", () => {
  it("un componente si specchia sul posto; due volte torna com'era", () => {
    const d = base();
    mirrorComponents(d, ["V1"], "h");
    expect(d.layout.V1).toEqual({ x: 0, y: 100, rot: 0, mirror: true });
    mirrorComponents(d, ["V1"], "h");
    expect(d.layout.V1).toEqual({ x: 0, y: 100, rot: 0 });
  });

  it("i punti del simbolo finiscono nella posizione speculare, anche se ruotato", () => {
    for (const rot of [0, 1, 2, 3]) {
      for (const axis of ["h", "v"] as const) {
        const d = base();
        d.layout.V1!.rot = rot;
        const before = world(d.layout.V1!, [30, -10]);
        mirrorComponents(d, ["V1"], axis);
        const after = world(d.layout.V1!, [30, -10]);
        const c = d.layout.V1!;
        expect(after).toEqual(axis === "h" ? [2 * c.x - before[0]!, before[1]] : [before[0], 2 * c.y - before[1]!]);
      }
    }
  });

  it("più componenti: posizioni e pieghe interne attorno al centro del gruppo", () => {
    const d = base();
    mirrorComponents(d, ["V1", "C1"], "h");
    // centro x = 50
    expect([d.layout.V1!.x, d.layout.C1!.x]).toEqual([100, 0]);
    expect(d.layout.C1!.rot).toBe(3);
    expect(d.connections[0]!.points).toEqual([[60, 50]]);
    expect(d.connections[1]!.points).toEqual([[0, 200]]); // linea verso P, fuori dal gruppo
    mirrorComponents(d, ["V1", "C1"], "v");
    expect([d.layout.V1!.y, d.layout.C1!.y]).toEqual([0, 100]);
  });
});
