// Modello, unità e validazione (portati dai test Python originali).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileBaseName, nets, normalizeCircuit, parseRef, CircuitError, type CircuitDoc } from "../src/model/circuit";
import {
  buildComponent, cylinderInfo, internalPaths, ParameterError, typeList, type ComponentData,
} from "../src/model/components";
import { q, Quantity, UnitError } from "../src/model/units";
import { analyze, build, pneumaticPorts } from "../src/model/validation";

// --- costruzione rapida degli schemi -------------------------------------------------

type Spec = Omit<ComponentData, "params"> & { params?: Record<string, string> };
const C = {
  source: (id: string, pressure: string): Spec => ({ id, type: "pressure_source", params: { pressure } }),
  regulator: (id: string, setpoint: string, extra: Record<string, string> = {}): Spec =>
    ({ id, type: "pressure_regulator", params: { setpoint, ...extra } }),
  valve: (id: string, fn: string, extra: Partial<Spec> & { params?: Record<string, string> } = {}): Spec =>
    ({ id, type: "directional_valve", function: fn, ...extra }),
  single: (id: string, params: Record<string, string> = {}): Spec =>
    ({ id, type: "single_acting_cylinder", params: { bore: "20 mm", stroke: "25 mm", ...params } }),
  double: (id: string, params: Record<string, string> = {}): Spec =>
    ({ id, type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm", ...params } }),
  silencer: (id: string): Spec => ({ id, type: "silencer" }),
  plug: (id: string): Spec => ({ id, type: "plug" }),
  flow: (id: string): Spec => ({ id, type: "flow_control_valve" }),
  rotary: (id: string): Spec => ({ id, type: "rotary_actuator", params: { angle: "90 deg" } }),
};
const circuit = (components: Spec[], wires: [string, string][]) => ({
  components: components as ComponentData[],
  connections: wires.map(([from, to]) => ({ from, to })),
});
const codes = (doc: Pick<CircuitDoc, "components" | "connections">) => analyze(doc).issues.map((i) => i.code);

/** Sorgente 6 bar -> 5/2 monostabile -> cilindro a doppio effetto, scarichi silenziati. */
function basic() {
  return circuit([
    C.source("P", "6 bar"),
    C.valve("V1", "5/2", { params: { max_pressure: "10 bar" } }),
    C.double("C1", { rod: "12 mm", max_pressure: "10 bar" }),
    C.silencer("S3"), C.silencer("S5"),
  ], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"], ["V1.3", "S3.1"], ["V1.5", "S5.1"]]);
}
const without = (doc: ReturnType<typeof circuit>, ...refs: string[]) => ({
  components: doc.components.filter((c) => !refs.includes(c.id)),
  connections: doc.connections.filter((w) => !refs.some((r) =>
    w.from === r || w.to === r || parseRef(w.from)[0] === r || parseRef(w.to)[0] === r)),
});

// --- unità ---------------------------------------------------------------------------

describe("unità da catalogo", () => {
  it("legge le unità dei cataloghi", () => {
    expect(q("6 bar").to("Pa")).toBeCloseTo(6e5);
    expect(q("0,6 MPa").equals(q("6 bar"))).toBe(true);
    expect(q("32mm").to("m")).toBeCloseTo(0.032);
    expect(q("90 psi").to("bar")).toBeCloseTo(6.205, 3);
    expect(q("500 Nl/min").to("Nm3/h")).toBeCloseTo(30);
    expect(q("90 °").to("rad")).toBeCloseTo(Math.PI / 2);
    expect(q("1 dm3/(s·bar)").to("m3/(s·Pa)")).toBeCloseTo(1e-8, 15);
  });

  it("conserva l'unità d'origine", () => {
    const p = q("6 bar");
    expect(p.unit).toBe("bar");
    expect(p.value).toBeCloseTo(6);
    expect(String(p)).toBe("6 bar");
    expect(String(p.inUnit("kPa"))).toBe("600 kPa");
  });

  it("confronta unità diverse e rifiuta dimensioni diverse", () => {
    expect(q("5 bar").compare(q("0.6 MPa"))).toBe(-1);
    expect(q("1 bar").equals(q("100 kPa"))).toBe(true);
    expect(() => q("6 bar").compare(q("6 mm"))).toThrow(UnitError);
    expect(() => q("6 bar").to("mm")).toThrow(UnitError);
  });

  it.each(["", "bar", "6 furlong", "abc mm"])("rifiuta '%s'", (bad) => {
    expect(() => Quantity.parse(bad)).toThrow(UnitError);
  });

  it("converte tuple e grandezze", () => {
    expect(Quantity.coerce([6, "bar"]).equals(q("6 bar"))).toBe(true);
    expect(Quantity.coerce(q("1 mm")).dimension).toBe("length");
    expect(() => Quantity.coerce(6)).toThrow(UnitError);
  });
});

// --- componenti ----------------------------------------------------------------------

const names = (c: ComponentData) => buildComponent(c).ports.map((p) => p.name).sort();

describe("componenti", () => {
  it("porte delle valvole secondo ISO 5599", () => {
    const v = buildComponent(C.valve("V", "5/2") as ComponentData);
    expect(v.ports.map((p) => p.name).sort()).toEqual(["1", "2", "3", "4", "5"]);
    const port = (n: string) => v.ports.find((p) => p.name === n)!;
    expect(port("1").kind).toBe("supply");
    expect(port("3").kind).toBe("exhaust");
    expect(port("3").mayBeOpen).toBe(true);
    expect(port("4").mayBeOpen).toBe(false);
    expect(names(C.valve("V2", "3/2") as ComponentData)).toEqual(["1", "2", "3"]);
  });

  it("i pilotaggi aggiungono le porte 14 e 12", () => {
    const v = buildComponent(C.valve("V", "5/2", { actuation_14: "pilot", actuation_12: "pilot" }) as ComponentData);
    expect(v.ports.filter((p) => p.kind === "pilot").map((p) => p.name).sort()).toEqual(["12", "14"]);
    expect(names(C.valve("M", "3/2", { actuation_14: "pilot" }) as ComponentData)).toContain("14");
    expect(names(C.valve("M", "3/2", { actuation_14: "pilot" }) as ComponentData)).not.toContain("12");
  });

  it("rifiuta funzioni sconosciute e due molle", () => {
    expect(() => buildComponent(C.valve("V", "7/4") as ComponentData)).toThrow(ParameterError);
    expect(() => buildComponent(C.valve("V", "5/2", { actuation_14: "spring", actuation_12: "spring" }) as ComponentData))
      .toThrow(ParameterError);
  });

  it("controlla i parametri", () => {
    expect(() => buildComponent({ id: "P", type: "pressure_source" })).toThrow(/pressure/);
    expect(() => buildComponent(C.source("P", "6 mm") as ComponentData)).toThrow(/atteso pressure/);
    expect(() => buildComponent({ id: "P", type: "pressure_source", params: { pressure: "6 bar", colour: "red" } }))
      .toThrow(/sconosciuti/);
    expect(() => buildComponent(C.double("C", { bore: "0 mm" }) as ComponentData)).toThrow(/positivo/);
    expect(() => buildComponent(C.double("C", { bore: "20 mm", rod: "25 mm" }) as ComponentData)).toThrow(/stelo/);
  });

  it("calcola forze teoriche del cilindro", () => {
    const c = buildComponent(C.double("C", { bore: "50 mm", stroke: "200 mm", rod: "20 mm" }) as ComponentData);
    const info = cylinderInfo(c, q("6 bar"))!;
    expect(info.forceExtend).toBe("1178 N");
    expect(info.forceRetract).toBe("990 N");
    expect(info.pistonArea).toMatch(/cm2$/);
  });

  it("il cilindro a semplice effetto ha una porta, il riduttore limita la pressione", () => {
    expect(names(C.single("C") as ComponentData)).toEqual(["A"]);
    const [path] = internalPaths(buildComponent(C.regulator("R", "4 bar") as ComponentData));
    expect(path!.cap).toBeCloseTo(4e5);
  });

  it.each(typeList().map((t) => t.type))("%s si costruisce con i valori della palette", (type) => {
    const def = typeList().find((t) => t.type === type)!;
    const data: ComponentData = { id: "X", type, params: { ...def.defaults },
      ...Object.fromEntries((def.options ?? []).map((o) => [o.name, o.default])) };
    expect(() => buildComponent(data)).not.toThrow();
  });
});

// --- schema --------------------------------------------------------------------------

describe("schema", () => {
  it("riferimenti alle porte", () => {
    expect(parseRef("V1.14")).toEqual(["V1", "14"]);
    expect(() => parseRef("V1")).toThrow(CircuitError);
  });

  it("collegamenti non validi diventano errori", () => {
    const doc = basic();
    const bad = (from: string, to: string) =>
      build({ ...doc, connections: [...doc.connections, { from, to }] }).issues.map((i) => i.message).join(" ");
    expect(bad("V1.9", "C1.A")).toMatch(/porta/);
    expect(bad("V1.1", "V1.1")).toMatch(/se stessa/);
    expect(bad("C1.A", "V1.4")).toMatch(/già presente/);
    const dup = build({ components: [C.silencer("S"), C.silencer("S")] as ComponentData[], connections: [] });
    expect(dup.issues[0]!.code).toBe("INVALID_COMPONENT");
  });

  it("un raccordo a T forma una sola rete, le reti coprono tutte le porte", () => {
    const tee = build(circuit([C.source("P", "6 bar"), C.silencer("A"), C.silencer("B")],
                              [["P.1", "A.1"], ["P.1", "B.1"]]));
    expect(nets(pneumaticPorts(tee.components), tee.connections)).toEqual([["A.1", "B.1", "P.1"]]);
    const b = build(basic());
    const all = nets(pneumaticPorts(b.components), b.connections);
    expect(all.flat().sort()).toEqual(pneumaticPorts(b.components).sort());
    expect(all).toHaveLength(5);
  });

  it("formato del file", () => {
    expect(() => normalizeCircuit({ format: "altro", components: [] })).toThrow(CircuitError);
    expect(codes(circuit([{ id: "X", type: "teletrasporto" }], []))).toEqual(["INVALID_COMPONENT"]);
  });

  it("l'esempio incluso è valido", () => {
    const doc = normalizeCircuit(JSON.parse(readFileSync("src/examples/doppio_effetto_bistabile.json", "utf8")));
    expect(doc.components).toHaveLength(8);
    expect(analyze(doc).issues).toEqual([]);
  });
});

// --- validazione ---------------------------------------------------------------------

describe("validazione", () => {
  it("lo schema base è valido e la pressione arriva al cilindro", () => {
    const a = analyze(basic());
    expect(a.issues).toEqual([]);
    expect(a.pressures["C1.A"]!.text).toBe("6 bar");
    expect(a.pressures["C1.B"]!.text).toBe("6 bar");
    expect(analyze({ components: [], connections: [] }).issues).toEqual([]);
  });

  it("senza sorgente: avvisi", () => {
    const doc = circuit([C.single("C"), C.plug("T")], [["C.A", "T.1"]]);
    expect(analyze(doc).ok).toBe(true);
    expect(new Set(codes(doc))).toEqual(new Set(["NO_SOURCE", "UNSUPPLIED_ACTUATOR"]));
  });

  it("porte scollegate", () => {
    const doc = basic();
    doc.connections = doc.connections.filter((w) => w.from !== "V1.2");
    const a = analyze(doc);
    expect(a.ok).toBe(false);
    expect(a.issues.filter((i) => i.code === "UNCONNECTED_PORT").map((i) => i.ports[0]).sort()).toEqual(["C1.B", "V1.2"]);
    expect(analyze(without(basic(), "S3")).ok).toBe(true); // scarico libero
  });

  it("utilizzo tappato e pilotaggio scollegato", () => {
    expect(codes(circuit([C.source("P", "6 bar"), C.valve("V", "5/2"), C.single("C"), C.plug("T")],
                         [["P.1", "V.1"], ["V.4", "C.A"], ["V.2", "T.1"]]))).toEqual([]);
    const a = analyze(circuit([C.source("P", "6 bar"), C.valve("V", "3/2", { actuation_14: "pilot" }), C.single("C")],
                              [["P.1", "V.1"], ["V.2", "C.A"]]));
    const [issue] = a.issues.filter((i) => i.code === "UNCONNECTED_PORT");
    expect(issue!.message).toMatch(/pilotaggio/);
    expect(issue!.ports).toEqual(["V.14"]);
  });

  it("sovrapressione, anche tra unità diverse", () => {
    const a = analyze(circuit([
      C.source("P", "8 bar"), C.valve("V", "5/2", { params: { max_pressure: "10 bar" } }),
      C.double("C", { bore: "16 mm", stroke: "50 mm", max_pressure: "7 bar" }),
    ], [["P.1", "V.1"], ["V.4", "C.A"], ["V.2", "C.B"]]));
    expect(a.issues).toHaveLength(1);
    expect(a.issues[0]).toMatchObject({ code: "OVERPRESSURE", component: "C" });
    expect(a.issues[0]!.message).toMatch(/8 bar.*7 bar/);
    expect(codes(circuit([C.source("P", "100 psi"), C.single("C", { max_pressure: "0.6 MPa" })], [["P.1", "C.A"]])))
      .toEqual(["OVERPRESSURE"]);
  });

  it("il riduttore protegge a valle ma può essere in sovrapressione", () => {
    const a = analyze(circuit([
      C.source("P", "8 bar"), C.regulator("R", "4 bar", { max_pressure: "16 bar" }),
      C.valve("V", "5/2", { params: { max_pressure: "10 bar" } }),
      C.double("C", { bore: "16 mm", stroke: "50 mm", max_pressure: "6 bar" }),
    ], [["P.1", "R.1"], ["R.2", "V.1"], ["V.4", "C.A"], ["V.2", "C.B"]]));
    expect(a.issues).toEqual([]);
    expect(a.pressures["C.A"]!.text).toBe("4 bar");
    const b = analyze(circuit([C.source("P", "12 bar"), C.regulator("R", "4 bar", { max_pressure: "10 bar" }), C.single("C")],
                              [["P.1", "R.1"], ["R.2", "C.A"]]));
    expect(b.issues.map((i) => [i.code, i.component])).toEqual([["OVERPRESSURE", "R"]]);
  });

  it("la pressione attraversa il regolatore di flusso in entrambi i versi", () => {
    expect(codes(circuit([C.source("P", "6 bar"), C.valve("V", "3/2"), C.flow("F"), C.single("C", { max_pressure: "5 bar" })],
                         [["P.1", "V.1"], ["V.2", "F.2"], ["F.1", "C.A"]]))).toEqual(["OVERPRESSURE"]);
  });

  it("sorgenti in conflitto e alimentazione allo scarico", () => {
    const conflict = analyze(circuit([C.source("P1", "6 bar"), C.source("P2", "8 bar"), C.single("C")],
                                     [["P1.1", "C.A"], ["P2.1", "C.A"]]));
    expect(conflict.issues.map((i) => i.code)).toEqual(["SOURCE_CONFLICT"]);
    expect(conflict.pressures["C.A"]!.text).toBe("8 bar");
    expect(codes(circuit([C.source("P1", "6 bar"), C.source("P2", "0.6 MPa"), C.single("C")],
                         [["P1.1", "C.A"], ["P2.1", "C.A"]]))).toEqual([]);
    expect(codes(circuit([C.source("P", "6 bar"), C.silencer("S")], [["P.1", "S.1"]]))).toEqual(["SUPPLY_VENTED"]);
    const vented = without(basic(), "S3");
    vented.connections.push({ from: "P.1", to: "V1.3" });
    const a = analyze(vented);
    expect(a.issues.map((i) => i.code)).toEqual(["SUPPLY_VENTED"]);
    expect(a.issues[0]!.message).toContain("V1.3");
  });

  it("attuatore e pilotaggio mai alimentati, pilotaggio sotto il minimo", () => {
    const rot = analyze(circuit([C.source("P", "6 bar"), C.plug("T"), C.rotary("R"), C.plug("TA"), C.plug("TB")],
                                [["P.1", "T.1"], ["R.A", "TA.1"], ["R.B", "TB.1"]]));
    expect(rot.issues.map((i) => [i.code, i.severity])).toEqual([["UNSUPPLIED_ACTUATOR", "warning"]]);

    const chain = analyze(circuit([
      C.source("P", "6 bar"), C.valve("Vp", "3/2", { actuation_14: "manual" }),
      C.valve("V", "5/2", { actuation_14: "pilot", actuation_12: "pilot", params: { min_pressure: "2 bar" } }),
      C.double("C"), C.plug("T"),
    ], [["P.1", "Vp.1"], ["P.1", "V.1"], ["Vp.2", "V.14"], ["V.12", "T.1"], ["V.4", "C.A"], ["V.2", "C.B"]]));
    expect(chain.ok).toBe(true);
    expect(chain.issues.map((i) => i.code)).toEqual(["UNSUPPLIED_PILOT"]);
    expect(chain.pressures["V.14"]!.text).toBe("6 bar");

    const under = analyze(circuit([
      C.source("P", "6 bar"), C.regulator("R", "1.5 bar"),
      C.valve("V", "3/2", { actuation_14: "pilot", params: { min_pressure: "2.5 bar" } }), C.single("C"),
    ], [["P.1", "R.1"], ["P.1", "V.1"], ["R.2", "V.14"], ["V.2", "C.A"]]));
    expect(under.issues.map((i) => [i.code, i.severity])).toEqual([["UNDERPRESSURE", "warning"]]);
    expect(under.issues[0]!.message).toContain("1.5 bar");
  });
});

describe("nome del file esportato", () => {
  it("tiene le lettere accentate e i segni + e -", () => {
    expect(fileBaseName("Elettropneumatica: sequenza A+ B+ B- A- con relè")).toBe("Elettropneumatica_sequenza_A+_B+_B-_A-_con_relè");
    expect(fileBaseName("Pressa / banco 1")).toBe("Pressa_banco_1");
    expect(fileBaseName("  ")).toBe("schema");
    expect(fileBaseName(undefined)).toBe("schema");
  });
});
