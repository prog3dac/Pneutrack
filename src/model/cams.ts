/**
 * Riferimenti dei finecorsa: quale cilindro preme un rullo, un finecorsa elettrico o un sensore, e dove.
 *
 * Nel file il riferimento è un testo nell'elemento azionato (`cam`, `cam_14`, `cam_12`):
 *
 * | testo           | significato                                                              |
 * |-----------------|--------------------------------------------------------------------------|
 * | `C1+`           | C1 a fine corsa in uscita (stelo tutto fuori)                            |
 * | `C1-`           | C1 a fine corsa in rientro (stelo tutto dentro)                          |
 * | `C1@80 mm`      | C1 a 80 mm dal fondello, in entrambi i versi                             |
 * | `C1+@80 mm`     | C1 a 80 mm dal fondello; la leva unidirezionale scatta solo in uscita    |
 * | `C1-@80 mm`     | come sopra, solo in rientro                                              |
 *
 * Le quote a fine corsa (`C1+`, `C1-`) seguono la corsa quando cambia; le quote in mm restano dove sono.
 * Un numero senza unità vale mm.
 */
import { ONEWAY_MIN_SPEED, ONEWAY_ZONE, ROLLER_ZONE } from "../solver/constants";
import { fmtG, Quantity, UnitError } from "./units";

/** Finecorsa: il cilindro `cylinder` a fine corsa (`end`) oppure alla quota `at` [m] dal fondello. */
export interface Cam {
  cylinder: string;
  /** fine corsa in uscita ("+") o in rientro ("-"); assente con una quota intermedia */
  end?: "+" | "-";
  /** quota dal fondello [m] */
  at?: number;
  /** con la quota intermedia: verso in cui scatta la leva unidirezionale (assente = entrambi) */
  dir?: "+" | "-";
}

/** Come il cilindro aziona l'elemento: rullo o tastatore, leva unidirezionale (ribaltabile). */
export type CamKind = "roller" | "oneway";

const CAM_RE = /^([A-Za-z0-9_-]+?)([+-])?(?:\s*@\s*(.+))?$/;

/** Legge il testo del riferimento; `null` se non è valido. */
export function parseCam(text: string): Cam | null {
  const m = CAM_RE.exec(text.trim());
  if (!m) return null;
  const [, cylinder, sign, pos] = m as unknown as [string, string, "+" | "-" | undefined, string | undefined];
  if (pos === undefined) return sign ? { cylinder, end: sign } : null;
  const raw = pos.trim();
  let at: number;
  try {
    const qty = /^[-+]?[\d.,]+$/.test(raw) ? Quantity.of(parseFloat(raw.replace(",", ".")), "mm") : Quantity.parse(raw);
    if (qty.dimension !== "length") return null;
    at = qty.si;
  } catch (e) {
    if (e instanceof UnitError) return null;
    throw e;
  }
  if (!Number.isFinite(at) || at < 0) return null;
  return sign ? { cylinder, at, dir: sign } : { cylinder, at };
}

/** Quota in mm come si scrive nel file ("80 mm"). */
export const fmtMm = (m: number): string => `${fmtG(Number((m * 1000).toFixed(3)))} mm`;

/** Testo del riferimento per il file. */
export function formatCam(cam: Cam): string {
  if (cam.at === undefined) return `${cam.cylinder}${cam.end ?? "+"}`;
  return `${cam.cylinder}${cam.dir ?? ""}@${fmtMm(cam.at)}`;
}

/** Sigla del cilindro di un riferimento scritto (anche se non è valido). */
export function camCylinder(text: string): string {
  return parseCam(text)?.cylinder ?? text.trim().replace(/@.*$/, "").replace(/[+-]$/, "");
}

/** Lo stesso riferimento con il cilindro rinominato da `rename` (il resto del testo non cambia). */
export function renameCam(text: string, rename: (id: string) => string): string {
  const id = camCylinder(text);
  const nid = rename(id);
  if (nid === id) return text;
  const t = text.trim();
  return nid + t.slice(id.length);
}

/** Testo breve accanto al simbolo: "C1+", "C1-", "C1@80", "C1+@80" (quota in mm). */
export function camLabel(text: string): string {
  const cam = parseCam(text);
  if (!cam) return text;
  if (cam.at === undefined) return `${cam.cylinder}${cam.end}`;
  return `${cam.cylinder}${cam.dir ?? ""}@${fmtG(Number((cam.at * 1000).toFixed(3)))}`;
}

/** Quota dal fondello [m] a cui interviene il finecorsa, per un cilindro di corsa `stroke`. */
export function camPosition(cam: Cam, stroke: number): number {
  return cam.at ?? (cam.end === "-" ? 0 : stroke);
}

/**
 * Elemento premuto dal cilindro, con lo stelo alla quota `x` [m] e velocità `v` [m/s].
 *
 * - A fine corsa: il rullo è premuto negli ultimi {@link ROLLER_ZONE} di corsa, la leva unidirezionale negli
 *   ultimi {@link ONEWAY_ZONE} e solo mentre lo stelo va verso quel fine corsa.
 * - A una quota intermedia: la camma sullo stelo preme il rullo entro ±{@link ROLLER_ZONE} dalla quota; la
 *   leva unidirezionale nello stesso tratto, solo nel verso indicato (senza verso, in entrambi).
 */
export function camPressed(cam: Cam, kind: CamKind, x: number, v: number, stroke: number): boolean {
  if (cam.at === undefined) {
    const fromEnd = cam.end === "-" ? x : stroke - x;
    if (kind === "oneway") {
      const towards = cam.end === "-" ? v < -ONEWAY_MIN_SPEED : v > ONEWAY_MIN_SPEED;
      return fromEnd <= Math.min(ONEWAY_ZONE, stroke / 2) && towards;
    }
    return fromEnd <= ROLLER_ZONE;
  }
  const inZone = Math.abs(x - cam.at) <= ROLLER_ZONE + 1e-12;
  if (kind === "oneway" && cam.dir) return inZone && (cam.dir === "+" ? v > ONEWAY_MIN_SPEED : v < -ONEWAY_MIN_SPEED);
  return inZone;
}
