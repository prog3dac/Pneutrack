// Diagramma delle fasi: registrazione, passi del ciclo e disegno.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSim } from "../src/sim/network";
import { Recorder, RECORD_EVERY, stepTimes, toStep, type Channel, type Sample } from "../src/sim/recorder";
import { Simulator } from "../src/sim/simulator";
import { renderDiagram } from "../src/ui/diagram";

function sim(name: string) {
  const r = compileSim(JSON.parse(readFileSync(`src/examples/${name}.json`, "utf8")));
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}

describe("registrazione", () => {
  it("traccia cilindri, bobine e contatti dei relè", () => {
    const s = sim("elettro_sequenza_rele");
    const rec = new Recorder(s);
    const ids = rec.channels.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["C1", "C2", "Y1", "Y4", "K1:contatti"]));
    expect(rec.channels.find((c) => c.id === "C1")!.kind).toBe("cyl");
    expect(rec.channels.find((c) => c.id === "Y1")!.kind).toBe("bool");
    s.setSwitch("S1", true);
    while (s.t < 4) { s.advance(0.002); rec.record(s.t); }
    // un campione ogni RECORD_EVERY al massimo
    expect(rec.samples.length).toBeLessThanOrEqual(Math.ceil(4 / RECORD_EVERY) + 1);
    const c1 = rec.channels.findIndex((c) => c.id === "C1");
    expect(Math.max(...rec.samples.map((x) => x.v[c1]!))).toBeGreaterThan(0.99);
  });

  it("senza circuito elettrico traccia le valvole", () => {
    const s = sim("doppio_effetto_bistabile");
    const rec = new Recorder(s);
    expect(rec.channels.some((c) => c.kind === "cyl")).toBe(true);
    expect(rec.channels.some((c) => c.kind === "bool")).toBe(true);
  });

  it("riparte da zero se il tempo torna indietro", () => {
    const s = sim("elettro_autoritenuta");
    const rec = new Recorder(s);
    rec.record(0); rec.record(1); rec.record(0.5);
    expect(rec.samples.map((x) => x.t)).toEqual([0.5]);
  });
});

describe("passi del ciclo", () => {
  const ch: Channel[] = [{ id: "A", label: "A", kind: "cyl" }, { id: "B", label: "B", kind: "cyl" }];
  const pos = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [1, 0.5], [1, 0], [0.5, 0], [0, 0]];
  const samples: Sample[] = pos.map((v, k) => ({ t: k, v, air: k, flow: 0 }));

  it("un passo per ogni arrivo a fine corsa: A+ B+ B- A-", () => {
    expect(stepTimes(ch, samples)).toEqual([0, 2, 4, 6, 8]);
  });

  it("toStep è lineare tra un passo e l'altro", () => {
    const times = [0, 2, 4];
    expect(toStep(times, 0)).toBe(0);
    expect(toStep(times, 1)).toBe(0.5);
    expect(toStep(times, 3)).toBe(1.5);
    expect(toStep(times, 9)).toBe(2);
  });

  it("disegna una corsia per canale e la griglia dei passi", () => {
    const svg = renderDiagram(ch, samples, "step", 600);
    expect(svg.match(/class="dg-lane cyl/g)).toHaveLength(2);
    expect(svg).toContain('data-channel="cicli"');
    expect(svg).toContain('data-steps="5"');
    expect(renderDiagram(ch, samples, "time", 600)).toContain("dg-trace");
  });
});
