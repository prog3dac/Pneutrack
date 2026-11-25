/**
 * Diagramma delle fasi: corsa dei cilindri e stato di bobine, relè e lampade,
 * nel tempo (diagramma spostamento-tempo) o per passi del ciclo (spostamento-passo).
 */
import { stepTimes, toStep, type Channel, type Sample } from "../sim/recorder";

export type DiagramMode = "time" | "step";

const LABEL_W = 120;
const PAD = 8;
const CYL_H = 34;
const BOOL_H = 16;
const GAP = 8;
const AXIS_H = 18;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (x: number) => (Math.round(x * 10) / 10).toString();

/** Altezza del disegno per questi canali [px]. */
export function diagramHeight(channels: Channel[]): number {
  return PAD + channels.reduce((h, c) => h + (c.kind === "cyl" ? CYL_H : BOOL_H) + GAP, 0) + AXIS_H;
}

/** Disegna il diagramma come SVG largo `width` px. */
export function renderDiagram(channels: Channel[], samples: Sample[], mode: DiagramMode, width: number): string {
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

  let y = PAD;
  channels.forEach((c, i) => {
    const h = c.kind === "cyl" ? CYL_H : BOOL_H;
    parts.push(`<g class="dg-lane ${c.kind}" data-channel="${esc(c.id)}">`);
    parts.push(`<text class="dg-label" x="${PAD}" y="${num(y + h / 2 + 4)}">${esc(c.label)}</text>`);
    parts.push(`<line class="dg-base" x1="${x0}" x2="${x1}" y1="${y + h}" y2="${y + h}"/>`);
    if (c.kind === "cyl") {
      parts.push(`<line class="dg-base dg-top" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + 4}" text-anchor="end">1</text>`);
      parts.push(`<text class="dg-tick" x="${x0 - 4}" y="${y + h + 3}" text-anchor="end">0</text>`);
    }
    const pts: string[] = [];
    let lastX = -1, lastV = NaN;
    for (let k = 0; k < samples.length; k++) {
      const s = samples[k]!;
      const v = s.v[i] ?? 0;
      const x = xOf(s.t);
      const isLast = k === samples.length - 1;
      if (c.kind === "bool") {
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
    parts.push(`</g>`);
    y += h + GAP;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" class="diagram-svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" data-mode="${mode}" data-steps="${steps.length}">${parts.join("")}</svg>`;
}
