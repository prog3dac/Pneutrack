import { describe, expect, it } from "vitest";
import type { CircuitDoc } from "../src/model/circuit";
import { buildComponent, parseLoadProfile, profileForce, type ComponentData } from "../src/model/components";
import { applyCylinderConfig, cylinderConfigOf, profileRows, profileText } from "../src/model/cylinderConfig";
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
/** alimentazione, 3/2 a pulsante e il cilindro dato sulla porta A */
const withValve = (cyl: ComponentData) => doc(
  [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "V1", type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" },
    cyl,
  ],
  [["P.1", "V1.1"], ["V1.2", `${cyl.id}.A`]],
);
const single = (extra: Partial<ComponentData>): ComponentData => ({
  id: "C1", type: "single_acting_cylinder", params: { bore: "20 mm", rod: "8 mm", stroke: "50 mm" }, ...extra,
});

describe("cilindri a semplice effetto", () => {
  it("in trazione parte con lo stelo fuori e l'aria lo fa rientrare", () => {
    const s = sim(withValve(single({ single_kind: "pull" })));
    expect(s.cylinder("C1")!.fraction).toBe(1);
    s.advance(0.2);
    expect(s.cylinder("C1")!.fraction).toBe(1);
    s.setCommand("V1", "14", true);
    s.advance(1);
    expect(s.cylinder("C1")!.fraction).toBe(0);
    s.setCommand("V1", "14", false);
    s.advance(1.5);
    expect(s.cylinder("C1")!.fraction).toBeGreaterThan(0.99);
  });

  it("senza molla resta fuori finché un carico non lo riporta", () => {
    const s = sim(withValve(single({ spring_return: "no" })));
    s.setCommand("V1", "14", true);
    s.advance(0.6);
    expect(s.cylinder("C1")!.fraction).toBeGreaterThan(0.99);
    s.setCommand("V1", "14", false);
    s.advance(0.6);
    expect(s.cylinder("C1")!.fraction).toBeGreaterThan(0.99);
    // montato in verticale, stelo in alto: il peso lo riporta giù
    const g = sim(withValve(single({ spring_return: "no",
      params: { bore: "20 mm", rod: "8 mm", stroke: "50 mm", mass: "2 kg", mounting_angle: "90 deg" } })));
    g.setCommand("V1", "14", true);
    g.advance(0.8);
    expect(g.cylinder("C1")!.fraction).toBeGreaterThan(0.99);
    g.setCommand("V1", "14", false);
    g.advance(1.5);
    expect(g.cylinder("C1")!.fraction).toBe(0);
  });

  it("simbolo: in trazione la porta è sulla camera stelo, lo stelo a riposo è fuori", () => {
    const push = geometry(single({}));
    const pull = geometry(single({ single_kind: "pull" }));
    expect(push.ports.A!.x).toBe(-50);
    expect(pull.ports.A!.x).toBe(50);
    expect(pull.svg).toContain("M-54,15 L-46,15 L-50,22 Z");
    expect(geometry(single({ spring_return: "no" })).svg).not.toEqual(push.svg);
  });
});

describe("profilo di forza", () => {
  it("si legge, si ordina e si interpola", () => {
    const p = parseLoadProfile("100 mm: 300 N; 0: 0; 50 mm: 100 N", 0.1);
    expect(p).toEqual([[0, 0], [0.05, 100], [0.1, 300]]);
    expect(profileForce(p, 0.025)).toBeCloseTo(50);
    expect(profileForce(p, 0.075)).toBeCloseTo(200);
    expect(profileForce(p, 0.2)).toBe(300);
    expect(() => parseLoadProfile("200 mm: 10 N", 0.1)).toThrow(/fuori dalla corsa/);
    expect(() => parseLoadProfile("50 mm 10 N", 0.1)).toThrow(/non valido/);
    expect(() => parseLoadProfile("50 mm: 10 bar", 0.1)).toThrow(/posizione e una forza/);
    expect(() => buildComponent({ id: "V", type: "directional_valve", load_profile: "0: 0" })).toThrow(/profilo di forza/);
  });

  it("in simulazione il cilindro si ferma dove il profilo supera la sua spinta", () => {
    const cyl: ComponentData = { id: "C1", type: "double_acting_cylinder",
      params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" },
      // circa 480 N di spinta a 6 bar: il carico la raggiunge verso metà corsa
      load_profile: "0 mm: 0 N; 100 mm: 1000 N" };
    const s = sim(doc(
      [
        { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
        { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
        cyl,
      ],
      [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]],
    ));
    s.setCommand("V1", "14", true);
    s.advance(2);
    const f = s.cylinder("C1")!.fraction;
    expect(f).toBeGreaterThan(0.35);
    expect(f).toBeLessThan(0.6);
  });
});

describe("configuratore dei cilindri", () => {
  it("cambia tipo tenendo le misure e togliendo quello che il nuovo tipo non ha", () => {
    const c: ComponentData = { id: "C1", type: "double_acting_cylinder", label: "Spintore", code: "DSBC-32",
      cushioning: "both", magnet: "yes",
      params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm", cushion_length: "20 mm", mass: "2 kg" } };
    const cfg = cylinderConfigOf(c);
    expect(cfg.kind).toBe("double");
    const s = applyCylinderConfig(c, { ...cfg, kind: "single_pull" });
    expect(s.type).toBe("single_acting_cylinder");
    expect(s.single_kind).toBe("pull");
    expect(s.cushioning).toBeUndefined();
    expect(s.params).toEqual({ bore: "32 mm", rod: "12 mm", stroke: "100 mm", mass: "2 kg" });
    expect(s.code).toBe("DSBC-32");
    expect(() => buildComponent(s)).not.toThrow();
    const r = applyCylinderConfig(c, { ...cfg, kind: "rodless", coupling: "magnetic" });
    expect(r.params?.rod).toBeUndefined();
    expect(r.rodless_kind).toBe("magnetic");
    expect(() => buildComponent(r)).not.toThrow();
    expect(geometry(r).svg).toContain(`class="magnet"`);
    const back = cylinderConfigOf(applyCylinderConfig(c, { ...cfg, params: { ...cfg.params, stroke: "160" } }));
    expect(back.params.stroke).toBe("160 mm");
  });

  it("scrive e rilegge il profilo, con le unità principali", () => {
    expect(profileText([["0", "0"], ["50", "200 N"], ["", ""]])).toBe("0 mm: 0 N; 50 mm: 200 N");
    expect(profileRows("0 mm: 0 N; 50 mm: 200 N")).toEqual([["0 mm", "0 N"], ["50 mm", "200 N"]]);
  });
});
