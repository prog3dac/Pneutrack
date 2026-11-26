import { describe, expect, it } from "vitest";
import { geometry, rotate } from "../src/ui/symbols";
import { ACTUATIONS, typeList, type ComponentData } from "../src/model/components";

const GRID = 10;

/** Tutte le varianti dei componenti: opzioni predefinite, voci della palette e ogni comando delle valvole. */
function variants(): ComponentData[] {
  const out: ComponentData[] = [];
  for (const d of typeList()) {
    const base: ComponentData = { id: "X", type: d.type };
    for (const o of d.options ?? []) (base as unknown as Record<string, string>)[o.name] = o.default;
    out.push(base);
    for (const p of d.presets ?? []) out.push({ ...base, ...p.options, params: p.params });
    for (const o of d.options ?? []) for (const [v] of o.choices) out.push({ ...base, [o.name]: v });
    if (d.options?.some((o) => o.name === "actuation_14")) {
      for (const a14 of ACTUATIONS) for (const a12 of ACTUATIONS) out.push({ ...base, actuation_14: a14, actuation_12: a12 });
    }
  }
  return out;
}

describe("porte sulla griglia", () => {
  it("ogni porta di ogni simbolo cade su un nodo della griglia, in ogni rotazione e specchiata", () => {
    const off: string[] = [];
    for (const comp of variants()) {
      let ports;
      try { ports = geometry(comp).ports; } catch { continue; }
      for (const [name, p] of Object.entries(ports)) {
        for (const m of [1, -1]) for (let rot = 0; rot < 4; rot++) {
          const [x, y] = rotate([m * p.x, p.y], rot);
          if (x % GRID !== 0 || y % GRID !== 0) off.push(`${comp.type} ${JSON.stringify(comp)} porta ${name} (${p.x}, ${p.y})`);
        }
      }
    }
    expect([...new Set(off)]).toEqual([]);
  });
});
