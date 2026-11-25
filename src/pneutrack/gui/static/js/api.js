// Accesso al motore: il server Python locale se c'è, altrimenti il motore JavaScript
// incluso (pagina statica pubblicata senza server, con i dati in data/).
import * as engine from "./engine.js";

let local = false;

async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
async function data(path) {
  const res = await fetch(`data/${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const isLocal = () => local;

export async function catalog() {
  try {
    if (window.PNEUTRACK_STATIC) throw new Error("statico");
    return await request("/api/catalog");
  } catch {
    const cat = await data("catalog.json");
    engine.setCatalog(cat);
    local = true;
    return cat;
  }
}
export const examples = () => (local ? data("examples.json") : request("/api/examples"));
export const example = (id) =>
  local ? data(`examples/${encodeURIComponent(id)}.json`) : request(`/api/examples/${encodeURIComponent(id)}`);
export const analyze = async (doc) =>
  local ? engine.analyze(JSON.parse(JSON.stringify(doc)))
        : request("/api/analyze", { method: "POST", body: JSON.stringify(doc) });
export async function cylinderInfo(comp) {
  if (!local) return request("/api/cylinder-info", { method: "POST", body: JSON.stringify(comp) });
  try { return engine.cylinderInfo(comp); } catch (e) { return { error: e.message }; }
}
