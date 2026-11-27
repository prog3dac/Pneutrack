import { KAPPA, P_ATM, R_AIR, SEAL_PRESSURE_FRICTION, T_REF, VISCOUS_PER_PERIMETER } from "./constants";
import { cFromDm3, signedFlow } from "./flow";
import { rk4Step } from "./rk4";

/** Parametri del circuito: alimentazione → valvola 5/2 → cilindro doppio effetto. */
export interface CircuitParams {
  supplyPressure: number; // Pa ass.
  bore: number; // alesaggio [m]
  rod: number; // diametro stelo [m]
  stroke: number; // corsa [m]
  deadVolume: number; // volume morto per camera (inclusi tubi) [m³]
  mass: number; // massa mobile [kg]
  load: number; // forza resistente costante, positiva se si oppone all'estensione [N]
  frictionCoulomb: number; // [N]
  frictionViscous: number; // [N·s/m]
  frictionPressure: number; // attrito delle guarnizioni: frazione della forza di pressione relativa [-]
  valveC: number; // conduttanza sonica per via valvola [dm³/(s·bar)]
  valveB: number; // rapporto critico valvola
  /** strozzatore sullo scarico di ogni camera: C [dm³/(s·bar)], Infinity = nessuno */
  exhaustC: number;
  T: number; // [K]
}

export const defaultParams: CircuitParams = {
  supplyPressure: 6e5 + P_ATM,
  bore: 0.032,
  rod: 0.012,
  stroke: 0.1,
  deadVolume: 5e-6,
  mass: 1,
  load: 0,
  frictionCoulomb: 5,
  frictionViscous: VISCOUS_PER_PERIMETER * Math.PI * 0.032,
  frictionPressure: SEAL_PRESSURE_FRICTION,
  valveC: 1.5,
  valveB: 0.35,
  exhaustC: Infinity,
  T: T_REF,
};

/** Stato: [p1, p2, x, v] con p1 camera lato testa (estensione), p2 lato stelo. */
export type State = [number, number, number, number];

export interface Sample {
  t: number;
  p1: number;
  p2: number;
  x: number;
  v: number;
}

/** Posizione valvola: 1 = P→A (testa) e B→scarico → estende; 0 = P→B e A→scarico → rientra. */
export function simulate(
  params: CircuitParams,
  valveSchedule: (t: number) => 0 | 1,
  tEnd: number,
  dt = 2e-5,
  sampleEvery = 100,
  initial?: Partial<{ p1: number; p2: number; x: number }>,
): Sample[] {
  const p = params;
  const A1 = (Math.PI * p.bore ** 2) / 4;
  const A2 = A1 - (Math.PI * p.rod ** 2) / 4;
  const C = cFromDm3(p.valveC);
  const Cx = Number.isFinite(p.exhaustC) ? cFromDm3(p.exhaustC) : Infinity;
  const RT = R_AIR * p.T;

  // Conduttanza serie valvola+strozzatore di scarico (somma in quadratura delle resistenze).
  const Cexh = Number.isFinite(Cx) ? 1 / Math.sqrt(1 / C ** 2 + 1 / Cx ** 2) : C;

  const deriv = (t: number, y: number[]): number[] => {
    const [p1, p2, x, v] = y as [number, number, number, number];
    const s = valveSchedule(t);
    const V1 = p.deadVolume + A1 * x;
    const V2 = p.deadVolume + A2 * (p.stroke - x);

    // Camera 1 e 2: portata entrante [kg/s]
    let m1: number, m2: number;
    if (s === 1) {
      m1 = signedFlow(p.supplyPressure, p1, C, p.valveB, p.T);
      m2 = -signedFlow(p2, P_ATM, Cexh, p.valveB, p.T);
    } else {
      m2 = signedFlow(p.supplyPressure, p2, C, p.valveB, p.T);
      m1 = -signedFlow(p1, P_ATM, Cexh, p.valveB, p.T);
    }

    // Fine corsa: blocco anelastico gestito a livello di passo, qui velocità effettiva.
    const dV1 = A1 * v;
    const dV2 = -A2 * v;
    const dp1 = ((KAPPA * RT) / V1) * m1 - (KAPPA * p1 * dV1) / V1;
    const dp2 = ((KAPPA * RT) / V2) * m2 - (KAPPA * p2 * dV2) / V2;

    const pressureForce = p1 * A1 - p2 * A2 - P_ATM * (A1 - A2);
    const seal = p.frictionPressure * (Math.max(0, p1 - P_ATM) * A1 + Math.max(0, p2 - P_ATM) * A2);
    const friction = (p.frictionCoulomb + seal) * Math.tanh(v / 1e-3) + p.frictionViscous * v;
    const a = (pressureForce - p.load - friction) / p.mass;
    return [dp1, dp2, v, a];
  };

  let t = 0;
  let y: number[] = [initial?.p1 ?? P_ATM, initial?.p2 ?? P_ATM, initial?.x ?? 0, 0];
  const out: Sample[] = [];
  let n = 0;
  const push = () => out.push({ t, p1: y[0] as number, p2: y[1] as number, x: y[2] as number, v: y[3] as number });
  push();
  while (t < tEnd) {
    y = rk4Step(deriv, t, y, dt);
    t += dt;
    // Finecorsa: posizione limitata, velocità annullata (urto anelastico).
    if ((y[2] as number) <= 0) {
      y[2] = 0;
      if ((y[3] as number) < 0) y[3] = 0;
    } else if ((y[2] as number) >= p.stroke) {
      y[2] = p.stroke;
      if ((y[3] as number) > 0) y[3] = 0;
    }
    y[0] = Math.max(y[0] as number, 1e3);
    y[1] = Math.max(y[1] as number, 1e3);
    if (++n % sampleEvery === 0) push();
  }
  return out;
}
