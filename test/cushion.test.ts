// Ammortizzo pneumatico regolabile dei cilindri.
import { describe, expect, it } from "vitest";
import { buildComponent, paramApplies, upgradeComponent, type ComponentData } from "../src/model/components";
import { compileSim, cushionTaper } from "../src/sim/network";
import { cushionConductance, Simulator } from "../src/sim/simulator";

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

/** Corsa di uscita: quanti ritorni fa lo stelo e di quanto arretra al massimo dopo essere entrato nell'ammortizzo [m]. */
function rebound(c: ComponentData) {
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
  let xMax = 0, back = 0, returns = 0, wasBack = false;
  for (let i = 0; i < 4000; i++) {
    s.advance(0.00025);
    const k = s.cylinder("C1")!;
    xMax = Math.max(xMax, k.x);
    back = Math.max(back, xMax - k.x);
    const isBack = k.v < -0.005;
    if (isBack && !wasBack) returns++;
    wasBack = isBack;
  }
  return { returns, back };
}

/** Tempo passato negli ultimi 20 mm della corsa di uscita [s], con una valvola di conduttanza `valveC`. */
function cushionTime(c: ComponentData, valveC = "0.3 dm3/(s·bar)") {
  const r = compileSim({
    components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring",
        params: { conductance: valveC } }, c],
    connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
  });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const s = new Simulator(r.network);
  s.advance(0.3);
  s.setCommand("V1", "14", true);
  let tIn = -1;
  while (s.t < 6) {
    s.advance(0.0005);
    const k = s.cylinder("C1")!;
    if (tIn < 0 && k.x >= 0.08) tIn = s.t;
    if (k.fraction >= 0.9999 && Math.abs(k.v) < 1e-3) break;
  }
  return s.t - tIn;
}

/** Corsa di uscita e poi di rientro: durata di ciascuna [s]. */
function bothStrokes(c: ComponentData) {
  const r = compileSim({
    components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring",
        params: { conductance: "0.3 dm3/(s·bar)" } }, c],
    connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
  });
  if (!r.ok) throw new Error(r.errors.join("; "));
  const s = new Simulator(r.network);
  s.advance(0.3);
  const time = (out: boolean) => {
    s.setCommand("V1", "14", out);
    const t0 = s.t;
    while (s.t < t0 + 5) {
      s.advance(0.0005);
      const k = s.cylinder("C1")!;
      if ((out ? k.fraction >= 0.9999 : k.fraction <= 1e-4) && Math.abs(k.v) < 1e-3) break;
    }
    const t = s.t - t0;
    s.advance(0.3);
    return t;
  };
  const extend = time(true);
  return { extend, retract: time(false), sim: s };
}

describe("ammortizzo pneumatico regolabile", () => {
  it("ha due viti: quella in uscita frena solo l'uscita, quella in rientro solo il rientro", () => {
    const base = bothStrokes(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.3", cushion_opening_cap: "0.3" }));
    const rodClosed = bothStrokes(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.05", cushion_opening_cap: "0.3" }));
    const capClosed = bothStrokes(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.3", cushion_opening_cap: "0.05" }));
    expect(rodClosed.extend).toBeGreaterThan(base.extend * 1.5);
    expect(Math.abs(rodClosed.retract - base.retract)).toBeLessThan(0.01);
    expect(capClosed.retract).toBeGreaterThan(base.retract * 1.5);
    expect(Math.abs(capClosed.extend - base.extend)).toBeLessThan(0.01);
  });

  it("in simulazione ogni vite ha il suo cursore", () => {
    const { sim } = bothStrokes(cyl({ cushioning: "both" }, { cushion_length: "20 mm" }));
    expect(sim.tunable("C1", "cushion_opening_rod")?.value).toBeCloseTo(0.3);
    expect(sim.tunable("C1", "cushion_opening_cap")?.value).toBeCloseTo(0.3);
    expect(sim.setTunable("C1", "cushion_opening_cap", 0.5)).toBeCloseTo(0.5);
    expect(sim.tunable("C1", "cushion_opening_rod")?.value).toBeCloseTo(0.3);
  });

  it("legge gli schemi con la vite unica delle versioni precedenti", () => {
    const old = cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening: "0.1" });
    const now = cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.1", cushion_opening_cap: "0.1" });
    const a = bothStrokes(old), b = bothStrokes(now);
    expect(a.extend).toBeCloseTo(b.extend, 3);
    expect(a.retract).toBeCloseTo(b.retract, 3);
    expect(old.params!.cushion_opening).toBe("0.1"); // l'originale non cambia
    expect(upgradeComponent(old)).toBe(true);
    expect(old.params).toEqual(now.params);
    expect(upgradeComponent(old)).toBe(false);
  });

  it("mostra solo i parametri dell'ammortizzo scelto", () => {
    expect(paramApplies({ cushioning: "none" }, "cushion_length")).toBe(false);
    expect(paramApplies({ cushioning: "rod" }, "cushion_opening_rod")).toBe(true);
    expect(paramApplies({ cushioning: "rod" }, "cushion_opening_cap")).toBe(false);
    expect(paramApplies({ cushioning: "both" }, "cushion_opening_cap")).toBe(true);
    expect(paramApplies({}, "mass")).toBe(true);
  });

  it("a pari apertura la frenata non dipende dall'alesaggio (vite e passaggi crescono con l'area)", () => {
    const small = cushionTime(cyl({ cushioning: "both" }, { cushion_length: "20 mm" }));
    const big = cushionTime(cyl({ cushioning: "both" }, { bore: "63 mm", rod: "20 mm", cushion_length: "20 mm" }), "3 dm3/(s·bar)");
    expect(big / small).toBeGreaterThan(0.6);
    expect(big / small).toBeLessThan(1.6);
  });

  it("non fa rimbalzare lo stelo con la vite regolata e una massa normale", () => {
    for (const opening of ["0.1", "0.3", "0.8"]) {
      const r = rebound(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: opening, cushion_opening_cap: opening }));
      expect(r.returns, `vite al ${opening}`).toBe(0);
    }
  });

  it("con la vite quasi chiusa e una massa grande rimbalza una volta sola, di pochi millimetri", () => {
    const r = rebound(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.1", cushion_opening_cap: "0.1", mass: "10 kg" }));
    expect(r.returns).toBeLessThanOrEqual(1);
    expect(r.back).toBeLessThan(3e-3);
  });

  it("lo spillo conico chiude il passaggio con continuità, senza gradino", () => {
    const free = 5e-8, screw = 1e-9;
    expect(cushionConductance(free, screw, 0)).toBe(free);
    expect(cushionConductance(free, screw, 1)).toBe(screw);
    let prev = free;
    for (let s = 0.05; s <= 1; s += 0.05) {
      const c = cushionConductance(free, screw, s);
      expect(c).toBeLessThan(prev);
      expect(prev / c).toBeLessThan(2); // nessun salto brusco tra due punti vicini
      prev = c;
    }
    expect(cushionTaper(0.02)).toBeCloseTo(0.004);
    expect(cushionTaper(0.004)).toBeCloseTo(0.001);
    expect(cushionTaper(0.04)).toBeCloseTo(0.005);
  });

  it("rallenta lo stelo negli ultimi millimetri, tanto più quanto la vite è chiusa", () => {
    const free = stroke(cyl());
    const open = stroke(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.8", cushion_opening_cap: "0.8" }));
    const closed = stroke(cyl({ cushioning: "both" }, { cushion_length: "20 mm", cushion_opening_rod: "0.1", cushion_opening_cap: "0.1" }));
    expect(open.vEnd).toBeLessThan(free.vEnd * 0.8);
    expect(closed.vEnd).toBeLessThan(open.vEnd);
    expect(closed.vEnd).toBeLessThan(0.15);
    expect(closed.time).toBeGreaterThan(open.time);
    // prima dell'ammortizzo il moto è quello libero
    expect(closed.vMax).toBeGreaterThan(free.vMax * 0.8);
  });

  it("l'ammortizzo solo in rientro non cambia l'uscita", () => {
    const free = stroke(cyl());
    const capOnly = stroke(cyl({ cushioning: "cap" }, { cushion_opening_cap: "0.1" }));
    expect(Math.abs(capOnly.time - free.time)).toBeLessThan(0.01);
  });

  it("valida opzione e parametri", () => {
    expect(() => buildComponent(cyl({ cushioning: "boh" }))).toThrow(/non valido/);
    expect(() => buildComponent(cyl({ cushioning: "both" }, { cushion_length: "60 mm" }))).toThrow(/troppo lungo/);
    expect(() => buildComponent(cyl({ cushioning: "both" }, { cushion_opening_rod: "2" }))).toThrow(/da 0/);
    expect(() => buildComponent(cyl({ cushioning: "both" }, { cushion_opening_cap: "0" }))).not.toThrow();
    expect(() => buildComponent({ id: "C2", type: "single_acting_cylinder", cushioning: "both",
      params: { bore: "20 mm", stroke: "50 mm" } })).toThrow(/non ha l'ammortizzo/);
  });
});
