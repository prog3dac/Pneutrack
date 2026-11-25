/**
 * Simulazione interattiva: avanza nel tempo con passi RK4 fissi e lascia
 * cambiare i comandi delle valvole mentre gira (pulsanti, solenoidi).
 *
 * Fisica dei nodi e dei cilindri identica a src/solver/simulate.ts:
 *   dp/dt = κRT/V · ṁ − κ p/V · dV/dt
 *   m ẍ = p_A A1 − p_B A2 − p_atm (A1 − A2) − carico − attrito − molla
 */
import { BAR, KAPPA, P_ATM, R_AIR } from "../solver/constants";
import { signedFlow } from "../solver/flow";
import { rk4Step } from "../solver/rk4";
import type { Position, SimNetwork, ValveSpec } from "./network";
import { isMechanical, isReturn } from "../model/components";

/** tratto finale di corsa in cui la leva ribaltabile è a contatto con la camma [m] */
const ONEWAY_ZONE = 0.005;
/** velocità minima dello stelo perché la leva ribaltabile venga azionata [m/s] */
const ONEWAY_MIN_SPEED = 1e-3;

export const DT = 2e-5;

export interface CylinderState {
  /** corsa percorsa [m] */
  x: number;
  /** velocità [m/s] */
  v: number;
  /** frazione di corsa 0..1 */
  fraction: number;
}

export class Simulator {
  t = 0;
  private y: number[];
  private readonly stateOfNode: number[];
  private readonly freeNodes: number[] = [];
  private readonly cylOffset: number;
  private readonly RT: number;
  /** posizione corrente di ogni valvola */
  readonly positions: Position[];
  /** comandi esterni (pulsante premuto, solenoide eccitato) per lato */
  private readonly commands = new Map<string, boolean>();

  constructor(readonly net: SimNetwork) {
    this.RT = R_AIR * net.temperature;
    this.stateOfNode = new Array<number>(net.nodeCount).fill(-1);
    for (let n = 0; n < net.nodeCount; n++) {
      if (!net.fixed.has(n)) {
        this.stateOfNode[n] = this.freeNodes.length;
        this.freeNodes.push(n);
      }
    }
    this.cylOffset = this.freeNodes.length;
    this.y = new Array<number>(this.cylOffset + 2 * net.cylinders.length).fill(0);
    for (const n of this.freeNodes) this.y[this.stateOfNode[n]!] = P_ATM;
    this.positions = net.valves.map((v) => v.initial);
    this.updateValves();
  }

  /** Imposta un comando esterno: lato "14" o "12" di una valvola, attivo o no. */
  setCommand(valveId: string, side: "14" | "12", active: boolean): void {
    this.commands.set(`${valveId}.${side}`, active);
    this.updateValves();
  }

  command(valveId: string, side: "14" | "12"): boolean {
    return this.commands.get(`${valveId}.${side}`) ?? false;
  }

  /** Avanza di `duration` secondi (a passi di {@link DT}). */
  advance(duration: number): void {
    const steps = Math.max(1, Math.round(duration / DT));
    for (let i = 0; i < steps; i++) this.step();
  }

  /** Pressione assoluta di ogni nodo [Pa]. */
  pressures(y = this.y): number[] {
    const out = new Array<number>(this.net.nodeCount);
    for (let n = 0; n < this.net.nodeCount; n++) out[n] = this.net.fixed.get(n) ?? y[this.stateOfNode[n]!]!;
    return out;
  }

  /** Pressione relativa [bar] su una porta ("C1.A"). */
  gauge(port: string): number {
    const n = this.net.portNode[port];
    if (n === undefined) return 0;
    return (this.pressures()[n]! - P_ATM) / BAR;
  }

  cylinder(id: string): CylinderState | undefined {
    const i = this.net.cylinders.findIndex((c) => c.id === id);
    if (i < 0) return undefined;
    const x = this.y[this.cylOffset + 2 * i]!, v = this.y[this.cylOffset + 2 * i + 1]!;
    return { x, v, fraction: x / this.net.cylinders[i]!.stroke };
  }

  valvePosition(id: string): Position | undefined {
    const i = this.net.valves.findIndex((v) => v.id === id);
    return i < 0 ? undefined : this.positions[i];
  }

  /** da quando il pilotaggio di ogni temporizzatore è attivo (s), per lato */
  private readonly pilotSince = new Map<string, number>();

  /** Lato comandato in questo istante (pilotaggio, finecorsa o comando esterno). */
  sideActive(v: ValveSpec, side: "14" | "12", P = this.pressures()): boolean {
    const act = side === "14" ? v.act14 : v.act12;
    if (isReturn(act)) return false;
    if (act === "pilot") {
      const n = side === "14" ? v.pilot14 : v.pilot12;
      const on = n !== undefined && P[n]! - P_ATM >= v.pilotThreshold;
      if (!v.delay) return on;
      const key = `${v.id}.${side}`;
      if (!on) { this.pilotSince.delete(key); return false; }
      if (!this.pilotSince.has(key)) this.pilotSince.set(key, this.t);
      return this.t - this.pilotSince.get(key)! >= v.delay - 1e-9;
    }
    const cam = side === "14" ? v.cam14 : v.cam12;
    if (isMechanical(act) && cam) {
      const c = this.cylinder(cam.cylinder);
      if (!c) return false;
      const stroke = this.net.cylinders.find((x) => x.id === cam.cylinder)!.stroke;
      if (act === "roller_oneway") {
        // leva ribaltabile: azionata solo mentre lo stelo la supera andando verso il fine corsa
        const tol = Math.min(0.5, ONEWAY_ZONE / stroke);
        const inZone = cam.end === "+" ? c.fraction >= 1 - tol : c.fraction <= tol;
        const towards = cam.end === "+" ? c.v > ONEWAY_MIN_SPEED : c.v < -ONEWAY_MIN_SPEED;
        return inZone && towards;
      }
      // rullo e tastatore sono premuti negli ultimi 2 mm di corsa
      const tol = 0.002 / stroke;
      return cam.end === "+" ? c.fraction >= 1 - tol : c.fraction <= tol;
    }
    const on = this.command(v.id, side);
    if (act === "solenoid_pilot" || act === "solenoid_pilot_ext") {
      // la valvola pilota commuta solo se la sua alimentazione ha pressione sufficiente
      const n = side === "14" ? v.pilot14 : v.pilot12;
      return on && n !== undefined && P[n]! - P_ATM >= v.pilotThreshold;
    }
    return on;
  }

  /** Tempo che manca allo scatto di un temporizzatore, o null se non sta contando. */
  delayRemaining(id: string): number | null {
    const v = this.net.valves.find((x) => x.id === id);
    if (!v?.delay) return null;
    const since = this.pilotSince.get(`${id}.14`);
    return since === undefined ? null : Math.max(0, v.delay - (this.t - since));
  }

  /** Il lato riporta la valvola a riposo (molla, o ritorno pneumatico con pressione). */
  private returns(v: ValveSpec, side: "14" | "12", P: number[]): boolean {
    const act = side === "14" ? v.act14 : v.act12;
    if (act === "spring") return true;
    if (act !== "air_return" && act !== "air_return_ext") return false;
    const n = side === "14" ? v.pilot14 : v.pilot12;
    return n !== undefined && P[n]! - P_ATM >= v.pilotThreshold;
  }

  /** Logica discreta delle valvole: comandi, pilotaggi, molle e memoria delle bistabili. */
  private updateValves(): void {
    const P = this.pressures();
    this.net.valves.forEach((v, i) => {
      const s14 = this.sideActive(v, "14", P), s12 = this.sideActive(v, "12", P);
      let pos = this.positions[i]!;
      if (v.fn.startsWith("5/3")) {
        pos = s14 && !s12 ? "14" : s12 && !s14 ? "12" : "0";
      } else if (s14 && !s12) {
        pos = "14";
      } else if (s12 && !s14) {
        pos = "12";
      } else if (!s14 && !s12) {
        // ritorno: la molla agisce sempre, il ritorno pneumatico solo se ha pressione
        if (this.returns(v, "12", P)) pos = "12";
        else if (this.returns(v, "14", P)) pos = "14";
        // bistabile (o ritorno pneumatico senz'aria): resta dov'è
      }
      this.positions[i] = pos;
    });
  }

  private deriv = (_t: number, y: number[]): number[] => {
    const net = this.net;
    const P = this.pressures(y);
    const inflow = new Array<number>(net.nodeCount).fill(0);
    for (const o of net.orifices) {
      if (o.valve !== undefined && !o.positions!.includes(this.positions[o.valve]!)) continue;
      const pa = P[o.a]!, pb = P[o.b]!;
      if (o.oneWay && pa <= pb) continue;
      let C = o.C;
      if (o.cushion && pa > pb) {
        // aria che esce dalla camera: dentro l'ammortizzo passa solo dalla vite
        const cy = net.cylinders[o.cushion.cylinder]!;
        const x = y[this.cylOffset + 2 * o.cushion.cylinder]!;
        const inside = o.cushion.end === "cap" ? x < o.cushion.length : x > cy.stroke - o.cushion.length;
        if (inside) C = o.cushion.C;
      }
      let m = signedFlow(pa, pb, C, o.bcrit, net.temperature);
      if (o.gate) {
        const g = o.gate(P);
        if (g <= 0) continue;
        m *= g;
      }
      if (o.limit !== undefined) {
        // riduttore: solo a→b, chiusura progressiva negli ultimi 0,1 bar
        m = m > 0 ? m * Math.min(1, Math.max(0, (o.limit - pb) / (0.1 * BAR))) : 0;
      }
      inflow[o.a]! -= m;
      inflow[o.b]! += m;
    }
    const V = net.baseVolume.slice();
    const dV = new Array<number>(net.nodeCount).fill(0);
    const dy = new Array<number>(y.length).fill(0);
    net.cylinders.forEach((c, i) => {
      const x = y[this.cylOffset + 2 * i]!;
      const v = y[this.cylOffset + 2 * i + 1]!;
      V[c.capNode]! += c.Vcap0 + c.A1 * x;
      dV[c.capNode]! += c.A1 * v;
      V[c.rodNode]! += c.Vrod0 + c.A2 * (c.stroke - x);
      dV[c.rodNode]! += -c.A2 * v;
      const force = P[c.capNode]! * c.A1 - P[c.rodNode]! * c.A2 - P_ATM * (c.A1 - c.A2) - c.spring;
      const fr = c.frictionCoulomb * Math.tanh(v / 1e-3) + c.frictionViscous * v;
      dy[this.cylOffset + 2 * i] = v;
      dy[this.cylOffset + 2 * i + 1] = (force - c.load - fr) / c.mass;
    });
    for (const n of this.freeNodes) {
      dy[this.stateOfNode[n]!] = ((KAPPA * this.RT) / V[n]!) * inflow[n]! - (KAPPA * P[n]! * dV[n]!) / V[n]!;
    }
    return dy;
  };

  private step(): void {
    this.y = rk4Step(this.deriv, this.t, this.y, DT);
    this.t += DT;
    const y = this.y;
    this.net.cylinders.forEach((c, i) => {
      const xi = this.cylOffset + 2 * i;
      if (y[xi]! <= 0) { y[xi] = 0; if (y[xi + 1]! < 0) y[xi + 1] = 0; }
      else if (y[xi]! >= c.stroke) { y[xi] = c.stroke; if (y[xi + 1]! > 0) y[xi + 1] = 0; }
    });
    for (let i = 0; i < this.cylOffset; i++) y[i] = Math.max(y[i]!, 1e3);
    this.updateValves();
  }
}
