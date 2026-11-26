// Regolazioni durante la simulazione: riduttori, strozzatori, tarature e ritardi cambiati mentre gira.
import { describe, expect, it } from "vitest";
import type { CircuitDoc } from "../src/model/circuit";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const BAR = 1e5;

function simOf(doc: Pick<CircuitDoc, "components" | "connections">) {
  const r = compileSim(doc);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}

const regulated = (params: Record<string, string> = {}) => simOf({
  components: [{ id: "P", type: "pressure_source", params: { pressure: "8 bar" } },
    { id: "R", type: "pressure_regulator", params: { setpoint: "4 bar", ...params } },
    { id: "T", type: "air_reservoir", params: { volume: "0.1 l" } },
    { id: "G", type: "pressure_gauge" }],
  connections: [{ from: "P.1", to: "R.1" }, { from: "R.2", to: "T.1" }, { from: "T.2", to: "G.1" }],
});

describe("regolazioni in simulazione", () => {
  it("elenca le regolazioni con il campo di catalogo", () => {
    const s = regulated({ setpoint_min: "0.5 bar", setpoint_max: "7 bar" });
    const t = s.tunable("R", "setpoint")!;
    expect(t.kind).toBe("pressure");
    expect(t.min).toBeCloseTo(0.5 * BAR);
    expect(t.max).toBeCloseTo(7 * BAR);
    expect(t.value).toBeCloseTo(4 * BAR);
    expect(s.tunable("P", "pressure")?.value).toBeCloseTo(8 * BAR);
  });

  it("senza campo di regolazione va da 0 alla pressione max", () => {
    const t = regulated({ max_pressure: "12 bar" }).tunable("R", "setpoint")!;
    expect(t.min).toBe(0);
    expect(t.max).toBeCloseTo(12 * BAR);
  });

  it("alzando la taratura del riduttore la pressione a valle sale, abbassandola resta (senza scarico)", () => {
    const s = regulated({ setpoint_max: "7 bar" });
    s.advance(1);
    expect(s.gauge("G.1")).toBeCloseTo(4, 1);
    // oltre il campo si ferma al massimo
    expect(s.setTunable("R", "setpoint", 9 * BAR)).toBeCloseTo(7 * BAR);
    s.advance(1);
    expect(s.gauge("G.1")).toBeCloseTo(7, 1);
  });

  it("il riduttore con scarico scarica l'eccesso quando si abbassa la taratura", () => {
    const s = simOf({
      components: [{ id: "P", type: "pressure_source", params: { pressure: "8 bar" } },
        { id: "R", type: "relieving_regulator", params: { setpoint: "6 bar" } },
        { id: "T", type: "air_reservoir", params: { volume: "0.1 l" } }],
      connections: [{ from: "P.1", to: "R.1" }, { from: "R.2", to: "T.1" }],
    });
    s.advance(1);
    expect(s.gauge("T.1")).toBeCloseTo(6, 1);
    s.setTunable("R", "setpoint", 3 * BAR);
    s.advance(2);
    expect(s.gauge("T.1")).toBeLessThan(3.3);
    expect(s.gauge("T.1")).toBeGreaterThan(2.8);
  });

  it("aprendo lo strozzatore il cilindro accelera subito", () => {
    const run = (tuneTo?: number) => {
      const s = simOf({
        components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
          { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
          { id: "F", type: "one_way_flow_control", params: { conductance: "0.5 dm3/(s·bar)", opening: "10 %" } },
          { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } }],
        connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "F.2" },
          { from: "F.1", to: "C1.B" }],
      });
      s.advance(0.3);
      expect(s.tunable("F", "opening")!.value).toBeCloseTo(0.1);
      if (tuneTo !== undefined) s.setTunable("F", "opening", tuneTo);
      s.setCommand("V1", "14", true);
      const t0 = s.t;
      while (s.cylinder("C1")!.fraction < 0.999 && s.t < t0 + 6) s.advance(0.002);
      return s.t - t0;
    };
    expect(run(1)).toBeLessThan(run() / 3);
  });

  it("la valvola di sequenza commuta alla nuova taratura", () => {
    const s = simOf({
      components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "R", type: "pressure_regulator", params: { setpoint: "3 bar" } },
        { id: "S", type: "sequence_valve", params: { setpoint: "4 bar" } }, { id: "G", type: "pressure_gauge" }],
      connections: [{ from: "P.1", to: "R.1" }, { from: "R.2", to: "S.12" }, { from: "P.1", to: "S.1" },
        { from: "S.2", to: "G.1" }],
    });
    s.advance(0.5);
    expect(s.valvePosition("S")).toBe("12");
    s.setTunable("S", "setpoint", 2.5 * BAR);
    s.advance(0.1);
    expect(s.valvePosition("S")).toBe("14");
  });

  it("il temporizzatore pneumatico usa il nuovo ritardo", () => {
    const s = simOf({
      components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "D", type: "time_delay_valve", params: { delay: "5 s" } }, { id: "G", type: "pressure_gauge" }],
      connections: [{ from: "P.1", to: "D.12" }, { from: "P.1", to: "D.1" }, { from: "D.2", to: "G.1" }],
    });
    s.setTunable("D", "delay", 0.5);
    s.advance(1);
    expect(s.valvePosition("D")).toBe("14");
  });

  it("il riavvio tiene le regolazioni: stanno nella rete compilata", () => {
    const s = regulated();
    s.setTunable("R", "setpoint", 2 * BAR);
    const again = new Simulator(s.net);
    again.advance(1);
    expect(again.gauge("G.1")).toBeCloseTo(2, 1);
    expect(again.tunable("R", "setpoint")!.initial).toBeCloseTo(4 * BAR);
  });
});

describe("campo di regolazione nello schema", () => {
  const doc = (params: Record<string, string>): CircuitDoc => ({
    name: "t", components: [{ id: "R", type: "pressure_regulator", params }], connections: [], layout: {},
  } as unknown as CircuitDoc);

  it("segnala la taratura fuori dal campo", () => {
    const a = analyze(doc({ setpoint: "8 bar", setpoint_min: "0.5 bar", setpoint_max: "7 bar" }));
    expect(a.issues.some((i) => i.code === "SETPOINT_OUT_OF_RANGE")).toBe(true);
  });

  it("rifiuta il minimo sopra il massimo", () => {
    const a = analyze(doc({ setpoint: "4 bar", setpoint_min: "8 bar", setpoint_max: "7 bar" }));
    expect(a.issues.some((i) => i.code === "SETPOINT_RANGE" && i.severity === "error")).toBe(true);
  });
});
