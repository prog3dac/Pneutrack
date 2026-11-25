/**
 * Misure normalizzate dei cilindri: alesaggi, diametri dello stelo e corse.
 *
 * Le serie seguono le norme dei cilindri pneumatici più diffusi. I valori sono in mm e si
 * scrivono nei parametri come `"32 mm"`; restano sempre modificabili a mano.
 */
import { Quantity } from "./units";

export interface CylinderSize { bore: number; rod: number }
export interface CylinderSeries { id: string; label: string; sizes: CylinderSize[] }

const sizes = (pairs: [number, number][]): CylinderSize[] => pairs.map(([bore, rod]) => ({ bore, rod }));

export const CYLINDER_SERIES: CylinderSeries[] = [
  { id: "iso6432", label: "ISO 6432 (minicilindri)",
    sizes: sizes([[8, 4], [10, 4], [12, 6], [16, 6], [20, 8], [25, 10]]) },
  { id: "iso21287", label: "ISO 21287 (compatti)",
    sizes: sizes([[20, 10], [25, 10], [32, 12], [40, 12], [50, 16], [63, 16], [80, 20], [100, 25]]) },
  { id: "iso15552", label: "ISO 15552 (profilati e a tiranti)",
    sizes: sizes([[32, 12], [40, 16], [50, 20], [63, 20], [80, 25], [100, 25], [125, 32], [160, 40],
                  [200, 40], [250, 50], [320, 63]]) },
];

/** Alesaggi normalizzati (ISO 3320) [mm]. */
export const STANDARD_BORES = [8, 10, 12, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320];
/** Diametri dello stelo normalizzati (ISO 3320) [mm]. */
export const STANDARD_RODS = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40, 45, 50, 56, 63];
/** Corse preferenziali (ISO 4393) [mm]. */
export const STANDARD_STROKES = [10, 25, 50, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000];

/** Valore in mm di un parametro di lunghezza, o null se manca o non è valido. */
export function toMm(raw: string | undefined): number | null {
  if (!raw) return null;
  try {
    return Math.round(Quantity.parse(raw).to("mm") * 1000) / 1000;
  } catch {
    return null;
  }
}

/** Serie normalizzate che contengono la coppia alesaggio/stelo indicata. */
export function seriesOf(bore: string | undefined, rod: string | undefined): CylinderSeries[] {
  const b = toMm(bore), r = toMm(rod);
  if (b == null || r == null) return [];
  return CYLINDER_SERIES.filter((s) => s.sizes.some((x) => x.bore === b && x.rod === r));
}
