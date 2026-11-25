import { describe, expect, it } from "vitest";
import { P_ATM } from "../src/solver/constants";
import { defaultParams, simulate } from "../src/solver/cylinderCircuit";

describe("cilindro doppio effetto con 5/2", () => {
  it("estende fino a fine corsa e la pressione sale all'alimentazione", () => {
    const s = simulate(defaultParams, () => 1, 0.5);
    const last = s[s.length - 1]!;
    expect(last.x).toBeCloseTo(defaultParams.stroke, 6);
    expect(last.p1).toBeCloseTo(defaultParams.supplyPressure, -2);
    expect(last.p2).toBeCloseTo(P_ATM, -2);
  });
  it("rientra a zero quando la valvola commuta", () => {
    const s = simulate(defaultParams, (t) => (t < 0.3 ? 1 : 0), 0.8);
    const last = s[s.length - 1]!;
    expect(last.x).toBeCloseTo(0, 6);
    expect(last.p2).toBeCloseTo(defaultParams.supplyPressure, -2);
  });
  it("uno strozzatore di scarico rallenta il movimento", () => {
    const time = (exhaustC: number) => {
      const s = simulate({ ...defaultParams, exhaustC }, () => 1, 2);
      return s.find((p) => p.x >= defaultParams.stroke - 1e-6)!.t;
    };
    expect(time(0.05)).toBeGreaterThan(time(Infinity) * 3);
  });
  it("un carico eccessivo impedisce il movimento", () => {
    const F = ((defaultParams.supplyPressure - P_ATM) * Math.PI * 0.032 ** 2) / 4;
    const s = simulate({ ...defaultParams, load: F * 1.2 }, () => 1, 0.3);
    expect(s[s.length - 1]!.x).toBeLessThan(1e-4);
  });
  it("la pressione resta finita e non negativa (stabilità)", () => {
    const s = simulate(defaultParams, (t) => (Math.floor(t / 0.05) % 2 === 0 ? 1 : 0), 1);
    for (const p of s) {
      expect(Number.isFinite(p.p1) && Number.isFinite(p.p2)).toBe(true);
      expect(p.p1).toBeLessThan(defaultParams.supplyPressure * 1.2);
    }
  });
});
