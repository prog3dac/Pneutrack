// Libreria di componenti da catalogo.
import { describe, expect, it } from "vitest";
import { buildComponent, conductanceFromFlow, conductanceOf, typeList, type ComponentData } from "../src/model/components";
import { q } from "../src/model/units";
import { applyPart, partByCode, partsFor, PARTS } from "../src/model/parts";

describe("libreria da catalogo", () => {
  it("ogni codice è unico e dà un componente valido del suo tipo", () => {
    expect(new Set(PARTS.map((p) => p.code)).size).toBe(PARTS.length);
    const types = new Set(typeList().map((t) => t.type));
    for (const part of PARTS) {
      expect(types.has(part.type), part.code).toBe(true);
      expect(part.source).toMatch(/^https:\/\//);
      const base: ComponentData = { id: "X", type: part.type, params: part.type.endsWith("_cylinder") ? { stroke: "100 mm" } : {} };
      const c = buildComponent(applyPart(base, part));
      if (part.params.flow || part.params.conductance) expect(conductanceOf(c)).toBeGreaterThan(0);
    }
  });

  it("scegliere un codice sostituisce i dati di catalogo e lascia gli altri", () => {
    const part = partByCode("GRLA-1/8-QS-8-D")!;
    const before: ComponentData = { id: "RF1", type: "one_way_flow_control",
      params: { conductance: "0.15 dm3/(s·bar)", opening: "40 %" } };
    const after = applyPart(before, part);
    expect(after.code).toBe("GRLA-1/8-QS-8-D");
    expect(after.params).toEqual({ opening: "40 %", flow: "475 Nl/min", free_conductance: part.params.free_conductance, max_pressure: "10 bar" });
    // C ricavata da Qn con b = 0,5 (circa 475 / 295 ≈ 1,6 dm³/(s·bar)), poi il 40 %
    expect(conductanceOf(buildComponent(after))).toBeCloseTo(0.4 * conductanceFromFlow(q("475 Nl/min").si, 0.5), 12);
    expect(conductanceOf(buildComponent(after)) / 1e-8).toBeCloseTo(0.4 * 1.6, 1);
  });

  it("le valvole impostano funzione e comandi", () => {
    const after = applyPart({ id: "V1", type: "directional_valve", function: "3/2" }, partByCode("SY5220")!);
    expect([after.function, after.actuation_14, after.actuation_12]).toEqual(["5/2", "solenoid_pilot", "solenoid_pilot"]);
    expect(partsFor("directional_valve").length).toBeGreaterThan(3);
    expect(partsFor("silencer")).toEqual([]);
  });
});
