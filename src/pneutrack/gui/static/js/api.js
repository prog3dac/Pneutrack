// Chiamate al server Python locale.
async function request(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const catalog = () => request("/api/catalog");
export const examples = () => request("/api/examples");
export const example = (id) => request(`/api/examples/${encodeURIComponent(id)}`);
export const analyze = (doc) => request("/api/analyze", { method: "POST", body: JSON.stringify(doc) });
export const cylinderInfo = (comp) =>
  request("/api/cylinder-info", { method: "POST", body: JSON.stringify(comp) });
