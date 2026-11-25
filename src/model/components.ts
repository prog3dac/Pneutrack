/**
 * Tipi di componente: porte (numerazione ISO 5599 per le valvole), parametri da
 * catalogo, percorsi interni della pressione e dati per la palette dell'editor.
 *
 * Per aggiungere un tipo: una voce in {@link TYPES} con porte, parametri e,
 * se trasmette pressione, `paths`; poi simbolo (ui/symbols.ts) e, se simulabile,
 * il comportamento in sim/compile.ts.
 */
import { Quantity, UnitError, type Dimension } from "./units";

/** "electric": morsetto di un componente elettrico; le sue linee sono fili, non tubi. */
export type PortKind = "supply" | "work" | "exhaust" | "pilot" | "electric";
export type Actuation =
  | "solenoid" | "solenoid_pilot" | "solenoid_pilot_ext"
  | "pilot"
  | "manual" | "lever" | "lever_detent" | "pedal"
  | "mechanical" | "plunger" | "roller_oneway"
  | "spring" | "air_return" | "air_return_ext";
export type ValveFunction = "2/2" | "3/2" | "4/2" | "5/2" | "5/3" | "5/3E" | "5/3P";

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

/** Voce della palette: un tipo con opzioni e parametri già scelti. */
export interface Preset {
  label: string;
  options?: Partial<Record<OptionSpec["name"], string>>;
  params?: Record<string, string>;
}

export type OptionName =
  | "function" | "actuation_14" | "actuation_12" | "cushioning"
  | "contact" | "operation" | "timer_mode" | "switch_actuation" | "sensor_kind" | "lamp_color";

export interface OptionSpec {
  name: OptionName;
  label: string;
  choices: [string, string][];
  default: string;
}

/** Componente come scritto nel file dello schema. */
export interface ComponentData {
  id: string;
  type: string;
  label?: string;
  /** codice articolo del costruttore, per la distinta componenti (non conta per la simulazione) */
  code?: string;
  params?: Record<string, string>;
  function?: string;
  actuation_14?: string;
  actuation_12?: string;
  /** rullo azionato da un cilindro: "C1+" a fine corsa in uscita, "C1-" in rientro */
  cam_14?: string;
  cam_12?: string;
  /** ammortizzo pneumatico regolabile: "none", "both", "cap" (fondello), "rod" (testata) */
  cushioning?: string;
  // --- componenti elettrici ---
  /** contatto: "no" (NA), "nc" (NC), "co" (scambio) */
  contact?: string;
  /** pulsante: "momentary" (a impulso) o "latching" (con ritenuta) */
  operation?: string;
  /** temporizzatore: "on_delay" (ritardato all'eccitazione) o "off_delay" (alla diseccitazione) */
  timer_mode?: string;
  /** finecorsa elettrico: "roller" o "roller_oneway" */
  switch_actuation?: string;
  /** sensore di prossimità: "reed", "inductive", "capacitive", "optical" */
  sensor_kind?: string;
  lamp_color?: string;
  /** bobina di elettrovalvola: il solenoide che eccita, "V1.14" */
  drives?: string;
  /** contatto: il relè, temporizzatore o pressostato che lo aziona, "K1" */
  relay?: string;
  /** finecorsa elettrico o sensore: "C1+" (stelo fuori) o "C1-" (stelo dentro) */
  cam?: string;
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
  cam_14?: Cam;
  cam_12?: Cam;
  cushioning?: Cushioning;
  contact?: ContactKind;
  operation?: "momentary" | "latching";
  timer_mode?: "on_delay" | "off_delay";
  switch_actuation?: "roller" | "roller_oneway";
  sensor_kind?: string;
  lamp_color?: string;
  /** solenoide eccitato dalla bobina */
  drives?: { valve: string; side: "14" | "12" };
  relay?: string;
  cam?: Cam;
  ports: PortSpec[];
}

/** Contatto normalmente aperto (NA), normalmente chiuso (NC) o in scambio. */
export type ContactKind = "no" | "nc" | "co";

/** Ammortizzo di fine corsa: su nessun lato, su entrambi, solo al fondello (rientro) o solo alla testata (uscita). */
export type Cushioning = "none" | "both" | "cap" | "rod";
export const CUSHIONING_CHOICES: [Cushioning, string][] = [
  ["none", "Nessuno"],
  ["both", "Regolabile ai due fine corsa"],
  ["cap", "Regolabile solo in rientro (fondello)"],
  ["rod", "Regolabile solo in uscita (testata)"],
];

/** Finecorsa: il cilindro `cylinder` a fine corsa in uscita ("+") o in rientro ("-"). */
export interface Cam {
  cylinder: string;
  end: "+" | "-";
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
  /** voci della palette; senza, il tipo compare una volta con le opzioni predefinite */
  presets?: Preset[];
  actuator?: boolean;
  /** dominio: pneumatico (predefinito) o elettrico */
  domain?: "pneumatic" | "electric";
  /** non ancora proposto nella palette dell'editor (manca il simbolo) */
  hidden?: boolean;
  ports(c: Pick<Component, "function" | "actuation_14" | "actuation_12" | "contact">): PortSpec[];
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
  "5/3E": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
  "5/3P": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
};
/** Comandi secondo ISO 1219-1, nell'ordine in cui compaiono nel menu. */
export const ACTUATIONS: Actuation[] = [
  "solenoid", "solenoid_pilot", "solenoid_pilot_ext", "pilot",
  "manual", "lever", "lever_detent", "pedal",
  "mechanical", "plunger", "roller_oneway", "spring", "air_return", "air_return_ext",
];
export const ACTUATION_LABELS: Record<Actuation, string> = {
  solenoid: "Elettrico: solenoide diretto",
  solenoid_pilot: "Elettrico: solenoide e valvola pilota (alimentazione interna)",
  solenoid_pilot_ext: "Elettrico: solenoide e valvola pilota (alimentazione esterna)",
  pilot: "Pneumatico: pilotaggio in pressione",
  manual: "Manuale: pulsante",
  lever: "Manuale: leva",
  lever_detent: "Manuale: leva con arresto",
  pedal: "Manuale: pedale",
  mechanical: "Meccanico: rullo",
  plunger: "Meccanico: tastatore",
  roller_oneway: "Meccanico: rullo unidirezionale (leva ribaltabile)",
  spring: "Ritorno a molla",
  air_return: "Ritorno pneumatico (alimentazione interna)",
  air_return_ext: "Ritorno pneumatico (alimentazione esterna)",
};
/** Nome breve per pannelli ed etichette. */
export const ACTUATION_SHORT: Record<Actuation, string> = {
  solenoid: "solenoide", solenoid_pilot: "elettropilota", solenoid_pilot_ext: "elettropilota esterno",
  pilot: "pilotaggio", manual: "pulsante", lever: "leva", lever_detent: "leva con arresto", pedal: "pedale",
  mechanical: "rullo", plunger: "tastatore", roller_oneway: "rullo unidirezionale", spring: "molla",
  air_return: "ritorno pneumatico", air_return_ext: "ritorno pneumatico esterno",
};
/** Comandi elettrici: il solenoide si eccita e si diseccita. */
export const isElectric = (a?: Actuation) => a === "solenoid" || a === "solenoid_pilot" || a === "solenoid_pilot_ext";
/** Comandi meccanici: possono essere azionati da un cilindro (finecorsa). */
export const isMechanical = (a?: Actuation) => a === "mechanical" || a === "plunger" || a === "roller_oneway";
/** Comandi che restano nella posizione in cui li si lascia (solenoidi, leva con arresto). */
export const isLatching = (a?: Actuation) => isElectric(a) || a === "lever_detent";
/** Comandi azionati dall'utente finché tiene premuto. */
export const isMomentary = (a?: Actuation) => a === "manual" || a === "lever" || a === "pedal" || isMechanical(a);
/** Comandi con una porta di pilotaggio (12 o 14): pilotaggio pneumatico o alimentazione esterna del pilota. */
export const hasPilotPort = (a?: Actuation) => a === "pilot" || a === "solenoid_pilot_ext" || a === "air_return_ext";
/** Comandi di ritorno: riportano la valvola a riposo quando l'altro lato non è azionato. */
export const isReturn = (a?: Actuation) => a === "spring" || a === "air_return" || a === "air_return_ext";

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

/** Ammortizzo pneumatico regolabile (cilindri a doppio effetto). */
const cushionParams: ParamSpec[] = [
  p("cushion_length", "Lunghezza ammortizzo", "length", { simDefault: "≈ 0,6 × alesaggio" }),
  p("cushion_opening", "Apertura vite ammortizzo (0 chiusa, 1 tutta aperta)", "dimensionless",
    { group: "sim", simDefault: "0.3" }),
];
const cushionOption: OptionSpec = {
  name: "cushioning", label: "Ammortizzo", default: "none", choices: CUSHIONING_CHOICES,
};

const AIR = "Alimentazione e trattamento aria";
const DIRECTIONAL = "Valvole distributrici";
const LOGIC = "Valvole di blocco e logiche";
const REGULATION = "Regolazione di portata e pressione";
const ACTUATORS = "Attuatori";
const ELECTRIC = "Elettrico";

const eport = (name: string, mayBeOpen = false) => port(name, "electric", mayBeOpen);
export const CONTACT_CHOICES: [ContactKind, string][] = [["no", "NA (normalmente aperto)"],
  ["nc", "NC (normalmente chiuso)"], ["co", "In scambio"]];
const contactOption: OptionSpec = { name: "contact", label: "Contatto", default: "no", choices: CONTACT_CHOICES };
const operationOption: OptionSpec = { name: "operation", label: "Azionamento", default: "momentary",
  choices: [["momentary", "A impulso"], ["latching", "Con ritenuta"]] };
/** Morsetti di un contatto (CEI EN 60947): NA 13-14, NC 11-12, scambio 11 comune, 12 NC, 14 NA. */
const contactPorts = (c: { contact?: ContactKind }): PortSpec[] =>
  c.contact === "nc" ? [eport("11"), eport("12")]
  : c.contact === "co" ? [eport("11"), eport("12", true), eport("14", true)]
  : [eport("13"), eport("14")];
const coilPorts = () => [eport("A1"), eport("A2")];
const both = (a: string, b: string) => [{ src: a, dst: b, cap: Infinity }, { src: b, dst: a, cap: Infinity }];
const oneWay = (a: string, b: string) => ({ src: a, dst: b, cap: Infinity });

const DEFS: TypeDef[] = [
  // --- alimentazione e trattamento aria ---------------------------------------
  {
    type: "pressure_source", label: "Alimentazione", category: AIR,
    doc: "Alimentazione d'aria compressa (compressore / rete) a pressione nota.",
    params: [p("pressure", "Pressione", "pressure", { required: true }), p("flow", "Portata", "flow")],
    defaults: { pressure: "6 bar" },
    ports: () => [port("1", "supply")],
    sources: (c) => ({ 1: c.params.pressure! }),
  },
  {
    type: "air_reservoir", label: "Serbatoio", category: AIR,
    doc: "Serbatoio d'aria (polmone): accumula aria e smorza i picchi di consumo. Le porte 1 e 2 " +
      "sono sullo stesso volume; la 2 può restare tappata.",
    params: [p("volume", "Volume", "volume", { required: true }), MAX_P],
    defaults: { volume: "1 l", max_pressure: "11 bar" },
    presets: [
      { label: "Serbatoio 1 l", params: { volume: "1 l" } },
      { label: "Serbatoio 10 l", params: { volume: "10 l" } },
      { label: "Serbatoio 50 l", params: { volume: "50 l" } },
      { label: "Serbatoio 0,1 l (temporizzazione)", params: { volume: "0.1 l" } },
    ],
    ports: () => [port("1", "work"), port("2", "work", true)],
    paths: () => both("1", "2"),
  },
  {
    type: "air_filter", label: "Filtro", category: AIR,
    doc: "Filtro con scarico della condensa.",
    params: [MAX_P, conductance("2 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "16 bar" },
    ports: () => [port("1", "supply"), port("2", "work")],
    paths: () => both("1", "2"),
  },
  {
    type: "lubricator", label: "Lubrificatore", category: AIR,
    doc: "Lubrificatore: nebulizza olio nell'aria.",
    params: [MAX_P, conductance("2 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "16 bar" },
    ports: () => [port("1", "supply"), port("2", "work")],
    paths: () => both("1", "2"),
  },
  {
    type: "frl_unit", label: "Gruppo FRL", category: AIR,
    doc: "Gruppo filtro, riduttore con manometro e lubrificatore: l'uscita 2 non supera la pressione regolata.",
    params: [p("setpoint", "Pressione regolata", "pressure", { required: true }), MAX_P,
             conductance("1.5 dm3/(s·bar)"), critical("0.35")],
    defaults: { setpoint: "6 bar", max_pressure: "16 bar" },
    ports: () => [port("1", "supply"), port("2", "work")],
    paths: (c) => [{ src: "1", dst: "2", cap: c.params.setpoint!.si }],
  },
  {
    type: "pressure_regulator", label: "Riduttore di pressione", category: AIR,
    doc: "Riduttore di pressione: l'uscita 2 non supera la pressione regolata.",
    params: [p("setpoint", "Pressione regolata", "pressure", { required: true }), MAX_P,
             conductance("1 dm3/(s·bar)"), critical("0.35")],
    defaults: { setpoint: "4 bar", max_pressure: "16 bar" },
    ports: () => [port("1", "supply"), port("2", "work")],
    paths: (c) => [{ src: "1", dst: "2", cap: c.params.setpoint!.si }],
  },
  {
    type: "pressure_gauge", label: "Manometro", category: AIR,
    doc: "Manometro: mostra la pressione della linea (in simulazione, il valore istantaneo).",
    params: [MAX_P], defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "work")],
  },
  {
    type: "silencer", label: "Silenziatore", category: AIR,
    doc: "Silenziatore / scarico in atmosfera.",
    params: [MAX_P], defaults: {},
    ports: () => [port("1", "exhaust")],
  },
  {
    type: "exhaust", label: "Scarico", category: AIR,
    doc: "Scarico diretto in atmosfera, senza silenziatore (simbolo ISO 1219: triangolo).",
    params: [MAX_P], defaults: {},
    ports: () => [port("1", "exhaust")],
  },
  {
    type: "junction", label: "Punto di connessione", category: AIR,
    doc: "Punto di connessione (raccordo a T o a croce): più linee unite nello stesso punto, " +
      "tutte alla stessa pressione. Trascina una linea su un'altra per crearne uno.",
    params: [], defaults: {},
    ports: () => [port("1", "work", true)],
  },
  {
    type: "plug", label: "Tappo", category: AIR,
    doc: "Tappo: chiude una porta che non si vuole usare.",
    params: [MAX_P], defaults: {},
    ports: () => [port("1", "work")],
  },

  // --- valvole distributrici ------------------------------------------------------
  {
    type: "directional_valve", label: "Valvola distributrice", category: DIRECTIONAL,
    doc: "Valvola distributrice n/m con comandi sui lati 14 e 12.",
    params: [MAX_P, MIN_P, p("flow", "Portata", "flow"), conductance("1.5 dm3/(s·bar)"), critical("0.35")],
    options: [
      { name: "function", label: "Funzione", default: "5/2",
        choices: [["2/2", "2/2"], ["3/2", "3/2"], ["4/2", "4/2"], ["5/2", "5/2"], ["5/3", "5/3 centri chiusi"],
                  ["5/3E", "5/3 centri in scarico"], ["5/3P", "5/3 centri in pressione"]] },
      { name: "actuation_14", label: "Comando lato 14", default: "solenoid",
        choices: ACTUATIONS.map((a) => [a, ACTUATION_LABELS[a]]) },
      { name: "actuation_12", label: "Comando lato 12", default: "spring",
        choices: ACTUATIONS.map((a) => [a, ACTUATION_LABELS[a]]) },
    ],
    defaults: { max_pressure: "10 bar" },
    presets: [
      { label: "3/2 NC a pulsante", options: { function: "3/2", actuation_14: "manual", actuation_12: "spring" } },
      { label: "3/2 NC a rullo (finecorsa)", options: { function: "3/2", actuation_14: "mechanical", actuation_12: "spring" } },
      { label: "3/2 NC a solenoide", options: { function: "3/2", actuation_14: "solenoid", actuation_12: "spring" } },
      { label: "3/2 NC pilotata", options: { function: "3/2", actuation_14: "pilot", actuation_12: "spring" } },
      { label: "3/2 NA a pulsante", options: { function: "3/2", actuation_14: "spring", actuation_12: "manual" } },
      { label: "2/2 a pulsante (intercettazione)", options: { function: "2/2", actuation_14: "manual", actuation_12: "spring" } },
      { label: "5/2 monostabile a solenoide", options: { function: "5/2", actuation_14: "solenoid", actuation_12: "spring" } },
      { label: "5/2 monostabile elettropneumatica", options: { function: "5/2", actuation_14: "solenoid_pilot", actuation_12: "spring" } },
      { label: "5/2 monostabile pilotata", options: { function: "5/2", actuation_14: "pilot", actuation_12: "spring" } },
      { label: "5/2 bistabile pneumatica", options: { function: "5/2", actuation_14: "pilot", actuation_12: "pilot" } },
      { label: "5/2 bistabile elettrica", options: { function: "5/2", actuation_14: "solenoid", actuation_12: "solenoid" } },
      { label: "5/2 bistabile elettropneumatica", options: { function: "5/2", actuation_14: "solenoid_pilot", actuation_12: "solenoid_pilot" } },
      { label: "5/2 elettropneumatica, ritorno pneumatico", options: { function: "5/2", actuation_14: "solenoid_pilot", actuation_12: "air_return" } },
      { label: "5/2 elettropneumatica, pilota esterno", options: { function: "5/2", actuation_14: "solenoid_pilot_ext", actuation_12: "spring" } },
      { label: "5/2 a leva con arresto", options: { function: "5/2", actuation_14: "lever_detent", actuation_12: "lever_detent" } },
      { label: "3/2 NC a pedale", options: { function: "3/2", actuation_14: "pedal", actuation_12: "spring" } },
      { label: "3/2 NC a tastatore", options: { function: "3/2", actuation_14: "plunger", actuation_12: "spring" } },
      { label: "3/2 NC a rullo unidirezionale", options: { function: "3/2", actuation_14: "roller_oneway", actuation_12: "spring" } },
      { label: "5/3 centri chiusi", options: { function: "5/3", actuation_14: "solenoid", actuation_12: "solenoid" } },
      { label: "5/3 centri in scarico", options: { function: "5/3E", actuation_14: "solenoid", actuation_12: "solenoid" } },
      { label: "5/3 centri in pressione", options: { function: "5/3P", actuation_14: "solenoid", actuation_12: "solenoid" } },
    ],
    ports: (c) => {
      const ports = VALVE_PORTS[c.function ?? "5/2"].map(([n, k]) => port(n, k, k === "exhaust"));
      if (hasPilotPort(c.actuation_14)) ports.push(port("14", "pilot"));
      if (hasPilotPort(c.actuation_12)) ports.push(port("12", "pilot"));
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

  // --- valvole di blocco e logiche --------------------------------------------------
  {
    type: "check_valve", label: "Valvola di non ritorno", category: LOGIC,
    doc: "Valvola di non ritorno: l'aria passa solo da 1 a 2.",
    params: [MAX_P, p("cracking_pressure", "Pressione di apertura", "pressure", { group: "sim", simDefault: "0.1 bar" }),
             conductance("2 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("2", "work")],
    paths: () => [oneWay("1", "2")],
  },
  {
    type: "pilot_check_valve", label: "Non ritorno pilotata", category: LOGIC,
    doc: "Non ritorno pilotata: passa da 1 a 2; da 2 a 1 solo con il pilotaggio 21 in pressione.",
    params: [MAX_P, p("pilot_pressure", "Pressione di pilotaggio", "pressure", { group: "sim", simDefault: "1.5 bar" }),
             conductance("2 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("2", "work"), port("21", "pilot")],
    paths: () => both("1", "2"),
  },
  {
    type: "shuttle_valve", label: "Valvola selettrice (OR)", category: LOGIC,
    doc: "Funzione O: l'uscita 2 riceve l'aria dall'ingresso (1 o 3) a pressione maggiore.",
    params: [MAX_P, conductance("1 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("3", "supply"), port("2", "work")],
    paths: () => [oneWay("1", "2"), oneWay("3", "2")],
  },
  {
    type: "and_valve", label: "Valvola a due pressioni (AND)", category: LOGIC,
    doc: "Funzione E: l'uscita 2 è in pressione solo se lo sono entrambi gli ingressi 1 e 3.",
    params: [MAX_P, conductance("1 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("3", "supply"), port("2", "work")],
    paths: () => [oneWay("1", "2"), oneWay("3", "2")],
  },
  {
    type: "quick_exhaust_valve", label: "Valvola di scarico rapido", category: LOGIC,
    doc: "Scarico rapido: l'aria va da 1 a 2; quando 1 si scarica, 2 sfoga subito dallo scarico 3.",
    params: [MAX_P, conductance("1.5 dm3/(s·bar)"), critical("0.4"),
             p("exhaust_conductance", "Conduttanza di scarico", "conductance", { group: "sim", simDefault: "4 dm3/(s·bar)" })],
    defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("2", "work"), port("3", "exhaust", true)],
    paths: () => [oneWay("1", "2"), oneWay("2", "3")],
  },

  // --- regolazione di portata e pressione ---------------------------------------------
  {
    type: "flow_control_valve", label: "Strozzatore bidirezionale", category: REGULATION,
    doc: "Strozzatore regolabile: riduce la portata nei due versi.",
    params: [MAX_P, conductance("0.3 dm3/(s·bar)"), critical("0.5")], defaults: {},
    ports: () => [port("1", "work"), port("2", "work")],
    paths: () => both("1", "2"),
  },
  {
    type: "one_way_flow_control", label: "Regolatore di flusso unidirezionale", category: REGULATION,
    doc: "Strozzatore con non ritorno: da 1 a 2 strozzato, da 2 a 1 libero.",
    params: [MAX_P, conductance("0.3 dm3/(s·bar)"), critical("0.5"),
             p("free_conductance", "Conduttanza in senso libero", "conductance", { group: "sim", simDefault: "2 dm3/(s·bar)" })],
    defaults: { max_pressure: "10 bar" },
    ports: () => [port("1", "work"), port("2", "work")],
    paths: () => both("1", "2"),
  },
  {
    type: "relief_valve", label: "Valvola limitatrice di pressione", category: REGULATION,
    doc: "Valvola di sicurezza: scarica da 1 a 3 quando la pressione supera la taratura.",
    params: [p("setpoint", "Pressione di taratura", "pressure", { required: true }), MAX_P,
             conductance("2 dm3/(s·bar)"), critical("0.4")],
    defaults: { setpoint: "7 bar", max_pressure: "16 bar" },
    ports: () => [port("1", "supply"), port("3", "exhaust", true)],
    paths: () => [oneWay("1", "3")],
  },
  {
    type: "sequence_valve", label: "Valvola di sequenza", category: REGULATION,
    doc: "3/2 NC che commuta quando il pilotaggio 12 raggiunge la pressione di taratura.",
    params: [p("setpoint", "Pressione di commutazione", "pressure", { required: true }), MAX_P,
             conductance("1 dm3/(s·bar)"), critical("0.35")],
    defaults: { setpoint: "4 bar", max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("2", "work"), port("3", "exhaust", true), port("12", "pilot")],
    paths: () => [oneWay("1", "2"), oneWay("2", "3")],
  },
  {
    type: "time_delay_valve", label: "Temporizzatore pneumatico", category: REGULATION,
    doc: "3/2 NC che commuta quando il pilotaggio 12 resta in pressione per il tempo impostato.",
    params: [p("delay", "Ritardo", "time", { required: true }), MAX_P,
             p("pilot_pressure", "Pressione di pilotaggio", "pressure", { group: "sim", simDefault: "2 bar" }),
             conductance("1 dm3/(s·bar)"), critical("0.35")],
    defaults: { delay: "2 s", max_pressure: "10 bar" },
    ports: () => [port("1", "supply"), port("2", "work"), port("3", "exhaust", true), port("12", "pilot")],
    paths: () => [oneWay("1", "2"), oneWay("2", "3")],
  },

  // --- attuatori ------------------------------------------------------------------------------
  {
    type: "single_acting_cylinder", label: "Cilindro semplice effetto", category: ACTUATORS,
    doc: "Cilindro a semplice effetto con ritorno a molla. Porta A: camera di spinta.",
    params: [...cylinderParams, p("spring_force", "Forza molla", "force", { group: "sim", simDefault: "15 N" })],
    defaults: { bore: "20 mm", rod: "8 mm", stroke: "50 mm", max_pressure: "10 bar" },
    actuator: true,
    ports: () => [port("A", "work")],
  },
  {
    type: "double_acting_cylinder", label: "Cilindro doppio effetto", category: ACTUATORS,
    doc: "Cilindro a doppio effetto. A: camera fondello (uscita), B: camera stelo (rientro).",
    params: [...cylinderParams, ...cushionParams],
    options: [cushionOption],
    defaults: { bore: "32 mm", stroke: "100 mm", rod: "12 mm", max_pressure: "10 bar" },
    presets: [
      { label: "Cilindro doppio effetto" },
      { label: "Cilindro doppio effetto ammortizzato",
        options: { cushioning: "both" }, params: { cushion_length: "20 mm" } },
    ],
    actuator: true,
    ports: () => [port("A", "work"), port("B", "work")],
  },
  {
    type: "double_rod_cylinder", label: "Cilindro a doppio stelo", category: ACTUATORS,
    doc: "Cilindro a doppio effetto con stelo passante: stessa area e stessa forza nei due versi.",
    params: [...cylinderParams.map((x) => (x.name === "rod" ? { ...x, required: true } : x)), ...cushionParams],
    options: [cushionOption],
    defaults: { bore: "32 mm", stroke: "100 mm", rod: "12 mm", max_pressure: "10 bar" },
    actuator: true,
    ports: () => [port("A", "work"), port("B", "work")],
  },
  {
    type: "rotary_actuator", label: "Attuatore rotante", category: ACTUATORS,
    doc: "Attuatore rotante a doppio effetto (non ancora simulato).",
    params: [p("angle", "Angolo", "angle", { required: true }), MAX_P, MIN_P],
    defaults: { angle: "90 deg", max_pressure: "10 bar" },
    actuator: true,
    ports: () => [port("A", "work"), port("B", "work")],
  },
  {
    type: "air_motor", label: "Motore pneumatico", category: ACTUATORS,
    doc: "Motore pneumatico reversibile: gira consumando aria tra le porte 1 e 2.",
    params: [MAX_P, conductance("1 dm3/(s·bar)"), critical("0.4")],
    defaults: { max_pressure: "8 bar" },
    actuator: true,
    ports: () => [port("1", "work"), port("2", "work")],
    paths: () => both("1", "2"),
  },

  // --- elettrico (comando elettropneumatico, 24 V c.c.) -------------------------------------
  {
    type: "electric_supply", label: "Alimentazione elettrica", category: ELECTRIC, domain: "electric",
    doc: "Alimentazione in corrente continua: morsetti + e 0V.",
    params: [p("voltage", "Tensione", "voltage", { required: true })],
    defaults: { voltage: "24 V" },
    ports: () => [eport("+"), eport("0V")],
  },
  {
    type: "pushbutton", label: "Pulsante", category: ELECTRIC, domain: "electric",
    doc: "Pulsante o interruttore: a impulso resta azionato finché si tiene premuto, con ritenuta resta dove lo si lascia.",
    params: [], defaults: {},
    options: [contactOption, operationOption],
    presets: [
      { label: "Pulsante NA", options: { contact: "no", operation: "momentary" } },
      { label: "Pulsante NC", options: { contact: "nc", operation: "momentary" } },
      { label: "Interruttore NA", options: { contact: "no", operation: "latching" } },
      { label: "Pulsante di emergenza (NC con ritenuta)", options: { contact: "nc", operation: "latching" } },
    ],
    ports: contactPorts,
  },
  {
    type: "relay_coil", label: "Bobina di relè", category: ELECTRIC, domain: "electric",
    doc: "Bobina di relè (K): eccitata, commuta tutti i contatti che la indicano.",
    params: [p("pickup_time", "Tempo di attrazione", "time", { group: "sim", simDefault: "10 ms" })],
    defaults: {},
    ports: coilPorts,
  },
  {
    type: "timer_relay", label: "Relè temporizzato", category: ELECTRIC, domain: "electric",
    doc: "Temporizzatore (KT): i suoi contatti commutano con ritardo dopo l'eccitazione o dopo la diseccitazione.",
    params: [p("delay", "Ritardo", "time", { required: true })],
    options: [{ name: "timer_mode", label: "Funzione", default: "on_delay", choices: [
      ["on_delay", "Ritardato all'eccitazione"], ["off_delay", "Ritardato alla diseccitazione"]] }],
    defaults: { delay: "2 s" },
    presets: [
      { label: "Temporizzatore ritardato all'eccitazione", options: { timer_mode: "on_delay" } },
      { label: "Temporizzatore ritardato alla diseccitazione", options: { timer_mode: "off_delay" } },
    ],
    ports: coilPorts,
  },
  {
    type: "relay_contact", label: "Contatto di relè", category: ELECTRIC, domain: "electric",
    doc: "Contatto azionato da un relè, da un temporizzatore o da un pressostato, indicato per sigla (relay: \"K1\").",
    params: [], defaults: {},
    options: [contactOption],
    presets: [
      { label: "Contatto NA", options: { contact: "no" } },
      { label: "Contatto NC", options: { contact: "nc" } },
      { label: "Contatto in scambio", options: { contact: "co" } },
    ],
    ports: contactPorts,
  },
  {
    type: "valve_solenoid", label: "Bobina di elettrovalvola", category: ELECTRIC, domain: "electric",
    doc: "Bobina (Y) del solenoide di una valvola, indicato con valvola e lato (drives: \"V1.14\").",
    params: [], defaults: {},
    ports: coilPorts,
  },
  {
    type: "limit_switch", label: "Finecorsa elettrico", category: ELECTRIC, domain: "electric",
    doc: "Microinterruttore a rullo azionato da un cilindro a fine corsa (cam: \"C1+\" stelo fuori, \"C1-\" dentro).",
    params: [], defaults: {},
    options: [contactOption, { name: "switch_actuation", label: "Azionamento", default: "roller", choices: [
      ["roller", "Rullo"], ["roller_oneway", "Rullo unidirezionale (leva ribaltabile)"]] }],
    presets: [
      { label: "Finecorsa NA", options: { contact: "no" } },
      { label: "Finecorsa NC", options: { contact: "nc" } },
      { label: "Finecorsa in scambio", options: { contact: "co" } },
      { label: "Finecorsa NA unidirezionale", options: { contact: "no", switch_actuation: "roller_oneway" } },
    ],
    ports: contactPorts,
  },
  {
    type: "proximity_sensor", label: "Sensore di prossimità", category: ELECTRIC, domain: "electric",
    doc: "Sensore a tre fili, uscita PNP: BN al +, BU al 0V, BK è l'uscita, che va a tensione quando lo stelo è " +
      "nella posizione indicata (cam: \"C1+\", oppure il parametro posizione).",
    params: [p("position", "Posizione dal fondello", "length"),
             p("range", "Campo di rilevamento (±)", "length", { group: "sim", simDefault: "3 mm" })],
    options: [{ name: "sensor_kind", label: "Tipo", default: "reed", choices: [
      ["reed", "Magnetico (reed)"], ["inductive", "Induttivo"], ["capacitive", "Capacitivo"], ["optical", "Ottico"]] }],
    defaults: {},
    ports: () => [eport("BN"), eport("BU"), eport("BK")],
  },
  {
    type: "pressure_switch", label: "Pressostato", category: ELECTRIC, domain: "electric",
    doc: "Pressostato: si collega alla linea pneumatica con la porta 1 e aziona i contatti che lo indicano " +
      "quando la pressione supera la taratura.",
    params: [p("setpoint", "Pressione di intervento", "pressure", { required: true }), MAX_P,
             p("hysteresis", "Isteresi", "pressure", { group: "sim", simDefault: "0.5 bar" })],
    defaults: { setpoint: "4 bar", max_pressure: "10 bar" },
    ports: () => [port("1", "pilot")],
  },
  {
    type: "wire_junction", label: "Punto di connessione elettrico", category: ELECTRIC, domain: "electric", hidden: true,
    doc: "Punto di connessione (morsetto comune) di più fili. Trascina un filo su un altro per crearne uno.",
    params: [], defaults: {},
    ports: () => [eport("1", true)],
  },
  {
    type: "signal_lamp", label: "Lampada di segnalazione", category: ELECTRIC, domain: "electric",
    doc: "Lampada (H): accesa quando ha tensione tra i morsetti X1 e X2.",
    params: [], defaults: {},
    options: [{ name: "lamp_color", label: "Colore", default: "green", choices: [
      ["green", "Verde"], ["red", "Rossa"], ["yellow", "Gialla"], ["white", "Bianca"], ["blue", "Blu"]] }],
    ports: () => [eport("X1"), eport("X2")],
  },
];

export const TYPES: ReadonlyMap<string, TypeDef> = new Map(DEFS.map((d) => [d.type, d]));
export const typeList = (): TypeDef[] => DEFS;

const isCylinder = (type: string) => type.endsWith("_cylinder");
export { isCylinder };

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
    if (isReturn(comp.actuation_14) && isReturn(comp.actuation_12)) {
      throw new ParameterError(`${id}: almeno un lato deve avere un comando attivo`);
    }
    for (const side of ["14", "12"] as const) {
      const raw_cam = raw[`cam_${side}`];
      if (raw_cam == null || raw_cam === "") continue;
      const m = CAM_RE.exec(String(raw_cam));
      if (!m) throw new ParameterError(`${id}: finecorsa '${raw_cam}' non valido (atteso per esempio 'C1+' o 'C1-')`);
      if (!isMechanical(comp[`actuation_${side}`])) {
        throw new ParameterError(`${id}: il finecorsa ${raw_cam} richiede un comando meccanico sul lato ${side}`);
      }
      comp[`cam_${side}`] = { cylinder: m[1]!, end: m[2] as "+" | "-" };
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
    const allowZero = (spec.group === "sim" && spec.dimension === "force") || spec.name === "cushion_opening";
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
  if (def.options?.some((o) => o.name === "cushioning")) {
    const cu = raw.cushioning ?? "none";
    if (!CUSHIONING_CHOICES.some(([v]) => v === cu)) throw new ParameterError(`${id}: ammortizzo '${cu}' non valido`);
    comp.cushioning = cu as Cushioning;
    const len = comp.params.cushion_length;
    if (cu !== "none" && len && len.si * (cu === "both" ? 2 : 1) > comp.params.stroke!.si) {
      throw new ParameterError(`${id}: l'ammortizzo (${len}) è troppo lungo per la corsa (${comp.params.stroke})`);
    }
    const op = comp.params.cushion_opening;
    if (op && op.si > 1) throw new ParameterError(`${id}.cushion_opening: va da 0 (vite chiusa) a 1 (tutta aperta)`);
  } else if (raw.cushioning && raw.cushioning !== "none") {
    throw new ParameterError(`${id}: questo componente non ha l'ammortizzo`);
  }
  buildElectric(def, raw, comp);
  comp.ports = def.ports(comp);
  return comp;
}

const ELECTRIC_OPTIONS = ["contact", "operation", "timer_mode", "switch_actuation", "sensor_kind", "lamp_color"] as const;
const CAM_RE = /^([A-Za-z0-9_-]+)([+-])$/;

/** Opzioni e riferimenti per sigla dei componenti elettrici (la loro esistenza la controlla la validazione). */
function buildElectric(def: TypeDef, raw: ComponentData, comp: Component): void {
  const id = comp.id;
  for (const name of ELECTRIC_OPTIONS) {
    const spec = def.options?.find((o) => o.name === name);
    const value = raw[name];
    if (!spec) {
      if (value != null && value !== "") throw new ParameterError(`${id}: questo componente non ha l'opzione '${name}'`);
      continue;
    }
    const v = value == null || value === "" ? spec.default : String(value);
    if (!spec.choices.some(([c]) => c === v)) {
      throw new ParameterError(`${id}: ${spec.label.toLowerCase()} '${v}' non valido; ammessi [${spec.choices.map(([c]) => `'${c}'`).join(", ")}]`);
    }
    (comp as unknown as Record<string, string>)[name] = v;
  }
  const refs = { drives: ["valve_solenoid"], relay: ["relay_contact"], cam: ["limit_switch", "proximity_sensor"] };
  for (const [field, types] of Object.entries(refs) as [keyof typeof refs, string[]][]) {
    const value = raw[field];
    if (value == null || value === "") continue;
    if (!types.includes(def.type)) throw new ParameterError(`${id}: questo componente non ha il riferimento '${field}'`);
    const text = String(value).trim();
    if (field === "drives") {
      const m = /^(.+)\.(14|12)$/.exec(text);
      if (!m) throw new ParameterError(`${id}: solenoide '${text}' non valido (atteso valvola e lato, per esempio 'V1.14')`);
      comp.drives = { valve: m[1]!, side: m[2] as "14" | "12" };
    } else if (field === "cam") {
      const m = CAM_RE.exec(text);
      if (!m) throw new ParameterError(`${id}: finecorsa '${text}' non valido (atteso per esempio 'C1+' o 'C1-')`);
      comp.cam = { cylinder: m[1]!, end: m[2] as "+" | "-" };
    } else {
      if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new ParameterError(`${id}: sigla del relè '${text}' non valida`);
      comp.relay = text;
    }
  }
}

/** Il componente è elettrico (fa parte del circuito di comando). */
export const isElectricType = (type: string): boolean => TYPES.get(type)?.domain === "electric";

/** Lunghezza dell'ammortizzo [m]: quella indicata o una stima dall'alesaggio (circa 0,6 × alesaggio, 10–40 mm). */
export function cushionLength(c: Component): number {
  const given = c.params.cushion_length?.si;
  const len = given ?? Math.min(0.04, Math.max(0.01, 0.6 * c.params.bore!.si));
  return Math.min(len, c.params.stroke!.si / (c.cushioning === "both" ? 2 : 1));
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
