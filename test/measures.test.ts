// Misure in simulazione: aria consumata, tempi di corsa e cicli.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSim } from "../src/sim/network";
import { cycles, strokes, summarize } from "../src/sim/measures";
import { Recorder, type Channel, type Sample } from "../src/sim/recorder";
import { Simulator } from "../src/sim/simulator";
import { renderDiagram } from "../src/ui/diagram";

function load(name: string) {
  const r = compileSim(JSON.parse(readFileSync(`src/examples/${name}.json`, "utf8")));
  if (!r.ok) throw new Error(r.errors.join("; "));
  return { s: new Simulator(r.network) };
}

describe("aria consumata", () => {
  it("parte da zero, cresce col riempimento e resta ferma a impianto in pressione", () => {
    const { s } = load("doppio_effetto_bistabile");
    expect(s.airUsed()).toBe(0);
    s.advance(1);
    const filled = s.airUsed();
    expect(filled).toBeGreaterThan(0.1);
    expect(s.airFlow()).toBeLessThan(0.1);
    s.advance(1);
    // a impianto fermo resta solo il piccolo trafilamento numerico del riduttore (< 1,2 Nl/min)
    expect(s.airUsed() - filled).toBeLessThan(0.02);
  });

  it("un ciclo di un doppio effetto consuma l'aria delle due camere alla pressione di lavoro", () => {
    const { s } = load("doppio_effetto_bistabile");
    const rec = new Recorder(s);
    const run = (d: number) => { const end = s.t + d; while (s.t < end - 1e-9) { s.advance(0.005); rec.record(s.t); } };
    run(1);
    for (const b of ["S1", "S2", "S1", "S2"]) { s.setCommand(b, "14", true); run(0.3); s.setCommand(b, "14", false); run(1.7); }
    const list = rec.tracker.cycles;
    expect(list).toHaveLength(2);
    // alesaggio 32, stelo 12, corsa 100 a 5 bar: (A1 + A2)·corsa·(5 + 1,013) / 1 bar ≈ 0,90 Nl, più linee e pilotaggi
    for (const c of list) {
      expect(c.air).toBeGreaterThan(0.9);
      expect(c.air).toBeLessThan(1.1);
    }
    const sum = summarize(list);
    expect(sum.meanFlow).toBeCloseTo((sum.meanAir! / sum.meanTime!) * 60, 6);
    // tempi di corsa: due uscite e due rientri di C1, ciascuno dentro il suo ciclo
    const runs = strokes(rec.channels, rec.samples);
    expect(runs.map((r) => r.dir)).toEqual(["+", "-", "+", "-"]);
    for (const r of runs) expect(r.end - r.start).toBeGreaterThan(0.02);
    expect(runs[0]!.start).toBeGreaterThanOrEqual(list[0]!.start);
    expect(runs[1]!.end).toBeLessThanOrEqual(list[0]!.end);
    // nel diagramma: tempi delle corse e fascia dei cicli
    const svg = renderDiagram(rec.channels, rec.samples, "step", 1200, list);
    expect(svg).toContain('class="dg-dur"');
    expect(svg).toContain('data-cycle="2"');
  });

  it("i manometri sono canali in bar con fondo scala dall'alimentazione", () => {
    const { s } = load("ciclo_automatico_finecorsa");
    const rec = new Recorder(s, {}, ["M1"]);
    expect(rec.channels.find((c) => c.id === "M1")).toMatchObject({ kind: "bar", max: 7 });
    s.advance(0.5);
    rec.record(s.t);
    const i = rec.channels.findIndex((c) => c.id === "M1");
    expect(rec.samples[0]!.v[i]).toBeCloseTo(s.gauge("M1.1"), 9);
    expect(renderDiagram(rec.channels, rec.samples, "time", 800)).toContain('data-channel="M1"');
  });
});

describe("corse e cicli dai campioni", () => {
  const ch: Channel[] = [{ id: "A", label: "A", kind: "cyl" }, { id: "B", label: "B", kind: "cyl" }];
  // A+ B+ B- A-, poi fermo, poi di nuovo A+ A-
  const pos = [[0, 0], [0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [1, 0.5], [1, 0], [0.5, 0], [0, 0], [0, 0],
               [0.5, 0], [1, 0], [0.5, 0], [0, 0]];
  const flow = pos.map((_, k) => (k === 0 || k === 10 ? 0 : 5));
  let air = 0;
  const samples: Sample[] = pos.map((v, k) => ({ t: k, v, air: (air += flow[k]!), flow: flow[k]! }));

  it("ogni corsa va dall'ultimo campione a fine corsa al primo all'altro capo", () => {
    expect(strokes(ch, samples).map((r) => `${r.id}${r.dir} ${r.start}-${r.end}`))
      .toEqual(["A+ 1-3", "B+ 3-5", "B- 5-7", "A- 7-9", "A+ 10-12", "A- 12-14"]);
  });

  it("un ciclo dalla partenza dal riposo al ritorno, con l'aria dall'ultimo istante fermo", () => {
    const list = cycles(ch, samples);
    expect(list.map((c) => [c.start, c.end])).toEqual([[1, 9], [10, 14]]);
    expect(list[0]!.air).toBe(samples[9]!.air - samples[0]!.air);
    expect(list[1]!.air).toBe(samples[14]!.air - samples[10]!.air);
  });

  it("partendo a metà corsa non conta cicli", () => {
    expect(cycles(ch, samples.slice(2))).toEqual([]);
  });
});
