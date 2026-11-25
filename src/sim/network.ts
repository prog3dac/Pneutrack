/**
 * Dallo schema dell'editor alla rete fisica da simulare.
 *
 * Modello a parametri concentrati (lo stesso di src/solver): ogni rete di porte
 * unite da collegamenti ideali è un nodo con un volume e una pressione; valvole,
 * strozzatori e tubi dimensionati sono orifizi ISO 6358 (conduttanza C, rapporto
 * critico b) tra due nodi, e il volume di un tubo va metà a ciascun capo; i cilindri
 * sono masse con attrito che cambiano il volume delle loro camere.
 */
import type { CircuitDoc } from "../model/circuit";
import { nets } from "../model/circuit";
import { simParam, type Actuation, type Cam, type Component, type ValveFunction } from "../model/components";
import { TUBE_CRITICAL_RATIO, tubeConductance, tubeVolume } from "../model/tubes";
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
  /** solo da a verso b (non ritorno) */
  oneWay?: boolean;
  /** apertura 0..1 in funzione delle pressioni assolute dei nodi (valvole logiche, di sicurezza...) */
  gate?: (P: number[]) => number;
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
  /** temporizzatore: il pilotaggio deve restare attivo per questo tempo [s] */
  delay?: number;
  /** rulli azionati dalla posizione di un cilindro */
  cam14?: Cam;
  cam12?: Cam;
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
  "5/3E": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]], "0": [["2", "3"], ["4", "5"]] },
  "5/3P": { "14": [["1", "4"], ["2", "3"]], "12": [["1", "2"], ["4", "5"]], "0": [["1", "2"], ["1", "4"]] },
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

  // i collegamenti ideali uniscono le porte in un solo nodo, i tubi restano tra due nodi
  const ideal = built.connections.filter((_, i) => !built.tubes[i]);
  // porte che stanno sullo stesso volume interno (serbatoio)
  for (const c of built.components.values()) {
    if (c.type === "air_reservoir") ideal.push([`${c.id}.1`, `${c.id}.2`]);
  }
  const groups = nets(allPorts(built.components), ideal);
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

  const tubeVolumes: [number, number][] = [];
  built.connections.forEach(([ra, rb], i) => {
    const t = built.tubes[i];
    if (!t) return;
    const a = portNode[ra]!, b = portNode[rb]!;
    orifices.push({ a, b, C: tubeConductance(t), bcrit: TUBE_CRITICAL_RATIO });
    tubeVolumes.push([a, tubeVolume(t) / 2], [b, tubeVolume(t) / 2]);
  });

  const extraVolumes: [number, number][] = [];
  const gauge = (P: number[], n: number) => P[n]! - P_ATM;
  /** apertura progressiva tra 0 e 1 attorno a una soglia (evita commutazioni a scatto) */
  const ramp = (x: number, width: number) => Math.min(1, Math.max(0, x / width));
  /** valvola 3/2 NC (porte 1, 2, 3) comandata dal pilotaggio 12 */
  const pilotedThreeTwo = (c: Component, threshold: number, delay?: number) => {
    const C = simParam(c, "conductance").si, bcrit = simParam(c, "critical_ratio").si;
    const vi = valves.length;
    for (const [pos, pairs] of Object.entries(VALVE_PATHS["3/2"]) as [Position, [string, string][]][]) {
      for (const [x, y] of pairs) orifices.push({ a: node(c, x), b: node(c, y), C, bcrit, valve: vi, positions: [pos] });
    }
    valves.push({ id: c.id, fn: "3/2", act14: "pilot", act12: "spring", pilot14: node(c, "12"),
                  pilotThreshold: threshold, initial: "12", delay });
  };

  for (const c of comps) {
    // scarichi lasciati liberi: aperti in atmosfera
    for (const p of c.ports) {
      if (p.kind === "exhaust" && !connected.has(`${c.id}.${p.name}`)) fixed.set(node(c, p.name), P_ATM);
    }
    const orifice = (x: string, y: string, extra: Partial<Orifice> = {}): Orifice => ({
      a: node(c, x), b: node(c, y), C: simParam(c, "conductance").si, bcrit: simParam(c, "critical_ratio").si, ...extra,
    });
    switch (c.type) {
      case "pressure_source":
        fixed.set(node(c, "1"), P_ATM + c.params.pressure!.si);
        break;
      case "silencer":
        fixed.set(node(c, "1"), P_ATM);
        break;
      case "plug":
      case "pressure_gauge":
        break;
      case "air_reservoir":
        extraVolumes.push([node(c, "1"), c.params.volume!.si]);
        break;
      case "pressure_regulator":
      case "frl_unit":
        orifices.push(orifice("1", "2", { limit: P_ATM + c.params.setpoint!.si }));
        break;
      case "flow_control_valve":
      case "air_filter":
      case "lubricator":
      case "air_motor":
        orifices.push(orifice("1", "2"));
        break;
      case "one_way_flow_control":
        orifices.push(orifice("1", "2"));
        orifices.push(orifice("2", "1", { C: simParam(c, "free_conductance").si, oneWay: true }));
        break;
      case "check_valve": {
        const crack = simParam(c, "cracking_pressure").si;
        const a = node(c, "1"), b = node(c, "2");
        orifices.push(orifice("1", "2", { oneWay: true, gate: (P) => ramp(P[a]! - P[b]! - crack, 0.05 * BAR) }));
        break;
      }
      case "pilot_check_valve": {
        const x = node(c, "21"), threshold = simParam(c, "pilot_pressure").si;
        orifices.push(orifice("1", "2", { oneWay: true }));
        orifices.push(orifice("2", "1", { oneWay: true, gate: (P) => ramp(gauge(P, x) - threshold + 0.1 * BAR, 0.2 * BAR) }));
        break;
      }
      case "shuttle_valve": {
        // la sfera chiude l'ingresso a pressione minore: l'uscita resta collegata all'altro
        const i1 = node(c, "1"), i3 = node(c, "3");
        orifices.push(orifice("1", "2", { gate: (P) => (P[i1]! >= P[i3]! ? 1 : 0) }));
        orifices.push(orifice("3", "2", { gate: (P) => (P[i3]! > P[i1]! ? 1 : 0) }));
        break;
      }
      case "and_valve": {
        // passa l'ingresso a pressione minore: in uscita c'è aria solo se ci sono entrambi
        const i1 = node(c, "1"), i3 = node(c, "3");
        orifices.push(orifice("1", "2", { gate: (P) => (P[i1]! <= P[i3]! ? 1 : 0) }));
        orifices.push(orifice("3", "2", { gate: (P) => (P[i3]! < P[i1]! ? 1 : 0) }));
        break;
      }
      case "quick_exhaust_valve": {
        const i1 = node(c, "1"), o2 = node(c, "2");
        orifices.push(orifice("1", "2", { oneWay: true }));
        orifices.push(orifice("2", "3", { C: simParam(c, "exhaust_conductance").si, oneWay: true,
                                          gate: (P) => ramp(P[o2]! - P[i1]! - 0.1 * BAR, 0.1 * BAR) }));
        break;
      }
      case "relief_valve": {
        const i1 = node(c, "1"), set = c.params.setpoint!.si;
        orifices.push(orifice("1", "3", { oneWay: true, gate: (P) => ramp(gauge(P, i1) - set, 0.2 * BAR) }));
        break;
      }
      case "sequence_valve":
        pilotedThreeTwo(c, c.params.setpoint!.si);
        break;
      case "time_delay_valve":
        pilotedThreeTwo(c, simParam(c, "pilot_pressure").si, c.params.delay!.si);
        break;
      case "directional_valve": {
        const fn = c.function!;
        const C = simParam(c, "conductance").si, bcrit = simParam(c, "critical_ratio").si;
        const vi = valves.length;
        for (const [pos, pairs] of Object.entries(VALVE_PATHS[fn]) as [Position, [string, string][]][]) {
          for (const [x, y] of pairs) {
            orifices.push({ a: node(c, x), b: node(c, y), C, bcrit, valve: vi, positions: [pos] });
          }
        }
        const act14 = c.actuation_14!, act12 = c.actuation_12!;
        const initial: Position = fn.startsWith("5/3") ? "0" : act14 === "spring" ? "14" : "12";
        valves.push({
          id: c.id, fn, act14, act12,
          pilot14: act14 === "pilot" ? node(c, "14") : undefined,
          pilot12: act12 === "pilot" ? node(c, "12") : undefined,
          pilotThreshold: c.params.min_pressure?.si ?? DEFAULT_PILOT_THRESHOLD,
          initial, cam14: c.cam_14, cam12: c.cam_12,
        });
        break;
      }
      case "single_acting_cylinder":
      case "double_acting_cylinder":
      case "double_rod_cylinder": {
        const d = c.params.bore!.si;
        const rod = c.params.rod?.si ?? 0;
        const full = (Math.PI * d * d) / 4, annulus = full - (Math.PI * rod * rod) / 4;
        const single = c.type === "single_acting_cylinder";
        const through = c.type === "double_rod_cylinder";
        cylinders.push({
          id: c.id,
          capNode: node(c, "A"),
          rodNode: single ? atmosphere() : node(c, "B"),
          A1: through ? annulus : full,
          A2: annulus,
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

  const baseVolume = Array.from({ length: nodeCount }, () => options.nodeVolume ?? NODE_VOLUME);
  for (const [n, v] of [...tubeVolumes, ...extraVolumes]) baseVolume[n]! += v;
  return {
    ok: true,
    warnings,
    network: {
      nodeCount, fixed, baseVolume,
      orifices, valves, cylinders, portNode, temperature: 293.15,
    },
  };
}
