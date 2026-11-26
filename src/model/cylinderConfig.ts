/**
 * Configuratore dei cilindri: un'unica finestra per i cilindri a semplice effetto (in spinta o in trazione,
 * con o senza molla), a doppio effetto, a doppio stelo e senza stelo. Cambiando tipo si conservano misure e
 * parametri che il nuovo tipo conosce; quelli che non conosce si tolgono, così il componente resta valido.
 */
import { CUSHIONING_CHOICES, TYPES, type ComponentData, type Cushioning } from "./components";

export type CylinderKind = "single_push" | "single_pull" | "double" | "double_rod" | "rodless";

export const CYLINDER_KINDS: [CylinderKind, string][] = [
  ["single_push", "Semplice effetto in spinta"],
  ["single_pull", "Semplice effetto in trazione"],
  ["double", "Doppio effetto, uno stelo"],
  ["double_rod", "Doppio effetto, stelo passante"],
  ["rodless", "Doppio effetto, senza stelo"],
];

const TYPE_OF: Record<CylinderKind, string> = {
  single_push: "single_acting_cylinder", single_pull: "single_acting_cylinder", double: "double_acting_cylinder",
  double_rod: "double_rod_cylinder", rodless: "rodless_cylinder",
};

/** Tipi che il configuratore dei cilindri sa aprire. */
export const CONFIGURABLE_CYLINDERS = new Set(Object.values(TYPE_OF));

export interface CylinderConfig {
  label: string;
  kind: CylinderKind;
  /** semplice effetto: con la molla di ritorno */
  spring: boolean;
  /** senza stelo: accoppiamento del carrello */
  coupling: "slide" | "magnetic";
  cushioning: Cushioning;
  magnet: boolean;
  /** parametri come scritti nel file ("32 mm"); vuoto = non scritto */
  params: Record<string, string>;
  /** profilo di forza: righe [posizione, forza] come scritte ("50", "200 N"); nessuna riga = carico costante */
  profile: [string, string][];
}

export function cylinderKindOf(c: ComponentData): CylinderKind {
  switch (c.type) {
    case "single_acting_cylinder": return c.single_kind === "pull" ? "single_pull" : "single_push";
    case "double_rod_cylinder": return "double_rod";
    case "rodless_cylinder": return "rodless";
    default: return "double";
  }
}

export const isSingleKind = (k: CylinderKind) => k === "single_push" || k === "single_pull";

/** Righe del profilo di forza dal testo del file ("0 mm: 0 N; 50 mm: 200 N"). */
export function profileRows(text: string | undefined): [string, string][] {
  return (text ?? "").split(";").map((s) => s.trim()).filter(Boolean).map((part) => {
    const i = part.search(/[:=]/);
    return i < 0 ? [part, ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
}

/** Testo del profilo per il file; le righe vuote non contano, i numeri senza unità valgono mm e N. */
export function profileText(rows: [string, string][]): string {
  return rows.filter(([x, f]) => x.trim() || f.trim()).map(([x, f]) => {
    const xs = /^[-+]?[\d.,]+$/.test(x.trim()) ? `${x.trim()} mm` : x.trim();
    const fs = /^[-+]?[\d.,]+$/.test(f.trim()) ? `${f.trim()} N` : f.trim();
    return `${xs}: ${fs}`;
  }).join("; ");
}

export function cylinderConfigOf(c: ComponentData): CylinderConfig {
  return {
    label: c.label ?? "",
    kind: cylinderKindOf(c),
    spring: c.spring_return !== "no",
    coupling: c.rodless_kind === "magnetic" ? "magnetic" : "slide",
    cushioning: (CUSHIONING_CHOICES.some(([v]) => v === c.cushioning) ? c.cushioning : "none") as Cushioning,
    magnet: c.magnet === "yes",
    params: { ...c.params },
    profile: profileRows(c.load_profile),
  };
}

/** Il componente con le scelte del configuratore (stessa sigla; il tipo può cambiare). */
export function applyCylinderConfig(c: ComponentData, cfg: CylinderConfig): ComponentData {
  const type = TYPE_OF[cfg.kind];
  const def = TYPES.get(type)!;
  const out: ComponentData = { id: c.id, type };
  for (const k of ["code", "cam", "cam_14", "cam_12"] as const) if (c[k] !== undefined) out[k] = c[k];
  if (cfg.label.trim()) out.label = cfg.label.trim();
  // parametri: solo quelli del nuovo tipo, con le unità principali se scritti come numero
  const params: Record<string, string> = {};
  for (const spec of def.params) {
    const v = (cfg.params[spec.name] ?? "").trim();
    if (!v) continue;
    params[spec.name] = /^[-+]?[\d.,]+$/.test(v) && UNIT[spec.dimension] ? `${v} ${UNIT[spec.dimension]}` : v;
  }
  out.params = params;
  const has = (name: string) => def.options?.some((o) => o.name === name);
  if (has("single_kind")) out.single_kind = cfg.kind === "single_pull" ? "pull" : "push";
  if (has("spring_return")) out.spring_return = cfg.spring ? "yes" : "no";
  if (has("cushioning")) out.cushioning = cfg.cushioning;
  if (has("rodless_kind")) out.rodless_kind = cfg.coupling;
  if (has("magnet")) out.magnet = cfg.magnet ? "yes" : "no";
  const profile = profileText(cfg.profile);
  if (profile) out.load_profile = profile;
  return out;
}

const UNIT: Partial<Record<string, string>> = { length: "mm", force: "N", mass: "kg", angle: "deg", pressure: "bar" };
