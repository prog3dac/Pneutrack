import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// GitHub Pages serve il sito da https://prog3dac.github.io/Pneutrack/.
// BASE=./ produce una build con percorsi relativi (pagina pubblicata altrove).
export default defineConfig({
  base: process.env.BASE ?? "/Pneutrack/",
  build: { outDir: "dist" },
  // numero di versione dell'app, mostrato nell'intestazione
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
