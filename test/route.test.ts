import { describe, expect, it } from "vitest";
import { routePoints, simplifyPolyline, straightenBends, type PortPoint, type Pt } from "../src/model/route";

const up: [number, number] = [0, -1], down: [number, number] = [0, 1], left: [number, number] = [-1, 0];
const port = (x: number, y: number, dir: [number, number]): PortPoint => ({ x, y, dir });
const onGrid = (pts: Pt[]) => pts.every(([x, y]) => x % 10 === 0 && y % 10 === 0);

describe("percorso delle linee", () => {
  it("con le porte sui nodi tutti i gomiti cadono sulla griglia, anche a metà percorso", () => {
    const { pts } = routePoints(port(0, 0, up), port(30, -50, down));
    expect(onGrid(pts)).toBe(true);
  });
  it("due porte una di fronte all'altra danno un tratto dritto", () => {
    const pts = simplifyPolyline(routePoints(port(0, 0, up), port(0, -100, down)).pts, 0);
    expect(pts.filter((_, i) => i > 0 && i < pts.length - 1).every((p) => p[0] === 0)).toBe(true);
  });
});

describe("raddrizza", () => {
  it("toglie un gradino di un passo tra due tratti nello stesso verso", () => {
    const pts: Pt[] = [[0, 0], [10, 0], [40, 0], [40, 10], [80, 10], [90, 10], [100, 10]];
    // tratto 40→80 a y=10 dopo un gradino di 10: con estremi fissi non si toglie
    expect(simplifyPolyline(pts, 10)).toEqual([[0, 0], [10, 0], [40, 0], [40, 10], [90, 10], [100, 10]]);
    const free: Pt[] = [[0, 0], [0, -10], [0, -40], [10, -40], [10, -80], [60, -80], [60, -90], [60, -100]];
    // il verticale dopo il gradino si sposta sulla retta di quello prima
    expect(simplifyPolyline(free, 10)).toEqual([[0, 0], [0, -10], [0, -80], [60, -80], [60, -90], [60, -100]]);
  });
  it("lascia stare i gradini più lunghi del limite e le anse a U", () => {
    const z: Pt[] = [[0, 0], [0, -10], [0, -40], [30, -40], [30, -80], [60, -80], [60, -90], [60, -100]];
    expect(simplifyPolyline(z, 10)).toEqual(z);
    const u: Pt[] = [[0, 0], [0, -10], [0, -40], [10, -40], [10, -10], [50, -10], [50, -20], [50, -30]];
    expect(simplifyPolyline(u, 10)).toEqual(u);
  });
  it("toglie i punti allineati e i tratti che tornano indietro", () => {
    expect(simplifyPolyline([[0, 0], [0, -10], [0, -30], [0, -20], [0, -50], [0, -60]], 0)).toEqual([[0, 0], [0, -10], [0, -50], [0, -60]]);
  });
  it("valvola sotto il cilindro: le pieghe di uno schema vecchio spariscono se la linea torna dritta", () => {
    // porta della valvola in (0, 100) verso l'alto, porta del cilindro in (0, 0) verso il basso
    const bends: Pt[] = [[0, 60], [10, 60], [10, 40], [0, 40]];
    expect(straightenBends(port(0, 100, up), port(0, 0, down), bends)).toEqual([]);
  });
  it("tiene le pieghe che servono, senza i gradini", () => {
    const a = port(0, 100, up), b = port(100, 0, left);
    const bends: Pt[] = [[0, 50], [10, 50], [10, 0]];
    const out = straightenBends(a, b, bends);
    const pts = simplifyPolyline(routePoints(a, b, out).pts, 0);
    expect(onGrid(pts)).toBe(true);
    expect(pts).toEqual([[0, 100], [0, 90], [0, 0], [90, 0], [100, 0]]);
  });
});
