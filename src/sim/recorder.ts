/**
 * Registrazione della simulazione per il diagramma delle fasi: corsa dei cilindri
 * (0 dentro, 1 fuori) e stato di bobine, relè, lampade e valvole nel tempo.
 */
import type { Simulator } from "./simulator";

export interface Channel {
  id: string;
  label: string;
  /** "cyl": corsa 0..1; "bool": acceso/spento */
  kind: "cyl" | "bool";
}

export interface Sample { t: number; v: number[] }

/** campionamento [s] di tempo simulato */
export const RECORD_EVERY = 0.005;
/** durata massima conservata [s]: i campioni più vecchi si scartano */
export const RECORD_SPAN = 60;

export class Recorder {
  readonly channels: Channel[];
  samples: Sample[] = [];
  private readonly read: (() => number)[];

  constructor(s: Simulator, labels: Record<string, string> = {}) {
    const ch: Channel[] = [], read: (() => number)[] = [];
    const lab = (id: string, what: string) => labels[id] ? `${id} · ${labels[id]}` : `${id} ${what}`.trim();
    for (const c of s.net.cylinders) {
      ch.push({ id: c.id, label: lab(c.id, ""), kind: "cyl" });
      read.push(() => s.cylinder(c.id)!.fraction);
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
        ch.push({ id: v.id, label: lab(v.id, ""), kind: "bool" });
        read.push(() => (s.valvePosition(v.id) === (v.act14 === "spring" ? "12" : "14") ? 1 : 0));
      }
    }
    this.channels = ch;
    this.read = read;
  }

  /** Registra l'istante `t` se è passato almeno {@link RECORD_EVERY} dall'ultimo campione. */
  record(t: number): void {
    let last = this.samples[this.samples.length - 1];
    if (last && t < last.t) { this.samples = []; last = undefined; } // ricominciata
    if (last && t - last.t < RECORD_EVERY - 1e-9) return;
    this.samples.push({ t, v: this.read.map((f) => f()) });
    const first = this.samples[0]!;
    if (t - first.t > RECORD_SPAN * 1.1) this.samples = this.samples.filter((x) => x.t >= t - RECORD_SPAN);
  }

  clear(): void { this.samples = []; }
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
