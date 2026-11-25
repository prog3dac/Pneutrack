/**
 * Tipi di componente: porte (numerazione ISO 5599 per le valvole), parametri da
 * catalogo, percorsi interni della pressione e dati per la palette dell'editor.
 *
 * Per aggiungere un tipo: una voce in {@link TYPES} con porte, parametri e,
 * se trasmette pressione, `paths`; poi simbolo (ui/symbols.ts) e, se simulabile,
 * il comportamento in sim/compile.ts.
 */
import { Quantity, UnitError, type Dimension } from "./units";

export type PortKind = "supply" | "work" | "exhaust" | "pilot";
export type Actuation = "solenoid" | "pilot" | "manual" | "mechanical" | "spring";
export type ValveFunction = "2/2" | "3/2" | "4/2" | "5/2" | "5/3";

export interface PortSpec {
  name: string;
  kind: PortKind;
  /** può restare scollegata (scarico libero in atmosfera) */
  mayBeOpen: boolean;
}

export interface ParamSpec {
  name: string;
  label: string;
  dimension: Dimension;
  required: boolean;
  /** "catalog": dato di catalogo; "sim": parametro della simulazione (ha un default) */
  group: "catalog" | "sim";
  /** valore usato dalla simulazione se il parametro manca */
  simDefault?: string;
  /** limite superiore escluso, nella stessa dimensione (es. b < 1) */
  below?: number;
}

export interface OptionSpec {
  name: "function" | "actuation_14" | "actuation_12";
  label: string;
  choices: [string, string][];
  default: string;
}

/** Componente come scritto nel file dello schema. */
export interface ComponentData {
  id: string;
  type: string;
  label?: string;
  params?: Record<string, string>;
  function?: string;
  actuation_14?: string;
  actuation_12?: string;
}

/** Componente validato, con parametri convertiti. */
export interface Component {
  id: string;
  type: string;
  label: string;
  params: Record<string, Quantity>;
  function?: ValveFunction;
  actuation_14?: Actuation;
  actuation_12?: Actuation;
  ports: PortSpec[];
}

/** La pressione su `src` può arrivare su `dst`, al più `cap` (Pa). */
export interface InternalPath {
  src: string;
  dst: string;
  cap: number;
}

export interface TypeDef {
  type: string;
  label: string;
  category: string;
  doc: string;
  params: ParamSpec[];
  options?: OptionSpec[];
  /** parametri di un componente appena inserito dalla palette */
  defaults: Record<string, string>;
  actuator?: boolean;
  ports(c: Pick<Component, "function" | "actuation_14" | "actuation_12">): PortSpec[];
  paths?(c: Component): InternalPath[];
  sources?(c: Component): Record<string, Quantity>;
}

export class ParameterError extends Error {
  override name = "ParameterError";
}

const port = (name: string, kind: PortKind, mayBeOpen = false): PortSpec => ({ name, kind, mayBeOpen });
const p = (name: string, label: string, dimension: Dimension, extra: Partial<ParamSpec> = {}): ParamSpec =>
  ({ name, label, dimension, required: false, group: "catalog", ...extra });

const MAX_P = p("max_pressure", "Pressione max", "pressure");
const MIN_P = p("min_pressure", "Pressione min", "pressure");
const conductance = (def: string) =>
  p("conductance", "Conduttanza C", "conductance", { group: "sim", simDefault: def });
const critical = (def: string) =>
  p("critical_ratio", "Rapporto critico b", "dimensionless", { group: "sim", simDefault: def, below: 1 });

export const VALVE_PORTS: Record<ValveFunction, [string, PortKind][]> = {
  "2/2": [["1", "supply"], ["2", "work"]],
  "3/2": [["1", "supply"], ["2", "work"], ["3", "exhaust"]],
  "4/2": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"]],
  "5/2": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
  "5/3": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
};
export const ACTUATIONS: Actuation[] = ["solenoid", "pilot", "manual", "mechanical", "spring"];
const ACTUATION_LABELS: Record<Actuation, string> = {
  solenoid: "Elettrico (solenoide)",
  pilot: "Pneumatico (pilotaggio)",
  manual: "Manuale (pulsante)",
  mechanical: "Meccanico (rullo)",
  spring: "Molla",
};

const cylinderParams: ParamSpec[] = [
  p("bore", "Alesaggio", "length", { required: true }),
  p("stroke", "Corsa", "length", { required: true }),
  p("rod", "Diametro stelo", "length"),
  MAX_P,
  MIN_P,
  p("mass", "Massa mobile", "mass", { group: "sim", simDefault: "1 kg" }),
  p("load", "Carico", "force", { group: "sim", simDefault: "0 N" }),
  p("friction", "Attrito", "force", { group: "sim", simDefault: "5 N" }),
];

const DEFS: TypeDef[] = [
  {
    type: "pressure_source", label: "Alimentazione", category: "Alimentazione e scarichi",
    doc: "Alimentazione d'aria compressa (compressore / rete) a pressione nota.",
    params: [p("pressure", "Pressione", "pressure", { required: true }), p("flow", "Portata", "flow")],
    defaults: { pressure: "6 bar" },
    ports: () => [port("1", "supply")],
    sources: (c) => ({ 1: c.params.pressure! }),
  },
  {
    type: "pressure_regulator", label: "Riduttore di pressione", category: "Alimentazione e scarichi",
    doc: "Riduttore di pressione: l'uscita 2 non supera la pressione regolata.",
    params: [p("setpoint", "Pressione regolata", "pressure", { required: true }), MAX_P,
             conductance("1 dm3/(s·bar)"), critical("0.35")],
    defaults: { setpoint: "4 bar", max_pressure: "16 bar" },
    ports: () => [port("1", "supply"), port("2", "work")],
    paths: (c) => [{ src: "1", dst: "2", cap: c.params.setpoint!.si }],
  },
  {
    type: "silencer", label: "Silenziatore", category: "Alimentazione e scarichi",
    doc: "Silenziatore / scarico in atmosfera.",
    params: [MAX_P], defaults: {},
    ports: () => [port("1", "exhaust")],
  },
  {
    type: "plug", label: "Tappo", category: "Alimentazione e scarichi",
    doc: "Tappo: chiude una porta che non si vuole usare.",
    params: [MAX_P], defaults: {},
    ports: () => [port("1", "work")],
  },
  {
    type: "directional_valve", label: "Valvola distributrice", category: "Valvole",
    doc: "Valvola distributrice n/m con comandi sui lati 14 e 12.",
    params: [MAX_P, MIN_P, p("flow", "Portata", "flow"), conductance("1.5 dm3/(s·bar)"), critical("0.35")],
    options: [
      { name: "function", label: "Funzione", default: "5/2",
        choices: [["2/2", "2/2"], ["3/2", "3/2"], ["4/2", "4/2"], ["5/2", "5/2"], ["5/3", "5/3 centri chiusi"]] },
      { name: "actuation_14", label: "Comando lato 14", default: "solenoid",
        choices: ACTUATIONS.map((a) => [a, ACTUATION_LABELS[a]]) },
      { name: "actuation_12", label: "Comando lato 12", default: "spring",
        choices: ACTUATIONS.map((a) => [a, ACTUATION_LABELS[a]]) },
    ],
    defaults: { max_pressure: "10 bar" },
    ports: (c) => {
      const ports = VALVE_PORTS[c.function ?? "5/2"].map(([n, k]) => port(n, k, k === "exhaust"));
      if (c.actuation_14 === "pilot") ports.push(port("14", "pilot"));
      if (c.actuation_12 === "pilot") ports.push(port("12", "pilot"));
      return ports;
    },
    // analisi conservativa: in qualche posizione l'alimentazione raggiunge ogni utilizzo
    // e ogni utilizzo scarica verso gli scarichi
    paths: (c) => {
      const names = new Set(c.ports.map((x) => x.name));
      const work = ["2", "4"].filter((x) => names.has(x));
      const exh = ["3", "5"].filter((x) => names.has(x));
      return [
        ...work.map((w) => ({ src: "1", dst: w, cap: Infinity })),
        ...work.flatMap((w) => exh.map((e) => ({ src: w, dst: e, cap: Infinity }))),
      ];
    },
  },
  {
    type: "flow_control_valve", label: "Regolatore di flusso", category: "Valvole",
    doc: "Regolatore di flusso (strozzatore) bidirezionale.",
    params: [MAX_P, conductance("0.3 dm3/(s·bar)"), critical("0.5")], defaults: {},
    ports: () => [port("1", "work"), port("2", "work")],
    paths: () => [{ src: "1", dst: "2", cap: Infinity }, { src: "2", dst: "1", cap: Infinity }],
  },
  {
    type: "single_acting_cylinder", label: "Cilindro semplice effetto", category: "Attuatori",
    doc: "Cilindro a semplice effetto con ritorno a molla. Porta A: camera di spinta.",
    params: [...cylinderParams, p("spring_force", "Forza molla", "force", { group: "sim", simDefault: "15 N" })],
    defaults: { bore: "20 mm", stroke: "50 mm", max_pressure: "10 bar" },
    actuator: true,
    ports: () => [port("A", "work")],
  },
  {
    type: "double_acting_cylinder", label: "Cilindro doppio effetto", category: "Attuatori",
    doc: "Cilindro a doppio effetto. A: camera fondello (uscita), B: camera stelo (rientro).",
    params: cylinderParams,
    defaults: { bore: "32 mm", stroke: "100 mm", rod: "12 mm", max_pressure: "10 bar" },
    actuator: true,
    ports: () => [port("A", "work"), port("B", "work")],
  },
  {
    type: "rotary_actuator", label: "Attuatore rotante", category: "Attuatori",
    doc: "Attuatore rotante a doppio effetto.",
    params: [p("angle", "Angolo", "angle", { required: true }), MAX_P, MIN_P],
    defaults: { angle: "90 deg", max_pressure: "10 bar" },
    actuator: true,
    ports: () => [port("A", "work"), port("B", "work")],
  },
];

export const TYPES: ReadonlyMap<string, TypeDef> = new Map(DEFS.map((d) => [d.type, d]));
export const typeList = (): TypeDef[] => DEFS;

const isCylinder = (type: string) => type.endsWith("_cylinder");

/** Valida e converte un componente letto dallo schema. Lancia {@link ParameterError}. */
export function buildComponent(raw: ComponentData): Component {
  const def = TYPES.get(raw?.type);
  if (!def) throw new ParameterError(`tipo di componente sconosciuto: ${raw?.type == null ? "None" : `'${raw.type}'`}`);
  const id = raw.id;
  if (!id) throw new ParameterError("ogni componente deve avere un id");
  const comp: Component = { id, type: def.type, label: raw.label ?? "", params: {}, ports: [] };

  if (def.type === "directional_valve") {
    const fn = raw.function ?? "5/2";
    if (!(fn in VALVE_PORTS)) {
      const allowed = Object.keys(VALVE_PORTS).sort().map((f) => `'${f}'`).join(", ");
      throw new ParameterError(`${id}: funzione valvola non supportata '${fn}'; ammesse [${allowed}]`);
    }
    comp.function = fn as ValveFunction;
    for (const side of ["actuation_14", "actuation_12"] as const) {
      const v = raw[side] ?? (side === "actuation_14" ? "solenoid" : "spring");
      if (!ACTUATIONS.includes(v as Actuation)) throw new ParameterError(`'${v}' non è un comando valido`);
      comp[side] = v as Actuation;
    }
    if (comp.actuation_14 === "spring" && comp.actuation_12 === "spring") {
      throw new ParameterError(`${id}: almeno un lato deve avere un comando attivo`);
    }
  }

  const params = raw.params ?? {};
  const unknown = Object.keys(params).filter((k) => !def.params.some((s) => s.name === k)).sort();
  if (unknown.length) throw new ParameterError(`${id}: parametri sconosciuti [${unknown.map((u) => `'${u}'`).join(", ")}]`);
  for (const spec of def.params) {
    const value = params[spec.name];
    if (value == null || value === "") {
      if (spec.required) throw new ParameterError(`${id}: parametro obbligatorio '${spec.name}' mancante`);
      continue;
    }
    let qty: Quantity;
    try {
      qty = Quantity.coerce(value);
    } catch (e) {
      if (e instanceof UnitError) throw new ParameterError(`${id}.${spec.name}: ${e.message}`);
      throw e;
    }
    if (qty.dimension !== spec.dimension) {
      throw new ParameterError(`${id}.${spec.name}: atteso ${spec.dimension}, ricevuto ${qty.dimension} (${qty})`);
    }
    // i parametri di simulazione come il carico possono valere zero
    const allowZero = spec.group === "sim" && spec.dimension === "force";
    if (allowZero ? qty.si < 0 : qty.si <= 0) {
      throw new ParameterError(`${id}.${spec.name}: deve essere ${allowZero ? "positivo o nullo" : "positivo"} (${qty})`);
    }
    if (spec.below !== undefined && qty.si >= spec.below) {
      throw new ParameterError(`${id}.${spec.name}: deve essere minore di ${spec.below} (${qty})`);
    }
    comp.params[spec.name] = qty;
  }
  if (isCylinder(def.type) && comp.params.rod && comp.params.rod.si >= comp.params.bore!.si) {
    throw new ParameterError(`${id}: lo stelo (${comp.params.rod}) deve essere minore dell'alesaggio (${comp.params.bore})`);
  }
  comp.ports = def.ports(comp);
  return comp;
}

/** Parametro con il default di simulazione, se manca. */
export function simParam(c: Component, name: string): Quantity {
  const given = c.params[name];
  if (given) return given;
  const spec = TYPES.get(c.type)!.params.find((s) => s.name === name);
  if (!spec?.simDefault) throw new Error(`${c.type}: nessun default per ${name}`);
  return Quantity.parse(spec.simDefault);
}

export const internalPaths = (c: Component): InternalPath[] => TYPES.get(c.type)?.paths?.(c) ?? [];
export const sourcePressures = (c: Component): Record<string, Quantity> => TYPES.get(c.type)?.sources?.(c) ?? {};
export const isActuator = (c: { type: string }): boolean => TYPES.get(c.type)?.actuator === true;

/** Aree e forze teoriche di un cilindro alla pressione data. */
export function cylinderInfo(c: Component, pressure: Quantity) {
  if (!isCylinder(c.type)) return null;
  if (pressure.dimension !== "pressure") throw new UnitError("serve una pressione");
  const d = c.params.bore!.si, r = c.params.rod?.si ?? 0;
  const a = (Math.PI * d * d) / 4, an = (Math.PI * (d * d - r * r)) / 4;
  return {
    pistonArea: `${(a / 1e-4).toFixed(2)} cm2`,
    annularArea: `${(an / 1e-4).toFixed(2)} cm2`,
    forceExtend: `${(pressure.si * a).toFixed(0)} N`,
    forceRetract: `${(pressure.si * an).toFixed(0)} N`,
    atPressure: String(pressure),
  };
}
