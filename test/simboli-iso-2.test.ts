import { describe, expect, it } from "vitest";
import type { CircuitDoc } from "../src/model/circuit";
import { billOfMaterials } from "../src/model/bom";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";
import { geometry } from "../src/ui/symbols";

const doc = (components: CircuitDoc["components"], connections: [string, string][]) =>
  ({ components, connections: connections.map(([from, to]) => ({ from, to })) });

function sim(d: Parameters<typeof compileSim>[0]) {
  const r = compileSim(d);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}

const P = { id: "P", type: "pressure_source", params: { pressure: "6 bar" } };
const cyl = { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } };
const tank = (id: string) => ({ id, type: "air_reservoir", params: { volume: "0.1 l" } });

describe("valvole a tre posizioni 3/3 e 4/3", () => {
  it("la 4/3 a centri chiusi parte al centro e blocca il cilindro", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "4/3", actuation_14: "solenoid", actuation_12: "solenoid" }, cyl],
      [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]));
    expect(s.valvePosition("V1")).toBe("0");
    s.advance(0.3);
    expect(s.cylinder("C1")!.x).toBe(0);
    s.setCommand("V1", "14", true);
    s.advance(0.6);
    expect(s.cylinder("C1")!.fraction).toBe(1);
    s.setCommand("V1", "14", false);
    expect(s.valvePosition("V1")).toBe("0");
  });
  it("la 4/3 a centri in scarico scarica i due utilizzi", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "4/3E", actuation_14: "lever", actuation_12: "lever" },
      tank("SB1"), tank("SB2")], [["P.1", "V1.1"], ["V1.4", "SB1.1"], ["V1.2", "SB2.1"]]));
    s.setCommand("V1", "14", true);
    s.advance(0.3);
    expect(s.gauge("SB1.1")).toBeGreaterThan(5.9);
    s.setCommand("V1", "14", false);
    s.advance(0.5);
    expect(s.gauge("SB1.1")).toBeLessThan(0.1);
  });
  it("la 3/3 ha tre caselle e le porte 1, 2, 3", () => {
    const g = geometry({ id: "V1", type: "directional_valve", function: "3/3", actuation_14: "solenoid", actuation_12: "solenoid" });
    expect(Object.keys(g.ports).sort()).toEqual(["1", "2", "3"]);
    expect(g.svg.match(/class="box/g)).toHaveLength(3);
  });
});

describe("nuovi comandi", () => {
  it("pilotaggio differenziale: ha la porta e commuta con la pressione", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "pilot_differential", actuation_12: "spring" },
      { id: "V0", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" }, tank("SB1")],
      [["P.1", "V0.1"], ["V0.2", "V1.14"], ["P.1", "V1.1"], ["V1.2", "SB1.1"]]));
    expect(s.valvePosition("V1")).toBe("12");
    s.setCommand("V0", "14", true);
    s.advance(0.1);
    expect(s.valvePosition("V1")).toBe("14");
  });
  it("molla e molla pneumatica riportano a riposo; i comandi elettrici nuovi si eccitano come il solenoide", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "proportional",
      actuation_12: "spring_air_return" }, tank("SB1")], [["P.1", "V1.1"], ["V1.2", "SB1.1"]]));
    s.setCommand("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
    s.setCommand("V1", "14", false);
    expect(s.valvePosition("V1")).toBe("12");
  });
});

describe("regolazione", () => {
  it("la non ritorno con molla apre a 0,5 bar se non è indicata la pressione di apertura", () => {
    const end = (spring: string) => {
      const s = sim(doc([{ id: "P", type: "pressure_source", params: { pressure: "0.3 bar" } },
        { id: "NR1", type: "check_valve", check_spring: spring }, tank("SB1")], [["P.1", "NR1.1"], ["NR1.2", "SB1.1"]]));
      s.advance(0.5);
      return s.gauge("SB1.1");
    };
    expect(end("no")).toBeGreaterThan(0.15);
    expect(end("yes")).toBeLessThan(0.01);
  });
  it("il riduttore con scarico fa uscire la pressione in eccesso a valle", () => {
    const s = sim(doc([{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "R1", type: "relieving_regulator", params: { setpoint: "3 bar" } }, tank("SB1"),
      { id: "P2", type: "pressure_source", params: { pressure: "5 bar" } },
      { id: "V1", type: "directional_valve", function: "2/2", actuation_14: "manual", actuation_12: "spring" }],
      [["P.1", "R1.1"], ["R1.2", "SB1.1"], ["P2.1", "V1.1"], ["V1.2", "SB1.2"]]));
    // una spinta a 5 bar a valle, poi il riduttore riporta la linea alla taratura scaricando da 3
    s.setCommand("V1", "14", true);
    s.advance(0.3);
    s.setCommand("V1", "14", false);
    s.advance(1);
    expect(s.gauge("SB1.1")).toBeGreaterThan(2.8);
    expect(s.gauge("SB1.1")).toBeLessThan(3.3);
  });
  it("il riduttore pilotato segue la pressione del pilotaggio", () => {
    const s = sim(doc([P, { id: "R0", type: "pressure_regulator", params: { setpoint: "2 bar" } },
      { id: "R1", type: "piloted_regulator", params: { ratio: "1.5" } }, tank("SB1")],
      [["P.1", "R0.1"], ["R0.2", "R1.12"], ["P.1", "R1.1"], ["R1.2", "SB1.1"]]));
    s.advance(1);
    expect(s.gauge("SB1.1")).toBeGreaterThan(2.8);
    expect(s.gauge("SB1.1")).toBeLessThan(3.1);
  });
  it("il moltiplicatore porta l'uscita sopra la pressione in ingresso", () => {
    const s = sim(doc([{ id: "P", type: "pressure_source", params: { pressure: "4 bar" } },
      { id: "MT1", type: "pressure_intensifier", params: { ratio: "2" } }, tank("SB1")],
      [["P.1", "MT1.1"], ["MT1.2", "SB1.1"]]));
    s.advance(2);
    expect(s.gauge("SB1.1")).toBeGreaterThan(6);
    expect(s.gauge("SB1.1")).toBeLessThan(8.6);
  });
  it("lo strozzatore a rullo rallenta il cilindro solo con il rullo premuto", () => {
    const time = (pressed: boolean) => {
      const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "manual", actuation_12: "spring" }, cyl,
        { id: "RF1", type: "roller_flow_control", params: { pressed_opening: "3 %" } }],
        [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "RF1.1"], ["RF1.2", "C1.B"]]));
      if (pressed) s.setCommand("RF1", "14", true);
      s.setCommand("V1", "14", true);
      let t = 0;
      while (s.cylinder("C1")!.fraction < 1 && t < 5) { s.advance(0.01); t += 0.01; }
      return t;
    };
    expect(time(true)).toBeGreaterThan(2 * time(false));
  });
});

describe("attuatori", () => {
  const locking = (type: string) => doc([P,
    { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "manual", actuation_12: "spring" },
    ...(type === "locking_cylinder" ? [{ id: "V2", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" }] : []),
    { id: "C1", type, params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } }],
    [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"],
     ...(type === "locking_cylinder" ? [["P.1", "V2.1"], ["V2.2", "C1.L"]] as [string, string][] : [])]);
  it("il bloccaggio dello stelo lo tiene fermo finché il pilotaggio L non è in pressione", () => {
    const s = sim(locking("locking_cylinder"));
    s.setCommand("V1", "14", true);
    s.advance(0.5);
    expect(s.cylinder("C1")!.x).toBe(0);
    s.setCommand("V2", "14", true);
    s.advance(0.6);
    expect(s.cylinder("C1")!.fraction).toBe(1);
  });
  it("il bloccaggio di fine corsa si apre con la pressione in A", () => {
    const s = sim(locking("end_lock_cylinder"));
    s.setCommand("V1", "14", true);
    s.advance(0.6);
    expect(s.cylinder("C1")!.fraction).toBe(1);
  });
  it("il doppio stelo con steli diversi ha forze diverse nei due versi", () => {
    const r = compileSim(doc([{ id: "C1", type: "double_rod_cylinder", params: { bore: "32 mm", rod: "12 mm", rod2: "20 mm", stroke: "50 mm" } },
      tank("SB1"), tank("SB2")], [["C1.A", "SB1.1"], ["C1.B", "SB2.1"]]));
    if (!r.ok) throw new Error(r.errors.join());
    const c = r.network.cylinders[0]!;
    expect(c.A1).toBeLessThan(c.A2);
  });
  it("soffietto, membrana e muscolo sono attuatori a semplice effetto", () => {
    for (const type of ["bellows_cylinder", "diaphragm_cylinder", "pneumatic_muscle"]) {
      const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" },
        { id: "C1", type, params: { bore: "40 mm", stroke: "20 mm" } }], [["P.1", "V1.1"], ["V1.2", "C1.A"]]));
      s.setCommand("V1", "14", true);
      s.advance(0.5);
      expect(s.cylinder("C1")!.fraction, type).toBe(1);
      s.setCommand("V1", "14", false);
      s.advance(1);
      expect(s.cylinder("C1")!.fraction, type).toBeLessThan(0.05);
    }
  });
  it("l'attuatore rotante a semplice effetto ha solo la porta A", () => {
    expect(Object.keys(geometry({ id: "X", type: "rotary_actuator", rotary_kind: "single" }).ports)).toEqual(["A"]);
  });
});

describe("vuoto, collegamenti e misure", () => {
  it("il soffio di distacco porta la ventosa sopra l'atmosfera", () => {
    const s = sim(doc([P,
      { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" },
      { id: "V2", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" },
      { id: "EV1", type: "vacuum_ejector", blowoff: "yes" }, { id: "VT1", type: "suction_cup", params: { diameter: "20 mm" } }],
      [["P.1", "V1.1"], ["V1.2", "EV1.4"], ["P.1", "V2.1"], ["V2.2", "EV1.1"], ["EV1.2", "VT1.1"]]));
    s.setCommand("V1", "14", true);
    s.advance(0.3);
    expect(s.gauge("VT1.1")).toBeGreaterThan(0.5);
  });
  it("il vacuostato interviene sul vuoto, non sulla pressione", () => {
    const s = sim(doc([{ id: "PV1", type: "vacuum_pump", params: { vacuum: "0.8 bar" } },
      { id: "BP1", type: "pressure_switch", switch_kind: "vacuum", params: { setpoint: "0.5 bar" } }], [["PV1.1", "BP1.1"]]));
    s.advance(0.1);
    expect(s.electricState()!.switched.has("BP1")).toBe(true);
  });
  it("i rimandi con lo stesso nome sono collegati", () => {
    const d = doc([P, { id: "RM1", type: "sheet_reference", label: "A1" }, { id: "RM2", type: "sheet_reference", label: "A1" },
      { id: "M1", type: "pressure_gauge" }], [["P.1", "RM1.1"], ["RM2.1", "M1.1"]]);
    expect(analyze(d).pressures["M1.1"]?.bar).toBe(6);
    const s = sim(d);
    s.advance(0.05);
    expect(s.gauge("M1.1")).toBeGreaterThan(5.9);
  });
  it("un rimando senza compagno è segnalato", () => {
    const a = analyze(doc([{ id: "RM1", type: "sheet_reference", label: "B2" }], []));
    expect(a.issues.some((i) => i.message.includes("nessun altro rimando"))).toBe(true);
  });
  it("il rubinetto a tre vie devia da 2 a 4", () => {
    const s = sim(doc([P, { id: "RB1", type: "three_way_cock" }, tank("SB1"), tank("SB2")],
      [["P.1", "RB1.1"], ["RB1.2", "SB1.1"], ["RB1.4", "SB2.1"]]));
    s.advance(0.3);
    expect(s.gauge("SB1.1")).toBeGreaterThan(5.9);
    expect(s.gauge("SB2.1")).toBeLessThan(0.1);
    s.setCommand("RB1", "14", false);
    s.advance(0.3);
    expect(s.gauge("SB2.1")).toBeGreaterThan(5.9);
  });
  it("la basetta distribuisce l'alimentazione sulle uscite", () => {
    const s = sim(doc([P, { id: "BD1", type: "manifold" }, { id: "M1", type: "pressure_gauge" }],
      [["P.1", "BD1.1"], ["BD1.23", "M1.1"]]));
    s.advance(0.05);
    expect(s.gauge("M1.1")).toBeGreaterThan(5.9);
  });
  it("compressore e opzioni compaiono in distinta", () => {
    const rows = billOfMaterials({ components: [{ id: "CP1", type: "compressor", params: { pressure: "8 bar" } },
      { id: "NR1", type: "check_valve", check_spring: "yes" }, { id: "RM1", type: "sheet_reference", label: "A" }] });
    expect(rows.map((r) => r.description)).toEqual(["Compressore", "Valvola di non ritorno con molla"]);
  });
});
