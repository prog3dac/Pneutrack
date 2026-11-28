// Finecorsa a quote intermedie e scheda «Sensori e finecorsa» del cilindro.
import { describe, expect, it } from "vitest";
import { extractFragment, insertFragment } from "../src/model/blocks";
import { camLabel, camPressed, camCylinder, formatCam, parseCam, renameCam } from "../src/model/cams";
import { normalizeCircuit } from "../src/model/circuit";
import { buildComponent, type ComponentData } from "../src/model/components";
import {
  applyLinkChanges, linkChanges, linkSummary, linkTargets, rowCam, rowOf, rowProblem, type LinkRow,
} from "../src/model/cylinderLinks";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";
import { geometry } from "../src/ui/symbols";

type C = ComponentData;
const src = (): C => ({ id: "P", type: "pressure_source", params: { pressure: "6 bar" } });
const valve = (): C => ({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" });
const cyl = (): C => ({ id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } });
const roller = (cam: string, act = "mechanical"): C =>
  ({ id: "S1", type: "directional_valve", function: "3/2", actuation_14: act, actuation_12: "spring", cam_14: cam });

function sim(components: C[], wires: [string, string][]) {
  const r = compileSim({ components, connections: wires.map(([from, to]) => ({ from, to })) });
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}
const pneu: [string, string][] = [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]];

/** Fa uscire e rientrare C1 e annota dove (in mm) `on` era vero, nei due versi. */
function stroke(s: Simulator, on: () => boolean) {
  const seen = { out: [] as number[], back: [] as number[] };
  s.setCommand("V1", "14", true);
  // passi brevi: senza carico lo stelo corre a circa 2,5 m/s e la camma è lunga 4 mm
  for (let i = 0; i < 4000; i++) { s.advance(0.0002); if (on()) seen.out.push(s.cylinder("C1")!.x * 1000); }
  expect(s.cylinder("C1")!.fraction).toBe(1);
  s.setCommand("V1", "14", false);
  for (let i = 0; i < 4000; i++) { s.advance(0.0002); if (on()) seen.back.push(s.cylinder("C1")!.x * 1000); }
  expect(s.cylinder("C1")!.fraction).toBe(0);
  return seen;
}

describe("riferimento del finecorsa", () => {
  it("legge e scrive fine corsa e quote, con o senza verso", () => {
    expect(parseCam("C1+")).toEqual({ cylinder: "C1", end: "+" });
    expect(parseCam("C1-")).toEqual({ cylinder: "C1", end: "-" });
    expect(parseCam("C1@80 mm")).toEqual({ cylinder: "C1", at: 0.08 });
    expect(parseCam("C1@80")!.at).toBeCloseTo(0.08, 12);
    expect(parseCam("1A1+@0,05 m")).toEqual({ cylinder: "1A1", at: 0.05, dir: "+" });
    expect(parseCam("C1-@12.5mm")).toEqual({ cylinder: "C1", at: 0.0125, dir: "-" });
    for (const bad of ["C1", "C1@", "C1@3 bar", "C1@-5 mm", "", "@80"]) expect(parseCam(bad), bad).toBeNull();
    expect(formatCam({ cylinder: "C1", at: 0.08 })).toBe("C1@80 mm");
    expect(formatCam({ cylinder: "C1", at: 0.0125, dir: "-" })).toBe("C1-@12.5 mm");
    expect(formatCam({ cylinder: "C1", end: "-" })).toBe("C1-");
    expect(camLabel("C1+@80 mm")).toBe("C1+@80");
    expect(camLabel("C1-")).toBe("C1-");
  });

  it("la rinomina del cilindro tocca solo la sigla", () => {
    const ren = (id: string) => (id === "C1" ? "C7" : id);
    expect(renameCam("C1+", ren)).toBe("C7+");
    expect(renameCam("C1-@80 mm", ren)).toBe("C7-@80 mm");
    expect(renameCam("C12@80 mm", ren)).toBe("C12@80 mm");
    expect(camCylinder("C9-@3 mm")).toBe("C9");
  });

  it("i componenti accettano le quote e rifiutano i testi non validi", () => {
    expect(buildComponent({ id: "S2", type: "limit_switch", cam: "C1@40 mm" }).cam).toEqual({ cylinder: "C1", at: 0.04 });
    expect(buildComponent(roller("C1+@40 mm", "roller_oneway")).cam_14).toEqual({ cylinder: "C1", at: 0.04, dir: "+" });
    expect(() => buildComponent({ id: "S2", type: "limit_switch", cam: "C1@x" })).toThrow(/C1@80 mm/);
  });

  it("zone di azionamento: fine corsa come prima, ±2 mm attorno alla quota intermedia", () => {
    const S = 0.1;
    expect(camPressed({ cylinder: "C", end: "+" }, "roller", 0.0985, 0, S)).toBe(true);
    expect(camPressed({ cylinder: "C", end: "+" }, "roller", 0.0975, 0, S)).toBe(false);
    expect(camPressed({ cylinder: "C", end: "-" }, "oneway", 0.004, -0.1, S)).toBe(true);
    expect(camPressed({ cylinder: "C", end: "-" }, "oneway", 0.004, 0.1, S)).toBe(false);
    const mid = { cylinder: "C", at: 0.05 };
    expect(camPressed(mid, "roller", 0.0519, 0, S)).toBe(true);
    expect(camPressed(mid, "roller", 0.0521, 0, S)).toBe(false);
    expect(camPressed(mid, "oneway", 0.05, -0.2, S)).toBe(true); // senza verso: in entrambi
    expect(camPressed({ ...mid, dir: "+" }, "oneway", 0.05, -0.2, S)).toBe(false);
    expect(camPressed({ ...mid, dir: "+" }, "oneway", 0.05, 0.2, S)).toBe(true);
    expect(camPressed({ ...mid, dir: "+" }, "oneway", 0.05, 0, S)).toBe(false); // fermo: la leva non scatta
  });
});

describe("simulazione con le quote intermedie", () => {
  it("valvola a rullo a metà corsa: commuta al passaggio, nei due versi", () => {
    const s = sim([src(), valve(), cyl(), roller("C1@50 mm"), { id: "M", type: "pressure_gauge" }],
      [...pneu, ["P.1", "S1.1"], ["S1.2", "M.1"]]);
    const seen = stroke(s, () => s.valvePosition("S1") === "14");
    expect(seen.out.length).toBeGreaterThan(0);
    expect(seen.back.length).toBeGreaterThan(0);
    for (const x of [...seen.out, ...seen.back]) expect(Math.abs(x - 50)).toBeLessThanOrEqual(2.5);
    expect(s.valvePosition("S1")).toBe("12");
  });

  it("leva unidirezionale a una quota: scatta solo nel verso indicato", () => {
    for (const [dir, out, back] of [["+", true, false], ["-", false, true]] as const) {
      const s = sim([src(), valve(), cyl(), roller(`C1${dir}@30 mm`, "roller_oneway"), { id: "M", type: "pressure_gauge" }],
        [...pneu, ["P.1", "S1.1"], ["S1.2", "M.1"]]);
      const seen = stroke(s, () => s.valvePosition("S1") === "14");
      expect(seen.out.length > 0, `${dir} in uscita`).toBe(out);
      expect(seen.back.length > 0, `${dir} in rientro`).toBe(back);
    }
  });

  it("finecorsa elettrico e sensore a una quota; il sensore delle versioni precedenti funziona come prima", () => {
    const s = sim([src(), valve(), cyl(), { id: "G", type: "electric_supply", params: { voltage: "24 V" } },
      { id: "S2", type: "limit_switch", contact: "no", cam: "C1@60 mm" },
      { id: "B1", type: "proximity_sensor", cam: "C1@20 mm", params: { range: "2 mm" } },
      { id: "B2", type: "proximity_sensor", cam: "C1+", params: { position: "70 mm" } },
      { id: "H1", type: "signal_lamp" }, { id: "H2", type: "signal_lamp" }, { id: "H3", type: "signal_lamp" }],
    [...pneu, ["G.+", "S2.13"], ["S2.14", "H1.X1"], ["H1.X2", "G.0V"],
     ["G.+", "B1.BN"], ["B1.BU", "G.0V"], ["B1.BK", "H2.X1"], ["H2.X2", "G.0V"],
     ["G.+", "B2.BN"], ["B2.BU", "G.0V"], ["B2.BK", "H3.X1"], ["H3.X2", "G.0V"]]);
    const lit = (id: string) => s.electricState()!.energized.has(id);
    const at = { H1: [] as number[], H2: [] as number[], H3: [] as number[] };
    s.setCommand("V1", "14", true);
    for (let i = 0; i < 800; i++) {
      s.advance(0.0005);
      const x = s.cylinder("C1")!.x * 1000;
      for (const h of ["H1", "H2", "H3"] as const) if (lit(h)) at[h].push(x);
    }
    expect(at.H1.length && at.H2.length && at.H3.length).toBeTruthy();
    // il circuito elettrico si aggiorna ogni millisecondo: a 2,5 m/s lo stelo fa ancora fino a 2,5 mm
    for (const x of at.H1) expect(Math.abs(x - 60)).toBeLessThanOrEqual(2 + 2.6);
    for (const x of at.H2) expect(Math.abs(x - 20)).toBeLessThanOrEqual(2 + 2.6);
    for (const x of at.H3) expect(Math.abs(x - 70)).toBeLessThanOrEqual(3 + 2.6);
  });

  it("validazione: quota oltre la corsa e cilindro mancante", () => {
    const codes = (comps: C[]) => analyze({ components: comps, connections: [] }).issues
      .filter((i) => i.code === "INVALID_CAM").map((i) => i.message);
    expect(codes([cyl(), roller("C1@100 mm")])).toEqual([]);
    expect(codes([cyl(), roller("C1@120 mm")])[0]).toMatch(/120 mm è oltre la corsa di C1/);
    expect(codes([cyl(), { id: "S2", type: "limit_switch", cam: "C1@101 mm" }])[0]).toMatch(/oltre la corsa/);
    expect(codes([cyl(), { id: "B1", type: "proximity_sensor", cam: "C1+", params: { position: "150 mm" } }])[0]).toMatch(/oltre la corsa/);
    expect(codes([roller("C9@10 mm")])[0]).toMatch(/C9@10 mm non corrisponde/);
  });

  it("la sigla accanto al simbolo mostra la quota", () => {
    expect(geometry(roller("C1@50 mm")).svg).toContain(">C1@50<");
    expect(geometry({ id: "S2", type: "limit_switch", cam: "C1-@25 mm" }).svg).toContain(">C1-@25<");
    expect(geometry({ id: "B1", type: "proximity_sensor", cam: "C1+" }).svg).toContain(">C1+<");
  });
});

describe("copia e incolla", () => {
  it("finecorsa elettrici e sensori seguono il cilindro copiato (prima restavano sull'originale)", () => {
    const d = normalizeCircuit({
      components: [cyl(), { id: "S2", type: "limit_switch", cam: "C1-@25 mm" }, { id: "B1", type: "proximity_sensor", cam: "C1+" },
        { id: "S3", type: "limit_switch", cam: "C1+" }, roller("C1@50 mm")],
      connections: [], layout: {},
    });
    const frag = extractFragment(d, ["C1", "S2", "B1", "S1"]);
    const gen = (type: string, taken: Set<string>) => {
      const p = type.includes("cylinder") ? "C" : type === "proximity_sensor" ? "B" : "S";
      let n = 1;
      while (taken.has(`${p}${n}`)) n++;
      return `${p}${n}`;
    };
    const ids = insertFragment(d, frag, { x: 0, y: 0 }, gen);
    const byId = (id: string) => d.components.find((c) => c.id === id)!;
    const [c2, s, b, v] = ids.map(byId);
    expect(c2!.id).toBe("C2");
    expect(s!.cam).toBe("C2-@25 mm");
    expect(b!.cam).toBe("C2+");
    expect(v!.cam_14).toBe("C2@50 mm");
    expect(byId("S3").cam).toBe("C1+");
  });
});

describe("scheda Sensori e finecorsa", () => {
  const comps = (): C[] => [
    cyl(), { id: "C2", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "200 mm" } },
    { id: "S1", type: "limit_switch", contact: "no", cam: "C1-" },
    { id: "S2", type: "limit_switch", contact: "no", switch_actuation: "roller_oneway" },
    { id: "B1", type: "proximity_sensor", cam: "C1+", params: { position: "80 mm", range: "2 mm" } },
    { id: "V3", type: "directional_valve", function: "5/2", actuation_14: "mechanical", actuation_12: "pilot", aux_12: "roller_oneway", cam_14: "C2+" },
    { id: "V4", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "R1", type: "roller_flow_control", cam_14: "C1@90 mm" },
  ];

  it("elenca gli elementi azionabili, lato per lato per le valvole", () => {
    const t = linkTargets(comps());
    expect(t.map((x) => `${x.key}:${x.kind}`)).toEqual(
      ["S1:roller", "S2:oneway", "B1:sensor", "V3.14:roller", "V3.12:oneway", "R1.14:roller"]);
    expect(t.find((x) => x.key === "S2")!.label).toBe("S2 · finecorsa NA unidirezionale");
  });

  it("righe: fine corsa, quote, e sensore delle versioni precedenti con la quota nel parametro", () => {
    const t = new Map(linkTargets(comps()).map((x) => [x.key, x]));
    expect(rowOf(t.get("S1")!)).toMatchObject({ mode: "-" });
    expect(rowOf(t.get("B1")!)).toMatchObject({ mode: "at", at: "80", range: "2 mm" });
    expect(rowOf(t.get("R1.14")!)).toMatchObject({ mode: "at", at: "90" });
    expect(linkSummary(t.get("B1")!, 0.1)).toBe("C1 a 80 mm dal fondello (80 %)");
    expect(linkSummary(t.get("S1")!, 0.1)).toMatch(/fine corsa in rientro/);
    const r: LinkRow = { key: "S2", mode: "at", at: "40", dir: "-", range: "" };
    expect(rowCam("C1", r, "oneway")).toBe("C1-@40 mm");
    expect(rowCam("C1", r, "roller")).toBe("C1@40 mm");
    expect(rowProblem({ ...r, at: "140" }, 0.1)).toMatch(/oltre la corsa/);
    expect(rowProblem({ ...r, at: "4x" }, 0.1)).toMatch(/non è una misura/);
  });

  it("Applica riporta negli elementi solo ciò che cambia, e un elemento passa da un cilindro all'altro", () => {
    const data = comps();
    const targets = linkTargets(data);
    const before = targets.filter((x) => x.cam && camCylinder(x.cam) === "C1").map(rowOf);
    expect(before.map((r) => r.key)).toEqual(["S1", "B1", "R1.14"]);
    // nessuna modifica: niente da riportare, nemmeno nel sensore delle versioni precedenti
    expect(linkChanges("C1", targets, before, before.map((r) => ({ ...r })))).toEqual([]);
    const after: LinkRow[] = [
      { ...before[0]!, mode: "at", at: "10" },                       // S1 da fine corsa a 10 mm
      { ...before[1]!, range: "4" },                                  // B1: solo il campo
      { key: "V3.14", mode: "-", at: "", dir: "", range: "" },        // V3.14 passa da C2 a C1
    ];                                                                // R1 tolto
    const ch = linkChanges("C1", targets, before, after);
    expect(ch).toEqual([
      { key: "R1.14", cam: null },
      { key: "S1", cam: "C1@10 mm" },
      { key: "B1", cam: "C1@80 mm", range: "4 mm" },
      { key: "V3.14", cam: "C1-" },
    ]);
    const get = (id: string) => data.find((c) => c.id === id);
    applyLinkChanges(get, ch);
    expect(get("S1")!.cam).toBe("C1@10 mm");
    expect(get("B1")!.cam).toBe("C1@80 mm");
    expect(get("B1")!.params).toEqual({ range: "4 mm" }); // la posizione ora sta nel riferimento
    expect(get("V3")!.cam_14).toBe("C1-");
    expect(get("R1")!.cam_14).toBeUndefined();
    // gli elementi riscritti restano validi
    for (const c of data) expect(() => buildComponent(c), c.id).not.toThrow();
  });
});
