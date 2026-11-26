import { describe, expect, it } from "vitest";
import { normalizeCircuit, type CircuitDoc } from "../src/model/circuit";
import { alignComponents } from "../src/model/align";

const doc = (): CircuitDoc => normalizeCircuit({
  components: [
    { id: "A", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "B", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "C", type: "pressure_source", params: { pressure: "6 bar" } },
  ],
  connections: [{ from: "A.1", to: "B.1", points: [[5, 5]] }],
  layout: { A: { x: 0, y: 0, rot: 0 }, B: { x: 100, y: 40, rot: 0 }, C: { x: 330, y: 90, rot: 1 } },
});
const sizes: Record<string, { hw: number; hh: number }> = { A: { hw: 20, hh: 10 }, B: { hw: 40, hh: 30 }, C: { hw: 10, hh: 20 } };
const size = (id: string) => sizes[id]!;

describe("allineamento", () => {
  it("bordi sinistri e superiori al componente più esterno", () => {
    const d = doc();
    alignComponents(d, ["A", "B", "C"], "left", size);
    // bordo sinistro più esterno: A a -20
    expect([d.layout.A!.x, d.layout.B!.x, d.layout.C!.x]).toEqual([0, 20, -10]);
    alignComponents(d, ["A", "B", "C"], "top", size);
    expect([d.layout.A!.y, d.layout.B!.y, d.layout.C!.y]).toEqual([0, 20, 10]);
  });

  it("bordi destri e inferiori", () => {
    const d = doc();
    alignComponents(d, ["A", "B", "C"], "right", size);
    expect([d.layout.A!.x, d.layout.B!.x, d.layout.C!.x]).toEqual([320, 300, 330]);
    alignComponents(d, ["A", "B", "C"], "bottom", size);
    expect([d.layout.A!.y, d.layout.B!.y, d.layout.C!.y]).toEqual([100, 80, 90]);
  });

  it("centri sulla stessa linea, sempre sulla griglia", () => {
    const d = doc();
    alignComponents(d, ["A", "C"], "center-x", size);
    expect([d.layout.A!.x, d.layout.C!.x]).toEqual([170, 170]); // 165 → 170
    expect(d.layout.B!.x).toBe(100);
    alignComponents(d, ["A", "B"], "center-y", size);
    expect([d.layout.A!.y, d.layout.B!.y]).toEqual([20, 20]);
  });

  it("distribuzione: estremi fermi, passo uguale tra i centri", () => {
    const d = doc();
    expect(alignComponents(d, ["C", "A", "B"], "dist-h", size)).toBe(1);
    expect([d.layout.A!.x, d.layout.B!.x, d.layout.C!.x]).toEqual([0, 170, 330]);
    alignComponents(d, ["A", "B", "C"], "dist-v", size);
    expect(d.layout.B!.y).toBe(50); // 45 arrotondato sulla griglia
  });

  it("con meno componenti del necessario non fa nulla; pieghe e rotazioni intatte", () => {
    const d = doc();
    expect(alignComponents(d, ["A"], "left", size)).toBe(0);
    expect(alignComponents(d, ["A", "B"], "dist-h", size)).toBe(0);
    alignComponents(d, ["A", "B", "C"], "center-y", size);
    expect(d.connections[0]!.points).toEqual([[5, 5]]);
    expect(d.layout.C!.rot).toBe(1);
  });
});
