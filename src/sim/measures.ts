/**
 * Misure ricavate dalla registrazione della simulazione: tempi di corsa dei cilindri,
 * cicli (dalla partenza dalla posizione di riposo al ritorno) e aria consumata.
 */
import type { Channel, Sample } from "./recorder";

/** tolleranza di fine corsa predefinita sulla frazione 0..1 */
const END_TOL = 0.01;
/** sotto questa portata [Nl/min] l'impianto è fermo: il consumo di un ciclo parte da lì */
const QUIET_FLOW = 1;

export interface Stroke {
  /** sigla del cilindro */
  id: string;
  /** "+" uscita, "-" rientro */
  dir: "+" | "-";
  /** istante in cui lo stelo lascia il fine corsa [s] */
  start: number;
  /** istante in cui arriva al fine corsa opposto [s] */
  end: number;
}

export interface Cycle {
  /** numero del ciclo, da 1 */
  n: number;
  /** partenza del primo cilindro dalla posizione di riposo [s] */
  start: number;
  /** tutti i cilindri di nuovo a riposo [s] */
  end: number;
  /** aria consumata nel ciclo [Nl] */
  air: number;
}

const endOf = (x: number, tol = END_TOL) => (x >= 1 - tol ? 1 : x <= tol ? -1 : 0);

/** Corse complete dei cilindri: da un fine corsa all'altro. */
export function strokes(channels: Channel[], samples: Sample[]): Stroke[] {
  const out: Stroke[] = [];
  channels.forEach((c, i) => {
    if (c.kind !== "cyl") return;
    let lastEnd = 0, leftAt = NaN;
    for (let k = 0; k < samples.length; k++) {
      const e = endOf(samples[k]!.v[i]!, c.endTol);
      if (e !== 0) {
        if (lastEnd !== 0 && e !== lastEnd && !Number.isNaN(leftAt)) {
          out.push({ id: c.id, dir: e === 1 ? "+" : "-", start: leftAt, end: samples[k]!.t });
        }
        lastEnd = e;
        leftAt = NaN;
      } else if (lastEnd !== 0 && Number.isNaN(leftAt)) {
        // l'ultimo campione ancora a fine corsa
        leftAt = samples[Math.max(0, k - 1)]!.t;
      }
    }
  });
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Cicli: un ciclo inizia quando un cilindro lascia la posizione di riposo (quella del
 * primo campione) e finisce quando tutti i cilindri vi sono tornati. Il consumo parte
 * dall'ultimo istante a portata ferma prima della partenza, così comprende il
 * riempimento della camera che precede il distacco dello stelo, e arriva fino a quando
 * la portata si ferma dopo il ritorno (o al ciclo dopo, se riparte subito).
 *
 * Si alimenta un campione alla volta, così conta anche i cicli più vecchi dei
 * campioni che la registrazione conserva.
 */
export class CycleTracker {
  readonly cycles: Cycle[] = [];
  private idx: number[] = [];
  private tol: number[] = [];
  private rest: number[] | null = null;
  /** aria all'ultimo istante a portata ferma, e all'inizio del ciclo in corso */
  private quietAir = 0;
  private start: { t: number; air: number } | null = null;

  constructor(channels: Channel[]) {
    this.idx = channels.flatMap((c, i) => (c.kind === "cyl" ? [i] : []));
    this.tol = this.idx.map((i) => channels[i]!.endTol ?? END_TOL);
  }

  push(s: Sample): void {
    if (!this.idx.length) return;
    const now = this.idx.map((i, k) => endOf(s.v[i]!, this.tol[k]));
    if (!this.rest) {
      // si parte a metà corsa: nessun riposo da cui contare
      if (now.some((e) => e === 0)) { this.idx = []; return; }
      this.rest = now;
      this.quietAir = s.air;
      return;
    }
    const atRest = now.every((e, k) => e === this.rest![k]);
    if (!this.start) {
      if (atRest) {
        if (this.open) {
          // dopo l'arrivo le camere finiscono di riempirsi: aria del ciclo appena chiuso
          this.open.air = s.air - this.openAir;
          if (s.flow <= QUIET_FLOW) this.open = null;
        }
        if (s.flow <= QUIET_FLOW) this.quietAir = s.air;
      } else {
        // riparte prima che la portata si fermi: il ciclo nuovo comincia dove finisce il vecchio
        const air = this.open ? this.openAir + this.open.air : this.quietAir;
        this.open = null;
        this.start = { t: this.last?.t ?? s.t, air };
      }
    } else if (atRest) {
      const c: Cycle = { n: this.cycles.length + 1, start: this.start.t, end: s.t, air: s.air - this.start.air };
      this.cycles.push(c);
      this.open = c;
      this.openAir = this.start.air;
      this.start = null;
      this.quietAir = s.air;
    }
    this.last = s;
  }

  /** ultimo ciclo chiuso, la cui aria cresce finché la portata non si ferma */
  private open: Cycle | null = null;
  private openAir = 0;
  private last: Sample | null = null;
}

/** Cicli completi in una serie di campioni (vedi {@link CycleTracker}). */
export function cycles(channels: Channel[], samples: Sample[]): Cycle[] {
  const tr = new CycleTracker(channels);
  for (const s of samples) tr.push(s);
  return tr.cycles;
}

/** Riepilogo per il pannello: ultimo ciclo completo e media dei cicli. */
export interface CycleSummary {
  count: number;
  last?: Cycle;
  /** tempo medio di ciclo [s] */
  meanTime?: number;
  /** aria media per ciclo [Nl] */
  meanAir?: number;
  /** consumo medio durante i cicli [Nl/min] */
  meanFlow?: number;
}

export function summarize(list: Cycle[]): CycleSummary {
  if (!list.length) return { count: 0 };
  const time = list.reduce((s, c) => s + (c.end - c.start), 0);
  const air = list.reduce((s, c) => s + c.air, 0);
  return { count: list.length, last: list[list.length - 1], meanTime: time / list.length,
           meanAir: air / list.length, meanFlow: time > 0 ? (air / time) * 60 : undefined };
}
