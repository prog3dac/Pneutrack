import { describe, expect, it } from "vitest";
import { P_ATM, RHO_ANR } from "../src/solver/constants";
import { cFromDm3, iso6358MassFlow, signedFlow } from "../src/solver/flow";

describe("ISO 6358", () => {
  const C = cFromDm3(2);
  it("flusso sonico indipendente dalla pressione a valle", () => {
    const pu = 7e5;
    const m = iso6358MassFlow(pu, 1e5, C, 0.35);
    expect(m).toBeCloseTo(C * RHO_ANR * pu, 8);
    expect(iso6358MassFlow(pu, 2e5, C, 0.35)).toBeCloseTo(m, 8);
  });
  it("flusso nullo senza differenza di pressione", () => {
    expect(iso6358MassFlow(5e5, 5e5, C, 0.35)).toBe(0);
  });
  it("continuo al rapporto critico e decrescente nel subsonico", () => {
    const pu = 6e5, b = 0.4;
    const atB = iso6358MassFlow(pu, pu * b, C, b);
    const justAbove = iso6358MassFlow(pu, pu * (b + 1e-6), C, b);
    expect(justAbove).toBeCloseTo(atB, 6);
    expect(iso6358MassFlow(pu, pu * 0.9, C, b)).toBeLessThan(atB);
  });
  it("segno coerente con il verso", () => {
    expect(signedFlow(6e5, P_ATM, C, 0.35)).toBeGreaterThan(0);
    expect(signedFlow(P_ATM, 6e5, C, 0.35)).toBeLessThan(0);
  });
});
