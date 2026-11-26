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
import { conductanceOf, cushionLength, hasPilotPort, isElectricType, isReturn, simParam, type Actuation, type Cam, type Component, type ValveFunction } from "../model/components";
import { TUBE_CRITICAL_RATIO, tubeConductance, tubeVolume } from "../model/tubes";
import { analyze, build, pneumaticPorts } from "../model/validation";
import { BAR, P_ATM } from "../solver/constants";
import { compileElectric, type ElectricNetwork } from "./electric";

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
  /**
   * ammortizzo: orifizio tra la camera `a` del cilindro e la sua porta `b`. Negli ultimi `length`
   * metri di corsa verso quella camera l'aria in uscita passa solo dalla vite (conduttanza `C`);
   * in ingresso passa libera (valvola di non ritorno dell'ammortizzo).
   */
  cushion?: { cylinder: number; end: "cap" | "rod"; length: number; C: number };
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
  /** comando manuale ausiliario dei solenoidi: a impulso o con arresto */
  override?: "push" | "detent";
  /** lati comandati all'avvio della simulazione (rubinetti e sezionatori partono aperti) */
  startCommands?: ("14" | "12")[];
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
  /** attrito di primo distacco [N]: a velocità quasi nulla l'attrito sale fino a questo valore (Stribeck) */
  frictionStatic: number;
  /** peso della massa mobile lungo l'asse, positivo se si oppone all'uscita dello stelo [N] */
  gravity: number;
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
  /** circuito elettrico di comando, se lo schema ne ha uno */
  electric: ElectricNetwork | null;
}

export type CompileResult =
  | { ok: true; network: SimNetwork; warnings: string[] }
  | { ok: false; errors: string[] };

/** Volume di ogni nodo di raccordo e tubo [m³]. */
const NODE_VOLUME = 1e-6;
const G = 9.81;
const DEAD_VOLUME = 5e-6;
const DEFAULT_PILOT_THRESHOLD = 2 * BAR;
/** comandi alimentati dalla porta 1 della valvola stessa */
const internalPilot = (a: Actuation) => a === "solenoid_pilot" || a === "air_return";
/** passaggio libero tra camera e porta del cilindro fuori dall'ammortizzo [m³/(s·Pa)] (5 dm³/(s·bar)) */
const CUSHION_FREE_C = 5e-3 / BAR;
/** conduttanza della vite dell'ammortizzo tutta aperta [m³/(s·Pa)] (0,3 dm³/(s·bar)) */
const CUSHION_MAX_C = 0.3e-3 / BAR;
/** apertura minima: anche a vite chiusa resta un piccolo trafilamento */
const CUSHION_MIN_OPENING = 0.01;

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
  const groups = nets(pneumaticPorts(built.components), ideal);
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
    const C = conductanceOf(c), bcrit = simParam(c, "critical_ratio").si;
    const vi = valves.length;
    for (const [pos, pairs] of Object.entries(VALVE_PATHS["3/2"]) as [Position, [string, string][]][]) {
      for (const [x, y] of pairs) orifices.push({ a: node(c, x), b: node(c, y), C, bcrit, valve: vi, positions: [pos] });
    }
    valves.push({ id: c.id, fn: "3/2", act14: "pilot", act12: "spring", pilot14: node(c, "12"),
                  pilotThreshold: threshold, initial: "12", delay });
  };

  for (const c of comps) {
    // la parte elettrica la compila compileElectric (il pressostato legge solo la pressione della sua porta)
    if (isElectricType(c.type)) continue;
    // scarichi lasciati liberi: aperti in atmosfera
    for (const p of c.ports) {
      if (p.kind === "exhaust" && !connected.has(`${c.id}.${p.name}`)) fixed.set(node(c, p.name), P_ATM);
    }
    const orifice = (x: string, y: string, extra: Partial<Orifice> = {}): Orifice => ({
      a: node(c, x), b: node(c, y), C: conductanceOf(c), bcrit: simParam(c, "critical_ratio").si, ...extra,
    });
    switch (c.type) {
      case "pressure_source":
        fixed.set(node(c, "1"), P_ATM + c.params.pressure!.si);
        break;
      case "silencer":
      case "exhaust":
        fixed.set(node(c, "1"), P_ATM);
        break;
      case "plug":
      case "junction":
      case "pressure_gauge":
        break;
      case "air_reservoir":
        extraVolumes.push([node(c, "1"), c.params.volume!.si]);
        break;
      case "pressure_regulator":
      case "frl_unit":
        orifices.push(orifice("1", "2", { limit: P_ATM + c.params.setpoint!.si }));
        break;
      case "fixed_orifice": {
        // ugello a spigolo vivo: C ≈ 0,8 · 0,16 · d² dm³/(s·bar) con d in mm (ISO 6358, flusso sonico ideale)
        const dmm = c.params.diameter!.si * 1000;
        const C = c.params.conductance?.si ?? (0.128 * dmm * dmm * 1e-3) / BAR;
        orifices.push({ a: node(c, "1"), b: node(c, "2"), C, bcrit: simParam(c, "critical_ratio").si });
        break;
      }
      case "shutoff_valve":
      case "lockout_valve": {
        const fn: ValveFunction = c.type === "shutoff_valve" ? "2/2" : "3/2";
        const C = conductanceOf(c), bcrit = simParam(c, "critical_ratio").si;
        const vi = valves.length;
        for (const [pos, pairs] of Object.entries(VALVE_PATHS[fn]) as [Position, [string, string][]][]) {
          for (const [x, y] of pairs) orifices.push({ a: node(c, x), b: node(c, y), C, bcrit, valve: vi, positions: [pos] });
        }
        // leva con arresto sul lato 14 (aperto), molla sul 12: parte aperto, un clic lo chiude
        valves.push({ id: c.id, fn, act14: "lever_detent", act12: "spring", pilotThreshold: DEFAULT_PILOT_THRESHOLD,
                      initial: "14", startCommands: ["14"] });
        break;
      }
      case "quick_coupling": {
        if (c.coupling_state !== "uncoupled") {
          orifices.push(orifice("1", "2"));
          break;
        }
        // staccato: la metà con il non ritorno resta chiusa, quella senza scarica in atmosfera
        const check = c.coupling ?? "check_one";
        if (check === "plain") orifices.push(orifice("1", "1", { b: atmosphere() }));
        if (check !== "check_both") orifices.push(orifice("2", "2", { b: atmosphere() }));
        break;
      }
      case "soft_start_valve": {
        const C = conductanceOf(c), i1 = node(c, "1"), o2 = node(c, "2");
        const ratio = simParam(c, "switch_ratio").si;
        orifices.push(orifice("1", "2", { C: C * simParam(c, "fill_opening").si, oneWay: true }));
        // apertura piena quando la pressione a valle raggiunge la soglia
        orifices.push(orifice("1", "2", { oneWay: true,
          gate: (P) => ramp(gauge(P, o2) - ratio * gauge(P, i1) + 0.05 * BAR, 0.1 * BAR) }));
        orifices.push(orifice("2", "1", { oneWay: true }));
        break;
      }
      case "vacuum_ejector": {
        const i1 = node(c, "1"), vac = simParam(c, "max_vacuum").si;
        // il vuoto cresce con la pressione di alimentazione: pieno sopra circa 4 bar
        const on = (P: number[]) => ramp(gauge(P, i1) - 0.5 * BAR, 3.5 * BAR);
        const sink = nodeCount++;
        fixed.set(sink, Math.max(0.05 * BAR, P_ATM - vac));
        orifices.push(orifice("1", "3"));
        const Cs = simParam(c, "suction_conductance").si;
        orifices.push(orifice("2", "2", { b: sink, C: Cs, oneWay: true, gate: on }));
        orifices.push(orifice("2", "2", { b: atmosphere(), C: Cs, gate: (P) => 1 - on(P) }));
        break;
      }
      case "suction_cup": {
        const d = c.params.diameter!.si;
        extraVolumes.push([node(c, "1"), (Math.PI * d * d / 4) * (d / 4)]);
        break;
      }
      case "double_pilot_check": {
        const threshold = simParam(c, "pilot_pressure").si;
        const p1 = node(c, "1"), p3 = node(c, "3");
        const open = (n: number) => (P: number[]) => ramp(gauge(P, n) - threshold + 0.1 * BAR, 0.2 * BAR);
        orifices.push(orifice("1", "2", { oneWay: true }), orifice("2", "1", { oneWay: true, gate: open(p3) }));
        orifices.push(orifice("3", "4", { oneWay: true }), orifice("4", "3", { oneWay: true, gate: open(p1) }));
        break;
      }
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
        const C = conductanceOf(c), bcrit = simParam(c, "critical_ratio").si;
        const vi = valves.length;
        for (const [pos, pairs] of Object.entries(VALVE_PATHS[fn]) as [Position, [string, string][]][]) {
          for (const [x, y] of pairs) {
            orifices.push({ a: node(c, x), b: node(c, y), C, bcrit, valve: vi, positions: [pos] });
          }
        }
        const act14 = c.actuation_14!, act12 = c.actuation_12!;
        const initial: Position = fn.startsWith("5/3") ? "0" : isReturn(act14) ? "14" : "12";
        valves.push({
          id: c.id, fn, act14, act12,
          // pilotaggio pneumatico o alimentazione della valvola pilota (esterna: 14/12, interna: 1)
          pilot14: hasPilotPort(act14) ? node(c, "14") : internalPilot(act14) ? node(c, "1") : undefined,
          pilot12: hasPilotPort(act12) ? node(c, "12") : internalPilot(act12) ? node(c, "1") : undefined,
          pilotThreshold: c.params.min_pressure?.si ?? DEFAULT_PILOT_THRESHOLD,
          initial, cam14: c.cam_14, cam12: c.cam_12,
          override: c.override === "push" || c.override === "detent" ? c.override : undefined,
        });
        break;
      }
      case "single_acting_cylinder":
      case "double_acting_cylinder":
      case "double_rod_cylinder":
      case "rodless_cylinder":
      case "gripper": {
        const d = c.params.bore!.si;
        const rod = c.params.rod?.si ?? 0;
        const full = (Math.PI * d * d) / 4, annulus = full - (Math.PI * rod * rod) / 4;
        const single = c.type === "single_acting_cylinder" || (c.type === "gripper" && c.gripper_kind === "single");
        const through = c.type === "double_rod_cylinder" || c.type === "rodless_cylinder";
        // con l'ammortizzo la camera è un nodo a sé, collegato alla porta
        const chamber = (portName: "A" | "B", end: "cap" | "rod") => {
          const cu = c.cushioning ?? "none";
          if (cu !== end && cu !== "both") return node(c, portName);
          const n = nodeCount++;
          const opening = Math.min(1, Math.max(CUSHION_MIN_OPENING, simParam(c, "cushion_opening").si));
          orifices.push({
            a: n, b: node(c, portName), C: CUSHION_FREE_C, bcrit: 0.4,
            cushion: { cylinder: cylinders.length, end, length: cushionLength(c), C: opening * CUSHION_MAX_C },
          });
          return n;
        };
        cylinders.push({
          id: c.id,
          capNode: chamber("A", "cap"),
          rodNode: single ? atmosphere() : chamber("B", "rod"),
          A1: through ? annulus : full,
          A2: annulus,
          stroke: c.params.stroke!.si,
          Vcap0: DEAD_VOLUME,
          Vrod0: DEAD_VOLUME,
          mass: simParam(c, "mass").si,
          load: simParam(c, "load").si,
          frictionCoulomb: simParam(c, "friction").si,
          frictionStatic: c.params.static_friction?.si ?? simParam(c, "friction").si,
          gravity: c.type === "gripper" ? 0 : simParam(c, "mass").si * G * Math.sin(simParam(c, "mounting_angle").si),
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
      electric: compileElectric(built, portNode),
    },
  };
}
