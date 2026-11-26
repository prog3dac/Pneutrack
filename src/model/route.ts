/**
 * Percorso delle linee sullo schema e loro pulizia ("raddrizza").
 *
 * Una linea esce dalla porta con un tratto di un passo di griglia nella direzione della
 * porta, passa per i punti di piega scelti dall'utente e rientra nell'altra porta nello
 * stesso modo. Con le porte sui nodi della griglia e le pieghe agganciate alla griglia,
 * tutti i gomiti cadono sui nodi.
 *
 * {@link straightenBends} toglie dal percorso i gradini corti, i tratti allineati e le
 * pieghe che non servono più, e restituisce le pieghe da salvare.
 */

export type Pt = [number, number];
export type Dir = [number, number];
export interface PortPoint { x: number; y: number; dir: Dir }
export interface RouteEnd { x: number; y: number; dir?: Dir }

/** passo della griglia dello schema */
export const GRID = 10;
/** lunghezza del tratto d'uscita da una porta: un passo, così il primo gomito cade su un nodo */
export const EXIT = GRID;

const snap = (v: number) => Math.round(v / GRID) * GRID;

/**
 * Percorso ortogonale di una linea: tratto d'uscita dalla porta, poi i punti di piega
 * scelti dall'utente (se ci sono), poi il tratto d'ingresso nell'altra porta.
 * `bendAt[k]` è l'indice in `pts` del k-esimo punto di piega.
 */
export function routePoints(a: PortPoint, b: RouteEnd, bends: Pt[] = []) {
  const s1: Pt = [a.x + a.dir[0] * EXIT, a.y + a.dir[1] * EXIT];
  const s2: Pt = b.dir ? [b.x + b.dir[0] * EXIT, b.y + b.dir[1] * EXIT] : [b.x, b.y];
  const pts: Pt[] = [[a.x, a.y], s1];
  const bendAt: number[] = [];
  if (!bends.length) {
    const v1 = a.dir[0] === 0, v2 = b.dir ? b.dir[0] === 0 : !v1;
    if (v1 && v2) {
      // tratto di mezzo sulla griglia, anche quando la metà cadrebbe tra due nodi
      const my = snap((s1[1] + s2[1]) / 2);
      pts.push([s1[0], my], [s2[0], my]);
    } else if (!v1 && !v2) {
      const mx = snap((s1[0] + s2[0]) / 2);
      pts.push([mx, s1[1]], [mx, s2[1]]);
    } else if (v1) {
      pts.push([s1[0], s2[1]]);
    } else {
      pts.push([s2[0], s1[1]]);
    }
  } else {
    let vertical = a.dir[0] === 0; // asse dell'ultimo tratto
    const goTo = (q: Pt) => {
      const p = pts[pts.length - 1]!;
      if (p[0] !== q[0] && p[1] !== q[1]) {
        // gira: prima perpendicolare all'ultimo tratto, poi di nuovo parallelo
        pts.push(vertical ? [q[0], p[1]] : [p[0], q[1]]);
      } else if (p[0] !== q[0] || p[1] !== q[1]) {
        vertical = p[0] === q[0];
      }
      pts.push(q);
    };
    for (const w of bends) { goTo(w); bendAt.push(pts.length - 1); }
    goTo(s2);
  }
  pts.push(s2, [b.x, b.y]);
  return { pts, bendAt };
}

const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1];
/** p, q, r sulla stessa retta orizzontale o verticale (anche tornando indietro) */
const inLine = (p: Pt, q: Pt, r: Pt) => (p[0] === q[0] && q[0] === r[0]) || (p[1] === q[1] && q[1] === r[1]);

/**
 * Pulisce una polilinea ortogonale. I primi `head` e gli ultimi `tail` punti sono fissi
 * (porta e fine del tratto d'uscita); gli altri si possono spostare o togliere.
 * - toglie i punti doppi e quelli allineati con i vicini (anche i tratti che tornano indietro);
 * - toglie i gradini lunghi al più `maxJog` tra due tratti paralleli che vanno nello stesso
 *   verso, spostando uno dei due tratti sulla retta dell'altro.
 */
export function simplifyPolyline(input: Pt[], maxJog = GRID, head = 2, tail = 2): Pt[] {
  const pts = input.map((p) => [...p] as Pt);
  const fixed = pts.map((_, i) => i < head || i >= pts.length - tail);
  const clean = () => {
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 1; i + 1 < pts.length; i++) {
        if (fixed[i]) continue;
        if (same(pts[i]!, pts[i - 1]!) || same(pts[i]!, pts[i + 1]!) || inLine(pts[i - 1]!, pts[i]!, pts[i + 1]!)) {
          pts.splice(i, 1); fixed.splice(i, 1); changed = true; break;
        }
      }
    }
  };
  clean();
  for (let guard = 0; guard < 100; guard++) {
    let done = false;
    // tratto i = pts[i] → pts[i + 1], tra il tratto i - 1 e il tratto i + 1
    for (let i = 1; i + 2 < pts.length && !done; i++) {
      const p0 = pts[i - 1]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2]!;
      const horiz = p1[1] === p2[1];
      const len = horiz ? Math.abs(p2[0] - p1[0]) : Math.abs(p2[1] - p1[1]);
      if (!len || len > maxJog) continue;
      // i due tratti vicini devono essere paralleli tra loro e andare nello stesso verso (a Z)
      const a = horiz ? p1[1] - p0[1] : p1[0] - p0[0];
      const b = horiz ? p3[1] - p2[1] : p3[0] - p2[0];
      if (!a || !b || Math.sign(a) !== Math.sign(b)) continue;
      if (horiz ? p0[0] !== p1[0] || p2[0] !== p3[0] : p0[1] !== p1[1] || p2[1] !== p3[1]) continue;
      const k = horiz ? 0 : 1;
      if (!fixed[i + 1] && !fixed[i + 2]) {
        // il tratto dopo il gradino si sposta sulla retta di quello prima
        pts[i + 1]![k] = p1[k]; pts[i + 2]![k] = p1[k];
        done = true;
      } else if (!fixed[i - 1] && !fixed[i]) {
        pts[i - 1]![k] = p2[k]; pts[i]![k] = p2[k];
        done = true;
      }
    }
    if (!done) break;
    clean();
  }
  return pts;
}

/**
 * Raddrizza una linea: restituisce le pieghe da salvare dopo la pulizia
 * (vuoto se il percorso automatico, senza pieghe, dà lo stesso disegno).
 */
export function straightenBends(a: PortPoint, b: RouteEnd, bends: Pt[] = [], maxJog = GRID): Pt[] {
  const drawn = (pts: Pt[]) => simplifyPolyline(routePoints(a, b, pts).pts, 0);
  const equal = (p: Pt[], q: Pt[]) => p.length === q.length && p.every((x, i) => same(x, q[i]!));
  const target = simplifyPolyline(simplifyPolyline(routePoints(a, b, bends).pts, maxJog), 0);
  // disegno invariato: le pieghe restano come le ha messe l'utente
  if (equal(drawn(bends), target)) return bends;
  if (equal(drawn([]), target)) return [];
  const out = target.slice(2, -2);
  // il percorso ricostruito dalle pieghe deve coincidere con quello pulito; altrimenti si lascia com'era
  if (!equal(drawn(out), target)) return bends;
  // si tengono solo le pieghe necessarie: i gomiti che il percorso ricostruisce da solo si tolgono
  for (let i = out.length - 1; i >= 0; i--) {
    const fewer = out.filter((_, j) => j !== i);
    if (equal(drawn(fewer), target)) out.splice(i, 1);
  }
  return out;
}
