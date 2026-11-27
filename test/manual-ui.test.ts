// Lettore del manuale d'uso dentro l'app.
import { describe, expect, it } from "vitest";
import { inline, MANUAL_PARTS, renderManual, slug } from "../src/ui/manual";

describe("manuale nell'app", () => {
  it("contiene le tre parti del manuale", () => {
    expect(MANUAL_PARTS.map((p) => p.file)).toEqual(["README.md", "calcoli.md", "componenti.md"]);
    for (const p of MANUAL_PARTS) expect(p.text.length).toBeGreaterThan(1000);
  });

  it("trasforma titoli, tabelle, elenchi e codice", () => {
    const html = renderManual("# Titolo\n\nUn `p_atm` **forte**.\n\n| A | B \\| C |\n|---|---|\n| 1 | 2 |\n\n- uno\n  continua\n- due\n\n```bash\nnpm test\n```\n<!-- nascosto -->");
    expect(html).toContain('<h1 id="titolo">Titolo</h1>');
    expect(html).toContain("<code>p_atm</code> <strong>forte</strong>");
    expect(html).toContain("<th>B | C</th>");
    expect(html).toContain("<td>2</td>");
    expect(html).toContain("<li>uno continua</li><li>due</li>");
    expect(html).toContain("<pre><code>npm test</code></pre>");
    expect(html).not.toContain("nascosto");
  });

  it("collega le parti tra loro e apre fuori i documenti esterni", () => {
    expect(inline("[calcoli](calcoli.md)")).toContain('data-manual-part="calcoli.md"');
    expect(inline("[cil](#double-acting-cylinder)")).toContain('data-manual-anchor="double-acting-cylinder"');
    expect(inline("[guida](../interfaccia.md)")).toContain('href="https://github.com/prog3dac/Pneutrack/blob/main/docs/interfaccia.md"');
    expect(inline("[x](javascript:void)")).toBe("x");
  });

  it("non lascia passare HTML dal testo", () => {
    expect(renderManual("<script>alert(1)</script>")).not.toContain("<script>");
    expect(inline("a < b & `<b>`")).toBe("a &lt; b &amp; <code>&lt;b&gt;</code>");
  });

  it("ogni collegamento interno del manuale porta a un titolo o a un'ancora che esiste", () => {
    const ids = new Map(MANUAL_PARTS.map((p) => [p.file, new Set([...renderManual(p.text).matchAll(/id="([^"]+)"/g)].map((m) => m[1]))]));
    for (const p of MANUAL_PARTS) {
      for (const m of renderManual(p.text).matchAll(/data-manual-part="([^"]*)" data-manual-anchor="([^"]*)"/g)) {
        const file = m[1] || p.file, anchor = m[2]!;
        expect(ids.has(file), `${p.file} → ${file}`).toBe(true);
        if (anchor) expect(ids.get(file)!.has(anchor), `${p.file} → ${file}#${anchor}`).toBe(true);
      }
    }
    expect(slug("4. Cilindri e attuatori")).toBe("4-cilindri-e-attuatori");
  });
});
