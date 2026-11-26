import { describe, expect, it } from "vitest";
import { ACTUATIONS, typeList } from "../src/model/components";
import { ACTUATION_NOTES, SYMBOL_NOTES, catalogEntries, renderCatalog } from "../src/ui/catalog";
import { DESIGNATION_PREFIX, paletteCategories, paletteItems } from "../src/ui/palette";

describe("catalogo dei simboli", () => {
  const html = renderCatalog();
  const visible = typeList().filter((d) => !d.hidden);
  /** voci "tipo|configurazione" presenti nelle schede del catalogo */
  const shown = new Set([...html.matchAll(/data-type="([^"]+)" data-presets="([^"]*)"/g)]
    .flatMap(([, type, presets]) => presets!.split(" ").map((p) => `${type}|${p}`)));

  it("ha una scheda per ogni voce della palette dell'editor", () => {
    for (const it of paletteItems(typeList())) {
      expect(shown.has(`${it.type.type}|${it.preset}`), `${it.type.type}: ${it.label}`).toBe(true);
      expect(html, it.label).toContain(it.label.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`));
    }
  });
  it("non mostra voci che non sono nella palette", () => {
    const palette = new Set(paletteItems(typeList()).map((it) => `${it.type.type}|${it.preset}`));
    for (const v of shown) expect(palette.has(v), v).toBe(true);
  });
  it("ha le stesse sezioni della palette, nello stesso ordine", () => {
    const sections = [...html.matchAll(/<section id="cat-\d+" data-category="([^"]+)"/g)].map((m) => m[1]);
    expect(sections).toEqual(paletteCategories(typeList()).map((c) => c.replace(/'/g, "&#39;")));
    // ogni componente sta nella sezione della sua categoria
    for (const def of visible) {
      const sec = html.slice(html.lastIndexOf("<section", html.indexOf(`data-type="${def.type}"`)));
      expect(sec.startsWith(`<section id="cat-${paletteCategories(typeList()).indexOf(def.category)}"`), def.type)
        .toBe(true);
    }
  });
  it("descrive ogni componente con la lettura del simbolo e la sigla", () => {
    for (const def of visible) {
      expect(SYMBOL_NOTES[def.type], def.type).toBeTruthy();
      expect(DESIGNATION_PREFIX[def.type], `sigla di ${def.type}`).toBeTruthy();
      expect(html, def.type).toContain(`Sigla <b>${DESIGNATION_PREFIX[def.type]}</b>1`);
    }
  });
  it("raggruppa nella stessa scheda solo le voci con lo stesso disegno", () => {
    const n = visible.reduce((s, d) => s + catalogEntries(d).length, 0);
    expect(html.match(/class="cat-card" data-type=/g)).toHaveLength(n);
    expect(catalogEntries(visible.find((d) => d.type === "air_reservoir")!)).toHaveLength(1);
  });
  it("descrive tutti i comandi delle valvole", () => {
    for (const a of ACTUATIONS) expect(ACTUATION_NOTES[a], a).toBeTruthy();
  });
});

describe("ordine del catalogo", () => {
  it("presenta i componenti nell'ordine della palette", () => {
    const html = renderCatalog();
    const order = [...new Set([...html.matchAll(/data-type="([^"]+)"/g)].map((m) => m[1]))];
    expect(order).toEqual([...new Set(paletteItems(typeList()).map((it) => it.type.type))]);
  });
});
