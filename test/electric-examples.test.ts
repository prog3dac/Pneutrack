// Esempi elettropneumatici: validi e funzionanti in simulazione.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const load = (name: string) => JSON.parse(readFileSync(`src/examples/${name}.json`, "utf8"));
function sim(name: string) {
  const doc = load(name);
  const a = analyze(doc);
  expect(a.issues.map((i) => `${i.code}: ${i.message}`)).toEqual([]);
  const r = compileSim(doc);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}
const out = (s: Simulator, id = "C1") => s.cylinder(id)!.fraction;
/** Avanza finché la condizione è vera; restituisce il tempo simulato o lancia l'errore dopo `max` secondi. */
function until(s: Simulator, cond: () => boolean, max = 5) {
  const t0 = s.t;
  while (!cond()) {
    if (s.t - t0 > max) throw new Error(`condizione non raggiunta in ${max} s`);
    s.advance(0.005);
  }
  return s.t;
}

describe("esempi elettropneumatici", () => {
  it("marcia e arresto con autoritenuta", () => {
    const s = sim("elettro_autoritenuta");
    s.setSwitch("S1", true); s.advance(0.05); s.setSwitch("S1", false);
    until(s, () => out(s) > 0.99);
    expect(s.electricState()!.energized.has("H1")).toBe(true);
    s.advance(0.5);
    expect(out(s)).toBeGreaterThan(0.99);
    s.setSwitch("S0", true); s.advance(0.05); s.setSwitch("S0", false);
    until(s, () => out(s) < 0.01);
    expect(s.electricState()!.energized.size).toBe(0);
  });

  it("ciclo automatico A+ A- con finecorsa elettrici", () => {
    const s = sim("elettro_ciclo_finecorsa");
    s.setSwitch("S1", true);
    for (let i = 0; i < 3; i++) {
      until(s, () => out(s) > 0.99);
      until(s, () => out(s) < 0.01);
    }
    s.setSwitch("S1", false);
    s.advance(1.5);
    expect(out(s)).toBeLessThan(0.01);
  });

  it("sequenza A+ B+ B- A- con relè di memoria, in ciclo continuo", () => {
    const s = sim("elettro_sequenza_rele");
    s.setSwitch("S1", true);
    const steps: string[] = [];
    let a = 0, b = 0;
    const t0 = s.t;
    while (s.t - t0 < 6 && steps.length < 8) {
      s.advance(0.005);
      const na = out(s, "C1") > 0.99 ? 1 : out(s, "C1") < 0.01 ? 0 : a;
      const nb = out(s, "C2") > 0.99 ? 1 : out(s, "C2") < 0.01 ? 0 : b;
      if (na !== a) steps.push(na ? "A+" : "A-");
      if (nb !== b) steps.push(nb ? "B+" : "B-");
      a = na; b = nb;
    }
    expect(steps).toEqual(["A+", "B+", "B-", "A-", "A+", "B+", "B-", "A-"]);
    expect(s.electricState()!.oscillating).toEqual([]);
  });

  it("sosta a fine corsa con temporizzatore, sensore e pressostato", () => {
    const s = sim("elettro_temporizzatore");
    s.setSwitch("S1", true); s.advance(0.05); s.setSwitch("S1", false);
    const tOut = until(s, () => out(s) > 0.99);
    until(s, () => s.electricState()!.energized.has("H1"), 2);
    const tBack = until(s, () => out(s) < 0.99, 3);
    expect(tBack - tOut).toBeGreaterThan(0.95);
    expect(tBack - tOut).toBeLessThan(1.3);
    until(s, () => out(s) < 0.01);
    s.advance(0.5);
    expect(out(s)).toBeLessThan(0.01); // il ciclo non riparte da solo
  });
});
