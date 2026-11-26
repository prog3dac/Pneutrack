import { describe, expect, it } from "vitest";
import type { CircuitDoc } from "../src/model/circuit";
import { buildComponent, ParameterError, restPosition, type ComponentData } from "../src/model/components";
import {
  boxPaths, CELLS, formatBoxes, parseBox, parseBoxes, STANDARD_BOXES, valveBoxes, WAYS, type Ways,
} from "../src/model/valveBody";
import {
  applyValveConfig, defaultBoxes, sanitizeValve, standardFunctionFor, valveConfigOf, valveTemplate,
} from "../src/model/valveConfig";
import { billOfMaterials } from "../src/model/bom";
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

const valve = (extra: Partial<ComponentData>): ComponentData => ({ id: "V1", type: "directional_valve", ...extra });

describe("corpo delle valvole: caselle uniche per simbolo e simulazione", () => {
  it("i passaggi delle funzioni normalizzate sono quelli di sempre", () => {
    // tabella scritta a mano prima del configuratore (sim/network.ts, 0.32.0)
    const before: Record<string, Record<string, [string, string][]>> = {
      "2/2": { "14": [["1", "2"]] },
      "3/2": { "14": [["1", "2"]], "12": [["2", "3"]] },
      "3/3": { "14": [["1", "2"]], "12": [["2", "3"]] },
      "4/2": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "3"]] },
      "4/3": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "3"]] },
      "4/3E": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "3"]], "0": [["4", "3"], ["2", "3"]] },
      "5/2": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]] },
      "5/3": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]] },
      "5/3E": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]], "0": [["4", "5"], ["2", "3"]] },
      "5/3P": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]], "0": [["1", "4"], ["1", "2"]] },
    };
    for (const [fn, paths] of Object.entries(before)) expect(boxPaths(STANDARD_BOXES[fn]!), fn).toEqual(paths);
  });

  it("legge e riscrive le caselle personalizzate", () => {
    const text = "1>4 1>2 x3 | x1 x2 x3 x4 | 1>2 4>3";
    expect(formatBoxes(parseBoxes(text, 4))).toBe(text);
    expect(() => parseBoxes("1>5 | x1", 4)).toThrow(/porta 5 non esiste/);
    expect(() => parseBoxes("1>2", 3)).toThrow(/2 o 3 caselle/);
    expect(() => parseBoxes("1>1 | x1", 3)).toThrow(/a sé stessa/);
    expect(() => parseBox("1-2")).toThrow(/non valido/);
  });

  it("ogni casella dell'elenco usa solo le porte delle sue vie", () => {
    for (const w of WAYS) {
      for (const c of CELLS[w]) expect(() => parseBoxes(`${formatBoxes([c.items])} | ${formatBoxes([c.items])}`, w), c.label).not.toThrow();
      expect(defaultBoxes(w, 2)).toHaveLength(2);
      expect(defaultBoxes(w, 3)).toHaveLength(3);
    }
  });

  it("una valvola personalizzata si valida: funzione vie/posizioni e caselle coerenti", () => {
    const c = buildComponent(valve({ function: "4/3", boxes: "1>4 2>3 | 1>4 1>2 x3 | 1>2 4>3",
      actuation_14: "solenoid", actuation_12: "solenoid" }));
    expect(c.boxes).toHaveLength(3);
    expect(c.ports.map((p) => p.name).sort()).toEqual(["1", "2", "3", "4"]);
    expect(() => buildComponent(valve({ function: "4/3E", boxes: "1>4 | x1 | 1>2" }))).toThrow(/vie\/posizioni/);
    expect(() => buildComponent(valve({ function: "4/2", boxes: "1>4 | x1 | 1>2" }))).toThrow(/vuole 2 caselle/);
    expect(() => buildComponent(valve({ function: "3/2", boxes: "1>4 | x1" }))).toThrow(ParameterError);
    expect(() => buildComponent(valve({ function: "6/2" }))).toThrow(/non supportata/);
    // 2/3 esiste solo come corpo personalizzato
    expect(() => buildComponent(valve({ function: "2/3", boxes: "1>2 | x1 x2 | 2>1" }))).not.toThrow();
  });
});

describe("posizione iniziale, segnale dominante e secondo comando", () => {
  it("la casella di riposo dipende dal ritorno; nelle bistabili si sceglie", () => {
    expect(restPosition({ function: "3/2", actuation_14: "spring", actuation_12: "manual" })).toBe("14");
    expect(restPosition({ function: "3/2", actuation_14: "manual", actuation_12: "spring" })).toBe("12");
    expect(restPosition({ function: "5/3", actuation_14: "solenoid", actuation_12: "solenoid" })).toBe("0");
    expect(restPosition({ function: "5/2", actuation_14: "solenoid", actuation_12: "solenoid" })).toBe("12");
    expect(restPosition({ function: "5/2", actuation_14: "solenoid", actuation_12: "solenoid", initial: "14" })).toBe("14");
    expect(() => buildComponent(valve({ function: "5/2", actuation_14: "solenoid", actuation_12: "spring", initial: "14" })))
      .toThrow(/solo nelle valvole bistabili/);
  });

  it("il segnale dominante e il secondo comando si controllano", () => {
    expect(() => buildComponent(valve({ actuation_14: "solenoid", actuation_12: "spring", dominant: "14" })))
      .toThrow(/segnale dominante/);
    expect(buildComponent(valve({ actuation_14: "pilot", actuation_12: "pilot", dominant: "12" })).dominant).toBe("12");
    expect(() => buildComponent(valve({ actuation_14: "solenoid", actuation_12: "spring", aux_12: "manual" })))
      .toThrow(/ha il ritorno/);
    expect(() => buildComponent(valve({ actuation_14: "solenoid", actuation_12: "spring", aux_14: "solenoid" })))
      .toThrow(/solo manuale o meccanico/);
    expect(() => buildComponent(valve({ actuation_14: "mechanical", actuation_12: "spring", aux_14: "plunger" })))
      .toThrow(/già un comando meccanico/);
    // finecorsa sul secondo comando meccanico
    const c = buildComponent(valve({ actuation_14: "pilot", actuation_12: "spring", aux_14: "mechanical", cam_14: "C1+" }));
    expect(c.cam_14).toEqual({ cylinder: "C1", end: "+" });
  });

  it("bistabile: parte dalla casella scelta e con i due segnali vince il dominante", () => {
    const parts = (extra: Partial<ComponentData>) => doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        valve({ function: "5/2", actuation_14: "solenoid", actuation_12: "solenoid", ...extra }),
        { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } },
      ],
      [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]],
    );
    const a = sim(parts({ initial: "14" }));
    expect(a.valvePosition("V1")).toBe("14");
    a.advance(0.5);
    expect(a.cylinder("C1")!.fraction).toBe(1);

    const b = sim(parts({ dominant: "12" }));
    b.setCommand("V1", "14", true);
    expect(b.valvePosition("V1")).toBe("14");
    b.setCommand("V1", "12", true);
    expect(b.valvePosition("V1")).toBe("12");
    // senza dominante la bistabile resta dov'è
    const c = sim(parts({}));
    c.setCommand("V1", "14", true);
    c.setCommand("V1", "12", true);
    expect(c.valvePosition("V1")).toBe("14");
  });

  it("il secondo comando manuale aziona il lato come il comando ausiliario", () => {
    const s = sim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        valve({ function: "3/2", actuation_14: "pilot", actuation_12: "spring", aux_14: "manual" }),
        { id: "T", type: "plug" },
        { id: "C1", type: "single_acting_cylinder", params: { bore: "20 mm", rod: "8 mm", stroke: "50 mm" } },
      ],
      [["P.1", "V1.1"], ["V1.14", "T.1"], ["V1.2", "C1.A"]],
    ));
    expect(s.valvePosition("V1")).toBe("12");
    s.setOverride("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
    s.setOverride("V1", "14", false);
    expect(s.valvePosition("V1")).toBe("12");
  });

  it("un rullo come secondo comando, senza cilindro, si preme a mano", () => {
    const s = sim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        valve({ function: "3/2", actuation_14: "manual", actuation_12: "spring", aux_14: "mechanical" }),
        { id: "C1", type: "single_acting_cylinder", params: { bore: "20 mm", rod: "8 mm", stroke: "50 mm" } },
      ],
      [["P.1", "V1.1"], ["V1.2", "C1.A"]],
    ));
    s.setOverride("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
  });

  it("la simulazione segue le caselle personalizzate: 3/2 normalmente aperta disegnata a mano", () => {
    const s = sim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        // casella 14 in scarico, casella 12 (riposo) alimentata: aperta senza comando
        valve({ function: "3/2", boxes: "2>3 x1 | 1>2 x3", actuation_14: "manual", actuation_12: "spring" }),
        { id: "C1", type: "single_acting_cylinder", params: { bore: "20 mm", rod: "8 mm", stroke: "50 mm" } },
      ],
      [["P.1", "V1.1"], ["V1.2", "C1.A"]],
    ));
    s.advance(0.5);
    expect(s.cylinder("C1")!.fraction).toBe(1);
    s.setCommand("V1", "14", true);
    s.advance(0.8);
    expect(s.cylinder("C1")!.fraction).toBe(0);
  });
});

describe("configuratore", () => {
  it("riconosce le funzioni normalizzate e scrive le caselle solo se servono", () => {
    const base = valve({ function: "5/2", actuation_14: "solenoid", actuation_12: "spring", params: { max_pressure: "10 bar" } });
    const cfg = valveConfigOf(base);
    expect(cfg.ways).toBe(5);
    expect(applyValveConfig(base, cfg).function).toBe("5/2");
    expect(applyValveConfig(base, cfg).boxes).toBeUndefined();

    const custom = applyValveConfig(base, { ...cfg, ways: 4, boxes: ["1>4 2>3", "1>4 1>2 x3", "1>2 4>3"], act12: "solenoid" });
    expect(custom.function).toBe("4/3");
    expect(custom.boxes).toBe("1>4 2>3 | 1>4 1>2 x3 | 1>2 4>3");
    expect(() => buildComponent(custom)).not.toThrow();
    const back = applyValveConfig(custom, { ...valveConfigOf(custom), boxes: STANDARD_BOXES["4/3E"]!.map((b) => formatBoxes([b])) });
    expect(back.function).toBe("4/3E");
    expect(back.boxes).toBeUndefined();
    expect(standardFunctionFor(4 as Ways, valveBoxes({ function: "4/3" }))).toBe("4/3");
  });

  it("toglie i campi rimasti senza senso", () => {
    const base = valve({ function: "5/2", actuation_14: "solenoid", actuation_12: "solenoid" });
    const cfg = { ...valveConfigOf(base), initial: "14" as const, dominant: "14" as const, act12: "spring" as const,
      aux12: "manual" as const, flow: "1000" };
    const out = applyValveConfig(base, cfg);
    expect(out.initial).toBeUndefined();
    expect(out.dominant).toBeUndefined();
    expect(out.aux_12).toBeUndefined();
    expect(out.params?.flow).toBe("1000 l/min");
    expect(() => buildComponent(out)).not.toThrow();

    const c = valve({ function: "4/3", boxes: "1>4 | x1 | 1>2", actuation_14: "solenoid", actuation_12: "solenoid",
      dominant: "12", aux_12: "manual" });
    c.actuation_12 = "spring";
    sanitizeValve(c, "actuation_12");
    expect(c.dominant).toBeUndefined();
    expect(c.aux_12).toBeUndefined();
    expect(c.boxes).toBeDefined();
    sanitizeValve(c, "function");
    expect(c.boxes).toBeUndefined();
  });

  it("la libreria ricorda corpo e comandi, non sigla e finecorsa", () => {
    const t = valveTemplate(valve({ function: "3/2", boxes: "2>3 x1 | 1>2 x3", actuation_14: "mechanical",
      actuation_12: "spring", cam_14: "C1+", code: "X", label: "3/2 NA a rullo" }));
    expect(t).toEqual({ function: "3/2", boxes: "2>3 x1 | 1>2 x3", actuation_14: "mechanical", actuation_12: "spring",
      label: "3/2 NA a rullo" });
  });
});

describe("simbolo e distinta", () => {
  it("la casella di riposo sta sotto le porte, che non si spostano", () => {
    const nc = geometry(valve({ function: "3/2", actuation_14: "manual", actuation_12: "spring" }));
    const na = geometry(valve({ function: "3/2", actuation_14: "spring", actuation_12: "manual" }));
    expect(na.ports).toEqual(nc.ports);
    expect(nc.svg).toContain(`transform="translate(0,0)"`);
    expect(na.svg).toContain(`transform="translate(40,0)"`);
  });

  it("disegna il secondo comando, il segno del dominante e le caselle a U", () => {
    const g = geometry(valve({ function: "5/2", actuation_14: "solenoid", actuation_12: "solenoid", aux_14: "lever_detent",
      dominant: "14" }));
    expect(g.svg).toMatch(/<g data-override="1"[^>]*data-side="14"/);
    expect(g.svg).toContain("dominant-label");
    const u = geometry(valve({ function: "4/2", boxes: "1>3 x2 x4 | 1>2 4>3", actuation_14: "solenoid", actuation_12: "spring" }));
    expect(u.svg).toContain("<path");
  });

  it("la distinta descrive il corpo personalizzato", () => {
    const rows = billOfMaterials({ components: [valve({ function: "3/2", boxes: "2>3 x1 | 1>2 x3", actuation_14: "manual",
      actuation_12: "spring", aux_14: "lever" })], connections: [], layout: {} } as unknown as CircuitDoc);
    const text = JSON.stringify(rows);
    expect(text).toContain("caselle 2>3 x1 | 1>2 x3");
    expect(text).toContain("leva sul lato 14");
  });
});
