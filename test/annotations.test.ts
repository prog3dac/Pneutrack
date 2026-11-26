import { describe, expect, it } from "vitest";
import {
  aciOf, ANN_PRESETS, annBox, annFromPreset, annLabel, dashArray, detachFrom, dxfLinetype, moveAnn, nextAnnId,
  normalizeAnnotations, offsetPolyline, rotatePt, type AnnotationData, type TextAnn,
} from "../src/model/annotations";
import { normalizeCircuit } from "../src/model/circuit";
import { DxfWriter } from "../src/model/dxf";

describe("annotazioni nel file", () => {
  it("tiene le voci valide, scarta le altre e rende uniche le sigle", () => {
    const anns = normalizeAnnotations([
      { id: "A1", kind: "rect", x: 0, y: 0, w: 100, h: 50, line: "dashdot", title: "Gruppo 1", carry: true, color: "#DC2626" },
      { id: "A1", kind: "text", x: 5, y: 5, text: "Nota", size: 5, rot: 5, box: "triangle", leader: { x: 1, y: 2, attach: "C1" } },
      { kind: "line", points: [[0, 0], [10, 0]], end: "open", line: "continuous", weight: 0.35 },
      { kind: "line", points: [[0, 0]] },
      { kind: "ellipse", x: 0, y: 0, w: 0, h: 10 },
      { kind: "cloud", x: 0, y: 0 },
      "testo",
    ]);
    expect(anns.map((a) => [a.id, a.kind])).toEqual([["A1", "rect"], ["A2", "text"], ["A3", "line"]]);
    expect(anns[0]).toMatchObject({ color: "#dc2626", line: "dashdot", carry: true });
    expect(anns[1]).toMatchObject({ rot: 1, box: "triangle", leader: { x: 1, y: 2, attach: "C1" } });
    // valori predefiniti non scritti
    expect(anns[2]).toEqual({ id: "A3", kind: "line", points: [[0, 0], [10, 0]], end: "open", weight: 0.35 });
  });

  it("lo schema letto conserva le annotazioni, che non toccano il circuito", () => {
    const doc = normalizeCircuit({ components: [], annotations: [{ kind: "text", x: 0, y: 0, text: "Ciao" }] });
    expect(doc.annotations).toEqual([{ id: "A1", kind: "text", x: 0, y: 0, text: "Ciao" }]);
    expect(normalizeCircuit({ components: [] }).annotations).toBeUndefined();
  });

  it("ogni voce della palette crea un'annotazione valida, centrata nel punto scelto", () => {
    for (const p of ANN_PRESETS) {
      const a = annFromPreset(p.key, "A9", { x: 1000, y: 500 })!;
      expect(normalizeAnnotations([a])).toEqual([a]);
      const b = annBox(a);
      expect(Math.abs(b.x + b.w / 2 - 1000)).toBeLessThan(120);
      expect(Math.abs(b.y + b.h / 2 - 500)).toBeLessThan(120);
    }
    expect(annLabel(annFromPreset("group", "A1", { x: 0, y: 0 })!)).toBe("Contorno gruppo");
    expect(annLabel(annFromPreset("flow", "A1", { x: 0, y: 0 })!)).toBe("Direzione del flusso");
    expect(annFromPreset("nessuno", "A1", { x: 0, y: 0 })).toBeNull();
  });

  it("sigle libere", () => {
    expect(nextAnnId([{ id: "A1" }, { id: "A3" }])).toBe("A2");
    expect(nextAnnId([{ id: "A1" }], new Set(["A2"]))).toBe("A3");
  });
});

describe("geometria", () => {
  it("spostare: il richiamo sciolto segue il testo, quello agganciato resta sul componente", () => {
    const free: TextAnn = { id: "A1", kind: "text", x: 0, y: 0, text: "x", leader: { x: 50, y: 50 } };
    const tied: TextAnn = { id: "A2", kind: "text", x: 0, y: 0, text: "x", leader: { x: -10, y: 0, attach: "C1" } };
    moveAnn(free, 10, 20); moveAnn(tied, 10, 20);
    expect(free.leader).toEqual({ x: 60, y: 70 });
    expect(tied.leader).toEqual({ x: -10, y: 0, attach: "C1" });
    const line: AnnotationData = { id: "A3", kind: "line", points: [[0, 0], [5, 5]] };
    moveAnn(line, 1, 2);
    expect(line.points).toEqual([[1, 2], [6, 7]]);
  });

  it("eliminando il componente il richiamo resta dov'era", () => {
    const anns: AnnotationData[] = [{ id: "A1", kind: "text", x: 0, y: 0, text: "x", leader: { x: -10, y: 5, attach: "C1" } }];
    detachFrom(anns, "C1", [100, 200]);
    expect((anns[0] as TextAnn).leader).toEqual({ x: 90, y: 205 });
  });

  it("ingombro di un testo ruotato e con richiamo agganciato", () => {
    const t: TextAnn = { id: "A1", kind: "text", x: 100, y: 100, text: "abcd", leader: { x: 0, y: 300, attach: "C1" } };
    const b = annBox(t, (id) => (id === "C1" ? [100, 0] : null));
    expect(b.y + b.h).toBeCloseTo(300, 6);
    const r = annBox({ ...t, leader: undefined, rot: 1 });
    expect(r.w).toBeLessThan(r.h); // in verticale
    expect(rotatePt([10, 0], 0, 0, 1)).toEqual([0, -10]); // antiorario sullo schermo
  });

  it("doppia linea: due tratti paralleli alla distanza giusta, anche sugli spigoli", () => {
    const pts = offsetPolyline([[0, 0], [100, 0], [100, 100]], 3);
    expect(pts[0]).toEqual([0, 3]);
    expect(pts[1]![0]).toBeCloseTo(97, 6); expect(pts[1]![1]).toBeCloseTo(3, 6);
    expect(pts[2]![0]).toBeCloseTo(97, 6);
  });
});

describe("stile ed esportazione", () => {
  it("tratteggi, tipi di linea DXF e colori AutoCAD", () => {
    expect(dashArray("dashdot")).toBe("18 4.5 1.5 4.5");
    expect(dashArray("double")).toBe("");
    expect([dxfLinetype("dashed"), dxfLinetype("dashdot"), dxfLinetype("dashdotdot"), dxfLinetype("dotted"), dxfLinetype(undefined)])
      .toEqual(["DASHED", "DASHDOT", "DIVIDE", "DOT", undefined]);
    expect(aciOf(undefined)).toBeUndefined();
    expect(aciOf("#dc2626")).toBe(1);
    expect(aciOf("#2563eb")).toBe(5);
    expect(aciOf("#fe0000")).toBe(1);
    expect(aciOf("#808081")).toBe(8);
  });

  it("DXF: tabella dei tipi di linea, colore e tipo di linea per entità", () => {
    const w = new DxfWriter([{ name: "ANNOTAZIONI", color: 7 }]);
    w.style = { color: 1, linetype: "DASHDOT" };
    w.polyline([[0, 0], [10, 0], [10, 10]], false, "ANNOTAZIONI", false, 0.5);
    w.text([0, 0], "Nota", "ANNOTAZIONI", { height: 3.5 });
    w.style = {};
    w.line([0, 0], [1, 1], "ANNOTAZIONI");
    const s = w.toString();
    expect(s).toMatch(/0\r\nTABLE\r\n2\r\nLTYPE\r\n70\r\n5\r\n/);
    expect(s).toMatch(/LTYPE\r\n2\r\nDASHDOT\r\n70\r\n0\r\n3\r\n[^\r]+\r\n72\r\n65\r\n73\r\n4\r\n40\r\n9\r\n49\r\n6\r\n49\r\n-1.5\r\n49\r\n0\r\n49\r\n-1.5/);
    expect(s).toMatch(/POLYLINE\r\n8\r\nANNOTAZIONI\r\n6\r\nDASHDOT\r\n62\r\n1\r\n66\r\n1/);
    expect(s).toMatch(/40\r\n0.5\r\n41\r\n0.5/);
    // il testo prende il colore ma non il tipo di linea
    expect(s).toMatch(/TEXT\r\n8\r\nANNOTAZIONI\r\n62\r\n1\r\n10/);
    expect(s).toMatch(/LINE\r\n8\r\nANNOTAZIONI\r\n10/);
  });
});
