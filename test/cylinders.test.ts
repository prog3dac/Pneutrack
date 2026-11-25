import { describe, expect, it } from "vitest";
import { CYLINDER_SERIES, seriesOf, STANDARD_BORES, STANDARD_RODS, toMm } from "../src/model/cylinders";

describe("misure normalizzate dei cilindri", () => {
  it("ogni misura delle serie usa alesaggi e steli normalizzati", () => {
    for (const s of CYLINDER_SERIES) {
      for (const { bore, rod } of s.sizes) {
        expect(STANDARD_BORES, `${s.id} Ø${bore}`).toContain(bore);
        expect(STANDARD_RODS, `${s.id} stelo ${rod}`).toContain(rod);
        expect(rod).toBeLessThan(bore);
      }
    }
  });

  it("riconosce la serie anche con unità diverse", () => {
    expect(seriesOf("32 mm", "12 mm").map((s) => s.id)).toEqual(["iso21287", "iso15552"]);
    expect(seriesOf("0.05 m", "20 mm").map((s) => s.id)).toEqual(["iso15552"]);
    expect(seriesOf("33 mm", "12 mm")).toEqual([]);
    expect(seriesOf(undefined, "12 mm")).toEqual([]);
    expect(toMm("1 in")).toBe(25.4);
  });
});
