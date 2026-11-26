import { describe, expect, it } from "vitest";
import type { CircuitDoc } from "../src/model/circuit";
import { buildComponent, type ComponentData } from "../src/model/components";
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
const cyl = (extra: Partial<ComponentData> = {}): ComponentData =>
  ({ id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" }, ...extra });

describe("comando manuale ausiliario", () => {
  const d = (override: string) => doc(
    [P, { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring", override }, cyl()],
    [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]],
  );
  it("aziona la valvola senza eccitare il solenoide", () => {
    const s = sim(d("push"));
    s.setOverride("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
    s.advance(0.5);
    expect(s.cylinder("C1")!.fraction).toBe(1);
    s.setOverride("V1", "14", false);
    expect(s.valvePosition("V1")).toBe("12");
  });
  it("senza opzione il comando manuale non fa nulla", () => {
    const s = sim(d("none"));
    s.setOverride("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("12");
  });
  it("si disegna oltre il solenoide e solo sui lati elettrici", () => {
    const g = geometry({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring", override: "detent" });
    expect(g.svg.match(/data-override="1"/g)).toHaveLength(1);
    const manual = geometry({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "manual", actuation_12: "spring", override: "push" });
    expect(manual.svg).not.toContain("data-override");
  });
  it("compare in distinta", () => {
    const rows = billOfMaterials({ components: [{ id: "V1", type: "directional_valve", override: "push" }] });
    expect(rows[0]!.description).toContain("comando manuale ausiliario");
  });
});

describe("rubinetto e valvola di sezionamento", () => {
  it("il rubinetto parte aperto e un clic lo chiude", () => {
    const s = sim(doc([P, { id: "RB1", type: "shutoff_valve" }, { id: "M1", type: "pressure_gauge" }],
      [["P.1", "RB1.1"], ["RB1.2", "M1.1"]]));
    s.advance(0.05);
    expect(s.gauge("M1.1")).toBeGreaterThan(5.9);
    s.setCommand("RB1", "14", false);
    expect(s.valvePosition("RB1")).toBe("12");
  });
  it("la valvola di sezionamento chiusa scarica l'impianto a valle", () => {
    const s = sim(doc([P, { id: "SZ1", type: "lockout_valve" }, { id: "SB1", type: "air_reservoir", params: { volume: "0.1 l" } }],
      [["P.1", "SZ1.1"], ["SZ1.2", "SB1.1"]]));
    s.advance(0.3);
    expect(s.gauge("SB1.1")).toBeGreaterThan(5.9);
    s.setCommand("SZ1", "14", false);
    s.advance(0.5);
    expect(s.gauge("SB1.1")).toBeLessThan(0.1);
  });
});

describe("strozzatore fisso e avviamento progressivo", () => {
  it("l'ugello ricava la conduttanza dal diametro: più piccolo, più lento", () => {
    const fill = (dia: string) => {
      const s = sim(doc([P, { id: "U1", type: "fixed_orifice", params: { diameter: dia } },
        { id: "SB1", type: "air_reservoir", params: { volume: "0.1 l" } }], [["P.1", "U1.1"], ["U1.2", "SB1.1"]]));
      s.advance(0.1);
      return s.gauge("SB1.1");
    };
    expect(fill("0.5 mm")).toBeLessThan(fill("1 mm"));
    expect(fill("1 mm")).toBeGreaterThan(0);
  });
  it("la valvola di avviamento riempie piano e poi apre del tutto", () => {
    const run = (type: string) => {
      const s = sim(doc([P, { id: "A1", type }, { id: "SB1", type: "air_reservoir", params: { volume: "1 l" } }],
        [["P.1", "A1.1"], ["A1.2", "SB1.1"]]));
      s.advance(0.05);
      const early = s.gauge("SB1.1");
      s.advance(3);
      return { early, late: s.gauge("SB1.1") };
    };
    const soft = run("soft_start_valve"), plain = run("shutoff_valve");
    expect(soft.early).toBeLessThan(plain.early / 2);
    expect(soft.late).toBeGreaterThan(5.9);
  });
});

describe("doppia non ritorno pilotata", () => {
  // carico che spinge lo stelo indietro: con la 5/3 al centro in scarico il cilindro rientrerebbe
  const loaded = cyl({ params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm", load: "100 N" } });
  const valve = { id: "V1", type: "directional_valve", function: "5/3E", actuation_14: "solenoid", actuation_12: "solenoid" };
  const run = (withCheck: boolean) => {
    const s = sim(withCheck
      ? doc([P, valve, { id: "NRD1", type: "double_pilot_check" }, loaded],
        [["P.1", "V1.1"], ["V1.4", "NRD1.1"], ["NRD1.2", "C1.A"], ["V1.2", "NRD1.3"], ["NRD1.4", "C1.B"]])
      : doc([P, valve, loaded], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]));
    s.setCommand("V1", "14", true);
    while (s.cylinder("C1")!.fraction < 0.5 && s.t < 2) s.advance(0.005);
    s.setCommand("V1", "14", false);
    s.advance(0.3);
    const held = s.cylinder("C1")!.fraction;
    s.advance(1);
    return { held, after: s.cylinder("C1")!.fraction };
  };
  it("con la valvola al centro tiene fermo il cilindro sotto carico", () => {
    const r = run(true);
    expect(r.held).toBeGreaterThan(0.3);
    expect(Math.abs(r.after - r.held)).toBeLessThan(0.01);
  });
  it("senza, lo stesso cilindro rientra", () => {
    expect(run(false).after).toBeLessThan(0.05);
  });
});

describe("cilindro senza stelo, pinza e pistone magnetico", () => {
  it("il cilindro senza stelo esce e rientra", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "C1", type: "rodless_cylinder", params: { bore: "25 mm", stroke: "200 mm" } }],
      [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]));
    s.setCommand("V1", "14", true);
    s.advance(1);
    expect(s.cylinder("C1")!.fraction).toBe(1);
  });
  it("la pinza a semplice effetto chiude con l'aria e riapre con la molla", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "PZ1", type: "gripper", gripper_kind: "single", params: { bore: "16 mm", stroke: "5 mm" } }],
      [["P.1", "V1.1"], ["V1.2", "PZ1.A"]]));
    s.setCommand("V1", "14", true);
    s.advance(0.3);
    expect(s.cylinder("PZ1")!.fraction).toBe(1);
    s.setCommand("V1", "14", false);
    s.advance(0.5);
    expect(s.cylinder("PZ1")!.fraction).toBe(0);
  });
  it("un sensore può indicare la pinza; il pistone magnetico compare nel simbolo e in distinta", () => {
    expect(analyze(doc([{ id: "PZ1", type: "gripper", params: { bore: "16 mm", stroke: "5 mm" } },
      { id: "B1", type: "proximity_sensor", cam: "PZ1+" }], [])).issues.filter((i) => i.code === "INVALID_CAM")).toEqual([]);
    expect(geometry(cyl({ magnet: "yes" })).svg).toContain("magnet");
    expect(geometry(cyl()).svg).not.toContain("magnet");
    const rows = billOfMaterials({ components: [cyl({ magnet: "yes" })] });
    expect(rows[0]!.description).toBe("Cilindro doppio effetto pistone magnetico");
    expect(geometry({ id: "PZ1", type: "gripper", gripper_kind: "single" }).ports).not.toHaveProperty("B");
  });
});

describe("vuoto", () => {
  const d = doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "EV1", type: "vacuum_ejector" }, { id: "VT1", type: "suction_cup", params: { diameter: "20 mm" } }],
  [["P.1", "V1.1"], ["V1.2", "EV1.1"], ["EV1.2", "VT1.1"]]);
  it("l'eiettore alimentato fa il vuoto nella ventosa, e senz'aria la ventosa torna in atmosfera", () => {
    const s = sim(d);
    s.setCommand("V1", "14", true);
    s.advance(0.5);
    expect(s.gauge("VT1.1")).toBeLessThan(-0.7);
    expect(s.gauge("VT1.1")).toBeGreaterThan(-0.86);
    s.setCommand("V1", "14", false);
    s.advance(0.5);
    expect(s.gauge("VT1.1")).toBeGreaterThan(-0.05);
  });
});

describe("innesto rapido", () => {
  const d = (coupling: string, coupling_state: string) => doc(
    [P, { id: "IR1", type: "quick_coupling", coupling, coupling_state }, { id: "SB1", type: "air_reservoir", params: { volume: "0.1 l" } }],
    [["P.1", "IR1.1"], ["IR1.2", "SB1.1"]]);
  it("innestato passa, staccato con non ritorno tiene chiusa l'alimentazione e scarica la spina", () => {
    const on = sim(d("check_one", "coupled"));
    on.advance(0.3);
    expect(on.gauge("SB1.1")).toBeGreaterThan(5.9);
    const off = sim(d("check_one", "uncoupled"));
    off.advance(0.3);
    expect(off.gauge("SB1.1")).toBeLessThan(0.1);
    expect(off.airFlow()).toBeLessThan(1);
  });
  it("staccato senza non ritorno l'alimentazione sfiata", () => {
    const s = sim(d("plain", "uncoupled"));
    s.advance(0.1);
    expect(s.airFlow()).toBeGreaterThan(10);
  });
  it("le varianti si costruiscono e le opzioni non valide sono rifiutate", () => {
    expect(() => buildComponent({ id: "IR1", type: "quick_coupling", coupling: "boh" })).toThrow();
    expect(buildComponent({ id: "IR1", type: "quick_coupling" }).coupling).toBe("check_one");
  });
});
