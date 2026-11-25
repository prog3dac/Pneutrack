// Legge da stdin {catalog, cases} e scrive su stdout i risultati del motore JavaScript.
import { readFileSync } from "node:fs";
import { analyze, cylinderInfo, setCatalog, fmtG } from "../../src/pneutrack/gui/static/js/engine.js";

const input = JSON.parse(readFileSync(0, "utf-8"));
setCatalog(input.catalog);
const out = {
  analyze: input.cases.map((c) => analyze(c)),
  cylinder: input.cylinders.map((c) => { try { return cylinderInfo(c); } catch (e) { return { error: e.message }; } }),
  fmt: input.numbers.map(fmtG),
};
process.stdout.write(JSON.stringify(out));
