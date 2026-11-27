/**
 * Diagramma delle fasi: corsa dei cilindri, pressione dei manometri e stato di bobine,
 * relè e lampade, nel tempo (diagramma spostamento-tempo) o per passi del ciclo
 * (spostamento-passo), con il tempo di ogni corsa e una fascia con i cicli.
 */
import { strokes, type Cycle } from "../sim/measures";
import { stepTimes, toStep, type Channel, type Sample } from "../sim/recorder";

export type DiagramMode = "time" | "step";

const LABEL_W = 120;
const PAD = 8;
const CYL_H = 34;
const BOOL_H = 16;
const BAR_H = 28;
const CYCLE_H = 16;
/** spazio libero dopo l'arrivo perché il tempo di corsa ci stia scritto [px] */
const MIN_LABEL_W = 34;
const GAP = 8;
const AXIS_H = 18;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (x: number) => (Math.round(x * 10) / 10).toString();
/** numero con la virgola e `d` decimali */
export const fmt = (x: number, d: number) => x.toFixed(d).replace(".", ",");
const laneH = (c: Channel) => (c.kind === "cyl" || c.kind === "pos3" ? CYL_H : c.kind === "bar" ? BAR_H : BOOL_H);
const hasCylinders = (channels: Channel[]) => channels.some((c) => c.kind === "cyl");

/** Altezza del disegno per questi canali [px]. */
export function diagramHeight(channels: Channel[]): number {
  return PAD + channels.reduce((h, c) => h + laneH(c) + GAP, 0) +
    (hasCylinders(channels) ? CYCLE_H + GAP : 0) + AXIS_H;
}

/**
 * Disegna il diagramma come SVG largo `width` px. `cycles` sono i cicli completati:
 * quelli che cadono nei campioni compaiono nella fascia «Cicli» in basso.
 */
export function renderDiagram(channels: Channel[], samples: Sample[], mode: DiagramMode, width: number,
                              cycles: Cycle[] = []): string {
  const height = diagramHeight(channels);
  const x0 = LABEL_W, x1 = Math.max(x0 + 40, width - PAD);
  const parts: string[] = [];
  const t0 = samples[0]?.t ?? 0;
  const tEnd = samples[samples.length - 1]?.t ?? 0;
  const steps = mode === "step" ? stepTimes(channels, samples) : [];
  const nSteps = Math.max(1, steps.length - 1);
  const span = Math.max(1, tEnd - t0);
  const xOf = mode === "step"
    ? (t: number) => x0 + (toStep(steps, t) / nSteps) * (x1 - x0)
    : (t: number) => x0 + ((t - t0) / span) * (x1 - x0);

  // griglia verticale: un tratto per passo, o per secondo "tondo"
  const grid: { x: number; text: string }[] = [];
  if (mode === "step") {
    for (let k = 0; k < steps.length; k++) grid.push({ x: x0 + (k / nSteps) * (x1 - x0), text: String(k + 1) });
  } else {
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
    const tick = nice.find((d) => span / d <= 10) ?? 20;
    for (let t = Math.ceil(t0 / tick) * tick; t <= t0 + span + 1e-9; t += tick) {
      grid.push({ x: xOf(t), text: `${num(t).replace(".", ",")} s` });
    }
  }
  for (const g of grid) {
    parts.push(`<line class="dg-grid" x1="${num(g.x)}" x2="${num(g.x)}" y1="${PAD}" y2="${height - AXIS_H}"/>`);
    parts.push(`<text class="dg-tick" x="${num(g.x)}" y="${height - 5}" text-anchor="middle">${esc(g.text)}</text>`);
  }

  const runs = strokes(channels, samples);
  let y = PAD;
  channels.forEach((c, i) => {
    const h = laneH(c);
    const scale = c.kind === "bar" ? 1 / (c.max || 10) : 1;
    parts.push(`<g class="dg-lane ${c.kind}" data-channel="${esc(c.id)}">`);
    parts.push(`<text class="dg-label" x="${PAD}" y="${num(y + h / 2 + 4)}">${esc(c.label)}</text>`);
    parts.push(`<line class="dg-base" x1="${x0}" x2="${x1}" y1="${y + h}" y2="${y + h}"/>`);
    if (c.kind === "cyl") {
      parts.push(`<line class="dg-base dg-top" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + 4}" text-anchor="end">1</text>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + h + 3}" text-anchor="end">0</text>`);
    } else if (c.kind === "pos3") {
      // le tre caselle: 14 in alto, centro, 12 in basso
      parts.push(`<line class="dg-base dg-mid" x1="${x0}" x2="${x1}" y1="${y + h / 2}" y2="${y + h / 2}"/>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + 4}" text-anchor="end">14</text>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${num(y + h / 2 + 3)}" text-anchor="end">0</text>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + h + 3}" text-anchor="end">12</text>`);
    } else if (c.kind === "bar") {
      parts.push(`<line class="dg-base dg-top" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + 4}" text-anchor="end">${c.max ?? 10}</text>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + h + 3}" text-anchor="end">0</text>`);
    }
    const pts: string[] = [];
    let lastX = -1, lastV = NaN;
    for (let k = 0; k < samples.length; k++) {
      const s = samples[k]!;
      const v = Math.min(1, Math.max(0, (s.v[i] ?? 0) * scale));
      const x = xOf(s.t);
      const isLast = k === samples.length - 1;
      if (c.kind === "bool" || c.kind === "pos3") {
        // a gradino: si aggiunge un punto solo quando lo stato cambia
        if (v !== lastV) {
          if (pts.length) pts.push(`${num(x)},${num(y + h - lastV * h)}`);
          pts.push(`${num(x)},${num(y + h - v * h)}`);
          lastV = v;
        } else if (isLast) pts.push(`${num(x)},${num(y + h - v * h)}`);
      } else if (x - lastX >= 1 || isLast) {
        pts.push(`${num(x)},${num(y + h - v * h)}`);
        lastX = x;
      }
    }
    if (pts.length) {
      if (c.kind === "bool") {
        const first = pts[0]!.split(",")[0], last = pts[pts.length - 1]!.split(",")[0];
        parts.push(`<polygon class="dg-fill" points="${first},${y + h} ${pts.join(" ")} ${last},${y + h}"/>`);
      }
      parts.push(`<polyline class="dg-trace" points="${pts.join(" ")}"/>`);
    }
    if (c.kind === "cyl") {
      // tempo di corsa, scritto appena dopo l'arrivo, sul fine corsa raggiunto
      const mine = runs.filter((r) => r.id === c.id);
      mine.forEach((r, k) => {
        const xb = xOf(r.end), next = mine[k + 1] ? xOf(mine[k + 1]!.start) : x1;
        if (next - xb < MIN_LABEL_W) return;
        const ty = r.dir === "+" ? y + 11 : y + h - 3;
        parts.push(`<text class="dg-dur" x="${num(xb + 3)}" y="${num(ty)}">` +
          `<title>${esc(`${c.id}${r.dir}: corsa in ${fmt(r.end - r.start, 3)} s, dalla partenza dal fine corsa all'arrivo`)}</title>` +
          `${fmt(r.end - r.start, 2)} s</text>`);
      });
    }
    parts.push(`</g>`);
    y += h + GAP;
  });

  if (hasCylinders(channels)) {
    // fascia dei cicli: dalla partenza dal riposo al ritorno di tutti i cilindri
    const h = CYCLE_H;
    parts.push(`<g class="dg-lane cycles" data-channel="cicli">`);
    parts.push(`<text class="dg-label" x="${PAD}" y="${num(y + h / 2 + 4)}">Cicli</text>`);
    for (const c of cycles) {
      if (c.end < t0 || c.start > tEnd) continue;
      const xa = Math.max(x0, xOf(c.start)), xb = Math.min(x1, xOf(c.end));
      const text = `${c.n}: ${fmt(c.end - c.start, 2)} s · ${fmt(c.air, 2)} Nl`;
      parts.push(`<g class="dg-cycle" data-cycle="${c.n}">` +
        `<title>${esc(`Ciclo ${c.n}: ${fmt(c.end - c.start, 3)} s dalla partenza al ritorno a riposo, ` +
          `${fmt(c.air, 3)} litri normali d'aria (ANR, 20 °C e 1 bar)`)}</title>` +
        `<rect x="${num(xa)}" y="${y + 2}" width="${num(Math.max(1, xb - xa))}" height="${h - 4}" rx="3"/>` +
        (xb - xa > text.length * 5.6 ? `<text x="${num((xa + xb) / 2)}" y="${num(y + h / 2 + 4)}" text-anchor="middle">${esc(text)}</text>`
          : xb - xa > 14 ? `<text x="${num((xa + xb) / 2)}" y="${num(y + h / 2 + 4)}" text-anchor="middle">${c.n}</text>` : "") +
        `</g>`);
    }
    parts.push(`</g>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" class="diagram-svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" data-mode="${mode}" data-steps="${steps.length}">${parts.join("")}</svg>`;
}
