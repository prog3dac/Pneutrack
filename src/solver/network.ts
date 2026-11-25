import { library, type CylinderSpec, type FlowElement } from "./library";
import { splitPortRef, type Diagnostic, type Schema } from "./schema";
import { P_ATM } from "./constants";

export interface Network {
  nodeCount: number;
  /** pressione imposta [Pa ass.] per i nodi fissi (alimentazioni, atmosfera) */
  fixed: Map<number, number>;
  /** volume base di ogni nodo [m³] */
  baseVolume: number[];
  elements: FlowElement[];
  cylinders: CylinderSpec[];
  /** "idComponente.porta" → indice nodo */
  portNode: Record<string, number>;
  /** id componenti azionabili (hanno elementi con `when`) */
  inputIds: string[];
  temperature: number; // K
}

export type CompileResult =
  | { ok: true; network: Network; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

export function compile(schema: Schema): CompileResult {
  const diag: Diagnostic[] = [];
  const err = (m: string) => diag.push({ level: "error", message: m });
  const warn = (m: string) => diag.push({ level: "warning", message: m });

  if (schema.version !== 1) err(`versione schema non supportata: ${String(schema.version)}`);

  // 1. Componenti e porte
  const comps = new Map<string, (typeof schema.components)[number]>();
  const portKeys: string[] = [];
  for (const c of schema.components) {
    if (comps.has(c.id)) { err(`id duplicato: ${c.id}`); continue; }
    const def = library.get(c.type);
    if (!def) { err(`${c.id}: tipo sconosciuto "${c.type}"`); continue; }
    comps.set(c.id, c);
    for (const k of Object.keys(c.params ?? {})) {
      if (!(k in def.defaults)) warn(`${c.id}: parametro sconosciuto "${k}"`);
    }
    for (const p of def.ports) portKeys.push(`${c.id}.${p}`);
  }

  // 2. Nodi = classi di porte collegate (union-find)
  const idx = new Map(portKeys.map((k, i) => [k, i]));
  const parent = portKeys.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const connected = new Set<string>();
  for (const cn of schema.connections) {
    const ends = [cn.from, cn.to].map((r) => {
      const s = splitPortRef(r);
      const ok = s && idx.has(r);
      if (!ok) err(`connessione verso porta inesistente: ${r}`);
      return ok ? r : null;
    });
    if (ends[0] && ends[1]) {
      parent[find(idx.get(ends[0])!)] = find(idx.get(ends[1])!);
      connected.add(ends[0]); connected.add(ends[1]);
      if (ends[0] === ends[1]) warn(`connessione di una porta con se stessa: ${ends[0]}`);
    }
  }
  if (diag.some((d) => d.level === "error")) return { ok: false, diagnostics: diag };

  const nodeOfRoot = new Map<number, number>();
  const portNode: Record<string, number> = {};
  for (const k of portKeys) {
    const r = find(idx.get(k)!);
    if (!nodeOfRoot.has(r)) nodeOfRoot.set(r, nodeOfRoot.size);
    portNode[k] = nodeOfRoot.get(r)!;
  }
  const nodeCount = nodeOfRoot.size;

  // 3. Costruzione elementi
  const fixed = new Map<number, number>();
  const setFixed = (node: number, p: number, who: string) => {
    const prev = fixed.get(node);
    if (prev !== undefined && Math.abs(prev - p) > 1) err(`${who}: cortocircuito tra pressioni imposte diverse sullo stesso nodo`);
    fixed.set(node, p);
  };
  const elements: FlowElement[] = [];
  const cylinders: CylinderSpec[] = [];
  const inputIds = new Set<string>();

  for (const c of comps.values()) {
    const def = library.get(c.type)!;
    const params = { ...def.defaults, ...(c.params ?? {}) };
    for (const p of def.exhaustPorts ?? []) {
      if (!connected.has(`${c.id}.${p}`)) setFixed(portNode[`${c.id}.${p}`]!, P_ATM, `${c.id}.${p}`);
    }
    const res = def.build(c.id, params, (port) => portNode[`${c.id}.${port}`]!);
    for (const f of res.fixed ?? []) setFixed(f.node, f.pressure, c.id);
    for (const e of res.elements ?? []) {
      elements.push(e);
      if (e.when) inputIds.add(e.when.input);
    }
    cylinders.push(...(res.cylinders ?? []));
    for (const p of def.ports) {
      const key = `${c.id}.${p}`;
      if (!connected.has(key) && !(def.exhaustPorts ?? []).includes(p) && !(res.fixed ?? []).some((f) => f.node === portNode[key])) {
        warn(`${key}: porta non collegata (considerata chiusa)`);
      }
    }
  }

  const nodeVolume = (schema.nodeVolume_cm3 ?? 1) * 1e-6;
  const baseVolume = Array.from({ length: nodeCount }, () => nodeVolume);
  for (const cyl of cylinders) {
    if (cyl.A1 <= 0 || cyl.A2 <= 0) err(`${cyl.id}: diametro stelo >= alesaggio`);
    if (cyl.stroke <= 0) err(`${cyl.id}: corsa non valida`);
  }
  for (let n = 0; n < nodeCount; n++) {
    if (!fixed.has(n) && baseVolume[n]! <= 0 && !cylinders.some((c) => c.capNode === n || c.rodNode === n)) {
      err(`nodo ${n}: volume nullo`);
    }
  }
  if (diag.some((d) => d.level === "error")) return { ok: false, diagnostics: diag };

  return {
    ok: true,
    diagnostics: diag,
    network: {
      nodeCount,
      fixed,
      baseVolume,
      elements,
      cylinders,
      portNode,
      inputIds: [...inputIds],
      temperature: (schema.temperature_C ?? 20) + 273.15,
    },
  };
}
