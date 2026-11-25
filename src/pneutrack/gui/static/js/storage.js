// Archivio dei progetti. Tre implementazioni con la stessa interfaccia:
//
//   server  – il server Python locale salva i file nella cartella dei progetti
//   cloud   – pagina pubblicata su claude.ai: database dell'artifact, privato per utente
//   browser – riserva: memoria del browser (localStorage), solo su questo dispositivo
//
// Un progetto è { id, name, createdAt, updatedAt, circuit }; l'elenco restituisce
// { id, name, createdAt, updatedAt, components } senza lo schema.

const LOCAL_PREFIX = "pneutrack.project.";

export function newProjectId() {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return "p" + Date.now().toString(36) + Array.from(rnd, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);
}

function summary(p) {
  return {
    id: p.id, name: p.name || "Senza nome", createdAt: p.createdAt, updatedAt: p.updatedAt,
    components: p.circuit?.components?.length ?? p.components ?? 0,
  };
}
const byUpdated = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt));

// --- server locale ------------------------------------------------------------

class ServerStore {
  kind = "server";
  label = "cartella dei progetti sul computer";
  async request(path, options = {}) {
    const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json" } });
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* corpo non JSON */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }
  list() { return this.request("/api/projects"); }
  get(id) { return this.request(`/api/projects/${encodeURIComponent(id)}`); }
  async put(project) {
    await this.request(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT", body: JSON.stringify(project) });
    return project;
  }
  remove(id) { return this.request(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); }
}

// --- database dell'artifact (claude.ai) --------------------------------------------

class CloudStore {
  kind = "cloud";
  label = "il tuo archivio online (privato)";
  constructor(db, uid) { this.col = db.collection(`data/users/${uid}`); }
  async list() {
    const snap = await this.col.get();
    return snap.docs.filter((d) => d.exists).map((d) => summary({ id: d.id, ...d.data() })).sort(byUpdated);
  }
  async get(id) {
    const snap = await this.col.doc(id).get();
    if (!snap.exists) throw new Error("progetto non trovato");
    return { id, ...JSON.parse(JSON.stringify(snap.data())) };
  }
  async put(project) {
    const { id, ...body } = project;
    await this.col.doc(id).set(JSON.parse(JSON.stringify(body)));
    return project;
  }
  remove(id) { return this.col.doc(id).delete(); }
}

// --- memoria del browser -----------------------------------------------------------

class BrowserStore {
  kind = "browser";
  label = "questo browser (solo su questo dispositivo)";
  keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LOCAL_PREFIX)) out.push(k);
    }
    return out;
  }
  async list() {
    return this.keys().map((k) => {
      try { return summary(JSON.parse(localStorage.getItem(k))); } catch { return null; }
    }).filter(Boolean).sort(byUpdated);
  }
  async get(id) {
    const raw = localStorage.getItem(LOCAL_PREFIX + id);
    if (!raw) throw new Error("progetto non trovato");
    return JSON.parse(raw);
  }
  async put(project) {
    try {
      localStorage.setItem(LOCAL_PREFIX + project.id, JSON.stringify(project));
    } catch (e) {
      throw new Error("memoria del browser piena o non disponibile");
    }
    return project;
  }
  async remove(id) { localStorage.removeItem(LOCAL_PREFIX + id); }
}

class MemoryStore extends BrowserStore {
  kind = "memory";
  label = "nessun archivio disponibile: esporta il file per non perdere il lavoro";
  items = new Map();
  keys() { return [...this.items.keys()]; }
  async list() { return [...this.items.values()].map(summary).sort(byUpdated); }
  async get(id) { if (!this.items.has(id)) throw new Error("progetto non trovato"); return structuredClone(this.items.get(id)); }
  async put(p) { this.items.set(p.id, structuredClone(p)); return p; }
  async remove(id) { this.items.delete(id); }
}

function browserAvailable() {
  try {
    const k = "pneutrack.__probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

// Sceglie l'archivio: server se c'è, poi database della pagina pubblicata, poi browser.
export async function openStore({ serverAvailable }) {
  if (serverAvailable) return new ServerStore();
  if (window.claude?.use) {
    try {
      const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      const uid = db && user ? await user.id() : null;
      // chi può solo guardare la pagina non può scrivere: usa la memoria del browser
      const canWrite = user?.can ? await user.can("data.write") : null;
      if (db && uid && canWrite !== false) return new CloudStore(db, uid);
    } catch { /* capability non disponibile */ }
  }
  return browserAvailable() ? new BrowserStore() : new MemoryStore();
}

// Esporta un file: capability "downloads" su claude.ai, altrimenti link di download.
// Restituisce "saved" oppure "declined".
export async function exportFile(filename, text) {
  let downloads = null;
  if (window.claude?.use) {
    try { downloads = await window.claude.use("downloads"); } catch { downloads = null; }
  }
  if (downloads) {
    try {
      await downloads.save({ filename, data: new Blob([text], { type: "application/json" }) });
      return "saved";
    } catch (e) {
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
