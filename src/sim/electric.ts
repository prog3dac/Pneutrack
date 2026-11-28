/**
 * Circuito elettrico di comando, simulato in modo logico (non circuitale).
 *
 * I fili uniscono i morsetti in nodi; i contatti chiusi uniscono i nodi tra loro.
 * Un carico (bobina di relè, temporizzatore, bobina di elettrovalvola, lampada) è
 * eccitato quando un suo morsetto è unito al + e l'altro al 0V. Se il + e il 0V
 * finiscono nello stesso gruppo di nodi c'è un cortocircuito: tutto resta senza
 * tensione finché non lo si elimina.
 *
 * I relè hanno un tempo di attrazione (e di rilascio) che evita le corse critiche;
 * i temporizzatori sono ritardati all'eccitazione o alla diseccitazione; le bobine
 * di elettrovalvola comandano subito il solenoide.
 */
import { nets } from "../model/circuit";
import { camPosition, camPressed } from "../model/cams";
import { isCylinder, simParam, type Cam, type Component, type ContactKind } from "../model/components";
import { electricPorts, type Built } from "../model/validation";

/** Cosa aziona un contatto. */
export type ContactDriver =
  | { kind: "manual" }
  | { kind: "relay"; relay: string }
  | { kind: "cam"; cam: Cam; oneway: boolean; stroke: number }
  | { kind: "sensor"; cylinder: string; position: number; range: number };

export interface ContactSpec {
  id: string;
  contact: ContactKind;
  /** nodi dei morsetti (undefined se il morsetto non esiste) */
  nodes: Record<string, number>;
  driver: ContactDriver;
  /** pulsante o finecorsa senza camma: si aziona a mano */
  manual: boolean;
}

export interface LoadSpec {
  id: string;
  type: "relay_coil" | "timer_relay" | "valve_solenoid" | "signal_lamp";
  a: number;
  b: number;
}

export interface RelaySpec {
  id: string;
  mode: "relay" | "on_delay" | "off_delay";
  /** tempo di attrazione e rilascio (relè) o ritardo (temporizzatore) [s] */
  delay: number;
}

export interface PressureSwitchSpec {
  id: string;
  /** nodo pneumatico della porta 1 */
  node: number;
  /** soglia di intervento e di rilascio, pressione relativa [Pa] */
  on: number;
  off: number;
  /** vacuostato: on e off sono gradi di vuoto */
  vacuum?: boolean;
}

export interface ElectricNetwork {
  nodeCount: number;
  /** morsetto ("S1.13") -> nodo */
  terminalNode: Record<string, number>;
  plus: number[];
  zero: number[];
  contacts: ContactSpec[];
  loads: LoadSpec[];
  relays: RelaySpec[];
  pressureSwitches: PressureSwitchSpec[];
  /** solenoide "V1.14" -> bobina che lo eccita */
  drives: Record<string, string>;
}

/** Ingressi letti dalla parte pneumatica a ogni aggiornamento. */
export interface ElectricInputs {
  t: number;
  /** posizione [m] e velocità [m/s] di un cilindro */
  cylinder(id: string): { x: number; v: number } | undefined;
  /** pressione relativa [Pa] di un nodo pneumatico */
  gauge(node: number): number;
}

export interface ElectricSnapshot {
  /** carichi eccitati (bobine, lampade) */
  energized: Set<string>;
  /** relè, temporizzatori e pressostati con i contatti commutati */
  switched: Set<string>;
  /** contatti azionati (pulsanti premuti, finecorsa e sensori attivi, contatti di relè commutati) */
  actuated: Set<string>;
  /** potenziale di ogni morsetto: "+" (sotto tensione), "0" (al 0V) o null */
  potential: Record<string, "+" | "0" | null>;
  shortCircuit: boolean;
  /** relè che continuano a commutare (per esempio una bobina che si stacca da sola) */
  oscillating: string[];
}

/** oltre questo numero di commutazioni al secondo un relè è considerato in oscillazione */
const OSCILLATION_LIMIT = 20;

const CONTACT_TYPES = new Set(["pushbutton", "relay_contact", "limit_switch"]);
const LOAD_TYPES = new Set(["relay_coil", "timer_relay", "valve_solenoid", "signal_lamp"]);

/** Compila la parte elettrica di uno schema valido; null se non ce n'è. */
export function compileElectric(built: Built, portNode: Record<string, number>): ElectricNetwork | null {
  const comps = [...built.components.values()];
  const terminals = electricPorts(built.components);
  if (!terminals.length && !comps.some((c) => c.type === "pressure_switch")) return null;
  const groups = nets(terminals, built.connections);
  const terminalNode: Record<string, number> = {};
  groups.forEach((g, i) => g.forEach((r) => (terminalNode[r] = i)));
  const nodesOf = (c: Component) =>
    Object.fromEntries(c.ports.filter((p) => p.kind === "electric").map((p) => [p.name, terminalNode[`${c.id}.${p.name}`]!]));
  const strokeOf = (id: string) => {
    const cyl = built.components.get(id);
    return cyl && isCylinder(cyl.type) ? cyl.params.stroke!.si : undefined;
  };

  const net: ElectricNetwork = {
    nodeCount: groups.length, terminalNode, plus: [], zero: [],
    contacts: [], loads: [], relays: [], pressureSwitches: [], drives: {},
  };
  for (const c of comps) {
    if (c.type === "electric_supply") {
      net.plus.push(terminalNode[`${c.id}.+`]!);
      net.zero.push(terminalNode[`${c.id}.0V`]!);
    } else if (CONTACT_TYPES.has(c.type)) {
      let driver: ContactDriver = { kind: "manual" };
      if (c.type === "relay_contact") driver = c.relay ? { kind: "relay", relay: c.relay } : { kind: "manual" };
      if (c.type === "limit_switch" && c.cam && strokeOf(c.cam.cylinder) !== undefined) {
        driver = { kind: "cam", cam: c.cam, oneway: c.switch_actuation === "roller_oneway", stroke: strokeOf(c.cam.cylinder)! };
      }
      net.contacts.push({ id: c.id, contact: c.contact ?? "no", nodes: nodesOf(c), driver,
                          manual: c.type === "pushbutton" || driver.kind === "manual" && c.type === "limit_switch" });
    } else if (c.type === "proximity_sensor") {
      // uscita PNP: BN (+) e BK (uscita) uniti quando lo stelo è nel campo del sensore
      const stroke = c.cam ? strokeOf(c.cam.cylinder) : undefined;
      // quota del riferimento ("C1@80 mm"), o il parametro posizione degli schemi precedenti, o il fine corsa
      const position = c.cam?.at ?? c.params.position?.si ?? (c.cam && stroke !== undefined ? camPosition(c.cam, stroke) : 0);
      const nodes = nodesOf(c);
      const driver: ContactDriver = c.cam && stroke !== undefined
        ? { kind: "sensor", cylinder: c.cam.cylinder, position: position!, range: simParam(c, "range").si }
        : { kind: "manual" };
      net.contacts.push({ id: c.id, contact: "no", nodes: { 13: nodes.BN!, 14: nodes.BK! }, driver, manual: false });
    } else if (LOAD_TYPES.has(c.type)) {
      const n = nodesOf(c);
      const [a, b] = c.type === "signal_lamp" ? [n.X1!, n.X2!] : [n.A1!, n.A2!];
      net.loads.push({ id: c.id, type: c.type as LoadSpec["type"], a, b });
      if (c.type === "relay_coil") net.relays.push({ id: c.id, mode: "relay", delay: simParam(c, "pickup_time").si });
      if (c.type === "timer_relay") net.relays.push({ id: c.id, mode: c.timer_mode ?? "on_delay", delay: c.params.delay!.si });
      if (c.type === "valve_solenoid" && c.drives) net.drives[`${c.drives.valve}.${c.drives.side}`] = c.id;
    } else if (c.type === "pressure_switch") {
      const on = c.params.setpoint!.si;
      const hyst = simParam(c, "hysteresis").si;
      net.pressureSwitches.push({ id: c.id, node: portNode[`${c.id}.1`]!, on, off: Math.max(0, on - hyst),
                                  vacuum: c.switch_kind === "vacuum" });
    }
  }
  return net;
}

/** Stato del circuito elettrico nel tempo. */
export class ElectricState {
  /** comandi manuali: pulsanti premuti o interruttori chiusi, finecorsa azionati a mano */
  private readonly manual = new Map<string, boolean>();
  /** stato dei contatti di relè, temporizzatori e pressostati */
  private readonly switched = new Map<string, boolean>();
  /** eccitazione della bobina e istante in cui è cambiata */
  private readonly coil = new Map<string, { on: boolean; since: number }>();
  private readonly toggles = new Map<string, number[]>();
  private snap: ElectricSnapshot;

  constructor(readonly net: ElectricNetwork) {
    for (const r of net.relays) { this.switched.set(r.id, false); this.coil.set(r.id, { on: false, since: 0 }); }
    for (const p of net.pressureSwitches) this.switched.set(p.id, false);
    this.snap = this.solve(new Set());
  }

  get snapshot(): ElectricSnapshot { return this.snap; }

  setManual(id: string, on: boolean): void { this.manual.set(id, on); }
  manualState(id: string): boolean { return this.manual.get(id) ?? false; }

  /** La bobina comanda il solenoide indicato ("V1.14")? Undefined se il solenoide non ha bobina. */
  drive(solenoid: string): boolean | undefined {
    const coil = this.net.drives[solenoid];
    return coil === undefined ? undefined : this.snap.energized.has(coil);
  }

  /** Tempo che manca alla commutazione di un relè o temporizzatore, o null se non sta contando. */
  remaining(id: string, t: number): number | null {
    const r = this.net.relays.find((x) => x.id === id);
    const c = this.coil.get(id);
    if (!r || !c || c.on === this.switched.get(id)) return null;
    if (r.mode === "on_delay" && !c.on) return null;
    if (r.mode === "off_delay" && c.on) return null;
    return Math.max(0, r.delay - (t - c.since));
  }

  /** Aggiorna sensori, contatti e carichi all'istante `inputs.t`. */
  update(inputs: ElectricInputs): ElectricSnapshot {
    const { t } = inputs;
    for (const p of this.net.pressureSwitches) {
      // vacuostato: interviene sul vuoto, cioè sulla pressione sotto l'atmosfera
      const g = p.vacuum ? -inputs.gauge(p.node) : inputs.gauge(p.node);
      const was = this.switched.get(p.id)!;
      this.switched.set(p.id, was ? g >= p.off : g >= p.on);
    }
    const actuatedNow = () => new Set(this.net.contacts.filter((c) => this.contactActuated(c, inputs)).map((c) => c.id));
    let snap = this.solve(actuatedNow());
    // i cambiamenti istantanei (temporizzatori) si propagano subito, ma al più per qualche giro
    for (let pass = 0; pass < 10; pass++) {
      let changed = false;
      for (const r of this.net.relays) {
        const coil = this.coil.get(r.id)!;
        const on = snap.energized.has(r.id);
        if (on !== coil.on) { coil.on = on; coil.since = t; }
        const was = this.switched.get(r.id)!;
        const elapsed = t - coil.since + 1e-9;
        let next = was;
        if (r.mode === "relay") next = elapsed >= r.delay ? coil.on : was;
        else if (r.mode === "on_delay") next = coil.on && elapsed >= r.delay;
        else next = coil.on || (was && elapsed < r.delay);
        if (next !== was) {
          this.switched.set(r.id, next);
          this.noteToggle(r.id, t);
          changed = true;
        }
      }
      if (!changed) break;
      snap = this.solve(actuatedNow());
    }
    snap.oscillating = [...this.toggles.entries()]
      .filter(([, ts]) => ts.filter((x) => x > t - 1).length > OSCILLATION_LIMIT).map(([id]) => id);
    this.snap = snap;
    return snap;
  }

  private noteToggle(id: string, t: number): void {
    const ts = (this.toggles.get(id) ?? []).filter((x) => x > t - 1);
    ts.push(t);
    this.toggles.set(id, ts);
  }

  private contactActuated(c: ContactSpec, inputs: ElectricInputs): boolean {
    const d = c.driver;
    if (d.kind === "relay") return this.switched.get(d.relay) ?? false;
    if (d.kind === "cam") {
      const cyl = inputs.cylinder(d.cam.cylinder);
      if (!cyl) return false;
      if (d.oneway) return camPressed(d.cam, "oneway", cyl.x, cyl.v, d.stroke);
      return camPressed(d.cam, "roller", cyl.x, cyl.v, d.stroke) || (c.manual && this.manualState(c.id));
    }
    if (d.kind === "sensor") {
      const cyl = inputs.cylinder(d.cylinder);
      return !!cyl && Math.abs(cyl.x - d.position) <= d.range + 1e-9;
    }
    return this.manualState(c.id);
  }

  /** Nodi uniti dai contatti chiusi, potenziali e carichi eccitati. */
  private solve(actuated: Set<string>): ElectricSnapshot {
    const net = this.net;
    const parent = Array.from({ length: net.nodeCount }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; }
      return x;
    };
    const join = (a?: number, b?: number) => {
      if (a === undefined || b === undefined) return;
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    for (const c of net.contacts) {
      const on = actuated.has(c.id);
      if (c.contact === "no") { if (on) join(c.nodes[13], c.nodes[14]); }
      else if (c.contact === "nc") { if (!on) join(c.nodes[11], c.nodes[12]); }
      else join(c.nodes[11], on ? c.nodes[14] : c.nodes[12]);
    }
    const plus = new Set(net.plus.map(find)), zero = new Set(net.zero.map(find));
    const shortCircuit = [...plus].some((r) => zero.has(r));
    const energized = new Set<string>();
    if (!shortCircuit) {
      for (const l of net.loads) {
        const a = find(l.a), b = find(l.b);
        if ((plus.has(a) && zero.has(b)) || (plus.has(b) && zero.has(a))) energized.add(l.id);
      }
    }
    const potential: ElectricSnapshot["potential"] = {};
    for (const [ref, n] of Object.entries(net.terminalNode)) {
      const r = find(n);
      potential[ref] = shortCircuit ? null : plus.has(r) ? "+" : zero.has(r) ? "0" : null;
    }
    const switched = new Set([...this.switched].filter(([, on]) => on).map(([id]) => id));
    return { energized, switched, actuated: new Set(actuated), potential, shortCircuit, oscillating: [] };
  }
}
