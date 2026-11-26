import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { precacheList, serviceWorkerSource } from "../tools/pwa";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));

describe("app installabile", () => {
  it("il manifest ha quello che serve per installare l'app", () => {
    expect(manifest.name).toBe("Pneutrack");
    expect(manifest.display).toBe("standalone");
    // percorsi relativi: valgono su GitHub Pages (/Pneutrack/) e con BASE=./
    for (const k of ["start_url", "scope", "id"]) expect(manifest[k]).toBe("./");
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
    for (const i of manifest.icons) expect(existsSync(new URL(`../public/${i.src}`, import.meta.url))).toBe(true);
  });

  it("il service worker tiene in memoria tutti i file della build, tranne sé stesso e le mappe", () => {
    expect(precacheList(["index.html", "assets/a-1.js", "assets/a-1.js.map", "sw.js", "icons/icon-192.png"]))
      .toEqual(["./", "assets/a-1.js", "icons/icon-192.png", "index.html"]);
  });

  it("la versione del service worker cambia con i file, così il browser scarica quella nuova", () => {
    const a = serviceWorkerSource("1.0.0", new Map([["index.html", "uno"]]));
    const b = serviceWorkerSource("1.0.0", new Map([["index.html", "due"]]));
    const version = (src: string) => /const VERSION = "([^"]+)"/.exec(src)![1];
    expect(version(a)).toMatch(/^1\.0\.0-[0-9a-f]{8}$/);
    expect(version(a)).not.toBe(version(b));
    expect(a).toContain('"./"');
    expect(a).toContain('self.addEventListener("fetch"');
  });
});
