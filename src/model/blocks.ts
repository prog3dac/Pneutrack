/**
 * Blocchi: gruppi di componenti con le linee che li collegano, con nome e descrizione.
 *
 * Nel file: `"blocks": [{"id": "B1", "name": "Comando cilindro", "description": "…",
 * "components": ["V1", "C1"]}]`. Un componente appartiene al più a un blocco. Come `layout`,
 * i blocchi non contano per il modello: servono a spostare, duplicare e riusare parti di schema.
 *
 * Un "frammento" è una parte di schema staccata (componenti, linee interne, disposizione):
 * si usa per duplicare e per la libreria dei blocchi riutilizzabili.
 */
import type { CircuitDoc, ConnectionData, Placement } from "./circuit";
import type { ComponentData } from "./components";

export interface BlockData {
  id: string;
  name: string;
  description?: string;
  components: string[];
}

export interface Fragment {
  name: string;
  description?: string;
  components: ComponentData[];
  connections: ConnectionData[];
  /** posizioni relative all'angolo in alto a sinistra del frammento */
  layout: Record<string, Placement>;
}

const ref = (r: string) => {
  const i = r.lastIndexOf(".");
  return [r.slice(0, i), r.slice(i + 1)] as const;
};

/** Legge `blocks` da un file: tiene solo voci valide e componenti esistenti, ognuno in un solo blocco. */
export function normalizeBlocks(raw: unknown, componentIds: Iterable<string>): BlockData[] {
  if (!Array.isArray(raw)) return [];
  const exists = new Set(componentIds), taken = new Set<string>(), ids = new Set<string>();
  const out: BlockData[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object" || typeof b.id !== "string" || ids.has(b.id)) continue;
    const members = (Array.isArray(b.components) ? b.components : [])
      .filter((c: unknown): c is string => typeof c === "string" && exists.has(c) && !taken.has(c));
    if (!members.length) continue;
    members.forEach((c: string) => taken.add(c));
    ids.add(b.id);
    out.push({ id: b.id, name: typeof b.name === "string" ? b.name : b.id, components: members,
               ...(typeof b.description === "string" && b.description ? { description: b.description } : {}) });
  }
  return out;
}

export const blockOf = (doc: Pick<CircuitDoc, "blocks">, compId: string) =>
  doc.blocks?.find((b) => b.components.includes(compId));

export function nextBlockId(doc: Pick<CircuitDoc, "blocks">): string {
  let n = 1;
  while (doc.blocks?.some((b) => b.id === `B${n}`)) n++;
  return `B${n}`;
}

/** Unisce i componenti in un nuovo blocco; li toglie dai blocchi in cui erano (che spariscono se restano vuoti). */
export function mergeBlock(doc: CircuitDoc, ids: string[], name?: string, description?: string): BlockData {
  const members = [...new Set(ids)].filter((id) => doc.components.some((c) => c.id === id));
  doc.blocks = (doc.blocks ?? [])
    .map((b) => ({ ...b, components: b.components.filter((c) => !members.includes(c)) }))
    .filter((b) => b.components.length);
  const id = nextBlockId(doc);
  const block: BlockData = { id, name: name || `Blocco ${id.slice(1)}`, components: members,
                             ...(description ? { description } : {}) };
  doc.blocks.push(block);
  return block;
}

/** Divide un blocco: i componenti restano, il gruppo sparisce. Restituisce i componenti liberati. */
export function splitBlock(doc: CircuitDoc, blockId: string): string[] {
  const b = doc.blocks?.find((x) => x.id === blockId);
  if (!b) return [];
  doc.blocks = doc.blocks!.filter((x) => x.id !== blockId);
  if (!doc.blocks.length) delete doc.blocks;
  return b.components;
}

/** Toglie dai blocchi i componenti che non esistono più e i blocchi rimasti vuoti. */
export function pruneBlocks(doc: CircuitDoc): void {
  if (!doc.blocks) return;
  const exists = new Set(doc.components.map((c) => c.id));
  doc.blocks = doc.blocks.map((b) => ({ ...b, components: b.components.filter((c) => exists.has(c)) }))
    .filter((b) => b.components.length);
  if (!doc.blocks.length) delete doc.blocks;
}

/** Copia staccata dei componenti `ids` con le linee tra loro (le linee verso l'esterno restano fuori). */
export function extractFragment(doc: CircuitDoc, ids: string[], name = "Blocco", description?: string): Fragment {
  const set = new Set(ids);
  const components = doc.components.filter((c) => set.has(c.id)).map((c) => structuredClone(c));
  const connections = doc.connections
    .filter((c) => set.has(ref(c.from)[0]) && set.has(ref(c.to)[0]))
    .map((c) => structuredClone(c));
  const places = components.map((c) => doc.layout[c.id] ?? { x: 0, y: 0, rot: 0 });
  const x0 = Math.min(...places.map((p) => p.x)), y0 = Math.min(...places.map((p) => p.y));
  const layout: Record<string, Placement> = {};
  components.forEach((c, i) => { const p = places[i]!; layout[c.id] = { x: p.x - x0, y: p.y - y0, rot: p.rot || 0 }; });
  for (const c of connections) if (c.points) c.points = c.points.map(([x, y]) => [x - x0, y - y0]);
  return { name, ...(description ? { description } : {}), components, connections, layout };
}

/**
 * Inserisce un frammento nello schema con l'angolo in (x, y), dando ai componenti sigle libere
 * (`newId(tipo, sigle già prese)`). Restituisce le nuove sigle, nell'ordine del frammento.
 */
export function insertFragment(doc: CircuitDoc, frag: Fragment, at: { x: number; y: number },
                               newId: (type: string, taken: Set<string>) => string): string[] {
  const taken = new Set(doc.components.map((c) => c.id));
  const rename = new Map<string, string>();
  for (const c of frag.components) {
    const id = newId(c.type, taken);
    taken.add(id);
    rename.set(c.id, id);
  }
  const fix = (r: string) => { const [c, p] = ref(r); return `${rename.get(c) ?? c}.${p}`; };
  for (const c of frag.components) {
    const copy = structuredClone(c);
    copy.id = rename.get(c.id)!;
    // i finecorsa seguono il cilindro copiato, se è nel frammento
    for (const key of ["cam_14", "cam_12"] as const) {
      const cam = copy[key];
      if (cam && rename.has(cam.slice(0, -1))) copy[key] = rename.get(cam.slice(0, -1))! + cam.slice(-1);
    }
    doc.components.push(copy);
    const p = frag.layout[c.id] ?? { x: 0, y: 0, rot: 0 };
    doc.layout[copy.id] = { x: at.x + p.x, y: at.y + p.y, rot: p.rot || 0 };
  }
  for (const c of frag.connections) {
    const copy = structuredClone(c);
    copy.from = fix(c.from); copy.to = fix(c.to);
    delete copy.id;
    if (copy.points) copy.points = copy.points.map(([x, y]) => [x + at.x, y + at.y]);
    doc.connections.push(copy);
  }
  return frag.components.map((c) => rename.get(c.id)!);
}

/** Controlla un frammento letto dalla libreria (localStorage); null se non è valido. */
export function parseFragment(raw: unknown): Fragment | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<Fragment>;
  if (typeof f.name !== "string" || !Array.isArray(f.components) || !f.components.length) return null;
  if (!f.components.every((c) => c && typeof c.id === "string" && typeof c.type === "string")) return null;
  return {
    name: f.name, ...(typeof f.description === "string" && f.description ? { description: f.description } : {}),
    components: f.components, connections: Array.isArray(f.connections) ? f.connections : [],
    layout: f.layout && typeof f.layout === "object" ? f.layout : {},
  };
}
