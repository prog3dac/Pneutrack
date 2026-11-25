export type Deriv = (t: number, y: number[]) => number[];

/** Un passo Runge-Kutta 4 a passo fisso. */
export function rk4Step(f: Deriv, t: number, y: number[], h: number): number[] {
  const add = (a: number[], b: number[], s: number) => a.map((v, i) => v + s * (b[i] as number));
  const k1 = f(t, y);
  const k2 = f(t + h / 2, add(y, k1, h / 2));
  const k3 = f(t + h / 2, add(y, k2, h / 2));
  const k4 = f(t + h, add(y, k3, h));
  return y.map((v, i) => v + (h / 6) * ((k1[i] as number) + 2 * (k2[i] as number) + 2 * (k3[i] as number) + (k4[i] as number)));
}
