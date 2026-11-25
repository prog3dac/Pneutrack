// Circuito elettrico di comando: componenti, morsetti e validazione dei riferimenti.
import { describe, expect, it } from "vitest";
import { buildComponent, ParameterError, typeList, type ComponentData } from "../src/model/components";
import type { ConnectionData } from "../src/model/circuit";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";

type Doc = { components: ComponentData[]; connections: ConnectionData[] };
const codes = (doc: Doc) =>
  analyze(doc).issues.map((i) => i.code).sort();

/** Comando diretto: S1 (pulsante NA) eccita Y1, che comanda la 5/2 monostabile V1 sul cilindro C1. */
const direct = (): Doc => ({
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
    { id: "G", type: "electric_supply", params: { voltage: "24 V" } },
    { id: "S1", type: "pushbutton", contact: "no" },
    { id: "Y1", type: "valve_solenoid", drives: "V1.14" },
  ],
  connections: [
    { from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" },
    { from: "G.+", to: "S1.13" }, { from: "S1.14", to: "Y1.A1" }, { from: "Y1.A2", to: "G.0V" },
  ],
});

describe("componenti elettrici", () => {
  it("sono nella categoria Elettrico, con morsetti elettrici, e in palette (tranne il punto di connessione)", () => {
    const electric = typeList().filter((t) => t.domain === "electric");
    expect(electric.map((t) => t.type).sort()).toEqual([
      "electric_supply", "limit_switch", "pressure_switch", "proximity_sensor", "pushbutton", "relay_coil",
      "relay_contact", "signal_lamp", "timer_relay", "valve_solenoid", "wire_junction"]);
    expect(electric.every((t) => t.category === "Elettrico")).toBe(true);
    expect(electric.filter((t) => t.hidden).map((t) => t.type)).toEqual(["wire_junction"]);
    expect(buildComponent({ id: "G", type: "electric_supply", params: { voltage: "24 V" } }).ports
      .map((p) => [p.name, p.kind])).toEqual([["+", "electric"], ["0V", "electric"]]);
  });

  it("i morsetti dei contatti seguono il tipo: NA 13-14, NC 11-12, scambio 11-12-14", () => {
    const ports = (contact: string) => buildComponent({ id: "K", type: "relay_contact", contact }).ports.map((p) => p.name);
    expect(ports("no")).toEqual(["13", "14"]);
    expect(ports("nc")).toEqual(["11", "12"]);
    expect(ports("co")).toEqual(["11", "12", "14"]);
    expect(() => buildComponent({ id: "K", type: "relay_contact", contact: "xx" })).toThrow(/contatto 'xx' non valido/);
  });

  it("i riferimenti si leggono dalla sigla e vanno solo dove hanno senso", () => {
    expect(buildComponent({ id: "Y1", type: "valve_solenoid", drives: "V1.12" }).drives).toEqual({ valve: "V1", side: "12" });
    expect(buildComponent({ id: "S2", type: "limit_switch", cam: "C1+" }).cam).toEqual({ cylinder: "C1", end: "+" });
    expect(buildComponent({ id: "K1a", type: "relay_contact", relay: "K1" }).relay).toBe("K1");
    expect(() => buildComponent({ id: "Y1", type: "valve_solenoid", drives: "V1.4" })).toThrow(ParameterError);
    expect(() => buildComponent({ id: "S2", type: "limit_switch", cam: "C1" })).toThrow(/finecorsa/);
    expect(() => buildComponent({ id: "K1", type: "relay_coil", drives: "V1.14" })).toThrow(/riferimento 'drives'/);
    expect(() => buildComponent({ id: "S1", type: "pushbutton", timer_mode: "on_delay" })).toThrow(/opzione/);
  });

  it("le tensioni si scrivono in volt", () => {
    expect(String(buildComponent({ id: "G", type: "electric_supply", params: { voltage: "24 V" } }).params.voltage)).toBe("24 V");
    expect(() => buildComponent({ id: "G", type: "electric_supply", params: { voltage: "24 bar" } })).toThrow(/voltage/);
  });
});

describe("validazione del circuito elettrico", () => {
  it("un comando diretto completo è valido e si compila per la simulazione", () => {
    const doc = direct();
    const a = analyze(doc);
    expect(a.issues).toEqual([]);
    expect(a.pressures["G.+"]).toBeUndefined();
    const r = compileSim(doc);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.network.portNode["G.+"]).toBeUndefined();
  });

  it("uno schema solo pneumatico non riceve avvisi sui solenoidi", () => {
    const doc = direct();
    doc.components = doc.components.slice(0, 3);
    doc.connections = doc.connections.slice(0, 3);
    expect(codes(doc)).toEqual([]);
  });

  it("filo tra elettrico e pneumatico, tubo su un filo, cortocircuito", () => {
    const doc = direct();
    doc.connections.push({ from: "S1.13", to: "V1.2" });
    expect(codes(doc)).toContain("MIXED_CONNECTION");
    const tube = direct();
    tube.connections[3] = { ...tube.connections[3]!, tube: { inner_diameter: "4 mm", length: "1 m" } };
    expect(codes(tube)).toContain("INVALID_TUBE");
    const short = direct();
    short.connections.push({ from: "G.+", to: "Y1.A2" });
    expect(codes(short)).toContain("SHORT_CIRCUIT");
  });

  it("morsetti scollegati e alimentazione mancante sono avvisi", () => {
    const doc = direct();
    doc.components.splice(3, 1);
    doc.connections = doc.connections.filter((c) => !c.from.startsWith("G.") && !c.to.startsWith("G."));
    const a = analyze(doc);
    expect(a.ok).toBe(true);
    expect(a.issues.map((i) => i.code).sort()).toEqual(["NO_ELECTRIC_SUPPLY", "UNCONNECTED_TERMINAL", "UNCONNECTED_TERMINAL"]);
  });

  it("bobine: valvola inesistente, lato senza solenoide, due bobine sullo stesso solenoide, solenoide senza bobina", () => {
    const missing = direct();
    missing.components[5] = { id: "Y1", type: "valve_solenoid", drives: "V9.14" };
    expect(codes(missing)).toEqual(["INVALID_REFERENCE", "UNDRIVEN_SOLENOID"]);
    const spring = direct();
    spring.components[5] = { id: "Y1", type: "valve_solenoid", drives: "V1.12" };
    expect(codes(spring)).toEqual(["NOT_A_SOLENOID", "UNDRIVEN_SOLENOID"]);
    const twice = direct();
    twice.components.push({ id: "Y2", type: "valve_solenoid", drives: "V1.14" });
    twice.connections.push({ from: "S1.14", to: "Y2.A1" }, { from: "Y2.A2", to: "G.0V" });
    expect(codes(twice)).toEqual(["DUPLICATE_COIL"]);
    const unlinked = direct();
    unlinked.components[5] = { id: "Y1", type: "valve_solenoid" };
    expect(codes(unlinked)).toEqual(["UNDRIVEN_SOLENOID", "UNLINKED_REFERENCE"]);
  });

  it("relè e contatti: autoritenuta valida, contatto verso un relè che non c'è, relè senza contatti", () => {
    const doc = direct();
    doc.components.push(
      { id: "S0", type: "pushbutton", contact: "nc" },
      { id: "K1", type: "relay_coil" },
      { id: "K1a", type: "relay_contact", contact: "no", relay: "K1" },
    );
    // + — S0 — (S1 // K1a) — K1 — 0V; il contatto K1b (scambio) eccita Y1
    doc.connections = [
      ...doc.connections.slice(0, 3),
      { from: "G.+", to: "S0.11" }, { from: "S0.12", to: "S1.13" }, { from: "S0.12", to: "K1a.13" },
      { from: "S1.14", to: "K1.A1" }, { from: "K1a.14", to: "K1.A1" }, { from: "K1.A2", to: "G.0V" },
      { from: "G.+", to: "K1b.11" }, { from: "K1b.14", to: "Y1.A1" }, { from: "Y1.A2", to: "G.0V" },
    ];
    doc.components.push({ id: "K1b", type: "relay_contact", contact: "co", relay: "K1" });
    expect(analyze(doc).issues).toEqual([]);

    const bad = structuredClone(doc);
    bad.components.find((c) => c.id === "K1b")!.relay = "Y1";
    expect(codes(bad)).toEqual(["INVALID_REFERENCE"]);
    const unused = structuredClone(doc);
    unused.components.push({ id: "K2", type: "relay_coil" });
    unused.connections.push({ from: "G.+", to: "K2.A1" }, { from: "K2.A2", to: "G.0V" });
    expect(codes(unused)).toEqual(["UNUSED_RELAY"]);
  });

  it("finecorsa, sensori e pressostato indicano un cilindro o una linea che esistono", () => {
    const doc = direct();
    doc.components.push(
      { id: "S2", type: "limit_switch", contact: "no", cam: "C1+" },
      { id: "B1", type: "proximity_sensor", cam: "C9-" },
      { id: "B2", type: "proximity_sensor", cam: "C1+", params: { position: "150 mm" } },
      { id: "B3", type: "pressure_switch", params: { setpoint: "8 bar" } },
      { id: "B3a", type: "relay_contact", relay: "B3" },
    );
    doc.connections.push(
      { from: "G.+", to: "S2.13" }, { from: "S2.14", to: "Y1.A1" },
      ...["B1", "B2"].flatMap((b) => [{ from: "G.+", to: `${b}.BN` }, { from: `${b}.BU`, to: "G.0V" }, { from: `${b}.BK`, to: "Y1.A1" }]),
      { from: "B3.1", to: "V1.4" }, { from: "G.+", to: "B3a.13" }, { from: "B3a.14", to: "Y1.A1" },
    );
    const a = analyze(doc);
    expect(a.issues.map((i) => [i.code, i.component])).toEqual([
      ["SETPOINT_UNREACHABLE", "B3"], ["INVALID_CAM", "B1"], ["INVALID_CAM", "B2"]]);
  });
});

describe("punti di connessione dei fili", () => {
  it("un filo si dirama con un punto di connessione elettrico, che si può anche togliere", async () => {
    const { splitConnection, dissolveJunction, WIRE_JUNCTION } = await import("../src/model/junctions");
    const doc = { ...direct(), format: "pneutrack/circuit" as const, version: 1 as const, name: "", layout: {} };
    const i = doc.connections.findIndex((c) => c.from === "S1.14");
    const ref = splitConnection(doc, i, [10, 10], "N1", 0, 0.5, WIRE_JUNCTION);
    expect(ref).toBe("N1.1");
    doc.components.push({ id: "H1", type: "signal_lamp" });
    doc.connections.push({ from: "N1.1", to: "H1.X1" }, { from: "H1.X2", to: "G.0V" });
    expect(analyze(doc).issues).toEqual([]);
    doc.connections = doc.connections.filter((c) => c.to !== "H1.X1" && c.from !== "H1.X2");
    doc.components.pop();
    expect(dissolveJunction(doc, "N1")).toBe(true);
    expect(analyze(doc).issues).toEqual([]);
  });
});
