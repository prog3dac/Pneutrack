/**
 * Progetto su più fogli.
 *
 * Nell'editor ogni foglio è uno schema a sé (`Page.doc`: componenti, linee, posizioni, cornice e
 * cartiglio, blocchi, testi e forme); per la validazione, la simulazione e la distinta i fogli si
 * uniscono in un solo circuito: le sigle sono uniche in tutto il progetto e i rimandi con la
 * stessa descrizione collegano i fogli tra loro.
 *
 * Nel file un progetto a un solo foglio resta come prima (nessuna chiave in più). Con più fogli:
 *
 *   "components": [...tutti...], "connections": [...tutte...],
 *   "layout": {"V1": {"x": 0, "y": 0, "rot": 0, "sheet": "F2"}, ...},
 *   "sheets": [{"id": "F1", "name": "Pneumatico", "sheet": {...cartiglio...}, "blocks": [...], "annotations": [...]}, ...]
 *
 * Un componente senza `sheet` (o con un foglio che non esiste) va sul primo foglio, così un vecchio
 * file a foglio singolo si apre senza conversione.
 */
import { normalizeAnnotations, type AnnotationData } from "./annotations";
import { normalizeBlocks, type BlockData } from "./blocks";
import { emptyCircuit, FORMAT, type CircuitDoc, type ConnectionData, type Placement } from "./circuit";
import { parseSheet, type SheetData } from "./sheet";

/** Voce `sheets[]` del file. */
export interface SheetEntry {
  id: string;
  name: string;
  sheet?: SheetData;
  blocks?: BlockData[];
  annotations?: AnnotationData[];
}

/** Foglio nell'editor: lo schema disegnato su quel foglio. */
export interface Page {
  id: string;
  name: string;
  doc: CircuitDoc;
}

export const defaultPageName = (n: number) => `Foglio ${n}`;

/** Prima sigla libera F1, F2, … */
export function newPageId(pages: Pick<Page, "id">[]): string {
  const taken = new Set(pages.map((p) => p.id));
  let n = 1;
  while (taken.has(`F${n}`)) n++;
  return `F${n}`;
}

const compOf = (ref: string) => ref.slice(0, ref.lastIndexOf("."));

/** Toglie dalle posizioni l'indicazione del foglio (nell'editor ogni foglio ha le sue). */
function cleanLayout(layout: Record<string, Placement>): Record<string, Placement> {
  const out: Record<string, Placement> = {};
  for (const [id, p] of Object.entries(layout)) {
    const { sheet: _s, ...rest } = p;
    out[id] = rest;
  }
  return out;
}

function pageDoc(name: string, extra: Partial<CircuitDoc> = {}): CircuitDoc {
  return { ...emptyCircuit(name), ...extra };
}

/** Divide un file nei suoi fogli (almeno uno). Non lancia: le voci non valide si scartano. */
export function splitPages(data: Partial<CircuitDoc>): Page[] {
  const name = typeof data.name === "string" ? data.name : "";
  const components = Array.isArray(data.components) ? data.components : [];
  const connections = Array.isArray(data.connections) ? data.connections : [];
  const layout: Record<string, Placement> = data.layout && typeof data.layout === "object" ? data.layout : {};
  const raw = Array.isArray(data.sheets) ? data.sheets : [];

  const entries: SheetEntry[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as unknown as Record<string, unknown>;
    let id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
    if (!id || ids.has(id)) id = newPageId([...ids].map((x) => ({ id: x })));
    ids.add(id);
    const sheet = parseSheet(o.sheet);
    entries.push({
      id, name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : defaultPageName(entries.length + 1),
      ...(sheet ? { sheet } : {}),
      ...(Array.isArray(o.blocks) ? { blocks: o.blocks as BlockData[] } : {}),
      ...(Array.isArray(o.annotations) ? { annotations: o.annotations as AnnotationData[] } : {}),
    });
  }
  if (!entries.length) entries.push({ id: "F1", name: defaultPageName(1) });
  // cornice, blocchi e testi scritti fuori da `sheets` (file a foglio singolo) vanno sul primo foglio
  const first = entries[0]!;
  const topSheet = parseSheet(data.sheet);
  if (topSheet && !first.sheet) first.sheet = topSheet;
  if (Array.isArray(data.blocks)) first.blocks = [...(first.blocks ?? []), ...data.blocks];
  if (Array.isArray(data.annotations)) first.annotations = [...(first.annotations ?? []), ...data.annotations];

  const index = new Map(entries.map((e, i) => [e.id, i]));
  const pageOf = new Map<string, number>();
  const pages: Page[] = entries.map((e) => ({ id: e.id, name: e.name, doc: pageDoc(name, e.sheet ? { sheet: e.sheet } : {}) }));
  for (const c of components) {
    const id = typeof c?.id === "string" ? c.id : undefined;
    const want = id ? layout[id]?.sheet : undefined;
    const i = (want !== undefined && index.get(want)) || 0;
    if (id) pageOf.set(id, i);
    pages[i]!.doc.components.push(c);
    if (id && layout[id]) pages[i]!.doc.layout[id] = layout[id]!;
  }
  for (const c of connections) {
    const a = typeof c?.from === "string" ? pageOf.get(compOf(c.from)) : undefined;
    const b = typeof c?.to === "string" ? pageOf.get(compOf(c.to)) : undefined;
    pages[a ?? b ?? 0]!.doc.connections.push(c as ConnectionData);
  }
  pages.forEach((p, i) => {
    p.doc.layout = cleanLayout(p.doc.layout);
    const e = entries[i]!;
    const blocks = normalizeBlocks(e.blocks, p.doc.components.map((c) => c.id));
    if (blocks.length) p.doc.blocks = blocks;
    const anns = normalizeAnnotations(e.annotations);
    if (anns.length) p.doc.annotations = anns;
  });
  return pages;
}

/** Il progetto ha bisogno della chiave `sheets` (più fogli, o un foglio con un nome scelto)? */
const needsSheets = (pages: Page[]) => pages.length > 1 || pages[0]!.name !== defaultPageName(1);

/**
 * Riunisce i fogli nel file. Con un solo foglio senza nome il file è identico a quello di
 * sempre; altrimenti le posizioni indicano il foglio e `sheets` elenca i fogli in ordine.
 */
export function joinPages(name: string, pages: Page[]): CircuitDoc {
  if (!pages.length) return emptyCircuit(name);
  if (!needsSheets(pages)) {
    const d = structuredClone(pages[0]!.doc);
    d.name = name;
    d.layout = cleanLayout(d.layout);
    delete d.sheets;
    return d;
  }
  const out: CircuitDoc = { format: FORMAT, version: 1, name, components: [], connections: [], layout: {}, sheets: [] };
  for (const p of pages) {
    const d = structuredClone(p.doc);
    out.components.push(...d.components);
    out.connections.push(...d.connections);
    const places = cleanLayout(d.layout);
    // ogni componente deve dire il suo foglio, anche se non ha ancora una posizione
    for (const c of d.components) out.layout[c.id] = { ...(places[c.id] ?? { x: 0, y: 0, rot: 0 }), sheet: p.id };
    out.sheets!.push({
      id: p.id, name: p.name,
      ...(d.sheet ? { sheet: d.sheet } : {}),
      ...(d.blocks?.length ? { blocks: d.blocks } : {}),
      ...(d.annotations?.length ? { annotations: d.annotations } : {}),
    });
  }
  return out;
}

/** Il circuito di tutti i fogli insieme, per validazione, simulazione e distinta. */
export function mergedCircuit(pages: Page[]): Pick<CircuitDoc, "components" | "connections"> {
  return {
    components: pages.flatMap((p) => p.doc.components),
    connections: pages.flatMap((p) => p.doc.connections),
  };
}

/** Indice del foglio che contiene il componente, -1 se non c'è. */
export const pageOfComponent = (pages: Page[], id: string): number =>
  pages.findIndex((p) => p.doc.components.some((c) => c.id === id));

/** Tipi di rimando e dominio: si collegano solo rimandi dello stesso dominio con la stessa descrizione. */
export const REFERENCE_TYPES: Readonly<Record<string, "pneumatic" | "electric">> = {
  sheet_reference: "pneumatic",
  wire_reference: "electric",
};

export interface ReferenceTarget { page: number; id: string }

/**
 * Dove prosegue ogni rimando: per sigla, gli altri rimandi con la stessa descrizione e lo stesso
 * dominio, con il foglio che li contiene (anche lo stesso foglio).
 */
export function referenceTargets(pages: Page[]): Map<string, ReferenceTarget[]> {
  const groups = new Map<string, ReferenceTarget[]>();
  pages.forEach((p, page) => {
    for (const c of p.doc.components) {
      const domain = REFERENCE_TYPES[c.type];
      const name = (c.label ?? "").trim();
      if (!domain || !name) continue;
      const key = `${domain}\u0000${name}`;
      groups.set(key, [...(groups.get(key) ?? []), { page, id: c.id }]);
    }
  });
  const out = new Map<string, ReferenceTarget[]>();
  for (const group of groups.values()) {
    for (const r of group) out.set(r.id, group.filter((x) => x.id !== r.id));
  }
  return out;
}

/** Testo del rimando sul disegno: i numeri dei fogli dove prosegue, per esempio «→ 2, 3». */
export function referenceText(targets: ReferenceTarget[] | undefined, here: number): string {
  const others = [...new Set((targets ?? []).map((t) => t.page).filter((p) => p !== here))].sort((a, b) => a - b);
  return others.length ? `→ fg. ${others.map((p) => p + 1).join(", ")}` : "";
}

/**
 * Copia di un foglio con sigle nuove (`newId(tipo, sigle prese)`), linee, blocchi e richiami
 * compresi. I riferimenti a componenti copiati (finecorsa, contatti, bobine) seguono le copie;
 * quelli a componenti di altri fogli restano come sono.
 */
export function duplicatePage(src: Page, id: string, name: string,
                              newId: (type: string, taken: Set<string>) => string): Page {
  const d = structuredClone(src.doc);
  const taken = new Set<string>();
  const rename = new Map<string, string>();
  for (const c of d.components) {
    const nid = newId(c.type, taken);
    taken.add(nid);
    rename.set(c.id, nid);
  }
  const fixId = (x: string) => rename.get(x) ?? x;
  const fixRef = (r: string) => { const i = r.lastIndexOf("."); return i > 0 ? `${fixId(r.slice(0, i))}${r.slice(i)}` : r; };
  const fixCam = (cam: string) => fixId(cam.slice(0, -1)) + cam.slice(-1);
  for (const c of d.components) {
    c.id = fixId(c.id);
    for (const key of ["cam_14", "cam_12", "cam"] as const) {
      const v = c[key];
      if (typeof v === "string" && v) c[key] = fixCam(v);
    }
    if (typeof c.relay === "string") c.relay = fixId(c.relay);
    if (typeof c.drives === "string") c.drives = fixRef(c.drives);
  }
  for (const c of d.connections) { c.from = fixRef(c.from); c.to = fixRef(c.to); delete c.id; }
  const layout: Record<string, Placement> = {};
  for (const [k, v] of Object.entries(d.layout)) layout[fixId(k)] = v;
  d.layout = layout;
  for (const b of d.blocks ?? []) b.components = b.components.map(fixId);
  for (const a of d.annotations ?? []) if (a.kind === "text" && a.leader?.attach) a.leader.attach = fixId(a.leader.attach);
  return { id, name, doc: d };
}
