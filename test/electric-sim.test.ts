// Simulazione combinata: circuito elettrico di comando e parte pneumatica.
import { describe, expect, it } from "vitest";
import type { ComponentData } from "../src/model/components";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

type Wire = [string, string];
const pneumatic = (valve: Partial<ComponentData> = {}): ComponentData[] => [
  { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
  { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring", ...valve },
  { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } },
  { id: "G", type: "electric_supply", params: { voltage: "24 V" } },
];
const pipes: Wire[] = [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]];

function sim(components: ComponentData[], wires: Wire[]) {
  const r = compileSim({ components, connections: [...pipes, ...wires].map(([from, to]) => ({ from, to })) });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}
const pos = (s: Simulator) => s.cylinder("C1")!.fraction;
const el = (s: Simulator) => s.electricState()!;

describe("circuito elettrico in simulazione", () => {
  it("comando diretto: il pulsante eccita la bobina, la valvola commuta e il cilindro esce", () => {
    const s = sim([...pneumatic(), { id: "S1", type: "pushbutton", contact: "no" }, { id: "Y1", type: "valve_solenoid", drives: "V1.14" }],
                  [["G.+", "S1.13"], ["S1.14", "Y1.A1"], ["Y1.A2", "G.0V"]]);
    expect(s.isDriven("V1", "14")).toBe(true);
    expect(el(s).potential["S1.13"]).toBe("+");
    expect(el(s).potential["S1.14"]).toBe(null);
    s.setCommand("V1", "14", true); // il solenoide con bobina non si comanda a clic
    s.advance(0.3);
    expect(pos(s)).toBe(0);
    s.setSwitch("S1", true);
    expect(el(s).energized.has("Y1")).toBe(true);
    expect(s.valvePosition("V1")).toBe("14");
    s.advance(0.6);
    expect(pos(s)).toBeGreaterThan(0.99);
    s.setSwitch("S1", false);
    s.advance(0.8);
    expect(pos(s)).toBeLessThan(0.01);
  });

  it("autoritenuta: marcia a impulso, il relè resta eccitato fino all'arresto", () => {
    const s = sim([...pneumatic(),
      { id: "S0", type: "pushbutton", contact: "nc" }, { id: "S1", type: "pushbutton", contact: "no" },
      { id: "K1", type: "relay_coil" }, { id: "K1a", type: "relay_contact", contact: "no", relay: "K1" },
      { id: "K1b", type: "relay_contact", contact: "no", relay: "K1" }, { id: "Y1", type: "valve_solenoid", drives: "V1.14" }],
    [["G.+", "S0.11"], ["S0.12", "S1.13"], ["S0.12", "K1a.13"], ["S1.14", "K1.A1"], ["K1a.14", "K1.A1"], ["K1.A2", "G.0V"],
     ["G.+", "K1b.13"], ["K1b.14", "Y1.A1"], ["Y1.A2", "G.0V"]]);
    s.setSwitch("S1", true);
    s.advance(0.005);
    expect(el(s).energized.has("K1")).toBe(true);
    expect(el(s).switched.has("K1")).toBe(false); // tempo di attrazione: 10 ms
    s.advance(0.05);
    expect(el(s).switched.has("K1")).toBe(true);
    s.setSwitch("S1", false);
    s.advance(0.8);
    expect(el(s).energized.has("K1")).toBe(true);
    expect(pos(s)).toBeGreaterThan(0.99);
    s.setSwitch("S0", true);
    s.advance(0.05);
    s.setSwitch("S0", false);
    s.advance(0.8);
    expect(el(s).switched.has("K1")).toBe(false);
    expect(pos(s)).toBeLessThan(0.01);
  });

  it("ciclo automatico A+ A- con due finecorsa elettrici e valvola bistabile", () => {
    const s = sim([...pneumatic({ actuation_12: "solenoid" }),
      { id: "S1", type: "pushbutton", contact: "no", operation: "latching" },
      { id: "S2", type: "limit_switch", contact: "no", cam: "C1-" }, { id: "S3", type: "limit_switch", contact: "no", cam: "C1+" },
      { id: "Y1", type: "valve_solenoid", drives: "V1.14" }, { id: "Y2", type: "valve_solenoid", drives: "V1.12" }],
    [["G.+", "S1.13"], ["S1.14", "S2.13"], ["S2.14", "Y1.A1"], ["Y1.A2", "G.0V"],
     ["G.+", "S3.13"], ["S3.14", "Y2.A1"], ["Y2.A2", "G.0V"]]);
    expect(el(s).actuated.has("S2")).toBe(true);
    s.setSwitch("S1", true);
    let ends = 0, last = 0;
    for (let i = 0; i < 400; i++) {
      s.advance(0.01);
      const f = pos(s), now = f > 0.99 ? 1 : f < 0.01 ? -1 : 0;
      if (now && now !== last) { ends++; last = now; }
    }
    expect(ends).toBeGreaterThanOrEqual(4);
    s.setSwitch("S1", false);
    s.advance(1.5);
    expect(pos(s)).toBeLessThan(0.01);
  });

  it("temporizzatore ritardato all'eccitazione: il cilindro parte dopo il ritardo", () => {
    const s = sim([...pneumatic(), { id: "S1", type: "pushbutton", contact: "no", operation: "latching" },
      { id: "KT1", type: "timer_relay", timer_mode: "on_delay", params: { delay: "0.5 s" } },
      { id: "KT1a", type: "relay_contact", contact: "no", relay: "KT1" }, { id: "Y1", type: "valve_solenoid", drives: "V1.14" }],
    [["G.+", "S1.13"], ["S1.14", "KT1.A1"], ["KT1.A2", "G.0V"], ["G.+", "KT1a.13"], ["KT1a.14", "Y1.A1"], ["Y1.A2", "G.0V"]]);
    s.setSwitch("S1", true);
    s.advance(0.3);
    expect(s.electric!.remaining("KT1", s.t)).toBeCloseTo(0.2, 2);
    expect(el(s).energized.has("Y1")).toBe(false);
    s.advance(0.25);
    expect(el(s).energized.has("Y1")).toBe(true);
    s.setSwitch("S1", false);
    s.advance(0.002);
    expect(el(s).energized.has("Y1")).toBe(false);
  });

  it("temporizzatore ritardato alla diseccitazione: il contatto resta chiuso per il ritardo", () => {
    const s = sim([...pneumatic(), { id: "S1", type: "pushbutton", contact: "no" },
      { id: "KT1", type: "timer_relay", timer_mode: "off_delay", params: { delay: "0.4 s" } },
      { id: "KT1a", type: "relay_contact", contact: "no", relay: "KT1" }, { id: "Y1", type: "valve_solenoid", drives: "V1.14" }],
    [["G.+", "S1.13"], ["S1.14", "KT1.A1"], ["KT1.A2", "G.0V"], ["G.+", "KT1a.13"], ["KT1a.14", "Y1.A1"], ["Y1.A2", "G.0V"]]);
    s.setSwitch("S1", true);
    expect(el(s).energized.has("Y1")).toBe(true);
    s.setSwitch("S1", false);
    s.advance(0.3);
    expect(el(s).energized.has("Y1")).toBe(true);
    s.advance(0.15);
    expect(el(s).energized.has("Y1")).toBe(false);
  });

  it("pressostato e sensore di prossimità accendono le lampade", () => {
    const s = sim([...pneumatic(), { id: "S1", type: "pushbutton", contact: "no", operation: "latching" },
      { id: "Y1", type: "valve_solenoid", drives: "V1.14" },
      { id: "B1", type: "pressure_switch", params: { setpoint: "5 bar" } }, { id: "B1a", type: "relay_contact", contact: "no", relay: "B1" },
      { id: "B2", type: "proximity_sensor", cam: "C1+" },
      { id: "H1", type: "signal_lamp" }, { id: "H2", type: "signal_lamp", lamp_color: "red" }],
    [["G.+", "S1.13"], ["S1.14", "Y1.A1"], ["Y1.A2", "G.0V"], ["B1.1", "C1.A"],
     ["G.+", "B1a.13"], ["B1a.14", "H1.X1"], ["H1.X2", "G.0V"],
     ["G.+", "B2.BN"], ["B2.BU", "G.0V"], ["B2.BK", "H2.X1"], ["H2.X2", "G.0V"]]);
    expect(el(s).energized.size).toBe(0);
    s.setSwitch("S1", true);
    s.advance(1);
    expect(pos(s)).toBeGreaterThan(0.99);
    expect(el(s).switched.has("B1")).toBe(true);
    expect([...el(s).energized].sort()).toEqual(["H1", "H2", "Y1"]);
    s.setSwitch("S1", false);
    s.advance(1);
    expect([...el(s).energized]).toEqual([]);
  });

  it("cortocircuito: nessun carico resta eccitato e il guasto si vede", () => {
    const s = sim([...pneumatic(), { id: "S1", type: "pushbutton", contact: "no" }, { id: "S9", type: "pushbutton", contact: "no" },
      { id: "Y1", type: "valve_solenoid", drives: "V1.14" }],
    [["G.+", "S1.13"], ["S1.14", "Y1.A1"], ["Y1.A2", "G.0V"], ["G.+", "S9.13"], ["S9.14", "G.0V"]]);
    s.setSwitch("S1", true);
    expect(el(s).energized.has("Y1")).toBe(true);
    s.setSwitch("S9", true);
    expect(el(s).shortCircuit).toBe(true);
    expect(el(s).energized.size).toBe(0);
    expect(s.valvePosition("V1")).toBe("12");
  });

  it("un relè che si stacca da solo (bobina sul proprio contatto NC) viene segnalato", () => {
    const s = sim([...pneumatic(), { id: "K1", type: "relay_coil" }, { id: "K1a", type: "relay_contact", contact: "nc", relay: "K1" },
      { id: "K1b", type: "relay_contact", contact: "no", relay: "K1" }, { id: "Y1", type: "valve_solenoid", drives: "V1.14" }],
    [["G.+", "K1a.11"], ["K1a.12", "K1.A1"], ["K1.A2", "G.0V"], ["G.+", "K1b.13"], ["K1b.14", "Y1.A1"], ["Y1.A2", "G.0V"]]);
    s.advance(0.5);
    expect(el(s).oscillating).toEqual(["K1"]);
  });

  it("schema solo pneumatico: nessun circuito elettrico e i solenoidi si comandano a clic", () => {
    const s = sim(pneumatic().slice(0, 3), []);
    expect(s.electricState()).toBeNull();
    s.setCommand("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
  });
});
