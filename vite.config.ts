import { defineConfig } from "vite";

// GitHub Pages serve il sito da https://prog3dac.github.io/Pneutrack/.
// BASE=./ produce una build con percorsi relativi (pagina pubblicata altrove).
export default defineConfig({
  base: process.env.BASE ?? "/Pneutrack/",
  build: { outDir: "dist" },
});
