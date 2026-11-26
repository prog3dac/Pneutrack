/**
 * Configuratore delle valvole distributrici: dalla valvola dello schema alle scelte della finestra e ritorno.
 *
 * La finestra lavora su un {@link ValveConfig}; {@link applyValveConfig} lo scrive nei campi del componente,
 * con la funzione normalizzata quando le caselle coincidono con una delle funzioni di sempre (5/2, 5/3E…) e
 * con `boxes` quando il corpo è personalizzato. I campi che non hanno più senso (finecorsa senza rullo,
 * posizione iniziale di una monostabile…) si tolgono, così il componente resta valido.
 */
import {
  isBistable, isElectric, isMechanical, isReturn, STANDARD_FUNCTIONS, type Actuation, type ComponentData,
} from "./components";
import {
  CELLS, formatBox, parseBoxes, positionsOf, sameBox, STANDARD_BOXES, valveBoxes, waysOf, type BoxItem, type Ways,
} from "./valveBody";

export interface ValveConfig {
  label: string;
  ways: Ways;
  /** caselle da sinistra (14) a destra (12), come testo "1>4 2>3 x5" */
  boxes: string[];
  act14: Actuation;
  act12: Actuation;
  /** secondo comando dello stesso lato, "" se manca */
  aux14: Actuation | "";
  aux12: Actuation | "";
  override: "none" | "push" | "detent";
  /** bistabili: casella di partenza */
  initial: "14" | "12";
  /** "" se nessun lato è dominante */
  dominant: "" | "14" | "12";
  /** portata nominale Qn come scritta nei parametri ("1000 l/min"), "" se manca */
  flow: string;
}

/** Caselle di partenza per vie e posizioni: quelle della funzione normalizzata, o le prime dell'elenco. */
export function defaultBoxes(ways: Ways, positions: number): string[] {
  const std = STANDARD_FUNCTIONS.find((f) => waysOf(f) === ways && positionsOf(f) === positions && f.length === 3);
  if (std) return STANDARD_BOXES[std]!.map(formatBox);
  return CELLS[ways].slice(0, positions).map((c) => formatBox(c.items));
}

export function valveConfigOf(c: ComponentData): ValveConfig {
  const opt = (v: string | undefined) => (v && v !== "none" ? (v as Actuation) : "");
  return {
    label: c.label ?? "",
    ways: waysOf(c.function),
    boxes: valveBoxes(c).map(formatBox),
    act14: (c.actuation_14 ?? "solenoid") as Actuation,
    act12: (c.actuation_12 ?? "spring") as Actuation,
    aux14: opt(c.aux_14),
    aux12: opt(c.aux_12),
    override: c.override === "push" || c.override === "detent" ? c.override : "none",
    initial: c.initial === "14" ? "14" : "12",
    dominant: c.dominant === "14" || c.dominant === "12" ? c.dominant : "",
    flow: c.params?.flow ?? "",
  };
}

/** Funzione normalizzata con queste caselle, se c'è (5/2, 4/3E…). */
export function standardFunctionFor(ways: Ways, boxes: BoxItem[][]): string | null {
  return STANDARD_FUNCTIONS.find((f) => {
    const std = STANDARD_BOXES[f]!;
    return waysOf(f) === ways && std.length === boxes.length && std.every((b, i) => sameBox(b, boxes[i]!));
  }) ?? null;
}

/** Il componente con le scelte del configuratore. Lancia un Error se le caselle non sono valide. */
export function applyValveConfig(c: ComponentData, cfg: ValveConfig): ComponentData {
  const boxes = parseBoxes(cfg.boxes.join(" | "), cfg.ways);
  const out: ComponentData = { ...c, params: { ...c.params } };
  const std = standardFunctionFor(cfg.ways, boxes);
  out.function = std ?? `${cfg.ways}/${boxes.length}`;
  if (std) delete out.boxes; else out.boxes = cfg.boxes.join(" | ");
  out.actuation_14 = cfg.act14;
  out.actuation_12 = cfg.act12;
  if (cfg.label.trim()) out.label = cfg.label.trim(); else delete out.label;
  for (const side of ["14", "12"] as const) {
    const act = side === "14" ? cfg.act14 : cfg.act12;
    const aux = side === "14" ? cfg.aux14 : cfg.aux12;
    // il secondo comando non sta su un lato con il ritorno, né due rulli sullo stesso lato
    if (aux && !isReturn(act) && !(isMechanical(aux) && isMechanical(act))) out[`aux_${side}`] = aux;
    else delete out[`aux_${side}`];
    if (!isMechanical(act) && !isMechanical(out[`aux_${side}`] as Actuation | undefined)) delete out[`cam_${side}`];
  }
  out.override = isElectric(cfg.act14) || isElectric(cfg.act12) ? cfg.override : "none";
  if (isBistable(out) && cfg.initial === "14") out.initial = "14"; else delete out.initial;
  if (cfg.dominant && !isReturn(cfg.act14) && !isReturn(cfg.act12)) out.dominant = cfg.dominant;
  else delete out.dominant;
  if (cfg.flow.trim()) {
    const f = cfg.flow.trim();
    out.params!.flow = /^[\d.,]+$/.test(f) ? `${f} l/min` : f;
  } else delete out.params!.flow;
  return out;
}

/** Campi della valvola da ricordare nella libreria «Le mie valvole» (senza sigla, finecorsa e codice). */
export function valveTemplate(c: ComponentData): Partial<ComponentData> {
  const keep = ["label", "function", "boxes", "actuation_14", "actuation_12", "aux_14", "aux_12", "override",
    "initial", "dominant", "params"] as const;
  const out: Partial<ComponentData> = {};
  for (const k of keep) if (c[k] !== undefined) (out as Record<string, unknown>)[k] = structuredClone(c[k]);
  return out;
}

/**
 * Toglie dalla valvola i campi che le scelte del pannello hanno reso senza senso: caselle personalizzate di
 * un'altra funzione, secondo comando su un lato con il ritorno, posizione iniziale di una valvola non bistabile,
 * segnale dominante con un ritorno. Modifica `c`.
 */
export function sanitizeValve(c: ComponentData, changed?: string): void {
  if (changed === "function") delete c.boxes;
  const a14 = (c.actuation_14 ?? "solenoid") as Actuation, a12 = (c.actuation_12 ?? "spring") as Actuation;
  for (const [side, act] of [["14", a14], ["12", a12]] as const) {
    const aux = c[`aux_${side}`] as Actuation | undefined;
    if (aux && (isReturn(act) || (isMechanical(aux) && isMechanical(act)))) delete c[`aux_${side}`];
  }
  if (c.initial && !isBistable(c)) delete c.initial;
  if (c.dominant && (isReturn(a14) || isReturn(a12))) delete c.dominant;
}
