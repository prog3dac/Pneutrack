/**
 * Punti di connessione: nodi senza corpo (tipo `junction`, porta unica "1") a cui si
 * collegano più linee, come un raccordo a T o a croce. Per il modello equivalgono a
 * più linee sulla stessa porta: tutte le porte collegate sono nella stessa rete.
 *
 * Qui le operazioni sullo schema: spezzare una linea con un nuovo punto e, al contrario,
 * togliere un punto che unisce solo due linee ricucendole in una.
 */
import type { CircuitDoc, ConnectionData } from "./circuit";
import type { TubeData } from "./tubes";
import { Quantity } from "./units";

export const JUNCTION = "junction";
/** punto di connessione dei fili elettrici */
export const WIRE_JUNCTION = "wire_junction";
export const isJunctionType = (type?: string): boolean => type === JUNCTION || type === WIRE_JUNCTION;
export const JUNCTION_PORT = "1";

type Pt = [number, number];

/** Lunghezza del tubo moltiplicata per `f`, nella stessa unità; invariata se non leggibile. */
function scaleLength(len: string | undefined, f: number): string | undefined {
  if (len === undefined) return undefined;
  try {
    const q = Quantity.parse(len);
    const v = Math.round(q.value * f * 1000) / 1000;
    return `${v} ${q.unit}`;
  } catch {
    return len;
  }
}

function sumLength(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined || b === undefined) return a ?? b;
  try {
    const qa = Quantity.parse(a), qb = Quantity.parse(b);
    const v = Math.round(new Quantity(qa.si + qb.si, qa.dimension, qa.unit).value * 1000) / 1000;
    return `${v} ${qa.unit}`;
  } catch {
    return a;
  }
}

function tubePart(tube: TubeData | undefined, f: number): TubeData | undefined {
  if (!tube) return undefined;
  const t: TubeData = { ...tube };
  const len = scaleLength(tube.length, f);
  if (len !== undefined) t.length = len;
  return t;
}

const withTube = (c: ConnectionData, tube: TubeData | undefined, points: Pt[]): ConnectionData => ({
  ...c, ...(tube ? { tube } : {}), ...(points.length ? { points } : {}),
});

/**
 * Spezza il collegamento `index` con un nuovo punto di connessione `id` in `at`.
 * `bendsBefore` dice quanti punti di piega restano nel primo tratto; `frac` (0..1) è la
 * parte di lunghezza del tubo che va al primo tratto. Restituisce la porta del nuovo punto.
 */
export function splitConnection(doc: CircuitDoc, index: number, at: Pt, id: string,
                                bendsBefore = 0, frac = 0.5, type = JUNCTION): string {
  const c = doc.connections[index];
  if (!c) throw new Error(`collegamento ${index} inesistente`);
  const ref = `${id}.${JUNCTION_PORT}`;
  const pts = c.points ?? [];
  const f = Math.max(0, Math.min(1, frac));
  const { from, to, tube, points: _p, id: _id, ...rest } = c;
  const first = withTube({ ...rest, from, to: ref }, tubePart(tube, f), pts.slice(0, bendsBefore));
  const second = withTube({ ...rest, from: ref, to }, tubePart(tube, 1 - f), pts.slice(bendsBefore));
  doc.components.push({ id, type });
  doc.layout[id] = { x: at[0], y: at[1], rot: 0 };
  doc.connections.splice(index, 1, first, second);
  return ref;
}

/**
 * Toglie il punto di connessione `id` se unisce esattamente due linee, che diventano una
 * sola (la posizione del punto resta come piega, i tubi si sommano). Altrimenti non fa
 * nulla e restituisce false.
 */
export function dissolveJunction(doc: CircuitDoc, id: string): boolean {
  const comp = doc.components.find((c) => c.id === id);
  if (!isJunctionType(comp?.type)) return false;
  const ref = `${id}.${JUNCTION_PORT}`;
  const idx = doc.connections.flatMap((c, i) => (c.from === ref || c.to === ref ? [i] : []));
  if (idx.length !== 2) return false;
  const [a, b] = idx.map((i) => doc.connections[i]!) as [ConnectionData, ConnectionData];
  // a: altro capo → punto, b: punto → altro capo
  const startA = a.to === ref ? a.from : a.to;
  const ptsA = a.to === ref ? (a.points ?? []) : [...(a.points ?? [])].reverse();
  const endB = b.from === ref ? b.to : b.from;
  const ptsB = b.from === ref ? (b.points ?? []) : [...(b.points ?? [])].reverse();
  if (startA === endB) return false;
  const l = doc.layout[id];
  const points: Pt[] = [...ptsA, ...(l ? [[l.x, l.y] as Pt] : []), ...ptsB];
  const len = sumLength(a.tube?.length, b.tube?.length);
  const tube = a.tube || b.tube ? { ...b.tube, ...a.tube, ...(len !== undefined ? { length: len } : {}) } : undefined;
  const merged = withTube({ from: startA, to: endB }, tube, points);
  doc.connections = doc.connections.filter((_, i) => !idx.includes(i));
  doc.connections.splice(Math.min(...idx), 0, merged);
  doc.components = doc.components.filter((c) => c.id !== id);
  delete doc.layout[id];
  return true;
}
