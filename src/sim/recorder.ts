/**
 * Registrazione della simulazione per il diagramma delle fasi: corsa dei cilindri
 * (0 dentro, 1 fuori), pressione dei manometri, stato di bobine, relè, lampade e
 * valvole, e aria consumata nel tempo.
 */
import { BAR, P_ATM } from "../solver/constants";
import { isThreePosition } from "../model/components";
import { CycleTracker } from "./measures";
import type { Simulator } from "./simulator";

export interface Channel {
  id: string;
  label: string;
  /**
   * "cyl": corsa 0..1; "bool": acceso/spento; "bar": pressione relativa [bar];
   * "pos3": valvola a tre posizioni, 0 casella 12, 0,5 centro, 1 casella 14
   */
  kind: "cyl" | "bool" | "bar" | "pos3";
  /** fondo scala dei canali "bar" [bar] */
  max?: number;
  /** cilindri: frazione di corsa entro cui lo stelo è a fine corsa (vedi sim/measures) */
  endTol?: number;
}

export interface Sample {
  t: number;
  v: number[];
  /** aria consumata dall'inizio [Nl] */
  air: number;
  /** portata istantanea dalle alimentazioni [Nl/min] */
  flow: number;
}

/** campionamento [s] di tempo simulato */
export const RECORD_EVERY = 0.005;
/** durata massima conservata [s]: i campioni più vecchi si scartano */
export const RECORD_SPAN = 60;

export class Recorder {
  readonly channels: Channel[];
  samples: Sample[] = [];
  /** cicli completati dall'inizio (anche quelli più vecchi dei campioni conservati) */
  tracker: CycleTracker;
  private readonly read: (() => number)[];

  /** `gauges`: sigle dei manometri da tracciare (la pressione si legge sulla loro porta 1). */
  constructor(private readonly s: Simulator, labels: Record<string, string> = {}, gauges: string[] = []) {
    const ch: Channel[] = [], read: (() => number)[] = [];
    const lab = (id: string, what: string) => labels[id] ? `${id} · ${labels[id]}` : `${id} ${what}`.trim();
    for (const c of s.net.cylinders) {
      // a fine corsa entro 1% o entro i 2,5 mm in cui un rullo è già azionato (2 mm, più il ritardo)
      ch.push({ id: c.id, label: lab(c.id, ""), kind: "cyl", endTol: Math.max(0.01, 0.0025 / c.stroke) });
      read.push(() => s.cylinder(c.id)!.fraction);
    }
    // fondo scala dei manometri: la pressione di alimentazione più alta
    const supply = Math.max(0, ...[...s.net.fixed.values()].map((p) => (p - P_ATM) / BAR));
    const max = supply > 0.5 ? Math.ceil(supply) : 10;
    for (const g of gauges) {
      if (s.net.portNode[`${g}.1`] === undefined) continue;
      ch.push({ id: g, label: lab(g, "bar"), kind: "bar", max });
      read.push(() => s.gauge(`${g}.1`));
    }
    const el = s.electric;
    if (el) {
      for (const l of el.net.loads) {
        ch.push({ id: l.id, label: lab(l.id, ""), kind: "bool" });
        read.push(() => (s.electricState()!.energized.has(l.id) ? 1 : 0));
      }
      for (const r of el.net.relays) {
        // il contatto commutato, distinto dalla bobina (ritardo dei temporizzatori)
        ch.push({ id: `${r.id}:contatti`, label: `${r.id} contatti`, kind: "bool" });
        read.push(() => (s.electricState()!.switched.has(r.id) ? 1 : 0));
      }
    } else {
      for (const v of s.net.valves) {
        if (isThreePosition(v.fn)) {
          ch.push({ id: v.id, label: lab(v.id, ""), kind: "pos3" });
          read.push(() => { const p = s.valvePosition(v.id); return p === "14" ? 1 : p === "12" ? 0 : 0.5; });
          continue;
        }
        ch.push({ id: v.id, label: lab(v.id, ""), kind: "bool" });
        read.push(() => (s.valvePosition(v.id) === (v.act14 === "spring" ? "12" : "14") ? 1 : 0));
      }
    }
    this.channels = ch;
    this.read = read;
    this.tracker = new CycleTracker(ch);
  }

  /** Registra l'istante `t` se è passato almeno {@link RECORD_EVERY} dall'ultimo campione. */
  record(t: number): void {
    let last = this.samples[this.samples.length - 1];
    if (last && t < last.t) { this.clear(); last = undefined; } // ricominciata
    if (last && t - last.t < RECORD_EVERY - 1e-9) return;
    const sample = { t, v: this.read.map((f) => f()), air: this.s.airUsed(), flow: this.s.airFlow() };
    this.samples.push(sample);
    this.tracker.push(sample);
    const first = this.samples[0]!;
    if (t - first.t > RECORD_SPAN * 1.1) this.samples = this.samples.filter((x) => x.t >= t - RECORD_SPAN);
  }

  clear(): void { this.samples = []; this.tracker = new CycleTracker(this.channels); }
}

/**
 * Passi del ciclo: istanti in cui un cilindro arriva a fine corsa (o ne parte).
 * Il diagramma spostamento-passo mette questi istanti a distanza uguale.
 */
export function stepTimes(channels: Channel[], samples: Sample[]): number[] {
  if (!samples.length) return [];
  const idx = channels.flatMap((c, i) => (c.kind === "cyl" ? [i] : []));
  const end = (x: number) => (x > 0.99 ? 1 : x < 0.01 ? -1 : 0);
  const times = [samples[0]!.t];
  let prev = idx.map((i) => end(samples[0]!.v[i]!));
  for (const s of samples.slice(1)) {
    const now = idx.map((i) => end(s.v[i]!));
    // un cilindro arriva a fine corsa: chiude un passo
    if (now.some((e, k) => e !== 0 && e !== prev[k])) times.push(s.t);
    prev = now;
  }
  const lastT = samples[samples.length - 1]!.t;
  if (times[times.length - 1]! < lastT - 1e-9) times.push(lastT);
  return times;
}

/** Converte un tempo nella coordinata "passo" (passo k all'istante times[k], lineare in mezzo). */
export function toStep(times: number[], t: number): number {
  if (times.length < 2) return 0;
  let k = 0;
  while (k < times.length - 2 && t > times[k + 1]!) k++;
  const a = times[k]!, b = times[k + 1]!;
  return k + (b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0);
}
