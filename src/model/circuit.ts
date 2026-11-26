/**
 * Lo schema pneumatico come grafo: componenti (nodi) e collegamenti tra porte
 * (archi). Le porte unite da collegamenti formano una rete, tutta alla stessa
 * pressione. Più linee sulla stessa porta equivalgono a un raccordo a T.
 *
 * Formato file: `pneutrack/circuit` versione 1.
 */
import type { ComponentData } from "./components";
import { normalizeAnnotations, type AnnotationData } from "./annotations";
import { normalizeBlocks, type BlockData } from "./blocks";
import { parseSheet, type SheetData } from "./sheet";
import type { SheetEntry } from "./sheets";
import type { TubeData } from "./tubes";

export const FORMAT = "pneutrack/circuit";

export interface ConnectionData {
  from: string;
  to: string;
  id?: string;
  /** dimensioni del tubo; senza, il collegamento è ideale */
  tube?: TubeData;
  /** punti di piega della linea [x, y], usati solo dall'editor */
  points?: [number, number][];
}

export interface Placement {
  x: number;
  y: number;
  /** rotazione in quarti di giro, senso orario */
  rot: number;
  /** simbolo specchiato (x → −x nel riferimento del simbolo, prima della rotazione) */
  mirror?: boolean;
  /** sigla e descrizione spostate a mano: scostamento dal centro del componente; senza, posizione automatica */
  label?: [number, number];
  /** foglio del progetto (id di `sheets`); senza, il primo foglio */
  sheet?: string;
}

export interface CircuitDoc {
  format: typeof FORMAT;
  version: 1;
  name: string;
  components: ComponentData[];
  connections: ConnectionData[];
  /** posizione grafica dei componenti, usata solo dall'editor */
  layout: Record<string, Placement>;
  /** foglio di disegno e cartiglio (facoltativo) */
  sheet?: SheetData;
  /** blocchi: gruppi di componenti con nome e descrizione (facoltativo) */
  blocks?: BlockData[];
  /** testi e forme disegnati sullo schema (facoltativo) */
  annotations?: AnnotationData[];
  /** fogli del progetto, in ordine (facoltativo: senza, un solo foglio); vedi `sheets.ts` */
  sheets?: SheetEntry[];
}

export const emptyCircuit = (name = "Nuovo schema"): CircuitDoc =>
  ({ format: FORMAT, version: 1, name, components: [], connections: [], layout: {} });

export class CircuitError extends Error {
  override name = "CircuitError";
}

export type PortRef = [component: string, port: string];

export function parseRef(value: unknown): PortRef {
  if (typeof value !== "string") throw new CircuitError("riferimento porta non valido");
  const i = value.lastIndexOf(".");
  if (i <= 0 || i === value.length - 1) {
    throw new CircuitError(`riferimento porta non valido: '${value}' (atteso 'componente.porta')`);
  }
  return [value.slice(0, i), value.slice(i + 1)];
}
export const refStr = (r: PortRef): string => `${r[0]}.${r[1]}`;
export const refCmp = (a: PortRef, b: PortRef): number =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;

/**
 * Partizione delle porte in reti (union-find). Le porte scollegate formano reti
 * di un solo elemento. Ogni rete è ordinata, e le reti sono ordinate per prima porta.
 */
export function nets(ports: string[], connections: [string, string][]): string[][] {
  const parent = new Map(ports.map((p) => [p, p]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const [a, b] of connections) {
    if (!parent.has(a) || !parent.has(b)) continue;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }
  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(k);
  }
  const sortRefs = (refs: string[]) => refs.map(parseRef).sort(refCmp).map(refStr);
  return [...groups.values()].map(sortRefs).sort((a, b) => refCmp(parseRef(a[0]!), parseRef(b[0]!)));
}

function blocksOf(d: Partial<CircuitDoc>) {
  const ids = (d.components ?? []).map((c) => c?.id).filter((x): x is string => typeof x === "string");
  const blocks = normalizeBlocks(d.blocks, ids);
  return blocks.length ? { blocks } : {};
}

function annotationsOf(d: Partial<CircuitDoc>) {
  const annotations = normalizeAnnotations(d.annotations);
  return annotations.length ? { annotations } : {};
}

/** Controlla la forma generale di un file e lo normalizza. Lancia {@link CircuitError}. */
export function normalizeCircuit(data: unknown): CircuitDoc {
  if (!data || typeof data !== "object") throw new CircuitError("il file non contiene uno schema");
  const d = data as Partial<CircuitDoc> & { format?: string; version?: number };
  if ((d.format ?? FORMAT) !== FORMAT) throw new CircuitError(`formato non riconosciuto: '${d.format}'`);
  if ((d.version ?? 1) !== 1) throw new CircuitError(`versione non supportata: ${d.version}`);
  if (!Array.isArray(d.components)) throw new CircuitError("il file non contiene uno schema");
  return {
    format: FORMAT, version: 1,
    name: typeof d.name === "string" ? d.name : "",
    components: d.components,
    connections: Array.isArray(d.connections) ? d.connections : [],
    layout: d.layout && typeof d.layout === "object" ? d.layout : {},
    ...(parseSheet(d.sheet) ? { sheet: parseSheet(d.sheet)! } : {}),
    ...blocksOf(d),
    ...annotationsOf(d),
    ...(Array.isArray(d.sheets) && d.sheets.length ? { sheets: d.sheets } : {}),
  };
}
