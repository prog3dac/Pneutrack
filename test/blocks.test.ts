import { describe, expect, it } from "vitest";
import {
  extractFragment, insertFragment, mergeBlock, normalizeBlocks, parseFragment, pruneBlocks, splitBlock,
} from "../src/model/blocks";
import { normalizeCircuit, type CircuitDoc } from "../src/model/circuit";

const base = (): CircuitDoc => normalizeCircuit({
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "V1", type: "directional_valve", function: "5/2" },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
    { id: "S1", type: "directional_valve", function: "3/2", actuation_14: "mechanical", cam_14: "C1+" },
  ],
  connections: [
    { from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A", points: [[120, 40]] }, { from: "V1.2", to: "C1.B" },
  ],
  layout: { P: { x: 0, y: 200, rot: 0 }, V1: { x: 100, y: 100, rot: 0 }, C1: { x: 100, y: 0, rot: 1 }, S1: { x: 300, y: 100, rot: 0 } },
});
const gen = (type: string, taken: Set<string>) => {
  const p = type === "directional_valve" ? "V" : type.includes("cylinder") ? "C" : "X";
  let n = 1;
  while (taken.has(`${p}${n}`)) n++;
  return `${p}${n}`;
};

describe("blocchi", () => {
  it("unisci e dividi: un componente sta in un solo blocco", () => {
    const d = base();
    const b1 = mergeBlock(d, ["V1", "C1"], "Comando", "Cilindro con la sua valvola");
    expect(b1).toEqual({ id: "B1", name: "Comando", description: "Cilindro con la sua valvola", components: ["V1", "C1"] });
    const b2 = mergeBlock(d, ["C1", "S1"]);
    expect(b2.id).toBe("B2");
    expect(d.blocks!.find((b) => b.id === "B1")!.components).toEqual(["V1"]);
    expect(splitBlock(d, "B2")).toEqual(["C1", "S1"]);
    expect(d.blocks!.map((b) => b.id)).toEqual(["B1"]);
    d.components = d.components.filter((c) => c.id !== "V1");
    pruneBlocks(d);
    expect(d.blocks).toBeUndefined();
  });

  it("duplica un blocco con le sue linee interne, le pieghe e i finecorsa", () => {
    const d = base();
    const frag = extractFragment(d, ["V1", "C1", "S1"], "Comando");
    expect(frag.connections.map((c) => `${c.from}-${c.to}`)).toEqual(["V1.4-C1.A", "V1.2-C1.B"]);
    expect(frag.layout.C1).toEqual({ x: 0, y: 0, rot: 1 });
    expect(frag.connections[0]!.points).toEqual([[20, 40]]);
    const ids = insertFragment(d, frag, { x: 500, y: 0 }, gen);
    expect(ids).toEqual(["V2", "C2", "V3"]);
    expect(d.connections.slice(-2).map((c) => `${c.from}-${c.to}`)).toEqual(["V2.4-C2.A", "V2.2-C2.B"]);
    expect(d.connections.at(-2)!.points).toEqual([[520, 40]]);
    expect(d.components.find((c) => c.id === "V3")!.cam_14).toBe("C2+");
    expect(d.layout.V2).toEqual({ x: 500, y: 100, rot: 0 });
    // l'originale non cambia
    expect(d.components.find((c) => c.id === "S1")!.cam_14).toBe("C1+");
  });

  it("legge i blocchi dai file e scarta quelli non validi", () => {
    expect(normalizeBlocks([{ id: "B1", name: "A", components: ["V1", "X9"] }, { id: "B2", components: ["V1", "C1"] },
                            { id: "B3", components: [] }, "boh"], ["V1", "C1"]))
      .toEqual([{ id: "B1", name: "A", components: ["V1"] }, { id: "B2", name: "B2", components: ["C1"] }]);
    const d = normalizeCircuit({ components: [{ id: "V1", type: "plug" }], blocks: [{ id: "B1", name: "x", components: ["V1"] }] });
    expect(d.blocks).toHaveLength(1);
    expect(parseFragment({ name: "x", components: [] })).toBeNull();
    expect(parseFragment(extractFragment(base(), ["P"]))!.components).toHaveLength(1);
  });
});
