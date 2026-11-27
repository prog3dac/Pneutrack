/**
 * Simulazione interattiva: avanza nel tempo con passi RK4 fissi e lascia
 * cambiare i comandi delle valvole mentre gira (pulsanti, solenoidi).
 *
 * Equazioni dei nodi e dei cilindri:
 *   dp/dt = κRT/V · ṁ − κ p/V · dV/dt
 *   m ẍ = p_A A1 − p_B A2 − p_atm (A1 − A2) − carico − attrito − molla
 *
 * Il caso base (orifizi, volumi, cilindro con attrito coulombiano e viscoso) coincide con il prototipo in
 * src/solver/simulate.ts, che test/sim.test.ts usa come riferimento indipendente. Il prototipo non ha
 * attrito di primo distacco, ammortizzo, peso, bloccaggio, arresto a fine corsa né consumo d'aria: quelli
 * esistono solo qui.
 */
import { BAR, KAPPA, ONEWAY_MIN_SPEED, ONEWAY_ZONE, P_ATM, R_AIR, RHO_ANR, ROLLER_ZONE } from "../solver/constants";
import { signedFlow } from "../solver/flow";
import type { CylinderSpec, Position, SimNetwork, Tunable, ValveSpec } from "./network";
import { ElectricState, type ElectricSnapshot } from "./electric";
import { isElectric, isManual, profileForce, isMechanical, isPilot, isReturn, isThreePosition, type Actuation, type Cam } from "../model/components";



/** velocità sotto la quale l'attrito vale quello statico [m/s] */
const STRIBECK_V = 0.01;

export const DT = 2e-5;

/**
 * Conduttanza dello scarico di una camera ammortizzata: lo spillo conico entra nella guarnizione e chiude il
 * passaggio libero `free` con continuità fino a lasciare solo la vite `screw`. `s` è la frazione del tratto
 * conico già percorsa (0 all'ingresso, da 1 in poi resta solo la vite). L'interpolazione è sul logaritmo, con un
 * raccordo morbido ai due capi, perché la conduttanza cambia di ordini di grandezza.
 */
export function cushionConductance(free: number, screw: number, s: number): number {
  if (s <= 0) return free;
  if (s >= 1) return screw;
  const k = s * s * (3 - 2 * s);
  return Math.exp(Math.log(free) + (Math.log(screw) - Math.log(free)) * k);
}
/** il circuito elettrico si aggiorna ogni millisecondo simulato */
export const ELECTRIC_EVERY = 50;

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
  private y: Float64Array;
  private readonly stateOfNode: number[];
  /** pressione dei nodi fissi [Pa ass.] (copia di `net.fixed`, letta a ogni passo) e indicatore di nodo fisso */
  private readonly fixedP: Float64Array;
  private readonly isFixed: Uint8Array;
  /** indice di ogni cilindro per sigla */
  private readonly cylIndex = new Map<string, number>();
  /** stato che integra la massa passata da ogni misuratore di portata, per sigla */
  private readonly meterIndex = new Map<string, number>();
  /** per ogni orifizio il suo misuratore (posizione da `meterOffset`), o −1 */
  private readonly meterOfOrifice: Int32Array;
  private readonly meterOffset: number;
  /** portata di ogni misuratore nello stadio di RK4 in corso [kg/s] */
  private readonly bufMeter: Float64Array;
  /** massa passata da ogni misuratore all'inizio dell'ultimo passo [kg] */
  private readonly meterBefore: Float64Array;
  // memoria di lavoro del passo di integrazione, allocata una volta sola
  private readonly bufP: Float64Array;
  private readonly bufInflow: Float64Array;
  private readonly bufV: Float64Array;
  private readonly bufDV: Float64Array;
  private readonly k1: Float64Array;
  private readonly k2: Float64Array;
  private readonly k3: Float64Array;
  private readonly k4: Float64Array;
  private readonly yTmp: Float64Array;
  private readonly freeNodes: number[] = [];
  private readonly cylOffset: number;
  /** indice dello stato che integra la massa d'aria uscita dalle alimentazioni [kg] */
  private readonly airIndex: number;
  /** nodi a pressione imposta sopra l'atmosfera: le alimentazioni */
  private readonly supplyNodes: number[];
  private readonly RT: number;
  /** posizione corrente di ogni valvola */
  readonly positions: Position[];
  /** comandi esterni (pulsante premuto, solenoide eccitato) per lato */
  private readonly commands = new Map<string, boolean>();
  /** comandi manuali ausiliari dei solenoidi azionati, per lato */
  private readonly overrides = new Map<string, boolean>();
  /** circuito elettrico di comando (null se lo schema non ne ha) */
  readonly electric: ElectricState | null;
  private stepCount = 0;

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
    this.airIndex = this.cylOffset + 2 * net.cylinders.length;
    this.meterOffset = this.airIndex + 1;
    this.meterOfOrifice = new Int32Array(net.orifices.length).fill(-1);
    net.orifices.forEach((o, k) => {
      if (o.meter === undefined) return;
      this.meterOfOrifice[k] = this.meterIndex.size;
      this.meterIndex.set(o.meter, this.meterIndex.size);
    });
    this.bufMeter = new Float64Array(this.meterIndex.size);
    this.meterBefore = new Float64Array(this.meterIndex.size);
    const len = this.meterOffset + this.meterIndex.size;
    this.y = new Float64Array(len);
    this.fixedP = new Float64Array(net.nodeCount);
    this.isFixed = new Uint8Array(net.nodeCount);
    this.syncFixed();
    net.cylinders.forEach((c, i) => this.cylIndex.set(c.id, i));
    this.bufP = new Float64Array(net.nodeCount);
    this.bufInflow = new Float64Array(net.nodeCount);
    this.bufV = new Float64Array(net.nodeCount);
    this.bufDV = new Float64Array(net.nodeCount);
    this.k1 = new Float64Array(len);
    this.k2 = new Float64Array(len);
    this.k3 = new Float64Array(len);
    this.k4 = new Float64Array(len);
    this.yTmp = new Float64Array(len);
    this.supplyNodes = [...net.fixed].filter(([, p]) => p > P_ATM + 1).map(([n]) => n);
    for (const n of this.freeNodes) this.y[this.stateOfNode[n]!] = P_ATM;
    net.cylinders.forEach((c, i) => { this.y[this.cylOffset + 2 * i] = c.x0 ?? 0; });
    this.positions = net.valves.map((v) => v.initial);
    for (const v of net.valves) for (const side of v.startCommands ?? []) this.commands.set(`${v.id}.${side}`, true);
    this.electric = net.electric ? new ElectricState(net.electric) : null;
    this.updateElectric();
    this.updateValves();
  }

  /** Regolazione `param` del componente `id` (riduttore, strozzatore, ritardo...), se c'è. */
  tunable(id: string, param: string): Tunable | undefined {
    return this.net.tunables.find((t) => t.id === id && t.param === param);
  }

  /**
   * Cambia una regolazione mentre la simulazione gira; il valore resta nel suo campo. Vale anche dopo
   * un riavvio, perché sta nella rete compilata. Restituisce il valore applicato.
   */
  setTunable(id: string, param: string, value: number): number | null {
    const t = this.tunable(id, param);
    if (!t || !Number.isFinite(value)) return null;
    t.value = Math.min(t.max, Math.max(t.min, value));
    t.apply(t.value);
    this.syncFixed(); // la pressione di un'alimentazione sta tra i nodi fissi
    return t.value;
  }

  /** Aziona a mano un pulsante, un interruttore o un finecorsa elettrico (premuto o rilasciato). */
  setSwitch(id: string, on: boolean): void {
    if (!this.electric) return;
    this.electric.setManual(id, on);
    this.updateElectric();
    this.updateValves();
  }

  switchState(id: string): boolean {
    return this.electric?.manualState(id) ?? false;
  }

  /** Stato del circuito elettrico (bobine eccitate, contatti, potenziali), o null. */
  electricState(): ElectricSnapshot | null {
    return this.electric?.snapshot ?? null;
  }

  /** Il solenoide è comandato da una bobina del circuito elettrico (e non si aziona a clic). */
  isDriven(valveId: string, side: "14" | "12"): boolean {
    return this.electric?.drive(`${valveId}.${side}`) !== undefined;
  }

  private updateElectric(): void {
    if (!this.electric) return;
    const P = this.pressures();
    this.electric.update({
      t: this.t,
      cylinder: (id) => this.cylinder(id),
      gauge: (n) => P[n]! - P_ATM,
    });
  }

  /** Imposta un comando esterno: lato "14" o "12" di una valvola, attivo o no. */
  setCommand(valveId: string, side: "14" | "12", active: boolean): void {
    this.commands.set(`${valveId}.${side}`, active);
    this.updateValves();
  }

  command(valveId: string, side: "14" | "12"): boolean {
    return this.commands.get(`${valveId}.${side}`) ?? false;
  }

  /** Aziona il comando manuale ausiliario di un solenoide (anche se il solenoide segue una bobina). */
  setOverride(valveId: string, side: "14" | "12", active: boolean): void {
    this.overrides.set(`${valveId}.${side}`, active);
    this.updateValves();
  }

  override(valveId: string, side: "14" | "12"): boolean {
    return this.overrides.get(`${valveId}.${side}`) ?? false;
  }

  /**
   * Avanza di `duration` secondi (a passi di {@link DT}). Con `budgetMs` si ferma prima se il calcolo supera quel
   * tempo (per non bloccare la pagina con schemi grandi). Restituisce il tempo simulato davvero percorso [s].
   */
  advance(duration: number, budgetMs = Infinity): number {
    const steps = Math.max(1, Math.round(duration / DT));
    const start = budgetMs < Infinity ? performance.now() : 0;
    let i = 0;
    while (i < steps) {
      this.step();
      i++;
      // l'orologio si legge ogni 100 passi (2 ms simulati): leggerlo a ogni passo costerebbe
      if (i % 100 === 0 && budgetMs < Infinity && performance.now() - start > budgetMs) break;
    }
    return i * DT;
  }

  /** Pressione assoluta di ogni nodo [Pa]. */
  pressures(): number[] {
    return Array.from(this.fillPressures(this.y, new Float64Array(this.net.nodeCount)));
  }

  private syncFixed(): void {
    this.isFixed.fill(0);
    for (const [n, p] of this.net.fixed) { this.fixedP[n] = p; this.isFixed[n] = 1; }
  }

  /** Pressioni assolute dello stato `y` scritte in `out`. */
  private fillPressures(y: ArrayLike<number>, out: Float64Array): Float64Array {
    const sn = this.stateOfNode, fx = this.isFixed, fp = this.fixedP;
    for (let n = 0; n < out.length; n++) out[n] = fx[n] ? fp[n]! : y[sn[n]!]!;
    return out;
  }

  /** Pressione relativa [bar] su una porta ("C1.A"). */
  gauge(port: string): number {
    const n = this.net.portNode[port];
    if (n === undefined) return 0;
    return ((this.isFixed[n] ? this.fixedP[n]! : this.y[this.stateOfNode[n]!]!) - P_ATM) / BAR;
  }

  cylinder(id: string): CylinderState | undefined {
    const i = this.cylIndex.get(id);
    if (i === undefined) return undefined;
    const x = this.y[this.cylOffset + 2 * i]!, v = this.y[this.cylOffset + 2 * i + 1]!;
    return { x, v, fraction: x / this.net.cylinders[i]!.stroke };
  }

  /** Aria consumata dall'inizio della simulazione, in litri normali ANR (ISO 8778: 20 °C, 1 bar ass.). */
  airUsed(): number {
    return (this.y[this.airIndex]! / RHO_ANR) * 1000;
  }

  /** Portata istantanea che esce dalle alimentazioni [Nl/min, ANR]. */
  airFlow(): number {
    const out = new Float64Array(this.y.length);
    this.deriv(this.y, out);
    return (out[this.airIndex]! / RHO_ANR) * 1000 * 60;
  }

  /**
   * Portata che attraversa il misuratore di portata `id` [Nl/min, ANR]: positiva da 1 verso 2,
   * negativa nel verso opposto. `undefined` se `id` non è un misuratore della rete.
   */
  meterFlow(id: string): number | undefined {
    const i = this.meterIndex.get(id);
    if (i === undefined) return undefined;
    if (this.t === 0) return 0;
    // la massa passata nell'ultimo passo, non la portata istantanea: un nodo piccolo tra due orifizi
    // grandi è rigido, e RK4 vi trova un equilibrio in cui le portate dei singoli stadi non sono
    // zero ma la loro media pesata sì. La media pesata è quella che sposta davvero l'aria.
    return ((this.y[this.meterOffset + i]! - this.meterBefore[i]!) / DT / RHO_ANR) * 1000 * 60;
  }

  /** Sigle dei misuratori di portata della rete. */
  meters(): string[] {
    return [...this.meterIndex.keys()];
  }

  /** Aria passata dal misuratore di portata `id` dall'inizio [Nl, ANR], con segno come {@link meterFlow}. */
  meterVolume(id: string): number | undefined {
    const i = this.meterIndex.get(id);
    return i === undefined ? undefined : (this.y[this.meterOffset + i]! / RHO_ANR) * 1000;
  }

  valvePosition(id: string): Position | undefined {
    const i = this.net.valves.findIndex((v) => v.id === id);
    return i < 0 ? undefined : this.positions[i];
  }

  /** da quando il pilotaggio di ogni temporizzatore è attivo (s), per lato */
  private readonly pilotSince = new Map<string, number>();

  /** Lato comandato in questo istante (pilotaggio, finecorsa o comando esterno, o il secondo comando del lato). */
  sideActive(v: ValveSpec, side: "14" | "12", P: ArrayLike<number> = this.pressures()): boolean {
    return this.mainActive(v, side, P) || this.auxActive(v, side);
  }

  /** Secondo comando del lato: manuale (come il comando ausiliario) o meccanico (rullo premuto dal cilindro). */
  auxActive(v: ValveSpec, side: "14" | "12"): boolean {
    const aux = side === "14" ? v.aux14 : v.aux12;
    if (!aux) return false;
    const cam = side === "14" ? v.cam14 : v.cam12;
    // un rullo senza cilindro si preme a mano, come il comando manuale
    if (isManual(aux) || (isMechanical(aux) && !cam)) return this.override(v.id, side);
    return isMechanical(aux) && !!cam && this.camPressed(aux, cam);
  }

  /** Rullo o tastatore premuto dal cilindro del finecorsa. */
  private camPressed(act: Actuation, cam: Cam): boolean {
    const i = this.cylIndex.get(cam.cylinder);
    if (i === undefined) return false;
    const c = this.cylinder(cam.cylinder)!;
    const stroke = this.net.cylinders[i]!.stroke;
    if (act === "roller_oneway") {
      // leva ribaltabile: azionata solo mentre lo stelo la supera andando verso il fine corsa
      const tol = Math.min(0.5, ONEWAY_ZONE / stroke);
      const inZone = cam.end === "+" ? c.fraction >= 1 - tol : c.fraction <= tol;
      const towards = cam.end === "+" ? c.v > ONEWAY_MIN_SPEED : c.v < -ONEWAY_MIN_SPEED;
      return inZone && towards;
    }
    // rullo e tastatore sono premuti negli ultimi 2 mm di corsa
    const tol = ROLLER_ZONE / stroke;
    return cam.end === "+" ? c.fraction >= 1 - tol : c.fraction <= tol;
  }

  private mainActive(v: ValveSpec, side: "14" | "12", P: ArrayLike<number>): boolean {
    const act = side === "14" ? v.act14 : v.act12;
    if (isReturn(act)) return false;
    if (isPilot(act)) {
      const n = side === "14" ? v.pilot14 : v.pilot12;
      const on = n !== undefined && P[n]! - P_ATM >= v.pilotThreshold;
      if (!v.delay) return on;
      const key = `${v.id}.${side}`;
      if (!on) { this.pilotSince.delete(key); return false; }
      if (!this.pilotSince.has(key)) this.pilotSince.set(key, this.t);
      return this.t - this.pilotSince.get(key)! >= v.delay - 1e-9;
    }
    const cam = side === "14" ? v.cam14 : v.cam12;
    if (isMechanical(act) && cam) return this.camPressed(act, cam);
    const on = (this.electric?.drive(`${v.id}.${side}`) ?? this.command(v.id, side)) ||
      (!!v.override && isElectric(act) && this.override(v.id, side));
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
  private returns(v: ValveSpec, side: "14" | "12", P: ArrayLike<number>): boolean {
    const act = side === "14" ? v.act14 : v.act12;
    if (act === "spring" || act === "spring_air_return") return true;
    if (act !== "air_return" && act !== "air_return_ext") return false;
    const n = side === "14" ? v.pilot14 : v.pilot12;
    return n !== undefined && P[n]! - P_ATM >= v.pilotThreshold;
  }

  /** Il bloccaggio del cilindro tiene fermo lo stelo (pilotaggio sotto la pressione di sblocco). */
  private locked(c: CylinderSpec, P: ArrayLike<number>, x: number): boolean {
    if (!c.lock || P[c.lock.node]! - P_ATM >= c.lock.threshold) return false;
    return c.lock.at === "any" || x <= 1e-6;
  }

  /** Logica discreta delle valvole: comandi, pilotaggi, molle e memoria delle bistabili. */
  private updateValves(): void {
    const P = this.fillPressures(this.y, this.bufP);
    this.net.valves.forEach((v, i) => {
      const s14 = this.sideActive(v, "14", P), s12 = this.sideActive(v, "12", P);
      let pos = this.positions[i]!;
      if (s14 && s12 && v.dominant) {
        // segnale dominante: con i due comandi insieme vince il lato indicato
        pos = v.dominant;
      } else if (isThreePosition(v.fn)) {
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

  /** Derivate dello stato `y`, scritte in `dy` (senza allocare: gira quattro volte a ogni passo). */
  private deriv(y: Float64Array, dy: Float64Array): void {
    const net = this.net;
    const P = this.fillPressures(y, this.bufP);
    const inflow = this.bufInflow.fill(0);
    const meter = this.bufMeter.fill(0);
    for (let k = 0; k < net.orifices.length; k++) {
      const o = net.orifices[k]!;
      if (o.valve !== undefined && !o.positions!.includes(this.positions[o.valve]!)) continue;
      const pa = o.boost ? P_ATM + o.boost * (P[o.a]! - P_ATM) : P[o.a]!, pb = P[o.b]!;
      if (o.oneWay && pa <= pb) continue;
      let C = o.C;
      if (o.cushion && pa > pb) {
        // aria che esce dalla camera: dentro l'ammortizzo passa solo dalla vite
        const cy = net.cylinders[o.cushion.cylinder]!;
        const x = y[this.cylOffset + 2 * o.cushion.cylinder]!;
        // profondità dentro l'ammortizzo: 0 all'ingresso dello spillo, cresce verso il fine corsa
        const depth = o.cushion.end === "cap" ? o.cushion.length - x : x - (cy.stroke - o.cushion.length);
        if (depth > 0) C = cushionConductance(o.C, o.cushion.C, depth / o.cushion.taper);
      }
      let m = signedFlow(pa, pb, C, o.bcrit, net.temperature);
      if (o.gate) {
        const g = o.gate(P);
        if (g <= 0) continue;
        m *= g;
      }
      const limit = o.limitFn ? o.limitFn(P) : o.limit;
      if (limit !== undefined) {
        // riduttore: solo a→b, chiusura progressiva negli ultimi 0,1 bar
        m = m > 0 ? m * Math.min(1, Math.max(0, (limit - pb) / (0.1 * BAR))) : 0;
      }
      inflow[o.a]! -= m * (o.boost ?? 1);
      inflow[o.b]! += m;
      const mi = this.meterOfOrifice[k]!;
      if (mi >= 0) meter[mi] = m;
    }
    const V = this.bufV;
    for (let n = 0; n < V.length; n++) V[n] = net.baseVolume[n]!;
    const dV = this.bufDV.fill(0);
    dy.fill(0);
    for (let i = 0; i < net.cylinders.length; i++) {
      const c = net.cylinders[i]!;
      const x = y[this.cylOffset + 2 * i]!;
      let v = y[this.cylOffset + 2 * i + 1]!;
      V[c.capNode]! += c.Vcap0 + c.A1 * x;
      V[c.rodNode]! += c.Vrod0 + c.A2 * (c.stroke - x);
      const force = P[c.capNode]! * c.A1 - P[c.rodNode]! * c.A2 - P_ATM * (c.A1 - c.A2) - c.spring;
      // attrito di Stribeck: dal valore statico a quello dinamico man mano che la velocità supera STRIBECK_V
      // le guarnizioni premono di più con la camera in pressione: l'attrito coulombiano cresce con la pressione
      const sealLoad = c.frictionPressure *
        (Math.max(0, P[c.capNode]! - P_ATM) * c.A1 + Math.max(0, P[c.rodNode]! - P_ATM) * c.A2);
      const coulomb = c.frictionCoulomb + sealLoad + (c.frictionStatic - c.frictionCoulomb) * Math.exp(-((v / STRIBECK_V) ** 2));
      const fr = coulomb * Math.tanh(v / 1e-3) + c.frictionViscous * v;
      const load = c.loadProfile ? profileForce(c.loadProfile, x) : c.load;
      let acc = (force - load - c.gravity - fr) / c.mass;
      // a fine corsa, spinto contro l'arresto: il pistone sta fermo. Senza questo nei passi intermedi
      // di RK4 entrerebbe nell'arresto e cambierebbe il volume delle camere a vuoto, e lo
      // scatto indietro a ogni passo farebbe passare aria che non esiste (consumo fantasma)
      if ((x <= 0 && v <= 0 && acc < 0) || (x >= c.stroke && v >= 0 && acc > 0)) { v = 0; acc = 0; }
      // bloccaggio dello stelo: fermo finché non arriva la pressione di sblocco
      if (this.locked(c, P, x)) { v = 0; acc = 0; }
      dV[c.capNode]! += c.A1 * v;
      dV[c.rodNode]! += -c.A2 * v;
      dy[this.cylOffset + 2 * i] = v;
      dy[this.cylOffset + 2 * i + 1] = acc;
    }
    for (const n of this.freeNodes) {
      dy[this.stateOfNode[n]!] = ((KAPPA * this.RT) / V[n]!) * inflow[n]! - (KAPPA * P[n]! * dV[n]!) / V[n]!;
    }
    // consumo: aria che esce dalle alimentazioni (quella che vi rientra si sottrae)
    for (const n of this.supplyNodes) dy[this.airIndex]! -= inflow[n]!;
    for (let i = 0; i < meter.length; i++) dy[this.meterOffset + i] = meter[i]!;
  }

  /** Un passo Runge-Kutta 4 a passo fisso, sul posto. */
  private rk4(h: number): void {
    const { y, yTmp, k1, k2, k3, k4 } = this;
    const n = y.length;
    this.deriv(y, k1);
    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + (h / 2) * k1[i]!;
    this.deriv(yTmp, k2);
    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + (h / 2) * k2[i]!;
    this.deriv(yTmp, k3);
    for (let i = 0; i < n; i++) yTmp[i] = y[i]! + h * k3[i]!;
    this.deriv(yTmp, k4);
    for (let i = 0; i < n; i++) y[i] = y[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
  }

  private step(): void {
    this.meterBefore.set(this.y.subarray(this.meterOffset));
    this.rk4(DT);
    this.t += DT;
    const y = this.y;
    const P = this.fillPressures(y, this.bufP);
    this.net.cylinders.forEach((c, i) => {
      const xi = this.cylOffset + 2 * i;
      if (this.locked(c, P, y[xi]!)) y[xi + 1] = 0;
      if (y[xi]! <= 0) { y[xi] = 0; if (y[xi + 1]! < 0) y[xi + 1] = 0; }
      else if (y[xi]! >= c.stroke) { y[xi] = c.stroke; if (y[xi + 1]! > 0) y[xi + 1] = 0; }
    });
    for (let i = 0; i < this.cylOffset; i++) y[i] = Math.max(y[i]!, 1e3);
    if (this.electric && ++this.stepCount % ELECTRIC_EVERY === 0) this.updateElectric();
    this.updateValves();
  }
}
