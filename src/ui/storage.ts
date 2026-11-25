/**
 * Archivio dei progetti. Tre implementazioni con la stessa interfaccia:
 *
 *   cloud   – pagina pubblicata su claude.ai: database dell'artifact, privato per utente
 *   browser – memoria del browser (localStorage), solo su questo dispositivo (GitHub Pages)
 *   memory  – riserva quando il browser non salva nulla: si perde alla chiusura
 */
import type { CircuitDoc } from "../model/circuit";

const LOCAL_PREFIX = "pneutrack.project.";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  circuit: CircuitDoc;
}
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  components: number;
}
export interface Store {
  kind: "cloud" | "browser" | "memory";
  label: string;
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project>;
  put(project: Project): Promise<Project>;
  remove(id: string): Promise<void>;
}

export function newProjectId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return "p" + Date.now().toString(36) + Array.from(rnd, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

function summary(p: Partial<Project> & { components?: number }): ProjectSummary {
  return {
    id: p.id ?? "", name: p.name || "Senza nome", createdAt: p.createdAt ?? "", updatedAt: p.updatedAt ?? "",
    components: p.circuit?.components?.length ?? p.components ?? 0,
  };
}
const byUpdated = (a: ProjectSummary, b: ProjectSummary) => String(b.updatedAt).localeCompare(String(a.updatedAt));

// --- database dell'artifact (claude.ai) --------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
type ClaudeRuntime = { use(name: string): Promise<any> };
const runtime = (): ClaudeRuntime | undefined => (window as unknown as { claude?: ClaudeRuntime }).claude;

class CloudStore implements Store {
  kind = "cloud" as const;
  label = "il tuo archivio online (privato)";
  private col: Db;
  constructor(db: Db, uid: string) { this.col = db.collection(`data/users/${uid}`); }
  async list() {
    const snap = await this.col.get();
    return snap.docs.filter((d: any) => d.exists).map((d: any) => summary({ id: d.id, ...d.data() })).sort(byUpdated);
  }
  async get(id: string) {
    const snap = await this.col.doc(id).get();
    if (!snap.exists) throw new Error("progetto non trovato");
    return { id, ...JSON.parse(JSON.stringify(snap.data())) } as Project;
  }
  async put(project: Project) {
    const { id, ...body } = project;
    await this.col.doc(id).set(JSON.parse(JSON.stringify(body)));
    return project;
  }
  async remove(id: string) { await this.col.doc(id).delete(); }
}

// --- memoria del browser -----------------------------------------------------------

class BrowserStore implements Store {
  kind: Store["kind"] = "browser";
  label = "questo browser (solo su questo dispositivo: esporta i file per averli altrove)";
  protected keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LOCAL_PREFIX)) out.push(k);
    }
    return out;
  }
  async list() {
    return this.keys().flatMap((k) => {
      try { return [summary(JSON.parse(localStorage.getItem(k) ?? "null"))]; } catch { return []; }
    }).sort(byUpdated);
  }
  async get(id: string) {
    const raw = localStorage.getItem(LOCAL_PREFIX + id);
    if (!raw) throw new Error("progetto non trovato");
    return JSON.parse(raw) as Project;
  }
  async put(project: Project) {
    try {
      localStorage.setItem(LOCAL_PREFIX + project.id, JSON.stringify(project));
    } catch {
      throw new Error("memoria del browser piena o non disponibile");
    }
    return project;
  }
  async remove(id: string) { localStorage.removeItem(LOCAL_PREFIX + id); }
}

class MemoryStore implements Store {
  kind = "memory" as const;
  label = "nessun archivio disponibile: esporta il file per non perdere il lavoro";
  private items = new Map<string, Project>();
  async list() { return [...this.items.values()].map(summary).sort(byUpdated); }
  async get(id: string) {
    const p = this.items.get(id);
    if (!p) throw new Error("progetto non trovato");
    return structuredClone(p);
  }
  async put(p: Project) { this.items.set(p.id, structuredClone(p)); return p; }
  async remove(id: string) { this.items.delete(id); }
}

function browserAvailable(): boolean {
  try {
    const k = "pneutrack.__probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

/** Sceglie l'archivio: database della pagina pubblicata su claude.ai, poi browser, poi memoria. */
export async function openStore(): Promise<Store> {
  const claude = runtime();
  if (claude?.use) {
    try {
      const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
      const uid = db && user ? await user.id() : null;
      // chi può solo guardare la pagina non può scrivere: usa la memoria del browser
      const canWrite = user?.can ? await user.can("data.write") : null;
      if (db && uid && canWrite !== false) return new CloudStore(db, uid);
    } catch { /* capability non disponibile */ }
  }
  return browserAvailable() ? new BrowserStore() : new MemoryStore();
}

/** Esporta un file: capability "downloads" su claude.ai, altrimenti link di download. */
export async function exportFile(filename: string, text: string): Promise<"saved" | "declined"> {
  let downloads: any = null;
  const claude = runtime();
  if (claude?.use) {
    try { downloads = await claude.use("downloads"); } catch { downloads = null; }
  }
  if (downloads) {
    try {
      await downloads.save({ filename, data: new Blob([text], { type: "application/json" }) });
      return "saved";
    } catch (e: any) {
      if (e?.code === "declined") return "declined";
      throw new Error(e?.message || "salvataggio del file non riuscito");
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return "saved";
}
