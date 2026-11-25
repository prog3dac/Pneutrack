/**
 * Tubi: le dimensioni di una linea pneumatica.
 *
 * Un collegamento senza `tube` è ideale (le due porte sono alla stessa pressione,
 * volume trascurabile). Con `tube` la linea ha un diametro interno e una lunghezza:
 * la simulazione ne conta il volume e la perdita di carico.
 *
 * Nel file: `{"from": "P.1", "to": "V1.1", "tube": {"outer_diameter": "6 mm",
 * "inner_diameter": "4 mm", "length": "1.5 m"}}`.
 */
import { ParameterError } from "./components";
import { Quantity, UnitError } from "./units";

export interface TubeData {
  outer_diameter?: string;
  inner_diameter?: string;
  length?: string;
}

/** Tubo validato, valori SI [m]. */
export interface Tube {
  outer?: number;
  inner: number;
  length: number;
}

/** Misure commerciali più comuni dei tubi in poliuretano (esterno × interno). */
export const TUBE_SIZES: { label: string; outer: string; inner: string }[] = [
  { label: "Ø4 × 2,5", outer: "4 mm", inner: "2.5 mm" },
  { label: "Ø6 × 4", outer: "6 mm", inner: "4 mm" },
  { label: "Ø8 × 5", outer: "8 mm", inner: "5 mm" },
  { label: "Ø10 × 6,5", outer: "10 mm", inner: "6.5 mm" },
  { label: "Ø12 × 8", outer: "12 mm", inner: "8 mm" },
];

const FIELDS = ["outer_diameter", "inner_diameter", "length"] as const;

function length(where: string, name: string, value: unknown): number {
  let q: Quantity;
  try {
    q = Quantity.coerce(value);
  } catch (e) {
    if (e instanceof UnitError) throw new ParameterError(`${where}.${name}: ${e.message}`);
    throw e;
  }
  if (q.dimension !== "length") throw new ParameterError(`${where}.${name}: atteso length, ricevuto ${q.dimension} (${q})`);
  if (q.si <= 0) throw new ParameterError(`${where}.${name}: deve essere positivo (${q})`);
  return q.si;
}

/** Valida il tubo di un collegamento (`where` per i messaggi). Lancia {@link ParameterError}. */
export function parseTube(raw: unknown, where: string): Tube | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ParameterError(`${where}: tubo non valido`);
  const data = raw as Record<string, unknown>;
  const unknown = Object.keys(data).filter((k) => !(FIELDS as readonly string[]).includes(k)).sort();
  if (unknown.length) throw new ParameterError(`${where}: parametri del tubo sconosciuti [${unknown.map((u) => `'${u}'`).join(", ")}]`);
  for (const f of ["inner_diameter", "length"] as const) {
    if (data[f] == null || data[f] === "") throw new ParameterError(`${where}: parametro del tubo '${f}' mancante`);
  }
  const tube: Tube = { inner: length(where, "inner_diameter", data.inner_diameter), length: length(where, "length", data.length) };
  if (data.outer_diameter != null && data.outer_diameter !== "") {
    tube.outer = length(where, "outer_diameter", data.outer_diameter);
    if (tube.inner >= tube.outer) {
      throw new ParameterError(`${where}: il diametro interno (${data.inner_diameter}) deve essere minore dell'esterno (${data.outer_diameter})`);
    }
  }
  return tube;
}

/** Volume interno [m³]. */
export const tubeVolume = (t: Tube): number => (Math.PI * t.inner * t.inner / 4) * t.length;

/** coefficiente d'attrito di Darcy, tipico dei tubi lisci in regime turbolento */
const FRICTION = 0.03;
/** rapporto critico adottato per i tubi */
export const TUBE_CRITICAL_RATIO = 0.4;

/**
 * Conduttanza sonica ISO 6358 [m³/(s·Pa)] di un tubo, stimata così:
 * area efficace = sezione / √(1 + λ·L/d), e C ≈ 1,99e-3 · area efficace
 * (portata critica di un ugello ideale con aria a 20 °C: C [dm³/(s·bar)] ≈ 0,2 · A_eff [mm²]).
 */
export function tubeConductance(t: Tube): number {
  const area = Math.PI * t.inner * t.inner / 4;
  const effective = area / Math.sqrt(1 + FRICTION * t.length / t.inner);
  return 1.99e-3 * effective;
}

/** Testo breve, es. "Ø6×4 · 1,5 m". */
export function tubeLabel(t: Tube): string {
  const mm = (m: number) => String(Math.round(m * 1e4) / 10).replace(".", ",");
  const len = t.length >= 1 ? `${String(Math.round(t.length * 100) / 100).replace(".", ",")} m` : `${Math.round(t.length * 1000)} mm`;
  return `${t.outer ? `Ø${mm(t.outer)}×${mm(t.inner)}` : `Ø int. ${mm(t.inner)}`} · ${len}`;
}
