// Misuratore di portata: in simulazione deve leggere la portata che lo attraversa.
import { describe, expect, it } from "vitest";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const circuit = () => {
  const r = compileSim({
    components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "FM", type: "flow_meter" },
      { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } }],
    connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "FM.1" }, { from: "FM.2", to: "C1.A" },
      { from: "V1.2", to: "C1.B" }],
  });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
};

describe("misuratore di portata", () => {
  it("legge la portata verso il cilindro in uscita e zero a impianto fermo", () => {
    const s = circuit();
    s.advance(0.3);
    expect(Math.abs(s.meterFlow("FM")!)).toBeLessThan(1);
    s.setCommand("V1", "14", true);
    let peak = 0;
    while (s.cylinder("C1")!.fraction < 0.5 && s.t < 2) { s.advance(0.002); peak = Math.max(peak, s.meterFlow("FM")!); }
    // la camera A si riempie: aria da 1 verso 2, decine di Nl/min
    expect(peak).toBeGreaterThan(10);
    // a fine corsa la camera è piena e la portata torna a zero
    s.advance(1.5);
    expect(Math.abs(s.meterFlow("FM")!)).toBeLessThan(1);
  });

  it("in rientro l'aria lo attraversa da 2 verso 1: portata negativa", () => {
    const s = circuit();
    s.setCommand("V1", "14", true);
    s.advance(1.5);
    s.setCommand("V1", "14", false);
    let low = 0;
    for (let i = 0; i < 100; i++) { s.advance(0.002); low = Math.min(low, s.meterFlow("FM")!); }
    expect(low).toBeLessThan(-10);
  });

  it("l'aria contata dal misuratore è quella che entra nel cilindro", () => {
    const s = circuit();
    s.advance(0.3);
    const v0 = s.meterVolume("FM")!, a0 = s.airUsed();
    s.setCommand("V1", "14", true);
    s.advance(1.5);
    const through = s.meterVolume("FM")! - v0, used = s.airUsed() - a0;
    expect(through).toBeGreaterThan(0.3);
    expect(through).toBeCloseTo(used, 1);
  });

  it("solo i misuratori hanno una lettura di portata", () => {
    const s = circuit();
    expect(s.meterFlow("C1")).toBeUndefined();
    expect(s.meterFlow("V1")).toBeUndefined();
    expect(s.meters()).toEqual(["FM"]);
  });
});
