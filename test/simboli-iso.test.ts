import { describe, expect, it } from "vitest";
import type { CircuitDoc } from "../src/model/circuit";
import { buildComponent, type ComponentData } from "../src/model/components";
import { billOfMaterials } from "../src/model/bom";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";
import { geometry } from "../src/ui/symbols";

const doc = (components: CircuitDoc["components"], connections: [string, string][]) =>
  ({ components, connections: connections.map(([from, to]) => ({ from, to })) });

function sim(d: Parameters<typeof compileSim>[0]) {
  const r = compileSim(d);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return new Simulator(r.network);
}

const P = { id: "P", type: "pressure_source", params: { pressure: "6 bar" } };
const cyl = (extra: Partial<ComponentData> = {}): ComponentData =>
  ({ id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" }, ...extra });

describe("comando manuale ausiliario", () => {
  const d = (override: string) => doc(
    [P, { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring", override }, cyl()],
    [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]],
  );
  it("aziona la valvola senza eccitare il solenoide", () => {
    const s = sim(d("push"));
    s.setOverride("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("14");
    s.advance(0.5);
    expect(s.cylinder("C1")!.fraction).toBe(1);
    s.setOverride("V1", "14", false);
    expect(s.valvePosition("V1")).toBe("12");
  });
  it("senza opzione il comando manuale non fa nulla", () => {
    const s = sim(d("none"));
    s.setOverride("V1", "14", true);
    expect(s.valvePosition("V1")).toBe("12");
  });
  it("si disegna oltre il solenoide e solo sui lati elettrici", () => {
    const g = geometry({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring", override: "detent" });
    expect(g.svg.match(/data-override="1"/g)).toHaveLength(1);
    const manual = geometry({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "manual", actuation_12: "spring", override: "push" });
    expect(manual.svg).not.toContain("data-override");
  });
  it("compare in distinta", () => {
    const rows = billOfMaterials({ components: [{ id: "V1", type: "directional_valve", override: "push" }] });
    expect(rows[0]!.description).toContain("comando manuale ausiliario");
  });
});

describe("rubinetto e valvola di sezionamento", () => {
  it("il rubinetto parte aperto e un clic lo chiude", () => {
    const s = sim(doc([P, { id: "RB1", type: "shutoff_valve" }, { id: "M1", type: "pressure_gauge" }],
      [["P.1", "RB1.1"], ["RB1.2", "M1.1"]]));
    s.advance(0.05);
    expect(s.gauge("M1.1")).toBeGreaterThan(5.9);
    s.setCommand("RB1", "14", false);
    expect(s.valvePosition("RB1")).toBe("12");
  });
  it("la valvola di sezionamento chiusa scarica l'impianto a valle", () => {
    const s = sim(doc([P, { id: "SZ1", type: "lockout_valve" }, { id: "SB1", type: "air_reservoir", params: { volume: "0.1 l" } }],
      [["P.1", "SZ1.1"], ["SZ1.2", "SB1.1"]]));
    s.advance(0.3);
    expect(s.gauge("SB1.1")).toBeGreaterThan(5.9);
    s.setCommand("SZ1", "14", false);
    s.advance(0.5);
    expect(s.gauge("SB1.1")).toBeLessThan(0.1);
  });
});

describe("strozzatore fisso e avviamento progressivo", () => {
  it("l'ugello ricava la conduttanza dal diametro: più piccolo, più lento", () => {
    const fill = (dia: string) => {
      const s = sim(doc([P, { id: "U1", type: "fixed_orifice", params: { diameter: dia } },
        { id: "SB1", type: "air_reservoir", params: { volume: "0.1 l" } }], [["P.1", "U1.1"], ["U1.2", "SB1.1"]]));
      s.advance(0.1);
      return s.gauge("SB1.1");
    };
    expect(fill("0.5 mm")).toBeLessThan(fill("1 mm"));
    expect(fill("1 mm")).toBeGreaterThan(0);
  });
  it("la valvola di avviamento riempie piano e poi apre del tutto", () => {
    const run = (type: string) => {
      const s = sim(doc([P, { id: "A1", type }, { id: "SB1", type: "air_reservoir", params: { volume: "1 l" } }],
        [["P.1", "A1.1"], ["A1.2", "SB1.1"]]));
      s.advance(0.05);
      const early = s.gauge("SB1.1");
      s.advance(3);
      return { early, late: s.gauge("SB1.1") };
    };
    const soft = run("soft_start_valve"), plain = run("shutoff_valve");
    expect(soft.early).toBeLessThan(plain.early / 2);
    expect(soft.late).toBeGreaterThan(5.9);
  });
});

describe("doppia non ritorno pilotata", () => {
  // carico che spinge lo stelo indietro: con la 5/3 al centro in scarico il cilindro rientrerebbe
  const loaded = cyl({ params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm", load: "100 N" } });
  const valve = { id: "V1", type: "directional_valve", function: "5/3E", actuation_14: "solenoid", actuation_12: "solenoid" };
  const run = (withCheck: boolean) => {
    const s = sim(withCheck
      ? doc([P, valve, { id: "NRD1", type: "double_pilot_check" }, loaded],
        [["P.1", "V1.1"], ["V1.4", "NRD1.1"], ["NRD1.2", "C1.A"], ["V1.2", "NRD1.3"], ["NRD1.4", "C1.B"]])
      : doc([P, valve, loaded], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]));
    s.setCommand("V1", "14", true);
    while (s.cylinder("C1")!.fraction < 0.5 && s.t < 2) s.advance(0.005);
    s.setCommand("V1", "14", false);
    s.advance(0.3);
    const held = s.cylinder("C1")!.fraction;
    s.advance(1);
    return { held, after: s.cylinder("C1")!.fraction };
  };
  it("con la valvola al centro tiene fermo il cilindro sotto carico", () => {
    const r = run(true);
    expect(r.held).toBeGreaterThan(0.3);
    expect(Math.abs(r.after - r.held)).toBeLessThan(0.01);
  });
  it("senza, lo stesso cilindro rientra", () => {
    expect(run(false).after).toBeLessThan(0.05);
  });
});

describe("cilindro senza stelo, pinza e pistone magnetico", () => {
  it("il cilindro senza stelo esce e rientra", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "C1", type: "rodless_cylinder", params: { bore: "25 mm", stroke: "200 mm" } }],
      [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]));
    s.setCommand("V1", "14", true);
    s.advance(1);
    expect(s.cylinder("C1")!.fraction).toBe(1);
  });
  it("la pinza a semplice effetto chiude con l'aria e riapre con la molla", () => {
    const s = sim(doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "PZ1", type: "gripper", gripper_kind: "single", params: { bore: "16 mm", stroke: "5 mm" } }],
      [["P.1", "V1.1"], ["V1.2", "PZ1.A"]]));
    s.setCommand("V1", "14", true);
    s.advance(0.3);
    expect(s.cylinder("PZ1")!.fraction).toBe(1);
    s.setCommand("V1", "14", false);
    s.advance(0.5);
    expect(s.cylinder("PZ1")!.fraction).toBe(0);
  });
  it("un sensore può indicare la pinza; il pistone magnetico compare nel simbolo e in distinta", () => {
    expect(analyze(doc([{ id: "PZ1", type: "gripper", params: { bore: "16 mm", stroke: "5 mm" } },
      { id: "B1", type: "proximity_sensor", cam: "PZ1+" }], [])).issues.filter((i) => i.code === "INVALID_CAM")).toEqual([]);
    expect(geometry(cyl({ magnet: "yes" })).svg).toContain("magnet");
    expect(geometry(cyl()).svg).not.toContain("magnet");
    const rows = billOfMaterials({ components: [cyl({ magnet: "yes" })] });
    expect(rows[0]!.description).toBe("Cilindro doppio effetto pistone magnetico");
    expect(geometry({ id: "PZ1", type: "gripper", gripper_kind: "single" }).ports).not.toHaveProperty("B");
  });
});

describe("vuoto", () => {
  const d = doc([P, { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "solenoid", actuation_12: "spring" },
    { id: "EV1", type: "vacuum_ejector" }, { id: "VT1", type: "suction_cup", params: { diameter: "20 mm" } }],
  [["P.1", "V1.1"], ["V1.2", "EV1.1"], ["EV1.2", "VT1.1"]]);
  it("l'eiettore alimentato fa il vuoto nella ventosa, e senz'aria la ventosa torna in atmosfera", () => {
    const s = sim(d);
    s.setCommand("V1", "14", true);
    s.advance(0.5);
    expect(s.gauge("VT1.1")).toBeLessThan(-0.7);
    expect(s.gauge("VT1.1")).toBeGreaterThan(-0.86);
    s.setCommand("V1", "14", false);
    s.advance(0.5);
    expect(s.gauge("VT1.1")).toBeGreaterThan(-0.05);
  });
});

describe("innesto rapido", () => {
  const d = (coupling: string, coupling_state: string) => doc(
    [P, { id: "IR1", type: "quick_coupling", coupling, coupling_state }, { id: "SB1", type: "air_reservoir", params: { volume: "0.1 l" } }],
    [["P.1", "IR1.1"], ["IR1.2", "SB1.1"]]);
  it("innestato passa, staccato con non ritorno tiene chiusa l'alimentazione e scarica la spina", () => {
    const on = sim(d("check_one", "coupled"));
    on.advance(0.3);
    expect(on.gauge("SB1.1")).toBeGreaterThan(5.9);
    const off = sim(d("check_one", "uncoupled"));
    off.advance(0.3);
    expect(off.gauge("SB1.1")).toBeLessThan(0.1);
    expect(off.airFlow()).toBeLessThan(1);
  });
  it("staccato senza non ritorno l'alimentazione sfiata", () => {
    const s = sim(d("plain", "uncoupled"));
    s.advance(0.1);
    expect(s.airFlow()).toBeGreaterThan(10);
  });
  it("le varianti si costruiscono e le opzioni non valide sono rifiutate", () => {
    expect(() => buildComponent({ id: "IR1", type: "quick_coupling", coupling: "boh" })).toThrow();
    expect(buildComponent({ id: "IR1", type: "quick_coupling" }).coupling).toBe("check_one");
  });
});

describe("regole quotate della ISO 1219-1 (M = 10)", () => {
  const valve = (fn: string, a14 = "solenoid", a12 = "spring") =>
    geometry({ id: "V", type: "directional_valve", function: fn, actuation_14: a14, actuation_12: a12 });
  it("RF020: porte adiacenti a 2M, anche nelle valvole a cinque vie (casella 6M, 101V8)", () => {
    for (const fn of ["3/2", "4/2", "5/2", "5/3"]) {
      const p = valve(fn).ports;
      for (const row of [["5", "1", "3"], ["4", "2"], ["1", "3"]]) {
        const xs = row.filter((n) => p[n] && p[n]!.y === p[row[0]!]?.y).map((n) => p[n]!.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBe(20);
      }
    }
  });
  it("RF004: l'asse dei comandi sta 1M sopra il bordo inferiore della casella", () => {
    const g = valve("5/2", "pilot", "pilot");
    expect(g.ports["14"]!.y).toBe(10);
    expect(g.ports["12"]!.y).toBe(10);
  });
  it("RF044: porte del cilindro 0,5M dalla camicia, pistone a riposo 1M dal fondello", () => {
    const g = geometry({ id: "C", type: "double_acting_cylinder", params: {} });
    expect(g.svg).toContain('<rect x="-55" y="-15" width="110" height="30" class="body"/>');
    expect(g.ports.A!.x).toBe(-50);
    expect(g.ports.B!.x).toBe(50);
    expect(g.svg).toContain('<line x1="-45" y1="-15" x2="-45" y2="15" class="thick"/>');
  });
  it("5.9: componenti con due funzioni principali in cornice continua, non tratto e punto", () => {
    for (const type of ["one_way_flow_control", "soft_start_valve"]) {
      expect(geometry({ id: "X", type }).svg).not.toContain("dashdot");
    }
    expect(geometry({ id: "X", type: "frl_unit" }).svg).toContain("dashdot"); // 5.10: più componenti in un gruppo
  });
  it("X10080, X10100: l'alimentazione della molla pneumatica è una linea continua", () => {
    for (const a of ["air_return", "air_return_ext"]) {
      const svg = valve("5/2", "solenoid", a).svg;
      const side12 = svg.slice(svg.indexOf('data-side="12"'));
      expect(side12.slice(0, side12.indexOf("</g>"))).not.toContain("dash");
    }
  });
});

describe("non ritorno pilotata (ISO 1219-1 X10720, disegno di ISO 1219-3 allegato A)", () => {
  /** Vertici dello zig-zag della molla: il path con più di 4 punti alternati a ±8. */
  const springPoints = (svg: string) => {
    const d = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]!)
      .find((p) => (p.match(/L/g) ?? []).length >= 4);
    expect(d, "molla a zig-zag").toBeDefined();
    return [...d!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => ({ x: +m[1]!, y: +m[2]! }));
  };
  const g = geometry({ id: "NRP1", type: "pilot_check_valve" });
  const ball = /<circle cx="0" cy="(-?[\d.]+)" r="([\d.]+)"/.exec(g.svg)!;
  const ballY = +ball[1]!, ballR = +ball[2]!;
  const box = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" class="box"/.exec(g.svg)!;
  const [bx, by, bw, bh] = box.slice(1).map(Number) as [number, number, number, number];

  it("la molla sta sull'asse della linea, sopra la sfera, come nel non ritorno con molla", () => {
    const pts = springPoints(g.svg);
    expect(pts.length).toBeGreaterThanOrEqual(5);
    const half = pts[1]!.x;
    expect(half).toBeGreaterThan(3);
    for (const [i, p] of pts.entries()) expect(p.x).toBe(i % 2 ? half : -half); // centrata sull'asse x = 0, alternata
    expect(half * 2).toBeLessThan(bw * 0.6); // più stretta della casella, come nel disegno della norma
    expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(ballY - ballR); // tutta sopra la sfera (lato di 2)
    expect(Math.min(...pts.map((p) => p.y))).toBeGreaterThan(by); // dentro il corpo
    // la molla occupa la parte alta della casella: almeno un terzo della sua altezza
    expect(Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))).toBeGreaterThan(bh / 3);
  });

  it("la casella è centrata sull'asse: la linea sporge uguale sopra e sotto", () => {
    expect(by - g.ports[2]!.y).toBe(g.ports[1]!.y - (by + bh));
  });

  it("la sede è sotto la sfera, dalla parte di 1: passa libero da 1 a 2", () => {
    const seat = /<path d="M-[89],(-?[\d.]+) L0,(-?[\d.]+) L[89],/.exec(g.svg)!;
    expect(+seat[2]!).toBeGreaterThan(ballY); // vertice della V sotto la sfera
    expect(+seat[1]!).toBeLessThan(ballY); // bracci aperti verso 2
  });

  it("il pilotaggio tratteggiato arriva da 21 fino alla sfera; corpo e porte non cambiano", () => {
    expect(g.svg).toMatch(/<path d="M8.5,12.55 H20 V0 H30" class="nofill dash"/); // tratteggiato fino a 21
    const diag = /<line x1="([\d.]+)" y1="(-?[\d.]+)" x2="8.5" y2="12.55"/.exec(g.svg)!;
    expect(Math.hypot(+diag[1]!, +diag[2]! - ballY)).toBeCloseTo(ballR, 1); // tocca la sfera
    expect(bx).toBeLessThan(-8); expect(bx + bw).toBeGreaterThan(8); expect(by + bh).toBeGreaterThan(0);
    expect(g.ports).toEqual({ 1: { x: 0, y: 30, dir: [0, 1] }, 2: { x: 0, y: -30, dir: [0, -1] }, 21: { x: 30, y: 0, dir: [1, 0] } });
  });
});

describe("sfera dei non ritorno tangente ai due bracci della sede", () => {
  /** Distanza del punto (px, py) dalla retta per (x1, y1) e (x2, y2). */
  const dist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) =>
    Math.abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / Math.hypot(x2 - x1, y2 - y1);
  const cases: [string, ComponentData][] = [
    ["non ritorno (X10690)", { id: "NR1", type: "check_valve" }],
    ["non ritorno con molla (X10700)", { id: "NR1", type: "check_valve", check_spring: "yes" }],
    ["non ritorno pilotata (X10720)", { id: "NRP1", type: "pilot_check_valve" }],
    ["doppia non ritorno pilotata (X10730)", { id: "NRD1", type: "double_pilot_check" }],
    ["strozzatore unidirezionale (X10640)", { id: "SU1", type: "one_way_flow_control" }],
    ["innesto rapido con non ritorno", { id: "IR1", type: "quick_coupling", coupling: "check_both" }],
  ];
  for (const [name, comp] of cases) {
    it(name, () => {
      const svg = geometry(comp).svg;
      const balls = [...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)" class="body"/g)]
        .map((m) => ({ x: +m[1]!, y: +m[2]!, r: +m[3]! }));
      const vees = [...svg.matchAll(/<path d="M(-?[\d.]+),(-?[\d.]+) L(-?[\d.]+),(-?[\d.]+) L(-?[\d.]+),(-?[\d.]+)" class="nofill"/g)]
        .map((m) => m.slice(1, 7).map(Number) as [number, number, number, number, number, number]);
      expect(balls.length).toBeGreaterThan(0);
      for (const b of balls) {
        // la sede è la V più vicina alla sfera
        const v = vees.map((p) => ({ p, d: Math.hypot(p[2] - b.x, p[3] - b.y) })).sort((a, c) => a.d - c.d)[0]!.p;
        expect(dist(b.x, b.y, v[0], v[1], v[2], v[3])).toBeCloseTo(b.r, 1);
        expect(dist(b.x, b.y, v[2], v[3], v[4], v[5])).toBeCloseTo(b.r, 1);
      }
    });
  }
});
