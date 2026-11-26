import { describe, expect, it } from "vitest";
import { DxfWriter, dxfBytes, dxfText, flattenPath } from "../src/model/dxf";

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe("tracciati SVG spezzati in segmenti", () => {
  it("linee assolute e relative, H, V e chiusura", () => {
    const [p] = flattenPath("M0,0 L10,0 l0,5 H2 v-5 Z");
    expect(p!.pts).toEqual([[0, 0], [10, 0], [10, 5], [2, 5], [2, 0]]);
    expect(p!.closed).toBe(true);
  });

  it("più sottotracciati e coppie implicite dopo M", () => {
    const ps = flattenPath("M0 0 5 0 5 5 M20,20 L30,20");
    expect(ps.map((p) => p.pts.length)).toEqual([3, 2]);
    expect(ps[1]!.pts[0]).toEqual([20, 20]);
  });

  it("quadratica: estremi esatti, punto medio sulla curva", () => {
    const [p] = flattenPath("M-8,-10 Q-1,0 -8,10");
    close(p!.pts[0]!, [-8, -10]);
    close(p!.pts.at(-1)!, [-8, 10]);
    close(p!.pts[6]!, [-4.5, 0]); // t = 0.5
  });

  it("arco: semicerchio di raggio 12 sopra il centro", () => {
    const [p] = flattenPath("M-12,0 A12,12 0 0 1 12,0");
    close(p!.pts.at(-1)!, [12, 0]);
    for (const [x, y] of p!.pts) expect(Math.hypot(x, y)).toBeCloseTo(12, 6);
    expect(Math.min(...p!.pts.map(([, y]) => y))).toBeCloseTo(-12, 1); // passa in alto (y SVG verso il basso)
  });
});

describe("file DXF", () => {
  it("sezioni, layer usati, entità e coppie codice/valore", () => {
    const w = new DxfWriter([{ name: "LINEE", color: 5 }, { name: "PILOTAGGI", color: 5, linetype: "DASHED" },
      { name: "VUOTO", color: 1 }]);
    w.line([0, 0], [10, 0], "LINEE");
    w.polyline([[0, 0], [5, 5], [10, 0]], false, "PILOTAGGI", true);
    w.circle([5, 5], 2, "LINEE");
    w.disc([1, 1], 0.5, "LINEE");
    w.solid([[0, 0], [1, 0], [0, 1]], "LINEE");
    w.text([3, 4], "Cilindro Ø32 – è", "LINEE", { height: 2.5, align: 1 });
    const s = w.toString();
    const lines = s.split("\r\n");
    expect(lines.at(-1)).toBe("");
    expect((lines.length - 1) % 2).toBe(0);
    expect(s).toContain("AC1009");
    expect(s).toMatch(/0\r\nLAYER\r\n2\r\nPILOTAGGI\r\n70\r\n0\r\n62\r\n5\r\n6\r\nDASHED/);
    expect(s).not.toContain("VUOTO");
    for (const e of ["LINE", "POLYLINE", "VERTEX", "SEQEND", "CIRCLE", "SOLID", "TEXT"]) expect(lines).toContain(e);
    expect(s).toContain("Cilindro Ø32 – è");
    expect(s.indexOf("ENTITIES")).toBeGreaterThan(s.indexOf("TABLES"));
    expect(s.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("testo in Windows-1252, il resto come \\U+", () => {
    expect(dxfText("Relè\nK1 · ↔")).toBe("Relè K1 · \\U+2194");
    expect([...dxfBytes("è–A")]).toEqual([0xe8, 0x96, 0x41]);
  });
});
