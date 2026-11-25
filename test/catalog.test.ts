import { describe, expect, it } from "vitest";
import { ACTUATIONS, typeList } from "../src/model/components";
import { ACTUATION_NOTES, SYMBOL_NOTES, distinctVariants, renderCatalog } from "../src/ui/catalog";

describe("catalogo dei simboli", () => {
  const html = renderCatalog();
  it("mostra ogni componente della palette con la lettura del simbolo", () => {
    for (const def of typeList().filter((d) => !d.hidden)) {
      expect(html, def.type).toContain(`data-type="${def.type}"`);
      expect(SYMBOL_NOTES[def.type], def.type).toBeTruthy();
    }
  });
  it("disegna una scheda per ogni simbolo diverso della palette", () => {
    const n = typeList().filter((d) => !d.hidden).reduce((s, d) => s + distinctVariants(d).length, 0);
    expect(html.match(/class="cat-card" data-type=/g)).toHaveLength(n);
  });
  it("descrive tutti i comandi delle valvole", () => {
    for (const a of ACTUATIONS) expect(ACTUATION_NOTES[a], a).toBeTruthy();
  });
});
