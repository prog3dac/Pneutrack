import { describe, expect, it } from "vitest";
import { geometry } from "../src/ui/symbols";
import type { ComponentData } from "../src/model/components";

const rects = (svg: string) => [...svg.matchAll(/<rect x="([-\d.e]+)" y="([-\d.e]+)" width="([-\d.e]+)" height="([-\d.e]+)"(?: class="(\w+)")?/g)]
  .map((m) => ({ x: +m[1]!, w: +m[3]!, h: +m[4]!, cls: m[5] }));
const thick = (svg: string) => [...svg.matchAll(/<line x1="([-\d.e]+)"[^>]*class="thick"/g)].map((m) => +m[1]!);

const cases: [string, string][] = [
  ["single_acting_cylinder", "none"],
  ...["none", "cap", "rod", "both"].flatMap((c): [string, string][] => [["double_acting_cylinder", c], ["double_rod_cylinder", c]]),
];

describe("simbolo del cilindro in simulazione", () => {
  for (const [type, cushioning] of cases) {
    it(`${type} (ammortizzo ${cushioning}): pistone dentro la camicia, stelo sempre sporgente`, () => {
      for (let f = 0; f <= 1.0001; f += 0.05) {
        const comp = { id: "1A", type, params: {}, cushioning } as unknown as ComponentData;
        const svg = geometry(comp, { stroke: f }).svg;
        const [body, ...others] = rects(svg);
        const piston = thick(svg);
        expect(piston).toHaveLength(1);
        expect(piston[0]).toBeGreaterThan(body!.x);
        expect(piston[0]).toBeLessThan(body!.x + body!.w);
        // tamponi degli ammortizzi (rettangoli alti 12) dentro la camicia
        for (const p of others.filter((r) => r.cls === "body" && r.h === 12)) {
          expect(p.x).toBeGreaterThan(body!.x);
          expect(p.x + p.w).toBeLessThan(body!.x + body!.w);
        }
        const rods = others.filter((r) => r.cls === "rod");
        expect(Math.max(...rods.map((r) => r.x + r.w))).toBeGreaterThan(body!.x + body!.w);
        if (type === "double_rod_cylinder") expect(Math.min(...rods.map((r) => r.x))).toBeLessThan(body!.x);
      }
    });
  }
});
