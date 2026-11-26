import { describe, expect, it } from "vitest";
import { billOfMaterials, bomCsv } from "../src/model/bom";
import { parseSheet } from "../src/model/sheet";
import type { ComponentData } from "../src/model/components";

const comps: ComponentData[] = [
  { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
  { id: "J1", type: "junction" },
  { id: "C10", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
  { id: "C2", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
  { id: "C3", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" }, code: "DSBC-32-100" },
  { id: "V1", type: "directional_valve", function: "5/2", actuation_14: "solenoid", actuation_12: "spring" },
  { id: "Y1", type: "valve_solenoid", drives: "V1.14" },
  { id: "S1", type: "pushbutton", contact: "no" },
  { id: "K1", type: "relay_coil" },
  { id: "K1a", type: "relay_contact", contact: "no", relay: "K1" },
];

describe("distinta componenti", () => {
  const rows = billOfMaterials({ components: comps });

  it("raggruppa pezzi uguali e separa i codici diversi", () => {
    const cyl = rows.filter((r) => r.description.startsWith("Cilindro"));
    expect(cyl.map((r) => [r.ids, r.qty, r.code])).toEqual([[["C2", "C10"], 2, ""], [["C3"], 1, "DSBC-32-100"]]);
    expect(cyl[0]!.data).toBe("Alesaggio 32 mm, Corsa 100 mm");
  });

  it("descrive le varianti e lascia fuori i simboli che non si ordinano", () => {
    expect(rows.map((r) => r.ids[0])).toEqual(["V1", "C2", "C3", "S1", "K1"]);
    expect(rows[0]!.description).toBe("Valvola distributrice 5/2, solenoide / molla");
    expect(rows.find((r) => r.ids[0] === "S1")!.description).toBe("Pulsante NA, a impulso");
    expect(rows.find((r) => r.ids[0] === "K1")!.description).toBe("Relè");
    expect(rows.map((r) => r.pos)).toEqual([1, 2, 3, 4, 5]);
  });

  it("CSV col punto e virgola, virgolette dove servono", () => {
    const csv = bomCsv(rows);
    expect(csv.startsWith("﻿Pos.;Sigle;Descrizione;Dati da catalogo;Codice articolo;Q.tà\r\n")).toBe(true);
    expect(csv).toContain("2;C2, C10;Cilindro doppio effetto;Alesaggio 32 mm, Corsa 100 mm;;2\r\n");
    expect(bomCsv([{ pos: 1, ids: ["X"], description: 'a;b "c"', data: "", code: "", qty: 1 }]))
      .toContain('1;X;"a;b ""c""";;;1');
  });

  it("il foglio ricorda se mostrare la distinta", () => {
    expect(parseSheet({ format: "A3", bom: true })?.bom).toBe(true);
    expect(parseSheet({ format: "A3", bom: "sì" })?.bom).toBeUndefined();
  });
});
