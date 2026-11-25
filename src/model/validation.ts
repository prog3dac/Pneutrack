/**
 * Analisi statica dello schema.
 *
 * Costruisce lo schema in modo tollerante (un componente o un collegamento non
 * valido diventa una segnalazione) e calcola per ogni rete la massima pressione
 * raggiungibile in una qualunque posizione delle valvole (analisi conservativa).
 *
 * | Codice                | Gravità | Significato                                          |
 * |-----------------------|---------|------------------------------------------------------|
 * | INVALID_COMPONENT     | error   | tipo sconosciuto o parametri non validi              |
 * | INVALID_CONNECTION    | error   | collegamento verso porta inesistente o duplicato     |
 * | INVALID_TUBE          | error   | dimensioni del tubo mancanti o non valide            |
 * | NO_SOURCE             | warning | nessuna sorgente di pressione                        |
 * | UNCONNECTED_PORT      | error   | porta scollegata che non può restare aperta          |
 * | SOURCE_CONFLICT       | error   | sorgenti a pressioni diverse sulla stessa rete       |
 * | SUPPLY_VENTED         | error   | alimentazione collegata direttamente a uno scarico   |
 * | OVERPRESSURE          | error   | pressione raggiungibile oltre il massimo da catalogo |
 * | UNDERPRESSURE         | warning | pressione di comando sotto il minimo di funzionamento|
 * | UNSUPPLIED_ACTUATOR   | warning | attuatore che nessuna sorgente alimenta              |
 * | UNSUPPLIED_PILOT      | warning | pilotaggio collegato ma mai in pressione             |
 * | INVALID_CAM           | error   | finecorsa riferito a un cilindro che non c'è         |
 * | SETPOINT_UNREACHABLE  | warning | taratura (sequenza, FRL...) sopra la pressione max   |
 */
import { CircuitError, nets, parseRef, refCmp, refStr, type CircuitDoc } from "./circuit";
import {
  buildComponent, hasPilotPort, internalPaths, isActuator, isCylinder, ParameterError, sourcePressures,
  type Component, type PortSpec,
} from "./components";
import { parseTube, type Tube } from "./tubes";
import { barFromPa, UnitError, type Quantity } from "./units";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  message: string;
  component: string | null;
  ports: string[];
}

export interface PortInfo {
  name: string;
  kind: PortSpec["kind"];
  may_be_open: boolean;
}

export interface Analysis {
  ok: boolean;
  errors: number;
  warnings: number;
  issues: Issue[];
  /** porte dei componenti validi */
  ports: Record<string, PortInfo[]>;
  /** massima pressione raggiungibile per porta (solo se > 0) */
  pressures: Record<string, { text: string; bar: number }>;
}

/** Schema costruito: componenti validi e collegamenti accettati. */
export interface Built {
  components: Map<string, Component>;
  connections: [string, string][];
  /** tubo di ogni collegamento accettato (null: collegamento ideale o tubo non valido) */
  tubes: (Tube | null)[];
  issues: Issue[];
}

const issue = (severity: Severity, code: string, message: string, component: string | null = null,
               ports: string[] = []): Issue => ({ severity, code, message, component, ports });
const fmtBar = (q: Quantity) => String(q.inUnit("bar"));

/** Costruisce componenti e collegamenti, raccogliendo gli errori invece di fermarsi. */
export function build(data: Pick<CircuitDoc, "components" | "connections">): Built {
  const issues: Issue[] = [];
  const components = new Map<string, Component>();
  for (const raw of data.components ?? []) {
    const cid = raw && typeof raw === "object" ? raw.id ?? null : null;
    try {
      const comp = buildComponent(raw);
      if (components.has(comp.id)) throw new CircuitError(`id duplicato: ${comp.id}`);
      components.set(comp.id, comp);
    } catch (e) {
      if (!(e instanceof ParameterError || e instanceof CircuitError || e instanceof UnitError)) throw e;
      issues.push(issue("error", "INVALID_COMPONENT", e.message, cid));
    }
  }

  const connections: [string, string][] = [];
  const tubes: (Tube | null)[] = [];
  const seen = new Set<string>();
  for (const raw of data.connections ?? []) {
    let a, b;
    try {
      a = parseRef(raw?.from);
      b = parseRef(raw?.to);
    } catch {
      issues.push(issue("error", "INVALID_CONNECTION", `collegamento non valido: ${JSON.stringify(raw)}`));
      continue;
    }
    if (!components.has(a[0]) || !components.has(b[0])) continue; // già segnalato
    const fail = (msg: string) =>
      issues.push(issue("error", "INVALID_CONNECTION", msg, a[0], [refStr(a), refStr(b)]));
    if (refStr(a) === refStr(b)) { fail(`una porta non può essere collegata a se stessa: ${refStr(a)}`); continue; }
    const bad = [a, b].find((r) => !components.get(r[0])!.ports.some((x) => x.name === r[1]));
    if (bad) {
      const c = components.get(bad[0])!;
      const names = c.ports.map((x) => `'${x.name}'`).sort().join(", ");
      fail(`${c.id} (${c.type}) non ha la porta '${bad[1]}'; porte: [${names}]`);
      continue;
    }
    const [x, y] = refCmp(a, b) <= 0 ? [a, b] : [b, a];
    const key = `${refStr(x)}|${refStr(y)}`;
    if (seen.has(key)) { fail(`collegamento già presente: ${refStr(x)} — ${refStr(y)}`); continue; }
    seen.add(key);
    connections.push([refStr(x), refStr(y)]);
    let tube: Tube | null = null;
    try {
      tube = parseTube(raw.tube, `linea ${refStr(x)} — ${refStr(y)}`);
    } catch (e) {
      if (!(e instanceof ParameterError)) throw e;
      issues.push(issue("error", "INVALID_TUBE", e.message, null, [refStr(x), refStr(y)]));
    }
    tubes.push(tube);
  }
  return { components, connections, tubes, issues };
}

export const allPorts = (components: Map<string, Component>): string[] =>
  [...components.values()].flatMap((c) => c.ports.map((p) => `${c.id}.${p.name}`));

/** Massima pressione raggiungibile su ogni rete (punto fisso monotono), in Pa. */
export function propagatePressures(built: Built): { nets: string[][]; pressure: number[] } {
  const all = nets(allPorts(built.components), built.connections);
  const index = new Map<string, number>();
  all.forEach((n, i) => n.forEach((r) => index.set(r, i)));
  const pressure = all.map(() => 0);
  for (const c of built.components.values()) {
    for (const [port, q] of Object.entries(sourcePressures(c))) {
      const i = index.get(`${c.id}.${port}`)!;
      pressure[i] = Math.max(pressure[i]!, q.si);
    }
  }
  const edges: [number, number, number][] = [];
  for (const c of built.components.values()) {
    for (const path of internalPaths(c)) {
      edges.push([index.get(`${c.id}.${path.src}`)!, index.get(`${c.id}.${path.dst}`)!, path.cap]);
    }
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [s, d, cap] of edges) {
      const p = Math.min(pressure[s]!, cap);
      if (p > pressure[d]!) { pressure[d] = p; changed = true; }
    }
  }
  return { nets: all, pressure };
}

export function analyze(data: Pick<CircuitDoc, "components" | "connections">): Analysis {
  const built = build(data);
  const { components: comps, connections } = built;
  const issues = [...built.issues];
  const connected = new Set(connections.flat());
  const portSpec = (ref: string) => {
    const [c, p] = parseRef(ref);
    return comps.get(c)!.ports.find((x) => x.name === p)!;
  };

  if (comps.size && ![...comps.values()].some((c) => Object.keys(sourcePressures(c)).length)) {
    issues.push(issue("warning", "NO_SOURCE", "lo schema non ha alcuna sorgente di pressione"));
  }
  for (const c of comps.values()) {
    for (const p of c.ports) {
      const ref = `${c.id}.${p.name}`;
      if (!p.mayBeOpen && !connected.has(ref)) {
        const what = p.kind === "pilot" ? "di pilotaggio " : "";
        issues.push(issue("error", "UNCONNECTED_PORT", `la porta ${what}${ref} non è collegata`, c.id, [ref]));
      }
    }
  }

  const { nets: all, pressure } = propagatePressures(built);
  for (const net of all) {
    const imposed: [string, Quantity][] = [];
    for (const ref of net) {
      const [cid, p] = parseRef(ref);
      const q = sourcePressures(comps.get(cid)!)[p];
      if (q) imposed.push([ref, q]);
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
        `l'alimentazione è collegata direttamente allo scarico ${exhausts.join(", ")}`,
        null, [...imposed.map(([r]) => r), ...exhausts]));
    }
  }

  const index = new Map<string, number>();
  all.forEach((n, i) => n.forEach((r) => index.set(r, i)));
  const pAt = (ref: string) => pressure[index.get(ref)!] ?? 0;

  for (const c of comps.values()) {
    const refs = c.ports.map((p) => `${c.id}.${p.name}`);
    const reached = refs.length ? Math.max(...refs.map(pAt)) : 0;
    const maxP = c.params.max_pressure, minP = c.params.min_pressure;
    if (maxP && reached > maxP.si * (1 + 1e-9)) {
      issues.push(issue("error", "OVERPRESSURE",
        `${c.id} può ricevere ${fmtBar(barFromPa(reached))} ma il massimo da catalogo è ${maxP}`,
        c.id, refs.filter((r) => pAt(r) === reached)));
    }
    if (isActuator(c) && reached === 0) {
      issues.push(issue("warning", "UNSUPPLIED_ACTUATOR",
        `l'attuatore ${c.id} non è alimentato da alcuna sorgente`, c.id, refs));
    }
    for (const p of c.ports.filter((x) => x.kind === "pilot")) {
      const ref = `${c.id}.${p.name}`;
      if (connected.has(ref) && pAt(ref) === 0) {
        issues.push(issue("warning", "UNSUPPLIED_PILOT", `il pilotaggio ${ref} non riceve mai pressione`, c.id, [ref]));
      }
    }
    for (const side of ["14", "12"] as const) {
      const cam = c[`cam_${side}`];
      if (!cam) continue;
      const cyl = comps.get(cam.cylinder);
      if (!cyl || !isCylinder(cyl.type)) {
        issues.push(issue("error", "INVALID_CAM",
          `${c.id}: il finecorsa ${cam.cylinder}${cam.end} non corrisponde a nessun cilindro dello schema`, c.id));
      }
    }
    if (c.type === "sequence_valve") {
      const pilot = pAt(`${c.id}.12`);
      if (pilot > 0 && pilot < c.params.setpoint!.si * (1 - 1e-9)) {
        issues.push(issue("warning", "SETPOINT_UNREACHABLE",
          `${c.id}: il pilotaggio arriva al più a ${fmtBar(barFromPa(pilot))}, sotto la taratura ${c.params.setpoint}: la valvola non commuterà`, c.id));
      }
    }
    if (minP) {
      let names = c.ports.map((p) => p.name);
      if (c.type === "directional_valve") {
        const pilots = ([["14", c.actuation_14], ["12", c.actuation_12]] as const)
          .filter(([, a]) => hasPilotPort(a)).map(([s]) => s);
        names = pilots.length ? pilots : ["1"];
      }
      const avail = Math.max(0, ...names.map((n) => pAt(`${c.id}.${n}`)));
      if (avail > 0 && avail < minP.si * (1 - 1e-9)) {
        issues.push(issue("warning", "UNDERPRESSURE",
          `${c.id} dispone al più di ${fmtBar(barFromPa(avail))}, sotto il minimo di funzionamento ${minP}`, c.id));
      }
    }
  }

  const pressures: Analysis["pressures"] = {};
  all.forEach((n, i) => {
    if (pressure[i]! > 0) {
      const q = barFromPa(pressure[i]!);
      for (const r of n) pressures[r] = { text: String(q), bar: Math.round(q.to("bar") * 1e6) / 1e6 };
    }
  });
  const portsOut: Analysis["ports"] = {};
  for (const c of comps.values()) {
    portsOut[c.id] = c.ports.map((p) => ({ name: p.name, kind: p.kind, may_be_open: p.mayBeOpen }));
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  return {
    ok: errors === 0, errors, warnings: issues.length - errors,
    issues, ports: portsOut, pressures,
  };
}
