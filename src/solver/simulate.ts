import { KAPPA, P_ATM, R_AIR } from "./constants";
import { signedFlow } from "./flow";
import { rk4Step } from "./rk4";
import type { Network } from "./network";

export interface SimOptions {
  tEnd: number;
  dt?: number;
  sampleEvery?: number;
  /** valori di azionamento degli input (id componente → 0/1) al tempo t */
  inputs?: (t: number) => Record<string, number>;
}

export interface GraphSample {
  t: number;
  /** pressione assoluta di ogni nodo [Pa] */
  p: number[];
  cylinders: Record<string, { x: number; v: number }>;
}

export interface SimResult {
  network: Network;
  samples: GraphSample[];
}

/** Pressione assoluta [Pa] di una porta ("V1.2") in un campione. */
export const portPressure = (r: SimResult, s: GraphSample, port: string): number => s.p[r.network.portNode[port]!]!;

export function simulateNetwork(net: Network, opt: SimOptions): SimResult {
  const dt = opt.dt ?? 2e-5;
  const every = opt.sampleEvery ?? 100;
  const RT = R_AIR * net.temperature;

  // Layout dello stato: nodi liberi, poi (x, v) per ogni cilindro.
  const stateOfNode = new Array<number>(net.nodeCount).fill(-1);
  const freeNodes: number[] = [];
  for (let n = 0; n < net.nodeCount; n++) {
    if (!net.fixed.has(n)) { stateOfNode[n] = freeNodes.length; freeNodes.push(n); }
  }
  const cylOffset = freeNodes.length;

  const pressures = (y: number[]): number[] =>
    Array.from({ length: net.nodeCount }, (_, n) => net.fixed.get(n) ?? (y[stateOfNode[n]!] as number));

  const deriv = (t: number, y: number[]): number[] => {
    const P = pressures(y);
    const inp = opt.inputs?.(t) ?? {};
    const inflow = new Array<number>(net.nodeCount).fill(0);
    for (const e of net.elements) {
      if (e.when && (inp[e.when.input] ?? 0) !== e.when.value) continue;
      const pa = P[e.a]!, pb = P[e.b]!;
      let m = signedFlow(pa, pb, e.C, e.bcrit, net.temperature);
      if ((e.direction === "ab" && m < 0) || (e.direction === "ba" && m > 0)) m = 0;
      inflow[e.a]! -= m;
      inflow[e.b]! += m;
    }
    const V = net.baseVolume.slice();
    const dV = new Array<number>(net.nodeCount).fill(0);
    const dy = new Array<number>(y.length).fill(0);
    net.cylinders.forEach((c, i) => {
      const x = y[cylOffset + 2 * i] as number;
      const v = y[cylOffset + 2 * i + 1] as number;
      V[c.capNode]! += c.Vcap0 + c.A1 * x;
      dV[c.capNode]! += c.A1 * v;
      V[c.rodNode]! += c.Vrod0 + c.A2 * (c.stroke - x);
      dV[c.rodNode]! += -c.A2 * v;
      const force = P[c.capNode]! * c.A1 - P[c.rodNode]! * c.A2 - P_ATM * (c.A1 - c.A2);
      const seal = c.frictionPressure * (Math.max(0, P[c.capNode]! - P_ATM) * c.A1 + Math.max(0, P[c.rodNode]! - P_ATM) * c.A2);
      const fr = (c.frictionCoulomb + seal) * Math.tanh(v / 1e-3) + c.frictionViscous * v;
      dy[cylOffset + 2 * i] = v;
      dy[cylOffset + 2 * i + 1] = (force - c.load - fr) / c.mass;
    });
    for (const n of freeNodes) {
      dy[stateOfNode[n]!] = ((KAPPA * RT) / V[n]!) * inflow[n]! - (KAPPA * P[n]! * dV[n]!) / V[n]!;
    }
    return dy;
  };

  let y = new Array<number>(cylOffset + 2 * net.cylinders.length).fill(0);
  for (const n of freeNodes) y[stateOfNode[n]!] = P_ATM;
  net.cylinders.forEach((c, i) => { y[cylOffset + 2 * i] = c.x0; });

  const snapshot = (t: number): GraphSample => ({
    t,
    p: pressures(y),
    cylinders: Object.fromEntries(
      net.cylinders.map((c, i) => [c.id, { x: y[cylOffset + 2 * i] as number, v: y[cylOffset + 2 * i + 1] as number }]),
    ),
  });

  const samples: GraphSample[] = [snapshot(0)];
  let t = 0, k = 0;
  while (t < opt.tEnd) {
    y = rk4Step(deriv, t, y, dt);
    t += dt;
    net.cylinders.forEach((c, i) => {
      const xi = cylOffset + 2 * i;
      if ((y[xi] as number) <= 0) { y[xi] = 0; if ((y[xi + 1] as number) < 0) y[xi + 1] = 0; }
      else if ((y[xi] as number) >= c.stroke) { y[xi] = c.stroke; if ((y[xi + 1] as number) > 0) y[xi + 1] = 0; }
    });
    for (let i = 0; i < cylOffset; i++) y[i] = Math.max(y[i] as number, 1e3);
    if (++k % every === 0) samples.push(snapshot(t));
  }
  return { network: net, samples };
}
