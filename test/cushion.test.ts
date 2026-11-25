// Ammortizzo pneumatico regolabile dei cilindri.
import { describe, expect, it } from "vitest";
import { buildComponent, type ComponentData } from "../src/model/components";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const cyl = (extra: Partial<ComponentData> = {}, params: Record<string, string> = {}): ComponentData => ({
  id: "C1", type: "double_acting_cylinder", ...extra,
  params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm", mass: "2 kg", ...params },
});

/** Corsa di uscita (velocità realistica, circa 0,5 m/s): velocità a 1 mm dal fine corsa, velocità massima e tempo totale. */
function stroke(c: ComponentData) {
  const r = compileSim({
    components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring",
        params: { conductance: "0.3 dm3/(s·bar)" } }, c],
    connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
  });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const s = new Simulator(r.network);
  s.advance(0.2);
  s.setCommand("V1", "14", true);
  const t0 = s.t;
  let vEnd = -1, vMax = 0;
  while (s.t < t0 + 5) {
    s.advance(0.0005);
    const k = s.cylinder("C1")!;
    vMax = Math.max(vMax, k.v);
    if (vEnd < 0 && k.x >= 0.099) vEnd = k.v; // velocità d'urto, 1 mm prima del fondo
    if (k.fraction >= 0.9999 && Math.abs(k.v) < 1e-3) break;
  }
  return { vEnd, vMax, time: s.t - t0 };
}

describe("ammortizzo pneumatico regolabile", () => {
  it("rallenta lo stelo negli ultimi millimetri, tanto più quanto la vite è chiusa", () => {
    const free = stroke(cyl());
    const open = stroke(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening: "0.8" }));
    const closed = stroke(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening: "0.1" }));
    expect(open.vEnd).toBeLessThan(free.vEnd * 0.8);
    expect(closed.vEnd).toBeLessThan(open.vEnd);
    expect(closed.vEnd).toBeLessThan(0.15);
    expect(closed.time).toBeGreaterThan(open.time);
    // prima dell'ammortizzo il moto è quello libero
    expect(closed.vMax).toBeGreaterThan(free.vMax * 0.8);
  });

  it("l'ammortizzo solo in rientro non cambia l'uscita", () => {
    const free = stroke(cyl());
    const capOnly = stroke(cyl({ cushioning: "cap" }, { cushion_opening: "0.1" }));
    expect(Math.abs(capOnly.time - free.time)).toBeLessThan(0.01);
  });

  it("valida opzione e parametri", () => {
    expect(() => buildComponent(cyl({ cushioning: "boh" }))).toThrow(/non valido/);
    expect(() => buildComponent(cyl({ cushioning: "both" }, { cushion_length: "60 mm" }))).toThrow(/troppo lungo/);
    expect(() => buildComponent(cyl({ cushioning: "both" }, { cushion_opening: "2" }))).toThrow(/da 0/);
    expect(() => buildComponent(cyl({ cushioning: "both" }, { cushion_opening: "0" }))).not.toThrow();
    expect(() => buildComponent({ id: "C2", type: "single_acting_cylinder", cushioning: "both",
      params: { bore: "20 mm", stroke: "50 mm" } })).toThrow(/non ha l'ammortizzo/);
  });
});
