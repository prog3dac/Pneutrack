/**
 * Dallo schema dell'editor alla rete fisica da simulare.
 *
 * Modello a parametri concentrati (lo stesso di src/solver): ogni rete di porte
 * collegate è un nodo con un volume e una pressione; valvole e strozzatori sono
 * orifizi ISO 6358 (conduttanza C, rapporto critico b) tra due nodi; i cilindri
 * sono masse con attrito che cambiano il volume delle loro camere.
 */
import type { CircuitDoc } from "../model/circuit";
import { nets } from "../model/circuit";
import { simParam, type Actuation, type Component, type ValveFunction } from "../model/components";
import { allPorts, analyze, build } from "../model/validation";
import { BAR, P_ATM } from "../solver/constants";

/** Posizione di una valvola: casella lato 14, lato 12, o centrale (5/3). */
export type Position = "14" | "12" | "0";

export interface Orifice {
  a: number;
  b: number;
  C: number; // m³/(s·Pa)
  bcrit: number;
  /** attivo solo con la valvola `valve` in una di queste posizioni */
  valve?: number;
  positions?: Position[];
  /** riduttore: il flusso a→b si chiude quando la pressione in b raggiunge questo valore (Pa ass.) */
  limit?: number;
}

export interface ValveSpec {
  id: string;
  fn: ValveFunction;
  act14: Actuation;
  act12: Actuation;
  /** nodo del pilotaggio, se il lato è pilotato */
  pilot14?: number;
  pilot12?: number;
  /** pressione relativa di commutazione dei pilotaggi [Pa] */
  pilotThreshold: number;
  initial: Position;
}

export interface CylinderSpec {
  id: string;
  capNode: number;
  rodNode: number;
  A1: number;
  A2: number;
  stroke: number;
  Vcap0: number;
  Vrod0: number;
  mass: number;
  load: number;
  frictionCoulomb: number;
  frictionViscous: number;
  /** forza della molla di richiamo (semplice effetto) [N] */
  spring: number;
}

export interface SimNetwork {
  nodeCount: number;
  /** pressione imposta [Pa ass.] dei nodi fissi */
  fixed: Map<number, number>;
  baseVolume: number[];
  orifices: Orifice[];
  valves: ValveSpec[];
  cylinders: CylinderSpec[];
  /** "C1.A" -> nodo */
  portNode: Record<string, number>;
  temperature: number;
}

export type CompileResult =
  | { ok: true; network: SimNetwork; warnings: string[] }
  | { ok: false; errors: string[] };

/** Volume di ogni nodo di raccordo e tubo [m³]. */
const NODE_VOLUME = 1e-6;
const DEAD_VOLUME = 5e-6;
const DEFAULT_PILOT_THRESHOLD = 2 * BAR;

// collegamenti attivi in ogni casella, come nei simboli (ui/symbols.ts)
const VALVE_PATHS: Record<ValveFunction, Partial<Record<Position, [string, string][]>>> = {
  "2/2": { "14": [["1", "2"]] },
  "3/2": { "14": [["1", "2"]], "12": [["2", "3"]] },
  "4/2": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "3"]] },
  "5/2": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]] },
  "5/3": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]] },
};

export interface CompileOptions {
  /** volume di ogni nodo di raccordo [m³] (predefinito 1 cm³) */
  nodeVolume?: number;
}

export function compileSim(doc: Pick<CircuitDoc, "components" | "connections">,
                           options: CompileOptions = {}): CompileResult {
  const analysis = analyze(doc);
  if (!analysis.ok) {
    return { ok: false, errors: analysis.issues.filter((i) => i.severity === "error").map((i) => i.message) };
  }
  const built = build(doc);
  const warnings: string[] = [];
  const comps = [...built.components.values()];

  const groups = nets(allPorts(built.components), built.connections);
  const portNode: Record<string, number> = {};
  groups.forEach((g, i) => g.forEach((r) => (portNode[r] = i)));
  let nodeCount = groups.length;
  const node = (c: Component, port: string) => portNode[`${c.id}.${port}`]!;
  const connected = new Set(built.connections.flat());

  const fixed = new Map<number, number>();
  const orifices: Orifice[] = [];
  const valves: ValveSpec[] = [];
  const cylinders: CylinderSpec[] = [];
  const atmosphere = () => {
    const n = nodeCount++;
    fixed.set(n, P_ATM);
    return n;
  };

  for (const c of comps) {
    switch (c.type) {
      case "pressure_source":
        fixed.set(node(c, "1"), P_ATM + c.params.pressure!.si);
        break;
      case "silencer":
        fixed.set(node(c, "1"), P_ATM);
        break;
      case "plug":
        break;
      case "pressure_regulator":
        orifices.push({
          a: node(c, "1"), b: node(c, "2"), C: simParam(c, "conductance").si,
          bcrit: simParam(c, "critical_ratio").si, limit: P_ATM + c.params.setpoint!.si,
        });
        break;
      case "flow_control_valve":
        orifices.push({
          a: node(c, "1"), b: node(c, "2"), C: simParam(c, "conductance").si,
          bcrit: simParam(c, "critical_ratio").si,
        });
        break;
      case "directional_valve": {
        const fn = c.function!;
        const C = simParam(c, "conductance").si, bcrit = simParam(c, "critical_ratio").si;
        const vi = valves.length;
        // scarichi lasciati liberi: aperti in atmosfera
        for (const p of c.ports) {
          if (p.kind === "exhaust" && !connected.has(`${c.id}.${p.name}`)) fixed.set(node(c, p.name), P_ATM);
        }
        for (const [pos, pairs] of Object.entries(VALVE_PATHS[fn]) as [Position, [string, string][]][]) {
          for (const [x, y] of pairs) {
            orifices.push({ a: node(c, x), b: node(c, y), C, bcrit, valve: vi, positions: [pos] });
          }
        }
        const act14 = c.actuation_14!, act12 = c.actuation_12!;
        const initial: Position = fn === "5/3" ? "0" : act14 === "spring" ? "14" : "12";
        valves.push({
          id: c.id, fn, act14, act12,
          pilot14: act14 === "pilot" ? node(c, "14") : undefined,
          pilot12: act12 === "pilot" ? node(c, "12") : undefined,
          pilotThreshold: c.params.min_pressure?.si ?? DEFAULT_PILOT_THRESHOLD,
          initial,
        });
        break;
      }
      case "single_acting_cylinder":
      case "double_acting_cylinder": {
        const d = c.params.bore!.si;
        const rod = c.params.rod?.si ?? 0;
        const A1 = (Math.PI * d * d) / 4;
        const single = c.type === "single_acting_cylinder";
        cylinders.push({
          id: c.id,
          capNode: node(c, "A"),
          rodNode: single ? atmosphere() : node(c, "B"),
          A1,
          A2: A1 - (Math.PI * rod * rod) / 4,
          stroke: c.params.stroke!.si,
          Vcap0: DEAD_VOLUME,
          Vrod0: DEAD_VOLUME,
          mass: simParam(c, "mass").si,
          load: simParam(c, "load").si,
          frictionCoulomb: simParam(c, "friction").si,
          frictionViscous: 20,
          spring: single ? simParam(c, "spring_force").si : 0,
        });
        break;
      }
      default:
        warnings.push(`${c.id}: questo componente non è ancora simulato, le sue porte restano chiuse`);
    }
  }

  return {
    ok: true,
    warnings,
    network: {
      nodeCount, fixed, baseVolume: Array.from({ length: nodeCount }, () => options.nodeVolume ?? NODE_VOLUME),
      orifices, valves, cylinders, portNode, temperature: 293.15,
    },
  };
}
