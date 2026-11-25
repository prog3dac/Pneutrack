import { describe, expect, it } from "vitest";
import { geometry } from "../src/ui/symbols";
import { autoLabelSpot, labelSpot, portSides } from "../src/ui/labels";
import { mirrorComponents } from "../src/model/mirror";
import { emptyCircuit } from "../src/model/circuit";

const valve = geometry({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" });
const cyl = geometry({ id: "C1", type: "double_acting_cylinder" });

describe("posizione di sigla e descrizione", () => {
  it("evita i lati da cui escono le porte", () => {
    // valvola: porte sopra e sotto → testo a sinistra
    expect(portSides(valve, { rot: 0 })).not.toContain("left");
    const v = autoLabelSpot(valve, { rot: 0 }, "V1 · 5/2 monostabile");
    expect(v).toMatchObject({ anchor: "end" });
    expect(v.dx).toBeLessThan(-valve.w / 2);
    // cilindro: porte sotto → testo sopra
    const s = autoLabelSpot(cyl, { rot: 0 }, "C1 · Cilindro di bloccaggio");
    expect(s).toMatchObject({ dx: 0, anchor: "middle" });
    expect(s.dy).toBeLessThan(-cyl.h / 2);
  });
  it("segue la rotazione del simbolo", () => {
    // valvola ruotata di un quarto: porte a destra e a sinistra → testo sopra
    expect(autoLabelSpot(valve, { rot: 1 }, "V1 · 5/2 monostabile")).toMatchObject({ dx: 0, anchor: "middle" });
    // cilindro capovolto: porte sopra → il testo non va sopra il simbolo, tra le linee
    const c = autoLabelSpot(cyl, { rot: 2 }, "C1 · Cilindro di bloccaggio");
    expect(c.dy < 0 && c.anchor === "middle").toBe(false);
  });
  it("con porte su tutti i lati sceglie un angolo libero", () => {
    const v = geometry({ id: "V1", type: "directional_valve", function: "5/2", actuation_14: "pilot", actuation_12: "pilot" });
    const spot = autoLabelSpot(v, { rot: 0 }, "V1 · 5/2 bistabile pneumatica");
    expect(spot.anchor).not.toBe("middle");
    expect(Math.abs(spot.dy)).toBeGreaterThan(v.h / 2);
  });
  it("usa la posizione scelta dall'utente", () => {
    expect(labelSpot(cyl, { x: 0, y: 0, rot: 0, label: [30, -50] })).toEqual({ dx: 30, dy: -50, anchor: "middle" });
  });
  it("la specchiatura specchia anche il testo spostato", () => {
    const doc = emptyCircuit();
    doc.components.push({ id: "C1", type: "double_acting_cylinder" });
    doc.layout.C1 = { x: 100, y: 100, rot: 0, label: [30, -50] };
    mirrorComponents(doc, ["C1"], "h");
    expect(doc.layout.C1!.label).toEqual([-30, -50]);
  });
});
