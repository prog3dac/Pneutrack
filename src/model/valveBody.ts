/**
 * Corpo delle valvole distributrici: numero di vie, porte e contenuto di ogni casella.
 *
 * Una casella è un elenco di elementi: `["a", da, a]` è un passaggio (freccia) tra due porte, `["x", porta]`
 * una porta chiusa (tratto a T). Le caselle vanno da sinistra (lato 14) a destra (lato 12); con tre caselle
 * la centrale è quella di riposo. Simbolo (ui/symbols.ts) e simulazione (sim/network.ts) leggono le stesse
 * caselle: quello che si disegna è quello che si simula.
 *
 * Nel file dello schema un corpo personalizzato si scrive nel campo `boxes` della valvola, una casella dopo
 * l'altra separate da `|`: `"1>4 2>3 x5 | 1>2 4>5 x3"`.
 */
import type { PortKind } from "./components";

export type BoxItem = ["a", string, string] | ["x", string];
export type Ways = 2 | 3 | 4 | 5;
/** Casella attiva: lato 14, lato 12 o centrale (riposo delle valvole a tre posizioni). */
export type BoxPosition = "14" | "12" | "0";

export const WAYS: Ways[] = [2, 3, 4, 5];

/** Porte per numero di vie (numerazione ISO 5599). */
export const WAY_PORTS: Record<Ways, [string, PortKind][]> = {
  2: [["1", "supply"], ["2", "work"]],
  3: [["1", "supply"], ["2", "work"], ["3", "exhaust"]],
  4: [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"]],
  5: [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
};

/** Funzioni normalizzate, con il loro contenuto (da sinistra, lato 14, a destra, lato 12). */
export const STANDARD_BOXES: Record<string, BoxItem[][]> = {
  "2/2": [[["a", "1", "2"]], [["x", "1"], ["x", "2"]]],
  "3/2": [[["a", "1", "2"], ["x", "3"]], [["a", "2", "3"], ["x", "1"]]],
  "4/2": [[["a", "1", "4"], ["a", "2", "3"]], [["a", "1", "2"], ["a", "4", "3"]]],
  // tre posizioni: la centrale è quella di riposo (centro chiuso, o utilizzi in scarico)
  "3/3": [[["a", "1", "2"], ["x", "3"]], [["x", "1"], ["x", "2"], ["x", "3"]], [["a", "2", "3"], ["x", "1"]]],
  "4/3": [
    [["a", "1", "4"], ["a", "2", "3"]],
    [["x", "1"], ["x", "2"], ["x", "3"], ["x", "4"]],
    [["a", "1", "2"], ["a", "4", "3"]],
  ],
  "4/3E": [
    [["a", "1", "4"], ["a", "2", "3"]],
    [["a", "4", "3"], ["a", "2", "3"], ["x", "1"]],
    [["a", "1", "2"], ["a", "4", "3"]],
  ],
  // nelle 5 vie lo scarico che non lavora in una posizione è chiuso: 5 col lato 14, 3 col lato 12 (ISO 1219-1)
  "5/2": [[["a", "1", "4"], ["a", "2", "3"], ["x", "5"]], [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]]],
  "5/3": [
    [["a", "1", "4"], ["a", "2", "3"], ["x", "5"]],
    [["x", "1"], ["x", "2"], ["x", "3"], ["x", "4"], ["x", "5"]],
    [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]],
  ],
  "5/3E": [
    [["a", "1", "4"], ["a", "2", "3"], ["x", "5"]],
    [["a", "4", "5"], ["a", "2", "3"], ["x", "1"]],
    [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]],
  ],
  "5/3P": [
    [["a", "1", "4"], ["a", "2", "3"], ["x", "5"]],
    [["a", "1", "4"], ["a", "1", "2"], ["x", "3"], ["x", "5"]],
    [["a", "1", "2"], ["a", "4", "5"], ["x", "3"]],
  ],
};

/** Una casella normalizzata da scegliere nel configuratore. */
export interface Cell { label: string; items: BoxItem[] }

const cell = (label: string, text: string): Cell => ({ label, items: parseBox(text) });

/** Caselle ISO 1219-1 per numero di vie, nell'ordine in cui compaiono nel configuratore. */
export const CELLS: Record<Ways, Cell[]> = {
  2: [
    cell("1→2 aperta", "1>2"),
    cell("chiusa", "x1 x2"),
    cell("2→1 aperta", "2>1"),
  ],
  3: [
    cell("1→2, 3 chiusa", "1>2 x3"),
    cell("2→3, 1 chiusa", "2>3 x1"),
    cell("tutte chiuse", "x1 x2 x3"),
    cell("1→2, 2→3 (tutte aperte)", "1>2 2>3"),
    cell("1→3, 2 chiusa", "1>3 x2"),
  ],
  4: [
    cell("1→4, 2→3", "1>4 2>3"),
    cell("1→2, 4→3", "1>2 4>3"),
    cell("tutte chiuse", "x1 x2 x3 x4"),
    cell("centro in scarico: 2→3, 4→3, 1 chiusa", "4>3 2>3 x1"),
    cell("centro in pressione: 1→2, 1→4, 3 chiusa", "1>4 1>2 x3"),
    cell("ricircolo: 1→3, 2 e 4 chiuse", "1>3 x2 x4"),
  ],
  5: [
    cell("1→4, 2→3, 5 chiusa", "1>4 2>3 x5"),
    cell("1→2, 4→5, 3 chiusa", "1>2 4>5 x3"),
    cell("tutte chiuse", "x1 x2 x3 x4 x5"),
    cell("centro in scarico: 2→3, 4→5, 1 chiusa", "4>5 2>3 x1"),
    cell("centro in pressione: 1→2, 1→4, 3 e 5 chiuse", "1>4 1>2 x3 x5"),
  ],
};

/** Numero di vie di una funzione: "5/3E" → 5 (2 se la funzione non è leggibile). */
export function waysOf(fn: string | undefined): Ways {
  const w = Number(/^([2-5])\//.exec(fn ?? "")?.[1]);
  return (WAYS.includes(w as Ways) ? w : 5) as Ways;
}

/** Numero di posizioni di una funzione: "5/3E" → 3. */
export const positionsOf = (fn: string | undefined): number => Number(/^\d\/(\d)/.exec(fn ?? "")?.[1]) || 2;

/** Una casella scritta come testo ("1>4 2>3 x5"), senza controllare le porte. */
export function parseBox(text: string): BoxItem[] {
  const out: BoxItem[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const a = /^(\d+)>(\d+)$/.exec(tok);
    const x = /^x(\d+)$/i.exec(tok);
    if (a) out.push(["a", a[1]!, a[2]!]);
    else if (x) out.push(["x", x[1]!]);
    else throw new Error(`elemento '${tok}' non valido (atteso per esempio '1>2' o 'x3')`);
  }
  return out;
}

/** Corpo personalizzato dal testo del file, controllato per il numero di vie. Lancia un Error leggibile. */
export function parseBoxes(text: string, ways: Ways): BoxItem[][] {
  const boxes = text.split("|").map((b) => parseBox(b));
  if (boxes.length < 2 || boxes.length > 3) throw new Error(`servono 2 o 3 caselle, ne sono scritte ${boxes.length}`);
  const ports = new Set(WAY_PORTS[ways].map(([n]) => n));
  boxes.forEach((box, i) => {
    for (const it of box) {
      for (const p of it.slice(1)) {
        if (!ports.has(p)) throw new Error(`casella ${i + 1}: la porta ${p} non esiste in una valvola a ${ways} vie`);
      }
      if (it[0] === "a" && it[1] === it[2]) throw new Error(`casella ${i + 1}: passaggio dalla porta ${it[1]} a sé stessa`);
    }
  });
  return boxes;
}

const itemText = (it: BoxItem) => (it[0] === "a" ? `${it[1]}>${it[2]}` : `x${it[1]}`);
export const formatBox = (box: BoxItem[]): string => box.map(itemText).join(" ");
export const formatBoxes = (boxes: BoxItem[][]): string => boxes.map(formatBox).join(" | ");

/** Due caselle hanno lo stesso contenuto (l'ordine degli elementi non conta). */
export const sameBox = (a: BoxItem[], b: BoxItem[]): boolean => {
  const k = (box: BoxItem[]) => box.map(itemText).sort().join(" ");
  return k(a) === k(b);
};

/** Caselle di una valvola: quelle personalizzate, se valide, altrimenti quelle della funzione normalizzata. */
export function valveBoxes(c: { function?: string; boxes?: string }): BoxItem[][] {
  if (c.boxes) {
    try { return parseBoxes(c.boxes, waysOf(c.function)); } catch { /* segnalato dalla validazione */ }
  }
  return STANDARD_BOXES[c.function ?? "5/2"] ?? STANDARD_BOXES["5/2"]!;
}

/** Posizione corrispondente alla casella `index` di una valvola con `count` caselle. */
export const boxPosition = (index: number, count: number): BoxPosition =>
  index === 0 ? "14" : index === count - 1 ? "12" : "0";

/** Indice della casella di una posizione. */
export const boxIndex = (pos: BoxPosition, count: number): number => (pos === "14" ? 0 : pos === "12" ? count - 1 : 1);

/** Passaggi aperti in ogni posizione, letti dalle caselle (le frecce, senza verso: l'aria va nei due sensi). */
export function boxPaths(boxes: BoxItem[][]): Partial<Record<BoxPosition, [string, string][]>> {
  const out: Partial<Record<BoxPosition, [string, string][]>> = {};
  boxes.forEach((box, i) => {
    const pairs = box.filter((it): it is ["a", string, string] => it[0] === "a").map(([, a, b]) => [a, b] as [string, string]);
    if (pairs.length) out[boxPosition(i, boxes.length)] = pairs;
  });
  return out;
}
