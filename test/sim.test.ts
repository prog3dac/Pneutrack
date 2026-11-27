import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { CircuitDoc } from "../src/model/circuit";
import { compileSim } from "../src/sim/network";
import { DT, Simulator } from "../src/sim/simulator";
import { compile } from "../src/solver/network";
import { simulateNetwork } from "../src/solver/simulate";
import type { Schema } from "../src/solver/schema";

const doc = (components: CircuitDoc["components"], connections: [string, string][]) =>
  ({ components, connections: connections.map(([from, to]) => ({ from, to })) });

const direct52 = doc(
  [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } },
  ],
  [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]],
);

function sim(d: Parameters<typeof compileSim>[0], opts = {}) {
  const r = compileSim(d, opts);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}

describe("simulazione dello schema dell'editor", () => {
  it("coincide con il solutore di riferimento (src/solver) sullo stesso circuito", () => {
    const ref = JSON.parse(readFileSync("examples/cylinder-52.json", "utf8")) as Schema;
    const net = compile(ref);
    if (!net.ok) throw new Error("riferimento non compilabile");
    const g = simulateNetwork(net.network, { tEnd: 0.6, inputs: (t) => ({ V1: t < 0.3 ? 1 : 0 }) });

    const s = sim(direct52, { nodeVolume: 0 });
    s.setCommand("V1", "14", true);
    const every = 100;
    let k = 0;
    for (const sample of g.samples.slice(1)) {
      if (s.t >= 0.3 - DT / 2) s.setCommand("V1", "14", false);
      s.advance(every * DT);
      k++;
      const mine = s.cylinder("C1")!;
      expect(Math.abs(mine.x - sample.cylinders.A1!.x)).toBeLessThan(0.2e-3); // entro 0,2 mm su 100
    }
    expect(k).toBeGreaterThan(100);
  });

  it("con un tempo di calcolo massimo avanza meno, ma nello stesso modo", () => {
    const a = sim(direct52), b = sim(direct52);
    a.setCommand("V1", "14", true);
    b.setCommand("V1", "14", true);
    expect(a.advance(0.1)).toBeCloseTo(0.1, 9);
    // budget nullo: si ferma al primo controllo dell'orologio (100 passi)
    const done = b.advance(0.1, 0);
    expect(done).toBeCloseTo(100 * DT, 12);
    expect(b.t).toBeCloseTo(done, 12);
    while (b.t < a.t - DT / 2) b.advance(Math.min(0.01, a.t - b.t));
    expect(b.cylinder("C1")!.x).toBe(a.cylinder("C1")!.x);
  });

  it("il cilindro esce col solenoide e rientra con la molla della valvola", () => {
    const s = sim(direct52);
    s.advance(0.05);
    expect(s.cylinder("C1")!.fraction).toBe(0);
    expect(s.gauge("C1.B")).toBeGreaterThan(5.9);
    s.setCommand("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
    s.advance(0.5);
    expect(s.cylinder("C1")!.fraction).toBe(1);
    expect(s.gauge("C1.A")).toBeGreaterThan(5.9);
    expect(s.gauge("C1.B")).toBeLessThan(0.1);
    s.setCommand("V1", "14", false);
    expect(s.valvePosition("V1")).toBe("12");
    s.advance(0.5);
    expect(s.cylinder("C1")!.fraction).toBe(0);
  });

  it("comando indiretto: i pulsanti pilotano la 5/2 bistabile, che resta in posizione", () => {
    const ex = JSON.parse(readFileSync("src/examples/doppio_effetto_bistabile.json", "utf8"));
    const s = sim(ex);
    expect(s.valvePosition("V1")).toBe("12");
    s.setCommand("S1", "14", true);
    s.advance(0.05);
    expect(s.valvePosition("V1")).toBe("14");
    s.setCommand("S1", "14", false);
    s.advance(0.6);
    expect(s.valvePosition("V1")).toBe("14"); // memoria della bistabile
    expect(s.cylinder("C1")!.fraction).toBe(1);
    expect(s.gauge("C1.A")).toBeCloseTo(5, 1); // dopo il riduttore a 5 bar
    s.setCommand("S2", "14", true);
    s.advance(0.05);
    s.setCommand("S2", "14", false);
    s.advance(0.6);
    expect(s.valvePosition("V1")).toBe("12");
    expect(s.cylinder("C1")!.fraction).toBe(0);
  });

  it("semplice effetto: esce con la 3/2 e rientra con la molla", () => {
    const s = sim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "V", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" },
        { id: "C", type: "single_acting_cylinder", params: { bore: "20 mm", stroke: "50 mm" } },
      ],
      [["P.1", "V.1"], ["V.2", "C.A"]],
    ));
    s.setCommand("V", "14", true);
    s.advance(0.4);
    expect(s.cylinder("C")!.fraction).toBe(1);
    s.setCommand("V", "14", false);
    s.advance(0.6);
    expect(s.cylinder("C")!.fraction).toBe(0);
  });

  it("lo strozzatore rallenta il cilindro", () => {
    const time = (withThrottle: boolean) => {
      const comps: CircuitDoc["components"] = [...direct52.components];
      const conns: [string, string][] = [["P.1", "V1.1"], ["V1.2", "C1.B"]];
      if (withThrottle) {
        comps.push({ id: "F", type: "flow_control_valve", params: { conductance: "0.1 dm3/(s·bar)" } });
        conns.push(["V1.4", "F.1"], ["F.2", "C1.A"]);
      } else conns.push(["V1.4", "C1.A"]);
      const s = sim(doc(comps, conns));
      s.setCommand("V1", "14", true);
      while (s.cylinder("C1")!.fraction < 1 && s.t < 5) s.advance(0.005);
      return s.t;
    };
    expect(time(true)).toBeGreaterThan(2 * time(false));
  });

  it("il riduttore limita la pressione a valle", () => {
    const s = sim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "8 bar" } },
        { id: "R", type: "pressure_regulator", params: { setpoint: "3 bar" } },
        { id: "T", type: "plug" },
      ],
      [["P.1", "R.1"], ["R.2", "T.1"]],
    ));
    s.advance(0.2);
    expect(s.gauge("R.2")).toBeGreaterThan(2.85);
    expect(s.gauge("R.2")).toBeLessThan(3.01);
  });

  it("non simula uno schema con errori, e avvisa per i componenti non simulati", () => {
    const bad = compileSim(doc([{ id: "V", type: "directional_valve", function: "3/2" }], []));
    expect(bad.ok).toBe(false);
    const rot = compileSim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "R", type: "rotary_actuator", params: { angle: "90 deg" } },
        { id: "T", type: "plug" },
      ],
      [["P.1", "R.A"], ["R.B", "T.1"]],
    ));
    expect(rot.ok && rot.warnings.length).toBe(1);
  });
});
