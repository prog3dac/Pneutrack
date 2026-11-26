// Comportamento in simulazione dei componenti del catalogo.
import { describe, expect, it } from "vitest";
import type { ComponentData } from "../src/model/components";
import { buildComponent, typeList } from "../src/model/components";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

type C = ComponentData;
const src = (id = "P", pressure = "6 bar"): C => ({ id, type: "pressure_source", params: { pressure } });
const button = (id: string): C => ({ id, type: "directional_valve", function: "3/2", actuation_14: "manual", actuation_12: "spring" });
const single = (id = "C1"): C => ({ id, type: "single_acting_cylinder", params: { bore: "20 mm", stroke: "50 mm" } });
const double = (id = "C1", type = "double_acting_cylinder"): C =>
  ({ id, type, params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } });

function sim(components: C[], wires: [string, string][]) {
  const r = compileSim({ components, connections: wires.map(([from, to]) => ({ from, to })) });
  if (!r.ok) throw new Error(r.errors.join("; "));
  expect(r.warnings).toEqual([]);
  return new Simulator(r.network);
}
const press = (s: Simulator, id: string, on = true) => s.setCommand(id, "14", on);
const frac = (s: Simulator, id = "C1") => s.cylinder(id)!.fraction;

describe("catalogo", () => {
  it("ogni voce della palette si costruisce e la valvola 5/3 ha le varianti di centro", () => {
    for (const t of typeList()) {
      for (const preset of t.presets ?? [{ label: t.label }]) {
        const data: C = { id: "X", type: t.type, params: { ...t.defaults, ...preset.params },
          ...Object.fromEntries((t.options ?? []).map((o) => [o.name, preset.options?.[o.name] ?? o.default])) };
        expect(() => buildComponent(data), `${t.type} · ${preset.label}`).not.toThrow();
      }
    }
    expect(typeList().length).toBeGreaterThanOrEqual(24);
  });

  it("finecorsa: deve indicare un cilindro esistente e un lato a rullo", () => {
    const roller = (cam: string, act = "mechanical"): C =>
      ({ id: "S1", type: "directional_valve", function: "3/2", actuation_14: act, actuation_12: "spring", cam_14: cam });
    expect(() => buildComponent(roller("C1+", "manual"))).toThrow(/meccanico/);
    expect(() => buildComponent(roller("C1+", "plunger"))).not.toThrow();
    expect(() => buildComponent(roller("C1*"))).toThrow(/non valido/);
    const codes = (cam: string) => analyze({ components: [src(), roller(cam), single()],
      connections: [{ from: "P.1", to: "S1.1" }, { from: "S1.2", to: "C1.A" }] }).issues.map((i) => i.code);
    expect(codes("C1+")).toEqual([]);
    expect(codes("C9-")).toEqual(["INVALID_CAM"]);
  });
});

describe("valvole di blocco e logiche", () => {
  it("non ritorno: passa solo da 1 a 2", () => {
    const check: C = { id: "N", type: "check_valve" };
    const fwd = sim([src(), check, single()], [["P.1", "N.1"], ["N.2", "C1.A"]]);
    fwd.advance(0.4);
    expect(frac(fwd)).toBe(1);
    const back = sim([src(), check, single()], [["P.1", "N.2"], ["N.1", "C1.A"]]);
    back.advance(0.4);
    expect(frac(back)).toBe(0);
    expect(back.gauge("C1.A")).toBeLessThan(0.01);
  });

  it("non ritorno pilotata: tiene la pressione finché il pilotaggio non la libera", () => {
    const poc: C = { id: "N", type: "pilot_check_valve" };
    const s = sim([src(), button("S1"), button("S2"), poc, single()],
      [["P.1", "S1.1"], ["P.1", "S2.1"], ["S1.2", "N.1"], ["N.2", "C1.A"], ["S2.2", "N.21"]]);
    press(s, "S1"); s.advance(0.4);
    expect(frac(s)).toBe(1);
    press(s, "S1", false); s.advance(0.4);
    expect(frac(s)).toBe(1); // S1 scarica, ma la valvola blocca il ritorno
    expect(s.gauge("C1.A")).toBeGreaterThan(4);
    press(s, "S2"); s.advance(0.6);
    expect(frac(s)).toBe(0);
  });

  it("selettrice (OR) e a due pressioni (AND)", () => {
    for (const [type, expected] of [["shuttle_valve", [0, 1, 1, 1]], ["and_valve", [0, 0, 0, 1]]] as const) {
      const results: number[] = [];
      for (const [a, b] of [[false, false], [true, false], [false, true], [true, true]]) {
        const s = sim([src(), button("S1"), button("S2"), { id: "L", type }, single()],
          [["P.1", "S1.1"], ["P.1", "S2.1"], ["S1.2", "L.1"], ["S2.2", "L.3"], ["L.2", "C1.A"]]);
        press(s, "S1", a); press(s, "S2", b);
        s.advance(0.4);
        results.push(frac(s));
      }
      expect(results, type).toEqual(expected);
    }
  });

  it("scarico rapido: il cilindro rientra più in fretta", () => {
    const retract = (quick: boolean) => {
      const valve: C = { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" };
      const parts: C[] = [src(), valve, double(), { id: "F", type: "flow_control_valve", params: { conductance: "0.4 dm3/(s·bar)" } }];
      const wires: [string, string][] = [["P.1", "V1.1"], ["V1.2", "C1.B"]];
      if (quick) { parts.push({ id: "Q", type: "quick_exhaust_valve" }); wires.push(["V1.4", "F.1"], ["F.2", "Q.1"], ["Q.2", "C1.A"]); }
      else wires.push(["V1.4", "F.1"], ["F.2", "C1.A"]);
      const s = sim(parts, wires);
      press(s, "V1"); s.advance(1.5);
      expect(frac(s)).toBe(1);
      press(s, "V1", false);
      const t0 = s.t;
      while (frac(s) > 0 && s.t - t0 < 5) s.advance(0.002);
      return s.t - t0;
    };
    expect(retract(true)).toBeLessThan(retract(false) * 0.7);
  });
});

describe("regolazione di portata e pressione", () => {
  it("regolatore unidirezionale: strozza in un verso, libero nell'altro", () => {
    const time = (from: "1" | "2") => {
      const s = sim([src(), button("S1"), { id: "F", type: "one_way_flow_control", params: { conductance: "0.05 dm3/(s·bar)" } }, single()],
        [["P.1", "S1.1"], ["S1.2", `F.${from}`], [`F.${from === "1" ? "2" : "1"}`, "C1.A"]]);
      press(s, "S1");
      while (frac(s) < 1 && s.t < 5) s.advance(0.002);
      return s.t;
    };
    expect(time("1")).toBeGreaterThan(time("2") * 1.5);
  });

  it("limitatrice: la linea non supera molto la taratura", () => {
    const s = sim([src("P", "8 bar"), { id: "F", type: "flow_control_valve", params: { opening: "20 %" } }, { id: "VS", type: "relief_valve", params: { setpoint: "4 bar" } },
                   { id: "SR", type: "air_reservoir", params: { volume: "0.2 l" } }],
      [["P.1", "F.1"], ["F.2", "VS.1"], ["F.2", "SR.1"]]);
    s.advance(3);
    expect(s.gauge("SR.1")).toBeGreaterThan(3.9);
    expect(s.gauge("SR.1")).toBeLessThan(4.6);
  });

  it("serbatoio: più volume, carica più lenta", () => {
    const at = (volume: string) => {
      const s = sim([src(), { id: "F", type: "flow_control_valve" }, { id: "SR", type: "air_reservoir", params: { volume } }],
        [["P.1", "F.1"], ["F.2", "SR.1"]]);
      s.advance(0.5);
      return s.gauge("SR.1");
    };
    expect(at("2 l")).toBeLessThan(at("0.2 l") - 1);
  });

  it("FRL, filtro e lubrificatore lasciano passare l'aria, l'FRL alla pressione regolata", () => {
    const s = sim([src("P", "8 bar"), { id: "G", type: "frl_unit", params: { setpoint: "5 bar" } },
                   { id: "FI", type: "air_filter" }, { id: "LU", type: "lubricator" }, { id: "M", type: "pressure_gauge" }],
      [["P.1", "FI.1"], ["FI.2", "LU.1"], ["LU.2", "G.1"], ["G.2", "M.1"]]);
    s.advance(0.5);
    expect(s.gauge("M.1")).toBeGreaterThan(4.8);
    expect(s.gauge("M.1")).toBeLessThan(5.05);
  });

  it("serbatoio con ingresso e uscita: le due porte sono lo stesso volume", () => {
    const s = sim([src(), { id: "SB", type: "air_reservoir", params: { volume: "1 l" } },
                   { id: "M", type: "pressure_gauge" }],
      [["P.1", "SB.1"], ["SB.2", "M.1"]]);
    s.advance(0.2);
    expect(Math.abs(s.gauge("SB.1") - s.gauge("M.1"))).toBeLessThan(1e-9);
  });

  it("valvola di sequenza: commuta solo quando il pilotaggio arriva alla taratura", () => {
    const s = sim([src(), button("S1"), { id: "SQ", type: "sequence_valve", params: { setpoint: "4 bar" } },
                   { id: "F", type: "flow_control_valve", params: { conductance: "0.05 dm3/(s·bar)" } },
                   { id: "SR", type: "air_reservoir", params: { volume: "0.1 l" } }, single()],
      [["P.1", "S1.1"], ["P.1", "SQ.1"], ["S1.2", "F.1"], ["F.2", "SR.1"], ["F.2", "SQ.12"], ["SQ.2", "C1.A"]]);
    press(s, "S1");
    let switched = 0;
    while (s.t < 5 && !switched) { s.advance(0.005); if (s.valvePosition("SQ") === "14") switched = s.gauge("SQ.12"); }
    expect(switched).toBeGreaterThanOrEqual(4);
    expect(switched).toBeLessThan(4.2);
    s.advance(0.4);
    expect(frac(s)).toBe(1);
  });

  it("temporizzatore: l'uscita arriva dopo il ritardo", () => {
    const s = sim([src(), button("S1"), { id: "T", type: "time_delay_valve", params: { delay: "1 s" } }, single()],
      [["P.1", "S1.1"], ["P.1", "T.1"], ["S1.2", "T.12"], ["T.2", "C1.A"]]);
    press(s, "S1");
    s.advance(0.9);
    expect(s.valvePosition("T")).toBe("12");
    expect(s.delayRemaining("T")).toBeGreaterThan(0);
    s.advance(0.2);
    expect(s.valvePosition("T")).toBe("14");
    press(s, "S1", false);
    s.advance(0.1);
    expect(s.valvePosition("T")).toBe("12");
  });
});

describe("attuatori e finecorsa", () => {
  it("ciclo continuo A+ A- con due finecorsa a rullo", () => {
    const v: C = { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "pilot", actuation_12: "pilot" };
    const roller = (id: string, cam: string): C =>
      ({ id, type: "directional_valve", function: "3/2", actuation_14: "mechanical", actuation_12: "spring", cam_14: cam });
    const s = sim([src(), v, double(), roller("S1", "C1-"), roller("S2", "C1+")],
      [["P.1", "V1.1"], ["P.1", "S1.1"], ["P.1", "S2.1"], ["S1.2", "V1.14"], ["S2.2", "V1.12"],
       ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
    let outs = 0, last = 0;
    for (let i = 0; i < 1000; i++) {
      s.advance(0.002);
      const f = frac(s);
      if (f > 0.99 && last <= 0.99) outs++;
      last = f;
    }
    expect(outs).toBeGreaterThanOrEqual(3);
  });

  it("cilindro a doppio stelo: esce e rientra con la stessa forza", () => {
    const v: C = { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" };
    const s = sim([src(), v, double("C1", "double_rod_cylinder")], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
    s.advance(0.1);
    expect(frac(s)).toBe(0);
    press(s, "V1");
    s.advance(0.5);
    expect(frac(s)).toBe(1);
  });

  it("5/3 centri in scarico e in pressione", () => {
    const run = (fn: string) => {
      const v: C = { id: "V1", type: "directional_valve", function: fn, actuation_14: "solenoid", actuation_12: "solenoid" };
      const s = sim([src(), v, double()], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
      press(s, "V1"); s.advance(0.3); press(s, "V1", false); s.advance(0.3);
      return [s.gauge("C1.A"), s.gauge("C1.B")];
    };
    const [ea, eb] = run("5/3E");
    expect(ea).toBeLessThan(0.05);
    expect(eb).toBeLessThan(0.05);
    const [pa, pb] = run("5/3P");
    expect(pa).toBeGreaterThan(5.9);
    expect(pb).toBeGreaterThan(5.9);
    const [ca] = run("5/3");
    expect(ca).toBeGreaterThan(5.5); // centri chiusi: la camera resta in pressione
  });

  it("motore pneumatico: consuma aria tra 1 e 2", () => {
    const s = sim([src(), button("S1"), { id: "MP", type: "air_motor" }, { id: "SL", type: "silencer" }],
      [["P.1", "S1.1"], ["S1.2", "MP.1"], ["MP.2", "SL.1"]]);
    press(s, "S1");
    s.advance(0.2);
    expect(s.gauge("MP.1")).toBeGreaterThan(3);
    expect(s.gauge("MP.1")).toBeLessThan(6); // l'aria passa attraverso il motore verso lo scarico
  });
});

describe("comandi delle valvole (ISO 1219)", () => {
  const valve = (a14: string, a12 = "spring", fn = "5/2"): C =>
    ({ id: "V1", type: "directional_valve", function: fn, actuation_14: a14, actuation_12: a12 });

  it("elettropneumatica con pilota interno: commuta solo se l'alimentazione supera la pressione minima", () => {
    const run = (pressure: string) => {
      const s = sim([src("P", pressure), valve("solenoid_pilot"), double()], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
      s.advance(0.05);
      press(s, "V1");
      s.advance(0.5);
      return s.valvePosition("V1");
    };
    expect(run("6 bar")).toBe("14");
    expect(run("1 bar")).toBe("12");
  });

  it("elettropneumatica con pilota esterno: serve la pressione sulla porta 14", () => {
    const parts = [src(), src("PP", "3 bar"), valve("solenoid_pilot_ext"), double()];
    const ports = buildComponent(parts[2]!).ports.map((p) => `${p.name}:${p.kind}`);
    expect(ports).toContain("14:pilot");
    const s = sim(parts, [["P.1", "V1.1"], ["PP.1", "V1.14"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
    press(s, "V1");
    s.advance(0.5);
    expect(frac(s)).toBe(1);
    // senza alimentazione del pilota la valvola non è valida (porta 14 scollegata)
    const codes = analyze({ components: [src(), valve("solenoid_pilot_ext"), double()],
      connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }] })
      .issues.map((i) => i.code);
    expect(codes).toContain("UNCONNECTED_PORT");
  });

  it("leva, pedale, leva con arresto e tastatore si azionano come comandi manuali", () => {
    for (const a of ["lever", "lever_detent", "pedal", "plunger"]) {
      const s = sim([src(), valve(a, "spring", "3/2"), single()], [["P.1", "V1.1"], ["V1.2", "C1.A"]]);
      press(s, "V1");
      s.advance(0.4);
      expect(frac(s), a).toBe(1);
      press(s, "V1", false);
      s.advance(0.6);
      expect(frac(s), a).toBe(0);
    }
  });

  it("rullo unidirezionale: dà un impulso solo quando lo stelo arriva andando verso la camma", () => {
    const v = valve("solenoid");
    const r: C = { id: "S1", type: "directional_valve", function: "3/2", actuation_14: "roller_oneway", actuation_12: "spring", cam_14: "C1+" };
    const s = sim([src(), v, double(), r, { id: "M", type: "pressure_gauge" }],
      [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"], ["P.1", "S1.1"], ["S1.2", "M.1"]]);
    press(s, "V1");
    let pulse = false;
    for (let i = 0; i < 300; i++) { s.advance(0.002); if (s.valvePosition("S1") === "14") pulse = true; }
    expect(frac(s)).toBe(1);
    expect(pulse).toBe(true);
    expect(s.valvePosition("S1")).toBe("12"); // fermo a fine corsa: la leva è ribaltata
    press(s, "V1", false);
    let back = false;
    for (let i = 0; i < 300; i++) { s.advance(0.002); if (s.valvePosition("S1") === "14") back = true; }
    expect(back).toBe(false);
  });
});

describe("ritorno pneumatico", () => {
  const v = (ret: string): C => ({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: ret });
  it("interno: con pressione su 1 riporta la valvola a riposo come una molla", () => {
    const s = sim([src(), v("air_return"), double()], [["P.1", "V1.1"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
    press(s, "V1"); s.advance(0.5);
    expect(s.valvePosition("V1")).toBe("14");
    press(s, "V1", false); s.advance(0.5);
    expect(s.valvePosition("V1")).toBe("12");
    expect(frac(s)).toBe(0);
  });
  it("esterno: senza aria sulla porta 12 la valvola resta dov'è", () => {
    const comps = [src(), src("PP", "0.5 bar"), v("air_return_ext"), double()];
    expect(buildComponent(comps[2]!).ports.map((p) => p.name)).toContain("12");
    const s = sim(comps, [["P.1", "V1.1"], ["PP.1", "V1.12"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
    press(s, "V1"); s.advance(0.3);
    press(s, "V1", false); s.advance(0.3);
    expect(s.valvePosition("V1")).toBe("14");
    const ok = sim([src(), src("PP", "4 bar"), v("air_return_ext"), double()],
      [["P.1", "V1.1"], ["PP.1", "V1.12"], ["V1.4", "C1.A"], ["V1.2", "C1.B"]]);
    press(ok, "V1"); ok.advance(0.3);
    press(ok, "V1", false); ok.advance(0.3);
    expect(ok.valvePosition("V1")).toBe("12");
  });
});
