// Simboli grafici dei componenti, nello stile ISO 1219 (disegni originali).
//
// geometry(comp) restituisce, in coordinate locali con origine al centro:
//   { w, h, ports: { nome: {x, y, dir: [dx, dy]} }, svg: "<markup>" }
// Le porte devono coincidere con quelle del modello Python (numerazione ISO 5599).

const S = 40; // lato di una casella di valvola
const STUB = 10; // tratto di linea tra simbolo e porta

const up = [0, -1], down = [0, 1], left = [-1, 0], right = [1, 0];

function line(x1, y1, x2, y2, cls = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${cls ? ` class="${cls}"` : ""}/>`;
}
function rect(x, y, w, h, cls = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${cls ? ` class="${cls}"` : ""}/>`;
}
function path(d, cls = "") {
  return `<path d="${d}"${cls ? ` class="${cls}"` : ""}/>`;
}
function circle(cx, cy, r, cls = "") {
  return `<circle cx="${cx}" cy="${cy}" r="${r}"${cls ? ` class="${cls}"` : ""}/>`;
}

function arrowHead(x1, y1, x2, y2, size = 6) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const p1 = [x2 - size * Math.cos(a - 0.4), y2 - size * Math.sin(a - 0.4)];
  const p2 = [x2 - size * Math.cos(a + 0.4), y2 - size * Math.sin(a + 0.4)];
  return path(`M${x2},${y2} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]} Z`, "fill");
}
function arrow(x1, y1, x2, y2) {
  return line(x1, y1, x2, y2) + arrowHead(x1, y1, x2, y2);
}
function zigzag(x1, y1, x2, y2, n = 6, amp = 5) {
  const dx = (x2 - x1) / n, dy = (y2 - y1) / n;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
  let d = `M${x1},${y1}`;
  for (let i = 1; i < n; i++) {
    const s = i % 2 ? amp : -amp;
    d += ` L${x1 + dx * i + nx * s},${y1 + dy * i + ny * s}`;
  }
  return path(d + ` L${x2},${y2}`, "nofill");
}

// --- valvole distributrici -------------------------------------------------

// posizione orizzontale delle porte all'interno di una casella (0..1)
const VALVE_LAYOUT = {
  "2/2": { top: { 2: 0.5 }, bottom: { 1: 0.5 } },
  "3/2": { top: { 2: 0.5 }, bottom: { 1: 0.3, 3: 0.7 } },
  "4/2": { top: { 4: 0.3, 2: 0.7 }, bottom: { 1: 0.3, 3: 0.7 } },
  "5/2": { top: { 4: 0.3, 2: 0.7 }, bottom: { 5: 0.2, 1: 0.5, 3: 0.8 } },
  "5/3": { top: { 4: 0.3, 2: 0.7 }, bottom: { 5: 0.2, 1: 0.5, 3: 0.8 } },
};

// contenuto delle caselle, da sinistra (lato 14) a destra (lato 12).
// ["a", da, a] = freccia di passaggio; ["x", porta] = via chiusa.
const VALVE_BOXES = {
  "2/2": [[["a", "1", "2"]], [["x", "1"], ["x", "2"]]],
  "3/2": [[["a", "1", "2"], ["x", "3"]], [["a", "2", "3"], ["x", "1"]]],
  "4/2": [[["a", "1", "4"], ["a", "2", "3"]], [["a", "1", "2"], ["a", "4", "3"]]],
  "5/2": [[["a", "1", "4"], ["a", "2", "3"]], [["a", "1", "2"], ["a", "4", "5"]]],
  "5/3": [
    [["a", "1", "4"], ["a", "2", "3"]],
    [["x", "1"], ["x", "2"], ["x", "3"], ["x", "4"], ["x", "5"]],
    [["a", "1", "2"], ["a", "4", "5"]],
  ],
};

function actuator(kind, x0, side) {
  // x0: bordo esterno della valvola; side: -1 sinistra, +1 destra. Occupa 20 px.
  const o = (d) => x0 + side * d;
  switch (kind) {
    case "solenoid":
      return line(o(0), 0, o(4), 0) + rect(Math.min(o(4), o(14)), -8, 10, 16) +
        line(o(4), 8, o(14), -8);
    case "pilot":
      return line(o(0), 0, o(20), 0, "dash") + arrowHead(o(10), 0, o(2), 0, 7);
    case "manual":
      return line(o(0), 0, o(14), 0) + line(o(14), -8, o(14), 8) +
        path(`M${o(14)},-8 Q${o(20)},0 ${o(14)},8`, "nofill");
    case "mechanical":
      return line(o(0), 0, o(10), 0) + circle(o(15), 0, 5, "nofill");
    case "spring":
      return zigzag(o(0), 0, o(18), 0, 6, 6);
    default:
      return "";
  }
}

function valveGeometry(comp) {
  const fn = comp.function || "5/2";
  const boxes = VALVE_BOXES[fn] || VALVE_BOXES["5/2"];
  const lay = VALVE_LAYOUT[fn] || VALVE_LAYOUT["5/2"];
  const n = boxes.length;
  const W = n * S;
  const x0 = -W / 2;
  const rest = x0 + S; // la casella di riposo è sempre la seconda
  let svg = "";
  const px = (box, name) => {
    const k = lay.top[name] ?? lay.bottom[name];
    return x0 + box * S + k * S;
  };
  const isTop = (name) => name in lay.top;

  boxes.forEach((content, b) => {
    svg += rect(x0 + b * S, -S / 2, S, S, "box");
    for (const item of content) {
      if (item[0] === "a") {
        const [, from, to] = item;
        const y1 = isTop(from) ? -S / 2 + 4 : S / 2 - 4;
        const y2 = isTop(to) ? -S / 2 + 4 : S / 2 - 4;
        svg += arrow(px(b, from), y1, px(b, to), y2);
      } else {
        const name = item[1];
        const x = px(b, name);
        const yEdge = isTop(name) ? -S / 2 : S / 2;
        const yIn = isTop(name) ? -S / 2 + 9 : S / 2 - 9;
        svg += line(x, yEdge, x, yIn) + line(x - 5, yIn, x + 5, yIn);
      }
    }
  });

  const ports = {};
  for (const [name, k] of Object.entries(lay.top)) {
    const x = rest + k * S;
    svg += line(x, -S / 2, x, -S / 2 - STUB);
    ports[name] = { x, y: -S / 2 - STUB, dir: up };
  }
  for (const [name, k] of Object.entries(lay.bottom)) {
    const x = rest + k * S;
    svg += line(x, S / 2, x, S / 2 + STUB);
    // gli scarichi hanno il triangolo di scarico se lasciati liberi (disegnato dall'editor)
    ports[name] = { x, y: S / 2 + STUB, dir: down };
  }

  const a14 = comp.actuation_14 || "solenoid";
  const a12 = comp.actuation_12 || "spring";
  svg += actuator(a14, x0, -1) + actuator(a12, -x0, +1);
  if (a14 === "pilot") ports["14"] = { x: x0 - 20, y: 0, dir: left };
  if (a12 === "pilot") ports["12"] = { x: -x0 + 20, y: 0, dir: right };

  return { w: W + 44, h: S + 2 * STUB, ports, svg };
}

// --- altri componenti -------------------------------------------------------

function sourceGeometry() {
  const svg = circle(0, 0, 14, "body") + path("M0,-8 L7,5 L-7,5 Z", "nofill") +
    line(0, -14, 0, -24);
  return { w: 30, h: 50, ports: { 1: { x: 0, y: -24, dir: up } }, svg };
}

function silencerGeometry() {
  const svg = line(0, -14, 0, -6) + path("M0,-6 L9,6 L-9,6 Z", "nofill") +
    rect(-9, 6, 18, 6, "hatch");
  return { w: 22, h: 30, ports: { 1: { x: 0, y: -14, dir: up } }, svg };
}

function plugGeometry() {
  const svg = line(0, -10, 0, 0) + line(-7, 0, 7, 0, "thick");
  return { w: 16, h: 14, ports: { 1: { x: 0, y: -10, dir: up } }, svg };
}

function regulatorGeometry() {
  const h = S / 2;
  const svg = rect(-h, -h, S, S, "box") +
    line(0, h, 0, h + STUB) + line(0, -h, 0, -h - STUB) +
    arrow(-6, h - 4, -6, -h + 4) +
    zigzag(h, 6, h + 16, 6, 5, 5) +
    line(-h, -h + 8, -h - 8, -h + 8, "dash") + line(-h - 8, -h + 8, -h - 8, -h - STUB + 2, "dash") +
    line(-h - 8, -h - STUB + 2, 0, -h - STUB + 2, "dash");
  return {
    w: S + 30, h: S + 2 * STUB,
    ports: { 1: { x: 0, y: h + STUB, dir: down }, 2: { x: 0, y: -h - STUB, dir: up } },
    svg,
  };
}

function flowControlGeometry() {
  const svg = line(0, -24, 0, 24) +
    path("M-8,-10 Q-1,0 -8,10", "nofill") + path("M8,-10 Q1,0 8,10", "nofill") +
    arrow(-12, 12, 12, -12);
  return {
    w: 30, h: 50,
    ports: { 1: { x: 0, y: 24, dir: down }, 2: { x: 0, y: -24, dir: up } },
    svg,
  };
}

function cylinderGeometry(comp, double) {
  const pistonX = -25;
  let svg = rect(-60, -15, 120, 30, "body") +
    line(pistonX, -15, pistonX, 15, "thick") +
    rect(pistonX, -3, 115, 6, "rod");
  const ports = { A: { x: -50, y: 25, dir: down } };
  svg += line(-50, 15, -50, 25);
  if (double) {
    svg += line(50, 15, 50, 25);
    ports.B = { x: 50, y: 25, dir: down };
  } else {
    svg += zigzag(pistonX + 4, -9, 58, -9, 9, 4);
    svg += line(50, -15, 50, -21) + line(46, -21, 54, -21); // sfiato camera stelo
  }
  return { w: 152, h: 52, ports, svg };
}

function rotaryGeometry() {
  const svg = circle(0, 0, 20, "body") +
    path("M-11,-6 A12,12 0 0 1 11,-6", "nofill") + arrowHead(-4, -11, -11, -6) +
    arrowHead(4, -11, 11, -6) + line(-10, 20, -10, 30) + line(10, 20, 10, 30) +
    line(0, 0, 0, -4);
  return {
    w: 44, h: 64,
    ports: { A: { x: -10, y: 30, dir: down }, B: { x: 10, y: 30, dir: down } },
    svg,
  };
}

export function geometry(comp) {
  switch (comp.type) {
    case "directional_valve": return valveGeometry(comp);
    case "pressure_source": return sourceGeometry(comp);
    case "silencer": return silencerGeometry(comp);
    case "plug": return plugGeometry(comp);
    case "pressure_regulator": return regulatorGeometry(comp);
    case "flow_control_valve": return flowControlGeometry(comp);
    case "single_acting_cylinder": return cylinderGeometry(comp, false);
    case "double_acting_cylinder": return cylinderGeometry(comp, true);
    case "rotary_actuator": return rotaryGeometry(comp);
    default:
      return {
        w: 40, h: 40, ports: {},
        svg: rect(-20, -20, 40, 40, "box") + `<text x="0" y="4" class="unknown">?</text>`,
      };
  }
}

// Ruota un punto o una direzione di rot*90° in senso orario.
export function rotate([x, y], rot) {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [-y, x];
    case 2: return [-x, -y];
    case 3: return [y, -x];
    default: return [x, y];
  }
}

// Miniatura per la palette.
export function thumbnail(comp, size = 44) {
  const g = geometry(comp);
  const scale = Math.min(size / g.w, size / g.h, 1);
  return `<svg viewBox="${-size / 2} ${-size / 2} ${size} ${size}" width="${size}" height="${size}" class="symbol">` +
    `<g transform="scale(${scale})">${g.svg}</g></svg>`;
}
