// Tubi dimensionati: validazione e effetto sulla simulazione.
import { describe, expect, it } from "vitest";
import type { CircuitDoc, ConnectionData } from "../src/model/circuit";
import { ParameterError } from "../src/model/components";
import { parseTube, tubeConductance, tubeVolume, type TubeData } from "../src/model/tubes";
import { analyze } from "../src/model/validation";
import { compileSim } from "../src/sim/network";
import { Simulator } from "../src/sim/simulator";

const T6x4 = (length: string): TubeData => ({ outer_diameter: "6 mm", inner_diameter: "4 mm", length });

function circuit(tubeA?: TubeData, tubeB?: TubeData): Pick<CircuitDoc, "components" | "connections"> {
  const conn = (from: string, to: string, tube?: TubeData): ConnectionData => (tube ? { from, to, tube } : { from, to });
  return {
    components: [
      { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
      { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
      { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", rod: "12 mm", stroke: "100 mm" } },
    ],
    connections: [conn("P.1", "V1.1"), conn("V1.4", "C1.A", tubeA), conn("V1.2", "C1.B", tubeB)],
  };
}

/** tempo per l'uscita completa del cilindro [s] */
function strokeTime(doc: ReturnType<typeof circuit>) {
  const r = compileSim(doc);
  if (!r.ok) throw new Error(r.errors.join("; "));
  const s = new Simulator(r.network);
  s.advance(0.05);
  s.setCommand("V1", "14", true);
  const t0 = s.t;
  while (s.cylinder("C1")!.fraction < 1 && s.t < 5) s.advance(0.002);
  return s.t - t0;
}

describe("tubi", () => {
  it("valida le dimensioni", () => {
    expect(parseTube(undefined, "L")).toBeNull();
    const t = parseTube(T6x4("1.5 m"), "L")!;
    expect(t.inner).toBeCloseTo(0.004);
    expect(t.length).toBeCloseTo(1.5);
    expect(tubeVolume(t)).toBeCloseTo(Math.PI * 0.002 ** 2 * 1.5, 12);
    expect(() => parseTube({ inner_diameter: "4 mm" }, "L")).toThrow(/length/);
    expect(() => parseTube({ inner_diameter: "4 bar", length: "1 m" }, "L")).toThrow(/atteso length/);
    expect(() => parseTube({ outer_diameter: "4 mm", inner_diameter: "6 mm", length: "1 m" }, "L")).toThrow(/minore/);
    expect(() => parseTube({ inner_diameter: "4 mm", length: "1 m", colore: "blu" }, "L")).toThrow(ParameterError);
  });

  it("un tubo non valido è un errore che blocca la simulazione", () => {
    const doc = circuit({ inner_diameter: "4 mm", length: "-1 m" });
    const a = analyze(doc);
    expect(a.issues.map((i) => i.code)).toEqual(["INVALID_TUBE"]);
    expect(a.issues[0]!.ports).toEqual(["C1.A", "V1.4"]);
    expect(compileSim(doc).ok).toBe(false);
    expect(analyze(circuit(T6x4("2 m"))).issues).toEqual([]);
  });

  it("la conduttanza scende con la lunghezza e sale col diametro", () => {
    const c = (inner: number, length: number) => tubeConductance({ inner, length });
    expect(c(0.004, 2)).toBeLessThan(c(0.004, 0.5));
    expect(c(0.006, 2)).toBeGreaterThan(c(0.004, 2));
    // ordine di grandezza da catalogo: 6×4 lungo 1 m ≈ 0,5–1,5 dm³/(s·bar)
    expect(c(0.004, 1) / 1e-8).toBeGreaterThan(0.5);
    expect(c(0.004, 1) / 1e-8).toBeLessThan(1.5);
  });

  it("tubi lunghi e sottili rallentano il cilindro", () => {
    const ideal = strokeTime(circuit());
    const short = strokeTime(circuit(T6x4("0.5 m"), T6x4("0.5 m")));
    const long = strokeTime(circuit({ inner_diameter: "2.5 mm", length: "5 m" }, { inner_diameter: "2.5 mm", length: "5 m" }));
    expect(short).toBeGreaterThan(ideal);
    expect(long).toBeGreaterThan(short * 1.5);
  });
});
