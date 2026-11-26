// Progetti su più fogli: file, migrazione, rimandi tra fogli e simulazione come un solo circuito.
import { describe, expect, it } from "vitest";
import { emptyCircuit, type CircuitDoc } from "../src/model/circuit";
import {
  duplicatePage, joinPages, mergedCircuit, newPageId, referenceTargets, referenceText, splitPages, type Page,
} from "../src/model/sheets";
import { analyze } from "../src/model/validation";
import { billOfMaterials } from "../src/model/bom";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const single: CircuitDoc = {
  ...emptyCircuit("Prova"),
  components: [{ id: "P", type: "pressure_source", params: { pressure: "6 bar" } }, { id: "M1", type: "pressure_gauge" }],
  connections: [{ from: "P.1", to: "M1.1" }],
  layout: { P: { x: 0, y: 0, rot: 0 }, M1: { x: 100, y: 0, rot: 0 } },
  sheet: { format: "A4", author: "AC" },
  annotations: [{ id: "T1", kind: "text", x: 0, y: 50, text: "Nota" }],
};

/** Due fogli: alimentazione e rimandi sul primo, valvola, cilindro, lampada e rimandi sul secondo. */
function twoSheets(): Page[] {
  const a: CircuitDoc = {
    ...emptyCircuit("Impianto"),
    components: [
      { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "RM1", type: "sheet_reference", label: "A1" },
      { id: "G", type: "electric_supply", params: { voltage: "24 V" } },
      { id: "S1", type: "pushbutton", contact: "no" },
      { id: "RE1", type: "wire_reference", label: "13" },
      { id: "RE2", type: "wire_reference", label: "0V" },
    ],
    connections: [{ from: "P.1", to: "RM1.1" }, { from: "G.+", to: "S1.13" }, { from: "S1.14", to: "RE1.1" }, { from: "G.0V", to: "RE2.1" }],
    layout: { P: { x: 0, y: 0, rot: 0 }, RM1: { x: 80, y: 0, rot: 0 } },
    sheet: { format: "A3" },
  };
  const b: CircuitDoc = {
    ...emptyCircuit("Impianto"),
    components: [
      { id: "RM2", type: "sheet_reference", label: "A1" },
      { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } },
      { id: "RE3", type: "wire_reference", label: "13" },
      { id: "RE4", type: "wire_reference", label: "0V" },
      { id: "Y1", type: "valve_solenoid", drives: "V1.14" },
    ],
    connections: [{ from: "RM2.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" },
                  { from: "RE3.1", to: "Y1.A1" }, { from: "Y1.A2", to: "RE4.1" }],
    layout: { RM2: { x: 0, y: 0, rot: 0 }, V1: { x: 0, y: 100, rot: 0 } },
    blocks: [{ id: "B1", name: "Attuatore", components: ["V1", "C1"] }],
  };
  return [{ id: "F1", name: "Pneumatico", doc: a }, { id: "F2", name: "Comando", doc: b }];
}

describe("fogli del progetto", () => {
  it("un file a foglio singolo diventa un foglio e torna identico", () => {
    const pages = splitPages(single);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.name).toBe("Foglio 1");
    expect(pages[0]!.doc.sheet).toEqual({ format: "A4", author: "AC" });
    expect(pages[0]!.doc.annotations?.[0]?.id).toBe("T1");
    expect(joinPages("Prova", pages)).toEqual(single);
  });

  it("con più fogli le posizioni indicano il foglio e i fogli tornano uguali", () => {
    const file = joinPages("Impianto", twoSheets());
    expect(file.sheets?.map((s) => [s.id, s.name])).toEqual([["F1", "Pneumatico"], ["F2", "Comando"]]);
    expect(file.sheet).toBeUndefined();
    expect(file.sheets?.[0]?.sheet).toEqual({ format: "A3" });
    expect(file.sheets?.[1]?.blocks?.[0]?.components).toEqual(["V1", "C1"]);
    expect(file.layout.V1?.sheet).toBe("F2");
    expect(file.components).toHaveLength(12);
    const back = splitPages(JSON.parse(JSON.stringify(file)));
    expect(back.map((p) => p.doc.components.map((c) => c.id))).toEqual(twoSheets().map((p) => p.doc.components.map((c) => c.id)));
    expect(back[1]!.doc.connections).toHaveLength(5);
    expect(back[1]!.doc.layout.V1).toEqual({ x: 0, y: 100, rot: 0 });
    expect(back[0]!.doc.sheet).toEqual({ format: "A3" });
  });

  it("un foglio solo ma con un nome scelto tiene la chiave sheets", () => {
    const p = splitPages(single);
    p[0]!.name = "Generale";
    const file = joinPages("Prova", p);
    expect(file.sheets?.[0]?.name).toBe("Generale");
    expect(splitPages(file)[0]!.name).toBe("Generale");
  });

  it("componenti senza foglio o su un foglio inesistente vanno sul primo", () => {
    const pages = splitPages({ ...single, layout: { P: { x: 0, y: 0, rot: 0, sheet: "Z9" } },
                               sheets: [{ id: "F1", name: "A" }, { id: "F2", name: "B" }] });
    expect(pages[0]!.doc.components).toHaveLength(2);
    expect(pages[1]!.doc.components).toHaveLength(0);
  });

  it("i rimandi collegano i fogli: validazione e simulazione vedono un solo circuito", () => {
    const pages = twoSheets();
    const a = analyze(mergedCircuit(pages));
    expect(a.issues.filter((i) => i.code.startsWith("SHEET_REFERENCE"))).toEqual([]);
    expect(a.pressures["V1.1"]?.bar).toBe(6);
    const r = compileSim(mergedCircuit(pages));
    if (!r.ok) throw new Error(r.errors.join("; "));
    const s = new Simulator(r.network);
    s.advance(0.3);
    expect(s.cylinder("C1")!.fraction).toBe(0);
    s.setSwitch("S1", true); // pulsante sul foglio 1, bobina sul foglio 2
    expect(s.electricState()!.energized.has("Y1")).toBe(true);
    s.advance(0.8);
    expect(s.cylinder("C1")!.fraction).toBeGreaterThan(0.99);
  });

  it("un rimando elettrico e uno pneumatico con lo stesso nome non si collegano", () => {
    const a = analyze({ components: [
      { id: "RM1", type: "sheet_reference", label: "X" }, { id: "RE1", type: "wire_reference", label: "X" }], connections: [] });
    expect(a.issues.filter((i) => i.code === "SHEET_REFERENCE_ALONE")).toHaveLength(2);
  });

  it("ogni rimando sa su quali fogli prosegue", () => {
    const t = referenceTargets(twoSheets());
    expect(t.get("RM1")).toEqual([{ page: 1, id: "RM2" }]);
    expect(t.get("RE4")).toEqual([{ page: 0, id: "RE2" }]);
    expect(referenceText(t.get("RM1"), 0)).toBe("→ fg. 2");
    expect(referenceText([{ page: 0, id: "X" }], 0)).toBe("");
  });

  it("la distinta conta i pezzi di tutti i fogli, senza i rimandi", () => {
    const rows = billOfMaterials(mergedCircuit(twoSheets()));
    expect(rows.flatMap((r) => r.ids)).toEqual(expect.arrayContaining(["S1", "V1", "C1"]));
    expect(rows.flatMap((r) => r.ids).some((id) => id.startsWith("RE") || id.startsWith("RM"))).toBe(false);
  });

  it("duplicare un foglio dà sigle nuove e i riferimenti interni seguono le copie", () => {
    const pages = twoSheets();
    const used = new Set(mergedCircuit(pages).components.map((c) => c.id));
    const free = (type: string, taken: Set<string>) => {
      const prefix = type === "directional_valve" ? "V" : type === "valve_solenoid" ? "Y" : type.endsWith("cylinder") ? "C" : "R";
      let n = 1;
      while (used.has(`${prefix}${n}`) || taken.has(`${prefix}${n}`)) n++;
      return `${prefix}${n}`;
    };
    const copy = duplicatePage(pages[1]!, newPageId(pages), "Comando (copia)", free);
    expect(copy.id).toBe("F3");
    const ids = copy.doc.components.map((c) => c.id);
    expect(ids.some((id) => used.has(id))).toBe(false);
    const y = copy.doc.components.find((c) => c.type === "valve_solenoid")!;
    const v = copy.doc.components.find((c) => c.type === "directional_valve")!;
    expect(y.drives).toBe(`${v.id}.14`);
    expect(copy.doc.blocks?.[0]?.components).toContain(v.id);
    expect(copy.doc.layout[v.id]).toEqual({ x: 0, y: 100, rot: 0 });
    expect(copy.doc.connections.every((c) => ids.includes(c.from.split(".")[0]!) && ids.includes(c.to.split(".")[0]!))).toBe(true);
    // l'originale non cambia
    expect(pages[1]!.doc.components[1]!.id).toBe("V1");
  });
});
