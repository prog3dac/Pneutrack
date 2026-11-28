/**
 * Scheda «Sensori e finecorsa» del cilindro: gli elementi dello schema che il cilindro aziona (finecorsa
 * elettrici, sensori di prossimità, valvole con comando meccanico, strozzatori a rullo) e la quota a cui li
 * aziona.
 *
 * Il dato resta nell'elemento (`cam`, `cam_14`, `cam_12`, vedi `cams.ts`): la scheda ne è una vista che lo
 * legge e lo riscrive. Così il formato del file non cambia, un elemento è azionato da un solo cilindro e
 * copia, incolla, Unisci e libreria continuano a portarsi dietro il collegamento.
 */
import { camCylinder, fmtMm, formatCam, parseCam, type Cam } from "./cams";
import { ACTUATION_SHORT, isMechanical, TYPES, type Actuation, type ComponentData } from "./components";
import { Quantity } from "./units";
import { ONEWAY_ZONE, ROLLER_ZONE } from "../solver/constants";

/** Come il cilindro aziona l'elemento: rullo o tastatore, leva unidirezionale, sensore senza contatto. */
export type LinkKind = "roller" | "oneway" | "sensor";

/** Elemento che un cilindro può azionare (per una valvola: un lato). */
export interface LinkTarget {
  /** "S1" o, per una valvola, "V3.14" */
  key: string;
  id: string;
  side?: "14" | "12";
  kind: LinkKind;
  /** testo per il menu: "S1 · finecorsa NA" */
  label: string;
  /** riferimento scritto nel file ("C1+", "C1@80 mm") */
  cam?: string;
  /** sensore degli schemi precedenti: quota nel parametro posizione ("80 mm") */
  position?: string;
  /** sensore: campo di rilevamento scritto ("3 mm"), vuoto = predefinito */
  range?: string;
}

/** Riga della scheda. */
export interface LinkRow {
  key: string;
  /** fine corsa in uscita, in rientro, o quota in mm */
  mode: "+" | "-" | "at";
  /** quota in mm, come scritta */
  at: string;
  /** leva unidirezionale a una quota: verso in cui scatta ("" = entrambi) */
  dir: "" | "+" | "-";
  /** sensore: campo di rilevamento (±), come scritto; vuoto = predefinito */
  range: string;
}

/** Modifica da riportare in un elemento: il nuovo riferimento (null = scollegato). */
export interface LinkChange {
  key: string;
  cam: string | null;
  /** sensore: nuovo campo di rilevamento ("" = predefinito); assente = invariato */
  range?: string;
}

const optionDefault = (type: string, name: string) => TYPES.get(type)?.options?.find((o) => o.name === name)?.default;
const CONTACT_NAMES: Record<string, string> = { no: "NA", nc: "NC", co: "in scambio" };
const SENSOR_NAMES: Record<string, string> = { reed: "reed", inductive: "induttivo", capacitive: "capacitivo", optical: "ottico" };

/** Comando meccanico del lato di una valvola (il principale o il secondo comando), se c'è. */
function mechanicalOf(c: ComponentData, side: "14" | "12"): Actuation | undefined {
  const main = (c[`actuation_${side}`] ?? optionDefault(c.type, `actuation_${side}`)) as Actuation | undefined;
  if (isMechanical(main)) return main;
  const aux = c[`aux_${side}`] as Actuation | undefined;
  return isMechanical(aux) ? aux : undefined;
}

/** Tutti gli elementi dello schema che un cilindro può azionare, nell'ordine dei componenti. */
export function linkTargets(components: ComponentData[]): LinkTarget[] {
  const out: LinkTarget[] = [];
  const desc = (c: ComponentData) => (c.label ? ` (${c.label})` : "");
  for (const c of components) {
    if (c.type === "limit_switch") {
      const oneway = (c.switch_actuation ?? "roller") === "roller_oneway";
      out.push({ key: c.id, id: c.id, kind: oneway ? "oneway" : "roller", cam: c.cam || undefined,
        label: `${c.id} · finecorsa ${CONTACT_NAMES[c.contact ?? "no"] ?? ""}${oneway ? " unidirezionale" : ""}${desc(c)}` });
    } else if (c.type === "proximity_sensor") {
      out.push({ key: c.id, id: c.id, kind: "sensor", cam: c.cam || undefined,
        position: c.params?.position || undefined, range: c.params?.range ?? "",
        label: `${c.id} · sensore ${SENSOR_NAMES[c.sensor_kind ?? "reed"] ?? ""}${desc(c)}` });
    } else if (c.type === "roller_flow_control") {
      out.push({ key: `${c.id}.14`, id: c.id, side: "14", kind: "roller", cam: c.cam_14 || undefined,
        label: `${c.id} · strozzatore a rullo${desc(c)}` });
    } else if (c.type === "directional_valve") {
      for (const side of ["14", "12"] as const) {
        const act = mechanicalOf(c, side);
        if (!act) continue;
        out.push({ key: `${c.id}.${side}`, id: c.id, side, kind: act === "roller_oneway" ? "oneway" : "roller",
          cam: c[`cam_${side}`] || undefined,
          label: `${c.id} lato ${side} · valvola ${c.function ?? "5/2"}, ${ACTUATION_SHORT[act]}${desc(c)}` });
      }
    }
  }
  return out;
}

/** Cilindro che aziona l'elemento, se ce n'è uno. */
export const linkedCylinder = (t: LinkTarget): string | undefined => (t.cam ? camCylinder(t.cam) : undefined);

/** Riga della scheda per un elemento già collegato (o appena aggiunto, a fine corsa in uscita). */
export function rowOf(t: LinkTarget): LinkRow {
  const cam = t.cam ? parseCam(t.cam) : null;
  const row: LinkRow = { key: t.key, mode: "+", at: "", dir: "", range: t.range ?? "" };
  if (!cam) return row;
  // sensore degli schemi precedenti: la quota sta nel parametro posizione
  if (t.kind === "sensor" && cam.at === undefined && t.position) {
    try { return { ...row, mode: "at", at: mmText(Quantity.parse(t.position).si) }; } catch { /* resta a fine corsa */ }
  }
  if (cam.at === undefined) return { ...row, mode: cam.end ?? "+" };
  return { ...row, mode: "at", at: mmText(cam.at), dir: cam.dir ?? "" };
}

const mmText = (m: number) => fmtMm(m).replace(/ mm$/, "");

/** Quota della riga in metri; `null` se non si legge. */
export function rowAt(row: LinkRow): number | null {
  if (row.mode !== "at") return null;
  const cam = parseCam(`X@${row.at.trim()}`);
  return cam?.at ?? null;
}

/** Riferimento da scrivere nell'elemento per la riga; `null` se la quota non si legge. */
export function rowCam(cylinder: string, row: LinkRow, kind: LinkKind): string | null {
  if (row.mode !== "at") return formatCam({ cylinder, end: row.mode });
  const at = rowAt(row);
  if (at === null) return null;
  const cam: Cam = { cylinder, at };
  if (kind === "oneway" && row.dir) cam.dir = row.dir;
  return formatCam(cam);
}

/** Problema della riga, da mostrare sotto di essa (corsa in metri, se nota). */
export function rowProblem(row: LinkRow, stroke: number | undefined): string | null {
  if (row.mode !== "at") return null;
  const at = rowAt(row);
  if (at === null) return `la quota «${row.at}» non è una misura valida (per esempio 80 o 80 mm)`;
  if (stroke !== undefined && at > stroke * (1 + 1e-9)) return `la quota ${fmtMm(at)} è oltre la corsa (${fmtMm(stroke)})`;
  if (row.range.trim()) {
    try {
      const r = /^[\d.,]+$/.test(row.range.trim()) ? Quantity.of(parseFloat(row.range.replace(",", ".")), "mm") : Quantity.parse(row.range);
      if (r.dimension !== "length" || r.si <= 0) return `campo di rilevamento «${row.range}» non valido`;
    } catch { return `campo di rilevamento «${row.range}» non valido`; }
  }
  return null;
}

/** Quota in metri a cui interviene la riga (fine corsa compresi), per il disegno della corsa. */
export function rowPosition(row: LinkRow, stroke: number): number | null {
  return row.mode === "+" ? stroke : row.mode === "-" ? 0 : rowAt(row);
}

/** Tratto in cui l'elemento è azionato, per la colonna Tolleranza. */
export function fixedZone(kind: LinkKind, row: LinkRow): string {
  if (kind === "sensor") return "";
  if (row.mode === "at") return `±${fmtMm(ROLLER_ZONE)} (camma, fisso)`;
  return kind === "oneway" ? `ultimi ${fmtMm(ONEWAY_ZONE)} (fisso)` : `ultimi ${fmtMm(ROLLER_ZONE)} (fisso)`;
}

/** Testo del campo di rilevamento per il file ("3 mm"; un numero solo vale mm). */
const rangeText = (s: string) => (/^[\d.,]+$/.test(s.trim()) ? `${s.trim()} mm` : s.trim());

/**
 * Modifiche da riportare negli elementi: le righe nuove o cambiate e quelle tolte. Le righe non valide
 * (quota illeggibile) restano come erano.
 */
export function linkChanges(cylinder: string, targets: LinkTarget[], before: LinkRow[], after: LinkRow[]): LinkChange[] {
  const byKey = new Map(targets.map((t) => [t.key, t]));
  const out: LinkChange[] = [];
  const kept = new Set(after.map((r) => r.key));
  for (const r of before) if (!kept.has(r.key)) out.push({ key: r.key, cam: null });
  for (const r of after) {
    const t = byKey.get(r.key);
    if (!t) continue;
    const cam = rowCam(cylinder, r, t.kind);
    if (cam === null) continue;
    const old = before.find((b) => b.key === r.key);
    const change: LinkChange = { key: r.key, cam };
    if (t.kind === "sensor" && r.range.trim() !== (t.range ?? "").trim()) change.range = rangeText(r.range);
    // riga invariata: l'elemento resta com'è (anche un sensore delle versioni precedenti)
    const same = old ? rowCam(cylinder, old, t.kind) === cam : cam === t.cam;
    if (!same || change.range !== undefined) out.push(change);
  }
  return out;
}

/** Riporta le modifiche negli elementi (`get` trova il componente per sigla, in qualsiasi foglio). */
export function applyLinkChanges(get: (id: string) => ComponentData | undefined, changes: LinkChange[]): void {
  for (const ch of changes) {
    const i = ch.key.lastIndexOf(".");
    const side = i > 0 && /^(14|12)$/.test(ch.key.slice(i + 1)) ? ch.key.slice(i + 1) as "14" | "12" : undefined;
    const c = get(side ? ch.key.slice(0, i) : ch.key);
    if (!c) continue;
    const field = side ? (`cam_${side}` as const) : ("cam" as const);
    if (ch.cam) c[field] = ch.cam; else delete c[field];
    if (c.type === "proximity_sensor") {
      // la quota ora sta nel riferimento: il parametro posizione delle versioni precedenti non serve più
      if (c.params?.position) delete c.params.position;
      if (ch.range !== undefined) {
        c.params ??= {};
        if (ch.range) c.params.range = ch.range; else delete c.params.range;
      }
    }
  }
}

/** Riassunto per le opzioni dell'elemento: «C1 a fine corsa in uscita», «C1 a 80 mm dal fondello (40 %)». */
export function linkSummary(t: LinkTarget, stroke: number | undefined): string {
  if (!t.cam) return "";
  const row = rowOf(t);
  const cyl = camCylinder(t.cam);
  if (row.mode === "+") return `${cyl} a fine corsa in uscita (stelo tutto fuori)`;
  if (row.mode === "-") return `${cyl} a fine corsa in rientro (stelo tutto dentro)`;
  const at = rowAt(row);
  const pct = at !== null && stroke ? ` (${Math.round((at / stroke) * 100)} %)` : "";
  const dir = t.kind === "oneway" ? (row.dir === "+" ? ", solo in uscita" : row.dir === "-" ? ", solo in rientro" : ", in entrambi i versi") : "";
  return `${cyl} a ${row.at} mm dal fondello${pct}${dir}`;
}
