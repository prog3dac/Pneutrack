import { describe, expect, it } from "vitest";
import { normalizeCircuit } from "../src/model/circuit";
import { centeredOrigin, drawingArea, parseSheet, sheetRect, sheetSizeMm, smallestFormat, UNITS_PER_MM } from "../src/model/sheet";

describe("fogli di disegno", () => {
  it("dimensioni ISO 216 e orientamento", () => {
    expect(sheetSizeMm({ format: "A4" })).toEqual([297, 210]);
    expect(sheetSizeMm({ format: "A4", orientation: "portrait" })).toEqual([210, 297]);
    expect(sheetSizeMm({ format: "A0" })).toEqual([1189, 841]);
    expect(sheetRect({ format: "A3", origin: [10, 20] })).toEqual({ x: 10, y: 20, w: 420 * UNITS_PER_MM, h: 297 * UNITS_PER_MM });
  });

  it("sceglie il formato più piccolo che contiene il disegno e lo centra", () => {
    const small = { x: 0, y: 0, w: 300, h: 200 };
    expect(smallestFormat(small)).toBe("A4");
    const big = { x: 0, y: 0, w: 2000, h: 1200 };
    const f = smallestFormat(big);
    expect(f).toBe("A1"); // in A2 l'area utile è alta 368 mm (1104 unità)
    const origin = centeredOrigin({ format: f }, big);
    const area = drawingArea({ format: f, origin });
    expect(area.x).toBeLessThanOrEqual(0);
    expect(area.x + area.w).toBeGreaterThanOrEqual(2000);
    expect(smallestFormat({ x: 0, y: 0, w: 1e6, h: 1e6 })).toBe("A0");
  });

  it("legge la chiave sheet dei file e ignora valori non validi", () => {
    expect(parseSheet({ format: "A2", orientation: "portrait", origin: [1, 2], author: "AR", bad: 1 }))
      .toEqual({ format: "A2", orientation: "portrait", origin: [1, 2], author: "AR" });
    expect(parseSheet({ format: "B5" })).toBeNull();
    const doc = normalizeCircuit({ components: [], sheet: { format: "A1" } });
    expect(doc.sheet).toEqual({ format: "A1" });
    expect(normalizeCircuit({ components: [] }).sheet).toBeUndefined();
  });
});
