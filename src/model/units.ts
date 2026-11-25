/**
 * Grandezze con unità da catalogo.
 *
 * I cataloghi pneumatici esprimono i parametri in unità "di officina" (bar, mm,
 * Nl/min, dm³/(s·bar)...). Ogni valore è una {@link Quantity} che conserva il
 * valore SI per i calcoli e l'unità d'origine per la visualizzazione.
 * Le pressioni sono sempre relative (manometriche), come nei cataloghi.
 */

export type Dimension =
  | "pressure" | "length" | "area" | "volume" | "force" | "flow" | "conductance"
  | "mass" | "time" | "angle" | "dimensionless";

export class UnitError extends Error {
  override name = "UnitError";
}

/** unità -> [dimensione, fattore verso SI] */
const UNITS: Record<string, [Dimension, number]> = {
  Pa: ["pressure", 1], kPa: ["pressure", 1e3], MPa: ["pressure", 1e6], bar: ["pressure", 1e5],
  mbar: ["pressure", 1e2], psi: ["pressure", 6894.757293168],
  m: ["length", 1], cm: ["length", 1e-2], mm: ["length", 1e-3], in: ["length", 0.0254],
  m2: ["area", 1], cm2: ["area", 1e-4], mm2: ["area", 1e-6],
  m3: ["volume", 1], l: ["volume", 1e-3], cm3: ["volume", 1e-6],
  N: ["force", 1], kN: ["force", 1e3], daN: ["force", 10],
  "Nl/min": ["flow", 1e-3 / 60], "Nl/s": ["flow", 1e-3], "Nm3/h": ["flow", 1 / 3600], "Nm3/s": ["flow", 1],
  // conduttanza sonica ISO 6358: 1 dm³/(s·bar) = 1e-8 m³/(s·Pa)
  "dm3/(s·bar)": ["conductance", 1e-8], "m3/(s·Pa)": ["conductance", 1],
  kg: ["mass", 1], g: ["mass", 1e-3],
  s: ["time", 1], ms: ["time", 1e-3], min: ["time", 60],
  rad: ["angle", 1], deg: ["angle", Math.PI / 180],
  "": ["dimensionless", 1],
};

const ALIASES: Record<string, string> = {
  "m²": "m2", "cm²": "cm2", "mm²": "mm2", "m³": "m3", "cm³": "cm3", dm3: "l", L: "l",
  "NL/min": "Nl/min", "nl/min": "Nl/min", "l/min": "Nl/min", "Nm³/h": "Nm3/h", "°": "deg",
  "dm³/(s·bar)": "dm3/(s·bar)", "dm3/(s*bar)": "dm3/(s·bar)", "dm3/s/bar": "dm3/(s·bar)",
  "l/(s·bar)": "dm3/(s·bar)", "l/(s*bar)": "dm3/(s·bar)", "Nl/(s·bar)": "dm3/(s·bar)",
};

export const SI_UNIT: Record<Dimension, string> = {
  pressure: "Pa", length: "m", area: "m2", volume: "m3", force: "N", flow: "Nm3/s",
  conductance: "m3/(s·Pa)", mass: "kg", time: "s", angle: "rad", dimensionless: "",
};

const QTY_RE = /^\s*([-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?)\s*(.*?)\s*$/;

function lookup(unit: string): [string, Dimension, number] {
  const u = ALIASES[unit] ?? unit;
  const entry = UNITS[u];
  if (!entry) throw new UnitError(`unità sconosciuta: '${unit}'`);
  return [u, entry[0], entry[1]];
}

export function knownUnits(dimension?: Dimension): string[] {
  return Object.entries(UNITS).filter(([, [d]]) => !dimension || d === dimension).map(([u]) => u);
}

/** Formato "%g": 6 cifre significative, notazione esponenziale per valori molto grandi o piccoli. */
export function fmtG(v: number): string {
  if (v === 0 || !Number.isFinite(v)) return String(v === 0 ? 0 : v);
  const exp = Math.floor(Math.log10(Math.abs(Number(v.toPrecision(6)))));
  if (exp < -4 || exp >= 6) {
    const [m = "", e = "0"] = v.toExponential(5).split("e");
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const n = Number(e);
    return `${mant}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
  }
  const s = v.toFixed(Math.max(0, 5 - exp));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export type QuantityLike = Quantity | string | [number, string];

export class Quantity {
  constructor(readonly si: number, readonly dimension: Dimension, readonly unit: string) {}

  static of(value: number, unit: string): Quantity {
    const [u, dim, factor] = lookup(unit);
    return new Quantity(value * factor, dim, u);
  }

  /** Legge stringhe come "6 bar", "32mm", "0,5 MPa". */
  static parse(text: string): Quantity {
    const m = QTY_RE.exec(text);
    if (!m) throw new UnitError(`grandezza non valida: '${text}'`);
    return Quantity.of(parseFloat(m[1]!.replace(",", ".")), m[2]!);
  }

  static coerce(value: unknown): Quantity {
    if (value instanceof Quantity) return value;
    if (typeof value === "string") return Quantity.parse(value);
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "string") {
      return Quantity.of(value[0], value[1]);
    }
    throw new UnitError(`impossibile interpretare ${JSON.stringify(value)} come grandezza`);
  }

  /** Valore nell'unità d'origine. */
  get value(): number {
    return this.to(this.unit);
  }

  to(unit: string): number {
    const [u, dim, factor] = lookup(unit);
    if (dim !== this.dimension) throw new UnitError(`impossibile convertire ${this.dimension} in '${u}'`);
    return this.si / factor;
  }

  inUnit(unit: string): Quantity {
    return new Quantity(this.si, this.dimension, lookup(unit)[0]);
  }

  equals(other: Quantity): boolean {
    return this.dimension === other.dimension &&
      Math.abs(this.si - other.si) <= 1e-12 * Math.max(1, Math.abs(this.si), Math.abs(other.si));
  }

  compare(other: Quantity): number {
    if (other.dimension !== this.dimension) {
      throw new UnitError(`dimensioni incompatibili: ${this.dimension} e ${other.dimension}`);
    }
    return this.equals(other) ? 0 : this.si < other.si ? -1 : 1;
  }

  toString(): string {
    const txt = fmtG(this.value);
    return this.unit ? `${txt} ${this.unit}` : txt;
  }
}

/** Scorciatoia: q("6 bar"). */
export const q = (text: string): Quantity => Quantity.parse(text);

/** Pressione relativa in bar a partire da Pa. */
export const barFromPa = (pa: number): Quantity => new Quantity(pa, "pressure", "bar");
