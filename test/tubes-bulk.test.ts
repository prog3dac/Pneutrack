// Più linee selezionate: valori comuni e modifiche in blocco dei tubi.
import { describe, expect, it } from "vitest";
import { polylineCrossesBox } from "../src/model/route";
import { commonTubeField, editTube, parseScale, sameTube, scaleLength, type TubeData } from "../src/model/tubes";

const T = (outer: string, inner: string, length: string): TubeData => ({ outer_diameter: outer, inner_diameter: inner, length });

describe("valori comuni a più tubi", () => {
  it("dà il valore se è uguale per tutti, anche scritto in unità diverse", () => {
    const tubes = [T("6 mm", "4 mm", "1 m"), T("6 mm", "4 mm", "1000 mm"), undefined];
    expect(commonTubeField(tubes, "inner_diameter")).toBe("4 mm");
    expect(commonTubeField(tubes, "length")).toBe("1 m");
  });
  it("null se i valori sono diversi, undefined se nessuna linea ha il tubo", () => {
    expect(commonTubeField([T("6 mm", "4 mm", "1 m"), T("8 mm", "5 mm", "1 m")], "outer_diameter")).toBeNull();
    expect(commonTubeField([undefined, undefined], "length")).toBeUndefined();
  });
  it("riconosce le linee con lo stesso tubo", () => {
    expect(sameTube(T("6 mm", "4 mm", "1.5 m"), T("6 mm", "4 mm", "1500 mm"))).toBe(true);
    expect(sameTube(T("6 mm", "4 mm", "1 m"), T("6 mm", "4 mm", "2 m"))).toBe(false);
    expect(sameTube(undefined, undefined)).toBe(true);
    expect(sameTube(undefined, T("6 mm", "4 mm", "1 m"))).toBe(false);
  });
});

describe("modifica in blocco", () => {
  const a = T("6 mm", "4 mm", "0.5 m");
  it("la misura cambia i diametri e tiene la lunghezza di ogni linea", () => {
    expect(editTube(a, { kind: "size", outer: "8 mm", inner: "5 mm", length: "1 m" })).toEqual(T("8 mm", "5 mm", "0.5 m"));
    expect(editTube(undefined, { kind: "size", outer: "8 mm", inner: "5 mm", length: "1 m" })).toEqual(T("8 mm", "5 mm", "1 m"));
  });
  it("«Personalizzato» tiene i tubi e dà un Ø6×4 alle linee ideali", () => {
    expect(editTube(T("7 mm", "5 mm", "2 m"), { kind: "custom", length: "1 m" })).toEqual(T("7 mm", "5 mm", "2 m"));
    expect(editTube(undefined, { kind: "custom", length: "1 m" })).toEqual(T("6 mm", "4 mm", "1 m"));
  });
  it("un campo vale per tutte le linee con il tubo; le ideali restano ideali", () => {
    expect(editTube(a, { kind: "field", name: "length", value: "2 m" })).toEqual(T("6 mm", "4 mm", "2 m"));
    expect(editTube(undefined, { kind: "field", name: "length", value: "2 m" })).toBeUndefined();
    expect(editTube(a, { kind: "field", name: "outer_diameter", value: "" })).toEqual({ inner_diameter: "4 mm", length: "0.5 m" });
    expect(editTube(a, { kind: "none" })).toBeUndefined();
  });
  it("la scala moltiplica la lunghezza di ognuna", () => {
    expect(editTube(a, { kind: "scale", factor: 1.2 })?.length).toBe("0.6 m");
    expect(editTube(T("6 mm", "4 mm", "1500 mm"), { kind: "scale", factor: 2 })?.length).toBe("3 m");
    expect(editTube(undefined, { kind: "scale", factor: 2 })).toBeUndefined();
    expect(scaleLength("10 mm", 0.0001)).toBe("0.001 m");
  });
  it("legge percentuali e fattori", () => {
    expect(parseScale("120")).toBeCloseTo(1.2);
    expect(parseScale("120 %")).toBeCloseTo(1.2);
    expect(parseScale("×1,5")).toBeCloseTo(1.5);
    expect(parseScale("x0.5")).toBeCloseTo(0.5);
    expect(parseScale("0")).toBeNull();
    expect(parseScale("due")).toBeNull();
  });
});

describe("riquadro sulle linee", () => {
  const box = { x: 0, y: 0, w: 10, h: 10 };
  it("prende le linee che lo attraversano o vi entrano", () => {
    expect(polylineCrossesBox([[-20, 5], [20, 5]], box)).toBe(true);
    expect(polylineCrossesBox([[5, 5], [50, 5]], box)).toBe(true);
    expect(polylineCrossesBox([[-20, -5], [5, -5], [5, 30]], box)).toBe(true);
  });
  it("lascia quelle che passano fuori", () => {
    expect(polylineCrossesBox([[-20, 15], [20, 15]], box)).toBe(false);
    expect(polylineCrossesBox([[-20, -5], [-5, -5], [-5, 30]], box)).toBe(false);
  });
});
