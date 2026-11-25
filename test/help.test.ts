import { describe, expect, it } from "vitest";
import { typeList } from "../src/model/components";
import { describedOptions, describedParams, FIELD_HELP, optionHelp, paramHelp } from "../src/ui/help";

describe("descrizioni dei campi", () => {
  it("ogni parametro e ogni opzione del catalogo ha una descrizione specifica", () => {
    const params = new Set(describedParams()), options = new Set(describedOptions());
    const missing: string[] = [];
    for (const t of typeList()) {
      for (const p of t.params) {
        if (!params.has(p.name)) missing.push(`${t.type}.${p.name}`);
        expect(paramHelp(t.type, p).length).toBeGreaterThan(30);
      }
      for (const o of t.options ?? []) {
        if (!options.has(o.name)) missing.push(`${t.type}.${o.name} (opzione)`);
        expect(optionHelp(t.type, o).length).toBeGreaterThan(30);
      }
    }
    expect(missing).toEqual([]);
  });

  it("aggiunge unità, obbligatorietà e valore predefinito", () => {
    const h = paramHelp("double_acting_cylinder", { name: "friction", label: "Attrito", dimension: "force",
      required: false, group: "sim", simDefault: "5 N" });
    expect(h).toMatch(/Unità: N/);
    expect(h).toMatch(/Se vuoto: 5 N/);
    expect(paramHelp("x", { name: "bore", label: "Alesaggio", dimension: "length", required: true, group: "catalog" }))
      .toMatch(/Obbligatorio/);
    for (const v of Object.values(FIELD_HELP)) expect(v.length).toBeGreaterThan(30);
  });
});
