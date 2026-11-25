import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Schema } from "../src/solver/schema";
import { compile } from "../src/solver/network";
import { simulateNetwork } from "../src/solver/simulate";
import { defaultParams, simulate } from "../src/solver/cylinderCircuit";
import { P_ATM } from "../src/solver/constants";

const example = JSON.parse(readFileSync("examples/cylinder-52.json", "utf8")) as Schema;
const build = (s: Schema) => {
  const r = compile(s);
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
  return r.network;
};

describe("compilatore dello schema", () => {
  it("compila l'esempio senza errori né avvisi", () => {
    const r = compile(example);
    expect(r.ok).toBe(true);
    expect(r.diagnostics).toEqual([]);
  });
  it("segnala porta inesistente, tipo sconosciuto e id duplicati", () => {
    const bad: Schema = {
      version: 1,
      components: [{ id: "X", type: "boh" }, { id: "S", type: "supply" }, { id: "S", type: "supply" }],
      connections: [{ from: "S.out", to: "Q.1" }],
    };
    const r = compile(bad);
    expect(r.ok).toBe(false);
    const msgs = r.diagnostics.map((d) => d.message).join("|");
    expect(msgs).toMatch(/sconosciuto/);
    expect(msgs).toMatch(/duplicato/);
    expect(msgs).toMatch(/inesistente/);
  });
  it("rileva il cortocircuito alimentazione-atmosfera", () => {
    const r = compile({
      version: 1,
      components: [{ id: "S", type: "supply" }, { id: "T", type: "atmosphere" }],
      connections: [{ from: "S.out", to: "T.a" }],
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.message).toMatch(/cortocircuito/);
  });
  it("avvisa se una porta non di scarico è scollegata", () => {
    const r = compile({
      version: 1,
      components: [{ id: "A", type: "cylinderDA" }],
      connections: [],
    });
    expect(r.diagnostics.filter((d) => d.level === "warning")).toHaveLength(2);
  });
});

describe("simulazione da grafo", () => {
  it("coincide con il circuito scritto a mano (stesso modello)", () => {
    const net = build(example);
    const sched = (t: number) => (t < 0.3 ? 1 : 0);
    const g = simulateNetwork(net, { tEnd: 0.6, inputs: (t) => ({ V1: sched(t) }) });
    const h = simulate(defaultParams, sched, 0.6);
    expect(g.samples.length).toBe(h.length);
    let maxDx = 0, maxDp = 0;
    g.samples.forEach((s, i) => {
      maxDx = Math.max(maxDx, Math.abs(s.cylinders.A1!.x - h[i]!.x));
      maxDp = Math.max(maxDp, Math.abs(s.p[net.portNode["A1.cap"]!]! - h[i]!.p1));
    });
    expect(maxDx).toBeLessThan(1e-6);
    expect(maxDp).toBeLessThan(10);
  });

  it("strozzatore sullo scarico (meter-out) rallenta l'estensione", () => {
    // Regolatore montato sul lato stelo: l'aria che esce dalla camera stelo (rod → 1 → 2)
    // è strozzata; in rientro (V1.2 → 2 → 1) passa libera dal ritegno.
    const withThrottle: Schema = {
      ...example,
      nodeVolume_cm3: 1,
      components: [...example.components, { id: "G1", type: "oneWayThrottle", params: { C_dm3_s_bar: 0.05 } }],
      connections: [
        { from: "S1.out", to: "V1.1" },
        { from: "V1.4", to: "A1.cap" },
        { from: "V1.2", to: "G1.2" },
        { from: "G1.1", to: "A1.rod" },
      ],
    };
    const t90 = (s: Schema) => {
      const r = simulateNetwork(build(s), { tEnd: 2, inputs: () => ({ V1: 1 }) });
      return r.samples.find((x) => x.cylinders.A1!.x >= 0.099)?.t ?? Infinity;
    };
    expect(t90(withThrottle)).toBeGreaterThan(t90(example) * 2);
  });

  it("uno stesso nodo con due cilindri in parallelo li fa muovere insieme", () => {
    const s: Schema = {
      version: 1,
      nodeVolume_cm3: 0.5,
      components: [
        { id: "S1", type: "supply" },
        { id: "V1", type: "valve52" },
        { id: "A1", type: "cylinderDA" },
        { id: "A2", type: "cylinderDA" },
      ],
      connections: [
        { from: "S1.out", to: "V1.1" },
        { from: "V1.4", to: "A1.cap" },
        { from: "V1.4", to: "A2.cap" },
        { from: "V1.2", to: "A1.rod" },
        { from: "V1.2", to: "A2.rod" },
      ],
    };
    const r = simulateNetwork(build(s), { tEnd: 0.5, inputs: () => ({ V1: 1 }) });
    const last = r.samples.at(-1)!;
    expect(last.cylinders.A1!.x).toBeCloseTo(0.1, 5);
    expect(last.cylinders.A2!.x).toBeCloseTo(0.1, 5);
    expect(last.p[build(s).portNode["A1.rod"]!]).toBeCloseTo(P_ATM, -2);
  });
});
