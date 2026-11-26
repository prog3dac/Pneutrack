/**
 * Distinta componenti: i pezzi dello schema raggruppati per tipo, opzioni, parametri da
 * catalogo e codice articolo, con le sigle e la quantità.
 *
 * Restano fuori i simboli che non sono pezzi da ordinare: punti di connessione, scarico
 * libero in atmosfera, alimentazioni (rete dell'aria, alimentazione elettrica), contatti dei
 * relè (fanno parte del relè) e bobine delle elettrovalvole (fanno parte della valvola).
 */
import type { CircuitDoc } from "./circuit";
import { ACTUATION_SHORT, TYPES, typeList, type Actuation, type ComponentData } from "./components";

export const NOT_PARTS = new Set([
  "junction", "wire_junction", "exhaust", "pressure_source", "electric_supply", "relay_contact", "valve_solenoid",
]);

export interface BomRow {
  pos: number;
  ids: string[];
  /** tipo e varianti, per esempio «Valvola distributrice 5/2, solenoide / molla» */
  description: string;
  /** parametri da catalogo, per esempio «Alesaggio 32 mm, Corsa 100 mm» */
  data: string;
  code: string;
  qty: number;
}

/** Sigle in ordine naturale: V2 prima di V10. */
const natural = (a: string, b: string) => a.localeCompare(b, "it", { numeric: true });
/** Testo breve di una scelta: «NA (normalmente aperto)» → «NA». */
const short = (t: string) => t.replace(/\s*\(.*\)\s*$/, "");
/** «A impulso» → «a impulso», ma «NA» resta «NA». */
const lowerFirst = (t: string) => (/^[A-ZÀ-Ý][a-zà-ÿ ]/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t);

/** Nomi da ordine dove il nome del simbolo non basta. */
const PART_NAMES: Record<string, string> = { relay_coil: "Relè" };
/** Come compaiono in distinta alcune opzioni ("" = non compare: non cambia il pezzo da ordinare). */
const BOM_CHOICES: Record<string, string> = {
  "magnet.no": "", "magnet.yes": "pistone magnetico",
  "coupling_state.coupled": "", "coupling_state.uncoupled": "",
  "coupling.plain": "senza non ritorno", "coupling.check_one": "con non ritorno", "coupling.check_both": "con due non ritorno",
};

function describe(c: ComponentData): string {
  const def = TYPES.get(c.type)!;
  const name = PART_NAMES[c.type] ?? def.label;
  const parts: string[] = [];
  if (c.type === "directional_valve") {
    const a14 = (c.actuation_14 ?? "solenoid") as Actuation, a12 = (c.actuation_12 ?? "spring") as Actuation;
    parts.push(`${c.function ?? "5/2"}, ${ACTUATION_SHORT[a14] ?? a14} / ${ACTUATION_SHORT[a12] ?? a12}`);
    if (c.override === "push" || c.override === "detent") {
      parts.push(c.override === "detent" ? "comando manuale ausiliario con arresto" : "comando manuale ausiliario");
    }
  } else {
    for (const opt of def.options ?? []) {
      const v = (c as unknown as Record<string, string | undefined>)[opt.name] ?? opt.default;
      const fixed = BOM_CHOICES[`${opt.name}.${v}`];
      if (fixed !== undefined) { if (fixed) parts.push(fixed); continue; }
      const choice = opt.choices.find(([k]) => k === v);
      if (choice && !(opt.name === "cushioning" && v === "none")) parts.push(lowerFirst(short(choice[1])));
    }
  }
  return parts.length ? `${name} ${parts.join(", ")}` : name;
}

function catalogData(c: ComponentData): string {
  const def = TYPES.get(c.type)!;
  return def.params.filter((p) => p.group === "catalog" && c.params?.[p.name])
    .map((p) => `${p.label} ${c.params![p.name]!.trim()}`).join(", ");
}

/** Righe della distinta, nell'ordine della palette (alimentazione, valvole, attuatori, elettrico). */
export function billOfMaterials(doc: Pick<CircuitDoc, "components">): BomRow[] {
  const order = new Map(typeList().map((t, i) => [t.type, i]));
  const groups = new Map<string, Omit<BomRow, "pos" | "qty"> & { type: string }>();
  for (const c of doc.components) {
    if (!TYPES.has(c.type) || NOT_PARTS.has(c.type)) continue;
    const row = { description: describe(c), data: catalogData(c), code: (c.code ?? "").trim() };
    const key = [c.type, row.description, row.data, row.code].join("\u0000");
    const g = groups.get(key);
    if (g) g.ids.push(c.id); else groups.set(key, { ...row, ids: [c.id], type: c.type });
  }
  const rows = [...groups.values()];
  for (const r of rows) r.ids.sort(natural);
  rows.sort((a, b) => (order.get(a.type)! - order.get(b.type)!) || natural(a.ids[0]!, b.ids[0]!));
  return rows.map(({ type: _t, ...r }, i) => ({ pos: i + 1, ...r, qty: r.ids.length }));
}

export const BOM_HEADERS = ["Pos.", "Sigle", "Descrizione", "Dati da catalogo", "Codice articolo", "Q.tà"];

export const bomCells = (r: BomRow): string[] =>
  [String(r.pos), r.ids.join(", "), r.description, r.data, r.code, String(r.qty)];

/** CSV con il punto e virgola (come lo apre Excel in italiano) e il BOM UTF-8 per gli accenti. */
export function bomCsv(rows: BomRow[]): string {
  const cell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [BOM_HEADERS, ...rows.map(bomCells)].map((r) => r.map(cell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
