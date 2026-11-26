/**
 * App installabile: genera dist/sw.js, il service worker che tiene in memoria tutti i file
 * della build (pagine, script, stili, icone, manifest) perché l'app si apra senza rete.
 * Il codice è in tools/sw.js; qui ci si mette davanti la versione e l'elenco dei file.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

/** File da tenere in memoria: la cartella dell'app ("./") e ogni file, senza mappe e senza sw.js. */
export function precacheList(files: string[]): string[] {
  const keep = files
    .map((f) => f.split(sep).join("/"))
    .filter((f) => f !== "sw.js" && !f.endsWith(".map") && !f.startsWith("."));
  return ["./", ...[...new Set(keep)].sort()];
}

function walk(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    const p = join(dir, n);
    out = statSync(p).isDirectory() ? out.concat(walk(p)) : out.concat(p);
  }
  return out;
}

/** Il testo di sw.js: versione (numero dell'app e impronta dei file) ed elenco, poi il codice. */
export function serviceWorkerSource(appVersion: string, files: Map<string, string | Uint8Array>): string {
  const list = precacheList([...files.keys()]);
  const hash = createHash("sha256");
  for (const f of list.slice(1)) hash.update(f).update(files.get(f) ?? "");
  const version = `${appVersion}-${hash.digest("hex").slice(0, 8)}`;
  const code = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
  return `const VERSION = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(list, null, 1)};\n\n${code}`;
}

export function pwa(appVersion: string): Plugin {
  let publicDir = "";
  return {
    name: "pneutrack-pwa",
    apply: "build",
    enforce: "post",
    configResolved(config) { publicDir = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = new Map<string, string | Uint8Array>();
      for (const [name, out] of Object.entries(bundle)) files.set(name, out.type === "chunk" ? out.code : out.source);
      for (const p of walk(publicDir)) files.set(relative(publicDir, p).split(sep).join("/"), readFileSync(p));
      this.emitFile({ type: "asset", fileName: "sw.js", source: serviceWorkerSource(appVersion, files) });
    },
  };
}
