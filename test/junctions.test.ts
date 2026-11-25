import { describe, expect, it } from "vitest";
import { normalizeCircuit, type CircuitDoc } from "../src/model/circuit";
import { dissolveJunction, splitConnection } from "../src/model/junctions";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const base = (): CircuitDoc => normalizeCircuit({
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "M1", type: "pressure_gauge" },
    { id: "M2", type: "pressure_gauge" },
  ],
  connections: [
    { from: "P.1", to: "M1.1", points: [[0, 50], [100, 50]],
      tube: { outer_diameter: "6 mm", inner_diameter: "4 mm", length: "2 m" } },
  ],
  layout: { P: { x: 0, y: 100, rot: 0 }, M1: { x: 100, y: 0, rot: 0 }, M2: { x: 200, y: 50, rot: 0 } },
});

describe("punti di connessione", () => {
  it("spezza una linea dividendo pieghe e tubo, e la ricuce", () => {
    const d = base();
    const ref = splitConnection(d, 0, [50, 50], "N1", 1, 0.25);
    expect(ref).toBe("N1.1");
    expect(d.connections).toEqual([
      { from: "P.1", to: "N1.1", points: [[0, 50]], tube: { outer_diameter: "6 mm", inner_diameter: "4 mm", length: "0.5 m" } },
      { from: "N1.1", to: "M1.1", points: [[100, 50]], tube: { outer_diameter: "6 mm", inner_diameter: "4 mm", length: "1.5 m" } },
    ]);
    expect(dissolveJunction(d, "N1")).toBe(true);
    expect(d.components.map((c) => c.id)).toEqual(["P", "M1", "M2"]);
    expect(d.connections).toEqual([
      { from: "P.1", to: "M1.1", points: [[0, 50], [50, 50], [100, 50]],
        tube: { outer_diameter: "6 mm", inner_diameter: "4 mm", length: "2 m" } },
    ]);
  });

  it("con tre linee resta, e porta la pressione a tutte le diramazioni", () => {
    const d = base();
    const ref = splitConnection(d, 0, [50, 50], "N1", 1);
    d.connections.push({ from: ref, to: "M2.1" });
    expect(dissolveJunction(d, "N1")).toBe(false);
    const a = analyze(d);
    expect(a.issues.filter((i) => i.severity === "error")).toEqual([]);
    const r = compileSim(d);
    if (!r.ok) throw new Error(r.errors.join("; "));
    const s = new Simulator(r.network);
    s.advance(0.5);
    expect(s.gauge("M2.1")).toBeGreaterThan(5.9);
    expect(s.gauge("M1.1")).toBeGreaterThan(5.9);
  });

  it("lo scarico porta la linea a pressione atmosferica", () => {
    const d = normalizeCircuit({
      components: [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "solenoid", actuation_12: "spring" },
        { id: "M", type: "pressure_gauge" },
        { id: "S1", type: "exhaust" },
      ],
      connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.2", to: "M.1" }, { from: "V1.3", to: "S1.1" }],
      layout: {},
    });
    const r = compileSim(d);
    if (!r.ok) throw new Error(r.errors.join("; "));
    const s = new Simulator(r.network);
    s.setCommand("V1", "14", true);
    s.advance(0.3);
    expect(s.gauge("M.1")).toBeGreaterThan(5.9);
    s.setCommand("V1", "14", false);
    s.advance(0.5);
    expect(s.gauge("M.1")).toBeLessThan(0.1);
  });
});
