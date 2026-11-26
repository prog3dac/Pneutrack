// Apertura percentuale degli strozzatori, portata nominale Qn e nuovi parametri dei cilindri.
import { describe, expect, it } from "vitest";
import { buildComponent, conductanceFromFlow, conductanceOf, type ComponentData } from "../src/model/components";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";
import { iso6358MassFlow } from "../src/solver/flow";
import { RHO_ANR } from "../src/solver/constants";
import { q } from "../src/model/units";

const comp = (type: string, params: Record<string, string> = {}): ComponentData => ({ id: "X", type, params });
const dm3 = (C: number) => C / 1e-8;

describe("apertura degli strozzatori", () => {
  it("la percentuale si scrive in % o come frazione", () => {
    expect(q("35 %").si).toBeCloseTo(0.35);
    expect(q("0.35").si).toBeCloseTo(0.35);
  });

  it("C effettiva = apertura × C a tutta apertura", () => {
    const c = buildComponent(comp("flow_control_valve", { conductance: "2 dm3/(s·bar)", opening: "25 %" }));
    expect(dm3(conductanceOf(c))).toBeCloseTo(0.5);
    const closed = buildComponent(comp("one_way_flow_control", { conductance: "2 dm3/(s·bar)", opening: "0 %" }));
    expect(conductanceOf(closed)).toBe(0);
  });

  it("senza apertura vale tutta aperta: gli schemi con la sola C simulano come prima", () => {
    const c = buildComponent(comp("flow_control_valve", { conductance: "0.3 dm3/(s·bar)" }));
    expect(dm3(conductanceOf(c))).toBeCloseTo(0.3);
  });

  it("rifiuta aperture fuori da 0–100 %", () => {
    expect(() => buildComponent(comp("flow_control_valve", { opening: "120 %" }))).toThrow(/100 %/);
    expect(() => buildComponent(comp("flow_control_valve", { opening: "-5 %" }))).toThrow();
  });

  it("a metà apertura il cilindro esce più lentamente, chiuso non esce", () => {
    const time = (opening: string) => {
      const r = compileSim({
        components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
          { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
          { id: "F", type: "one_way_flow_control", params: { conductance: "0.5 dm3/(s·bar)", opening } },
          { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } }],
        connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "F.2" }, { from: "F.1", to: "C1.B" }],
      });
      if (!r.ok) throw new Error(r.errors.join("; "));
      const s = new Simulator(r.network);
      s.advance(0.3);
      s.setCommand("V1", "14", true);
      const t0 = s.t;
      while (s.cylinder("C1")!.fraction < 0.999 && s.t < t0 + 4) s.advance(0.002);
      return s.t - t0;
    };
    const full = time("100 %"), half = time("50 %"), shut = time("0 %");
    expect(half).toBeGreaterThan(full * 1.4);
    expect(shut).toBeGreaterThan(3.9);
  });
});

describe("portata nominale Qn", () => {
  it("C ricavata da Qn ridà Qn tra 6 e 5 bar", () => {
    const qn = q("500 Nl/min").si, b = 0.35;
    const C = conductanceFromFlow(qn, b);
    const P1 = 6e5 + 101325, P2 = 5e5 + 101325;
    expect(iso6358MassFlow(P1, P2, C, b) / RHO_ANR).toBeCloseTo(qn, 6);
    // ordine di grandezza del suggerimento: C ≈ Qn / 260
    expect(dm3(C)).toBeGreaterThan(500 / 300);
    expect(dm3(C)).toBeLessThan(500 / 230);
  });

  it("se C manca la simulazione usa Qn, se c'è vale C", () => {
    const fromQn = buildComponent({ id: "V", type: "directional_valve", function: "5/2", params: { flow: "780 Nl/min" } });
    expect(dm3(conductanceOf(fromQn))).toBeCloseTo(dm3(conductanceFromFlow(q("780 Nl/min").si, 0.35)));
    const both = buildComponent({ id: "V", type: "directional_valve", function: "5/2",
      params: { flow: "780 Nl/min", conductance: "1 dm3/(s·bar)" } });
    expect(dm3(conductanceOf(both))).toBeCloseTo(1);
    const regulator = buildComponent(comp("flow_control_valve", { flow: "400 Nl/min", opening: "50 %" }));
    expect(dm3(conductanceOf(regulator))).toBeCloseTo(dm3(conductanceFromFlow(q("400 Nl/min").si, 0.5)) / 2);
  });
});

describe("cilindri: attrito statico e angolo di montaggio", () => {
  const strokeTime = (params: Record<string, string>) => {
    const r = compileSim({
      components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
        { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm", ...params } }],
      connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
    });
    if (!r.ok) throw new Error(r.errors.join("; "));
    const s = new Simulator(r.network);
    s.advance(0.3);
    s.setCommand("V1", "14", true);
    const t0 = s.t;
    while (s.cylinder("C1")!.fraction < 0.999 && s.t < t0 + 4) s.advance(0.001);
    return { time: s.t - t0, fraction: s.cylinder("C1")!.fraction };
  };

  it("un carico sollevato in verticale rallenta l'uscita, verso il basso la accelera", () => {
    const flat = strokeTime({ mass: "30 kg" }).time;
    const up = strokeTime({ mass: "30 kg", mounting_angle: "90 deg" }).time;
    const down = strokeTime({ mass: "30 kg", mounting_angle: "-90 deg" }).time;
    expect(up).toBeGreaterThan(flat);
    expect(down).toBeLessThan(flat);
  });

  it("un peso maggiore della spinta tiene fermo lo stelo", () => {
    // spinta a 6 bar su Ø32 circa 480 N: 60 kg in verticale (≈ 590 N) non salgono
    expect(strokeTime({ mass: "60 kg", mounting_angle: "90 deg" }).fraction).toBeLessThan(0.01);
  });

  it("l'attrito statico alto ritarda la partenza", () => {
    const base = strokeTime({ friction: "20 N" }).time;
    const sticky = strokeTime({ friction: "20 N", static_friction: "300 N" }).time;
    expect(sticky).toBeGreaterThan(base);
  });
});
