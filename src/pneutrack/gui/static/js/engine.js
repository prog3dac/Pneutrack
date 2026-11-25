// Motore di analisi in JavaScript, per usare l'editor senza server (pagina statica).
//
// È la trascrizione fedele di pneutrack.model (unità, componenti, validazione) e di
// pneutrack.gui.api.analyze. La coerenza con Python è verificata da
// tests/e2e/engine_parity.mjs, che confronta i risultati dei due motori.
// I tipi di componente e i loro parametri arrivano da data/catalog.json, generato da Python.

// --- unità -------------------------------------------------------------------

const UNITS = {
  Pa: ["pressure", 1], kPa: ["pressure", 1e3], MPa: ["pressure", 1e6], bar: ["pressure", 1e5],
  mbar: ["pressure", 1e2], psi: ["pressure", 6894.757293168],
  m: ["length", 1], cm: ["length", 1e-2], mm: ["length", 1e-3], in: ["length", 0.0254],
  m2: ["area", 1], cm2: ["area", 1e-4], mm2: ["area", 1e-6],
  m3: ["volume", 1], l: ["volume", 1e-3], cm3: ["volume", 1e-6],
  N: ["force", 1], kN: ["force", 1e3], daN: ["force", 10],
  "Nl/min": ["flow", 1e-3 / 60], "Nl/s": ["flow", 1e-3], "Nm3/h": ["flow", 1 / 3600], "Nm3/s": ["flow", 1],
  s: ["time", 1], ms: ["time", 1e-3], min: ["time", 60],
  rad: ["angle", 1], deg: ["angle", Math.PI / 180],
  "": ["dimensionless", 1],
};
const ALIASES = {
  "m²": "m2", "cm²": "cm2", "mm²": "mm2", "m³": "m3", "cm³": "cm3", dm3: "l", L: "l",
  "NL/min": "Nl/min", "nl/min": "Nl/min", "l/min": "Nl/min", "Nm³/h": "Nm3/h", "°": "deg",
};
const QTY_RE = /^\s*([-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?)\s*(.*?)\s*$/;

class UnitError extends Error {}
class ParameterError extends Error {}
class CircuitError extends Error {}

function lookup(unit) {
  unit = ALIASES[unit] ?? unit;
  if (!(unit in UNITS)) throw new UnitError(`unità sconosciuta: ${pyRepr(unit)}`);
  return [unit, ...UNITS[unit]];
}

function pyRepr(s) { return `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }

// Formato "%g" di Python (6 cifre significative).
export function fmtG(v) {
  if (v === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(Number(v.toPrecision(6)))));
  if (exp < -4 || exp >= 6) {
    const [m, e] = v.toExponential(5).split("e");
    const mant = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    const n = Number(e);
    return `${mant}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
  }
  const s = v.toFixed(Math.max(0, 5 - exp));
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

export class Quantity {
  constructor(si, dimension, unit) { this.si = si; this.dimension = dimension; this.unit = unit; }
  static of(value, unit) {
    const [u, dim, factor] = lookup(unit);
    return new Quantity(Number(value) * factor, dim, u);
  }
  static parse(text) {
    const m = QTY_RE.exec(text);
    if (!m) throw new UnitError(`grandezza non valida: ${pyRepr(text)}`);
    return Quantity.of(parseFloat(m[1].replace(",", ".")), m[2]);
  }
  static coerce(value) {
    if (value instanceof Quantity) return value;
    if (typeof value === "string") return Quantity.parse(value);
    if (Array.isArray(value) && value.length === 2) return Quantity.of(...value);
    throw new UnitError(`impossibile interpretare ${JSON.stringify(value)} come grandezza`);
  }
  to(unit) {
    const [u, dim, factor] = lookup(unit);
    if (dim !== this.dimension) throw new UnitError(`impossibile convertire ${this.dimension} in ${pyRepr(u)}`);
    return this.si / factor;
  }
  inUnit(unit) { return new Quantity(this.si, this.dimension, lookup(unit)[0]); }
  toString() {
    const txt = fmtG(this.to(this.unit));
    return this.unit ? `${txt} ${this.unit}` : txt;
  }
}

const bar = (si) => new Quantity(si, "pressure", "bar");
const fmtBar = (q) => String(q.inUnit("bar"));

// --- componenti ----------------------------------------------------------------

const VALVE_PORTS = {
  "2/2": [["1", "supply"], ["2", "work"]],
  "3/2": [["1", "supply"], ["2", "work"], ["3", "exhaust"]],
  "4/2": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"]],
  "5/2": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
  "5/3": [["1", "supply"], ["2", "work"], ["4", "work"], ["3", "exhaust"], ["5", "exhaust"]],
};
const ACTUATIONS = ["solenoid", "pilot", "manual", "mechanical", "spring"];
const ACTUATORS = new Set(["single_acting_cylinder", "double_acting_cylinder", "rotary_actuator"]);
const port = (name, kind, may_be_open = false) => ({ name, kind, may_be_open });

const PORTS = {
  pressure_source: () => [port("1", "supply")],
  silencer: () => [port("1", "exhaust")],
  plug: () => [port("1", "work")],
  pressure_regulator: () => [port("1", "supply"), port("2", "work")],
  flow_control_valve: () => [port("1", "work"), port("2", "work")],
  single_acting_cylinder: () => [port("A", "work")],
  double_acting_cylinder: () => [port("A", "work"), port("B", "work")],
  rotary_actuator: () => [port("A", "work"), port("B", "work")],
  directional_valve: (c) => {
    const ports = VALVE_PORTS[c.function].map(([n, k]) => port(n, k, k === "exhaust"));
    if (c.actuation_14 === "pilot") ports.push(port("14", "pilot"));
    if (c.actuation_12 === "pilot") ports.push(port("12", "pilot"));
    return ports;
  },
};

let SPECS = {}; // tipo -> [{name, dimension, required}]
export function setCatalog(catalog) {
  SPECS = Object.fromEntries(catalog.map((t) => [t.type, t.params]));
}

function buildComponent(raw) {
  const type = raw.type;
  if (!(type in SPECS) || !(type in PORTS)) {
    throw new ParameterError(`tipo di componente sconosciuto: ${raw.type == null ? "None" : pyRepr(raw.type)}`);
  }
  const id = raw.id;
  if (!id) throw new ParameterError("ogni componente deve avere un id");
  const comp = { id, type, label: raw.label || "" };

  if (type === "directional_valve") {
    const fn = raw.function ?? "5/2";
    if (!(fn in VALVE_PORTS)) {
      throw new ParameterError(`${id}: funzione valvola non supportata ${pyRepr(fn)}; ammesse ` +
        `[${Object.keys(VALVE_PORTS).sort().map(pyRepr).join(", ")}]`);
    }
    comp.function = fn;
    for (const side of ["actuation_14", "actuation_12"]) {
      const v = raw[side] ?? (side === "actuation_14" ? "solenoid" : "spring");
      if (!ACTUATIONS.includes(v)) throw new ParameterError(`${pyRepr(v)} is not a valid Actuation`);
      comp[side] = v;
    }
    if (comp.actuation_14 === "spring" && comp.actuation_12 === "spring") {
      throw new ParameterError(`${id}: almeno un lato deve avere un comando attivo`);
    }
  }

  const params = raw.params || {};
  const specs = SPECS[type];
  const unknown = Object.keys(params).filter((k) => !specs.some((s) => s.name === k)).sort();
  if (unknown.length) {
    throw new ParameterError(`${id}: parametri sconosciuti [${unknown.map(pyRepr).join(", ")}]`);
  }
  comp.params = {};
  for (const spec of specs) {
    const value = params[spec.name];
    if (value == null) {
      if (spec.required) throw new ParameterError(`${id}: parametro obbligatorio '${spec.name}' mancante`);
      continue;
    }
    let q;
    try { q = Quantity.coerce(value); } catch (e) {
      if (e instanceof UnitError) throw new ParameterError(`${id}.${spec.name}: ${e.message}`);
      throw e;
    }
    if (q.dimension !== spec.dimension) {
      throw new ParameterError(`${id}.${spec.name}: atteso ${spec.dimension}, ricevuto ${q.dimension} (${q})`);
    }
    if (q.si <= 0) throw new ParameterError(`${id}.${spec.name}: deve essere positivo (${q})`);
    comp.params[spec.name] = q;
  }
  if (type.endsWith("_cylinder") && comp.params.rod && comp.params.rod.si >= comp.params.bore.si) {
    throw new ParameterError(`${id}: lo stelo (${comp.params.rod}) deve essere minore dell'alesaggio (${comp.params.bore})`);
  }
  comp.ports = PORTS[type](comp);
  return comp;
}

function internalPaths(c) {
  if (c.type === "directional_valve") {
    const names = new Set(c.ports.map((p) => p.name));
    const work = ["2", "4"].filter((p) => names.has(p));
    const exh = ["3", "5"].filter((p) => names.has(p));
    return [...work.map((w) => ["1", w, Infinity]),
            ...work.flatMap((w) => exh.map((e) => [w, e, Infinity]))];
  }
  if (c.type === "pressure_regulator") return [["1", "2", c.params.setpoint.si]];
  if (c.type === "flow_control_valve") return [["1", "2", Infinity], ["2", "1", Infinity]];
  return [];
}
const sourcePressures = (c) => (c.type === "pressure_source" ? { 1: c.params.pressure } : {});

// --- grafo -----------------------------------------------------------------------

function parseRef(value) {
  if (typeof value !== "string") throw new CircuitError("riferimento non valido");
  const i = value.lastIndexOf(".");
  if (i <= 0 || i === value.length - 1) throw new CircuitError(`riferimento porta non valido: ${pyRepr(value)}`);
  return [value.slice(0, i), value.slice(i + 1)];
}
const refStr = (r) => `${r[0]}.${r[1]}`;
const refCmp = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

function nets(comps, connections) {
  const parent = new Map();
  for (const c of comps.values()) for (const p of c.ports) parent.set(`${c.id}.${p.name}`, `${c.id}.${p.name}`);
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [a, b] of connections) {
    const ra = find(refStr(a)), rb = find(refStr(b));
    if (ra !== rb) parent.set(rb, ra);
  }
  const groups = new Map();
  for (const k of parent.keys()) {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(k);
  }
  return [...groups.values()];
}

// --- analisi ---------------------------------------------------------------------------

const issue = (severity, code, message, component = null, ports = []) =>
  ({ severity, code, message, component, ports });

export function analyze(data) {
  const issues = [];
  const comps = new Map();
  const portsOut = {};

  for (const raw of data.components || []) {
    const cid = raw && typeof raw === "object" ? raw.id ?? null : null;
    let comp;
    try {
      comp = buildComponent(raw || {});
      if (comps.has(comp.id)) throw new CircuitError(`id duplicato: ${comp.id}`);
    } catch (e) {
      if (!(e instanceof ParameterError || e instanceof CircuitError || e instanceof UnitError)) throw e;
      issues.push(issue("error", "INVALID_COMPONENT", e.message, cid));
      continue;
    }
    comps.set(comp.id, comp);
    portsOut[comp.id] = comp.ports.map((p) => ({ ...p }));
  }

  const connections = [];
  const seen = new Set();
  for (const raw of data.connections || []) {
    let a, b;
    try { a = parseRef(raw.from); b = parseRef(raw.to); } catch {
      issues.push(issue("error", "INVALID_CONNECTION", `collegamento non valido: ${JSON.stringify(raw)}`));
      continue;
    }
    if (!comps.has(a[0]) || !comps.has(b[0])) continue;
    const fail = (msg) => issues.push(issue("error", "INVALID_CONNECTION", msg, a[0], [refStr(a), refStr(b)]));
    if (refStr(a) === refStr(b)) { fail(`una porta non può essere collegata a se stessa: ${refStr(a)}`); continue; }
    const bad = [a, b].find((r) => !comps.get(r[0]).ports.some((p) => p.name === r[1]));
    if (bad) {
      const c = comps.get(bad[0]);
      fail(`${c.id} (${c.type}) non ha la porta '${bad[1]}'; porte: [${c.ports.map((p) => pyRepr(p.name)).sort().join(", ")}]`);
      continue;
    }
    const [x, y] = refCmp(a, b) <= 0 ? [a, b] : [b, a];
    const key = `${refStr(x)}|${refStr(y)}`;
    if (seen.has(key)) { fail(`collegamento già presente: ${refStr(x)} — ${refStr(y)}`); continue; }
    seen.add(key);
    connections.push([x, y]);
  }

  // validazione (stesso ordine di pneutrack.model.validation)
  const isConnected = new Set(connections.flatMap(([x, y]) => [refStr(x), refStr(y)]));
  const allNets = nets(comps, connections);
  const portSpec = (ref) => { const [c, p] = parseRef(ref); return comps.get(c).ports.find((x) => x.name === p); };
  const sortRefs = (refs) => refs.map(parseRef).sort(refCmp).map(refStr);

  if (comps.size && ![...comps.values()].some((c) => Object.keys(sourcePressures(c)).length)) {
    issues.push(issue("warning", "NO_SOURCE", "lo schema non ha alcuna sorgente di pressione"));
  }
  for (const c of comps.values()) {
    for (const p of c.ports) {
      const ref = `${c.id}.${p.name}`;
      if (!p.may_be_open && !isConnected.has(ref)) {
        const what = p.kind === "pilot" ? "di pilotaggio " : "";
        issues.push(issue("error", "UNCONNECTED_PORT", `la porta ${what}${ref} non è collegata`, c.id, [ref]));
      }
    }
  }
  const netOrder = allNets.map((n) => sortRefs(n)).sort((a, b) => refCmp(parseRef(a[0]), parseRef(b[0])));
  for (const net of netOrder) {
    const imposed = [];
    for (const ref of net) {
      const [cid, p] = parseRef(ref);
      const pr = sourcePressures(comps.get(cid))[p];
      if (pr) imposed.push([ref, pr]);
    }
    if (!imposed.length) continue;
    if (new Set(imposed.map(([, q]) => Math.round(q.si * 1e6) / 1e6)).size > 1) {
      const desc = imposed.map(([r, q]) => `${r} = ${fmtBar(q)}`).join(", ");
      issues.push(issue("error", "SOURCE_CONFLICT", `sorgenti a pressioni diverse sulla stessa linea: ${desc}`,
                        null, imposed.map(([r]) => r)));
    }
    const exhausts = net.filter((r) => portSpec(r).kind === "exhaust");
    if (exhausts.length) {
      issues.push(issue("error", "SUPPLY_VENTED",
        "l'alimentazione è collegata direttamente allo scarico " + exhausts.join(", "),
        null, [...imposed.map(([r]) => r), ...exhausts]));
    }
  }

  // propagazione delle pressioni
  const netIndex = new Map();
  allNets.forEach((n, i) => n.forEach((r) => netIndex.set(r, i)));
  const pressure = allNets.map(() => 0);
  for (const c of comps.values()) {
    for (const [p, q] of Object.entries(sourcePressures(c))) {
      const i = netIndex.get(`${c.id}.${p}`);
      pressure[i] = Math.max(pressure[i], q.si);
    }
  }
  const edges = [];
  for (const c of comps.values()) {
    for (const [s, d, cap] of internalPaths(c)) edges.push([netIndex.get(`${c.id}.${s}`), netIndex.get(`${c.id}.${d}`), cap]);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [s, d, cap] of edges) {
      const p = Math.min(pressure[s], cap);
      if (p > pressure[d]) { pressure[d] = p; changed = true; }
    }
  }
  const pAt = (ref) => pressure[netIndex.get(ref)] || 0;

  for (const c of comps.values()) {
    const refs = c.ports.map((p) => `${c.id}.${p.name}`);
    const reached = refs.length ? Math.max(...refs.map(pAt)) : 0;
    const maxP = c.params.max_pressure, minP = c.params.min_pressure;
    if (maxP && reached > maxP.si * (1 + 1e-9)) {
      issues.push(issue("error", "OVERPRESSURE",
        `${c.id} può ricevere ${fmtBar(bar(reached))} ma il massimo da catalogo è ${maxP}`,
        c.id, refs.filter((r) => pAt(r) === reached)));
    }
    if (ACTUATORS.has(c.type) && reached === 0) {
      issues.push(issue("warning", "UNSUPPLIED_ACTUATOR", `l'attuatore ${c.id} non è alimentato da alcuna sorgente`, c.id, refs));
    }
    if (c.type === "directional_valve") {
      for (const side of ["14", "12"]) {
        const ref = `${c.id}.${side}`;
        if (c.ports.some((p) => p.name === side) && isConnected.has(ref) && pAt(ref) === 0) {
          issues.push(issue("warning", "UNSUPPLIED_PILOT", `il pilotaggio ${ref} non riceve mai pressione`, c.id, [ref]));
        }
      }
    }
    if (minP) {
      let names = c.ports.map((p) => p.name);
      if (c.type === "directional_valve") {
        const pilots = [["14", c.actuation_14], ["12", c.actuation_12]].filter(([, a]) => a === "pilot").map(([s]) => s);
        names = pilots.length ? pilots : ["1"];
      }
      const avail = Math.max(0, ...names.map((n) => pAt(`${c.id}.${n}`)));
      if (avail > 0 && avail < minP.si * (1 - 1e-9)) {
        issues.push(issue("warning", "UNDERPRESSURE",
          `${c.id} dispone al più di ${fmtBar(bar(avail))}, sotto il minimo di funzionamento ${minP}`, c.id));
      }
    }
  }

  const pressures = {};
  allNets.forEach((n, i) => {
    if (pressure[i] > 0) {
      const q = bar(pressure[i]);
      for (const r of n) pressures[r] = { text: String(q), bar: Math.round(q.to("bar") * 1e6) / 1e6 };
    }
  });
  const errors = issues.filter((i) => i.severity === "error").length;
  return {
    ok: errors === 0, errors,
    warnings: issues.filter((i) => i.severity === "warning").length,
    issues, ports: portsOut, pressures,
  };
}

export function cylinderInfo(data) {
  const c = buildComponent(data);
  if (!c.type.endsWith("_cylinder")) return {};
  const p = Quantity.coerce(data.pressure ?? "6 bar");
  if (p.dimension !== "pressure") throw new UnitError("serve una pressione");
  const d = c.params.bore.si, r = c.params.rod ? c.params.rod.si : 0;
  const a = (Math.PI * d * d) / 4, an = (Math.PI * (d * d - r * r)) / 4;
  return {
    piston_area: `${(a / 1e-4).toFixed(2)} cm2`,
    annular_area: `${(an / 1e-4).toFixed(2)} cm2`,
    force_extend: `${(p.si * a).toFixed(0)} N`,
    force_retract: `${(p.si * an).toFixed(0)} N`,
    at_pressure: String(p),
  };
}
