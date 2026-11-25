import { RHO_ANR, T_REF } from "./constants";

/**
 * Portata massica secondo ISO 6358 attraverso un orifizio/componente.
 *
 * @param pu pressione a monte [Pa ass.]
 * @param pd pressione a valle [Pa ass.]
 * @param C  conduttanza sonica [m³/(s·Pa)] (ANR). 1 dm³/(s·bar) = 1e-8 m³/(s·Pa)
 * @param b  rapporto critico di pressioni (0..1)
 * @param T  temperatura a monte [K]
 * @returns portata massica [kg/s], >0 da monte a valle (pu >= pd)
 */
export function iso6358MassFlow(pu: number, pd: number, C: number, b: number, T = T_REF): number {
  if (pu <= pd || pu <= 0) return 0;
  const choked = C * RHO_ANR * pu * Math.sqrt(T_REF / T);
  const r = pd / pu;
  if (r <= b) return choked;
  const x = (r - b) / (1 - b);
  return choked * Math.sqrt(Math.max(0, 1 - x * x));
}

/** Portata con segno tra due nodi: >0 se il flusso va da `pa` verso `pb`. */
export function signedFlow(pa: number, pb: number, C: number, b: number, T = T_REF): number {
  return pa >= pb ? iso6358MassFlow(pa, pb, C, b, T) : -iso6358MassFlow(pb, pa, C, b, T);
}

/** Converte C da dm³/(s·bar) a m³/(s·Pa). */
export const cFromDm3 = (c: number): number => c * 1e-3 / 1e5;
