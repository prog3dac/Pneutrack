import { writeFileSync, mkdirSync } from "node:fs";
import { BAR, P_ATM } from "../solver/constants";
import { defaultParams, simulate } from "../solver/cylinderCircuit";

// Estende per 0.5 s, poi rientra per 0.5 s.
const samples = simulate(defaultParams, (t) => (t < 0.5 ? 1 : 0), 1.0);
mkdirSync("out", { recursive: true });
const rows = ["t_s,p1_bar_g,p2_bar_g,x_mm,v_m_s"].concat(
  samples.map((s) => [s.t, (s.p1 - P_ATM) / BAR, (s.p2 - P_ATM) / BAR, s.x * 1000, s.v].map((n) => n.toFixed(5)).join(",")),
);
writeFileSync("out/cylinder.csv", rows.join("\n"));
const ext = samples.find((s) => s.x >= defaultParams.stroke - 1e-6);
const ret = samples.find((s) => s.t > 0.5 && s.x <= 1e-6);
console.log(`Estensione completata a t = ${ext?.t.toFixed(3)} s`);
console.log(`Rientro completato a t = ${ret ? (ret.t - 0.5).toFixed(3) : "n/d"} s dopo il comando`);
console.log("CSV: out/cylinder.csv");
