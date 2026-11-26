/**
 * Libreria di componenti da catalogo.
 *
 * Ogni voce è un articolo reale (Festo, SMC) con i dati che servono alla simulazione, presi
 * dalle schede tecniche indicate in `source`. Scegliendo un codice nell'editor si compilano
 * insieme parametri e opzioni del componente; il codice resta nel campo `code` del componente
 * (il codice articolo della distinta). Sono valori di catalogo: dove la scheda dà un intervallo si usa il valore
 * indicato in `note`, e i campi che la scheda non dà restano ai valori predefiniti.
 */
import type { ComponentData } from "./components";

export interface CatalogPart {
  /** codice d'ordine (o di serie) del costruttore */
  code: string;
  maker: "Festo" | "SMC";
  /** serie, per raggruppare le voci nel menu */
  series: string;
  /** descrizione breve mostrata nel menu */
  label: string;
  type: string;
  /** opzioni del componente (funzione e comandi della valvola, ammortizzo) */
  options?: Partial<Pick<ComponentData, "function" | "actuation_14" | "actuation_12" | "cushioning">>;
  params: Record<string, string>;
  /** come sono stati ricavati i valori */
  note?: string;
  source: string;
}

/** Parametri che un codice di catalogo può impostare: scegliendo un codice vengono sostituiti tutti. */
export const PART_PARAMS = [
  "flow", "conductance", "critical_ratio", "free_conductance", "min_pressure", "max_pressure",
  "bore", "rod", "cushion_length",
] as const;

const GRLA = "https://ftp.festo.com/Public/PNEUMATIC/SOFTWARE_SERVICE/Documentation/2026/EN/GRLA-GRLZ_EN.PDF";
const SY = "https://static.smc.eu/pdf/SY3000_9000-RU.pdf";
const DSBC = "https://ftp.festo.com/Public/PNEUMATIC/SOFTWARE_SERVICE/Documentation/2014/EN/DSBC_EN.PDF";
const CP96 = "https://www.smcpneumatics.com/assets/images/pdf/C96.pdf";

/** Conduttanza nel verso libero da una portata qn misurata da 6 bar verso l'atmosfera (flusso sonico). */
const freeC = (qnLmin: number) => `${(qnLmin / 60 / 7.01325).toFixed(2)} dm3/(s·bar)`;

const grla = (size: string, tube: number, qnN: number, qnFree: number): CatalogPart => ({
  code: `GRLA-${size}-QS-${tube}-D`, maker: "Festo", series: "GRLA (regolatori unidirezionali sullo scarico)",
  label: `GRLA ${size}, tubo Ø${tube}`, type: "one_way_flow_control",
  params: { flow: `${qnN} Nl/min`, free_conductance: freeC(qnFree), max_pressure: "10 bar" },
  note: "Qn a tutta apertura = massimo dell'intervallo qnN nel verso regolato (6→5 bar) per la taglia; " +
    "conduttanza libera dal massimo di qn nel verso di non ritorno (6→0 bar).",
  source: GRLA,
});

const vuvg = (code: string, label: string, qnN: number, port: string): CatalogPart => ({
  code, maker: "Festo", series: "VUVG (elettrovalvole)", label: `${label}, ${port}`, type: "directional_valve",
  options: { function: "5/2", actuation_14: "solenoid_pilot", actuation_12: "spring" },
  params: { flow: `${qnN} Nl/min`, min_pressure: "3 bar", max_pressure: "8 bar" },
  source: `https://ftp.festo.com/public/PNEUMATIC/SOFTWARE_SERVICE/DataSheet/EN_GB/${code.includes("L18") ? "8033554" : "8033530"}.pdf`,
});

const sy = (size: 3 | 5 | 7, C: number, b: number, double: boolean): CatalogPart => ({
  code: `SY${size}${double ? 2 : 1}20`, maker: "SMC", series: "SY (elettrovalvole)",
  label: `SY${size}000 5/2 ${double ? "bistabile (due solenoidi)" : "monostabile (solenoide e molla)"}`,
  type: "directional_valve",
  options: { function: "5/2", actuation_14: "solenoid_pilot", actuation_12: double ? "solenoid_pilot" : "spring" },
  params: { conductance: `${C} dm3/(s·bar)`, critical_ratio: String(b),
            min_pressure: double ? "1 bar" : "1.5 bar", max_pressure: "7 bar" },
  note: "C e b sono i valori di serie dichiarati da SMC per la SY" + size + "000.",
  source: SY,
});

const dsbc = (bore: number, rod: number, cushion: number): CatalogPart => ({
  code: `DSBC-${bore}-…-PPVA-N3`, maker: "Festo", series: "DSBC (ISO 15552)",
  label: `DSBC Ø${bore}, stelo Ø${rod}, ammortizzo regolabile`, type: "double_acting_cylinder",
  options: { cushioning: "both" },
  params: { bore: `${bore} mm`, rod: `${rod} mm`, cushion_length: `${cushion} mm` },
  note: "La corsa si sceglie a parte (… nel codice). Stelo secondo ISO 15552.",
  source: DSBC,
});

const cp96 = (bore: number, rod: number): CatalogPart => ({
  code: `CP96SDB${bore}-…`, maker: "SMC", series: "CP96 (ISO 15552)",
  label: `CP96 Ø${bore}, stelo Ø${rod}, ammortizzo pneumatico`, type: "double_acting_cylinder",
  options: { cushioning: "both" },
  params: { bore: `${bore} mm`, rod: `${rod} mm`, min_pressure: "0.5 bar", max_pressure: "10 bar" },
  note: "La corsa si sceglie a parte (… nel codice). La scheda non dà la lunghezza dell'ammortizzo: resta la stima dall'alesaggio.",
  source: CP96,
});

export const PARTS: CatalogPart[] = [
  grla("M5", 6, 115, 200),
  grla("1/8", 8, 475, 760),
  grla("1/4", 10, 480, 790),
  grla("3/8", 10, 900, 1620),
  grla("1/2", 12, 1580, 2500),
  vuvg("VUVG-L14-M52-M-G18", "VUVG-L14 5/2 monostabile", 780, "G1/8"),
  vuvg("VUVG-L18-M52-M-G14", "VUVG-L18 5/2 monostabile", 1300, "G1/4"),
  sy(3, 1.1, 0.28, false), sy(3, 1.1, 0.28, true),
  sy(5, 2.8, 0.37, false), sy(5, 2.8, 0.37, true),
  sy(7, 4.5, 0.28, false), sy(7, 4.5, 0.28, true),
  dsbc(32, 12, 20), dsbc(40, 16, 20), dsbc(50, 20, 22), dsbc(63, 20, 22),
  dsbc(80, 25, 32), dsbc(100, 25, 32), dsbc(125, 32, 46),
  cp96(32, 12), cp96(40, 16), cp96(50, 20), cp96(63, 20), cp96(80, 25), cp96(100, 25), cp96(125, 32),
];

/** Codici di catalogo adatti a un tipo di componente. */
export const partsFor = (type: string): CatalogPart[] => PARTS.filter((p) => p.type === type);

export const partByCode = (code: string | undefined): CatalogPart | undefined =>
  code ? PARTS.find((p) => p.code === code) : undefined;

/**
 * Applica un codice di catalogo al componente: imposta opzioni e parametri del codice e toglie
 * gli altri parametri di catalogo (così non resta, per esempio, una C scritta prima che varrebbe
 * più della Qn del codice). Restano corsa, massa, carico, apertura e gli altri parametri.
 */
export function applyPart(comp: ComponentData, part: CatalogPart): ComponentData {
  const params = { ...comp.params };
  for (const k of PART_PARAMS) delete params[k];
  return { ...comp, ...part.options, code: part.code, params: { ...params, ...part.params } };
}
