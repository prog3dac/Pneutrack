/**
 * Genera docs/manuale/componenti.md, il riferimento dei componenti del manuale d'uso, dal catalogo
 * (`DEFS` in src/model/components.ts): porte, opzioni, parametri, unità e valori predefiniti.
 *
 *   npm run manuale        riscrive il file
 *
 * Il test test/manuale.test.ts fallisce se il file non corrisponde al catalogo: dopo ogni modifica ai
 * componenti va rigenerato.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { typeList, type Component, type OptionSpec, type ParamSpec, type PortKind, type TypeDef } from "../src/model/components";
import { knownUnits, type Dimension } from "../src/model/units";

export const COMPONENTS_FILE = fileURLToPath(new URL("../docs/manuale/componenti.md", import.meta.url));

const DIMENSION: Record<Dimension, string> = {
  pressure: "pressione", length: "lunghezza", area: "area", volume: "volume", force: "forza", flow: "portata (ANR)",
  conductance: "conduttanza sonica C", mass: "massa", time: "tempo", angle: "angolo", voltage: "tensione",
  dimensionless: "numero puro",
};
const PORT_KIND: Record<PortKind, string> = {
  supply: "alimentazione", work: "utilizzo", exhaust: "scarico", pilot: "pilotaggio", electric: "morsetto elettrico",
};

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const code = (s: string) => `\`${s}\``;

function ports(d: TypeDef): string {
  // porte con le opzioni predefinite (per le valvole dipendono dalla funzione scelta)
  const c = Object.fromEntries((d.options ?? []).map((o) => [o.name, o.default])) as unknown as Component;
  try {
    return d.ports(c).map((p) => `${code(p.name)} ${PORT_KIND[p.kind]}${p.mayBeOpen ? " (può restare libera)" : ""}`).join(", ");
  } catch {
    return "dipendono dalle opzioni";
  }
}

function options(list: OptionSpec[]): string[] {
  if (!list.length) return [];
  const out = ["", "| Opzione | Descrizione | Scelte | Predefinita |", "|---|---|---|---|"];
  for (const o of list) {
    const choices = o.choices.map(([v, l]) => `${code(v)} ${l}`).join("; ");
    out.push(`| ${code(o.name)} | ${cell(o.label)} | ${cell(choices)} | ${code(o.default)} |`);
  }
  return out;
}

function params(list: ParamSpec[], defaults: Record<string, string>): string[] {
  if (!list.length) return ["", "Nessun parametro."];
  const out = ["", "| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |",
    "|---|---|---|---|---|---|"];
  for (const p of list) {
    const units = p.dimension === "dimensionless" ? (p.percent ? "% (0–100 %) o frazione 0–1" : "numero") : knownUnits(p.dimension).join(", ");
    const kind = [p.group === "sim" ? "simulazione" : "catalogo", p.required ? "obbligatorio" : "facoltativo"].join(", ");
    const notes = [p.below !== undefined ? `minore di ${p.below}` : "", p.signed ? "ammette valori negativi" : ""].filter(Boolean).join("; ");
    out.push(`| ${code(p.name)} | ${cell(p.label)}${notes ? ` (${notes})` : ""} | ${DIMENSION[p.dimension]} (${cell(units)}) | ${kind} | ` +
      `${defaults[p.name] ? code(defaults[p.name]!) : ""} | ${p.simDefault ? cell(p.simDefault) : p.required ? "obbligatorio" : "—"} |`);
  }
  return out;
}

/** Testo di docs/manuale/componenti.md. */
export function componentReference(): string {
  const defs = typeList().filter((d) => !d.hidden);
  const out = [
    "# Manuale · Riferimento dei componenti",
    "",
    "<!-- File generato da tools/manuale.ts a partire dal catalogo (src/model/components.ts): non modificarlo a mano,",
    "     esegui `npm run manuale`. Il test test/manuale.test.ts controlla che sia aggiornato. -->",
    "",
    "Per ogni tipo di componente: nome nel file (`type`), porte, opzioni e parametri con le unità ammesse.",
    "Come la simulazione usa questi dati è spiegato in [calcoli.md](calcoli.md); le convenzioni (pressioni",
    "relative, numerazione delle porte, unità) in [README.md](README.md).",
    "",
    "- **catalogo**: dato che si legge sulla scheda del costruttore; se manca e la simulazione non lo usa, resta vuoto.",
    "- **simulazione**: parametro del modello fisico; se manca vale il valore della colonna «Se manca, in simulazione».",
    "- **Valore della palette**: valore con cui il componente viene inserito dalla palette.",
    "- **—**: il parametro non ha un valore predefinito; dove la simulazione lo usa, il suo ruolo è spiegato in [calcoli.md](calcoli.md).",
    "",
  ];
  const categories = [...new Set(defs.map((d) => d.category))];
  out.push("## Indice", "");
  for (const cat of categories) {
    out.push(`- **${cat}**: ` + defs.filter((d) => d.category === cat).map((d) => `[${d.label}](#${d.type.replace(/_/g, "-")})`).join(", "));
  }
  for (const cat of categories) {
    out.push("", `## ${cat}`);
    for (const d of defs.filter((x) => x.category === cat)) {
      out.push("", `<a id="${d.type.replace(/_/g, "-")}"></a>`, "", `### ${d.label} · ${code(d.type)}`, "", d.doc.trim(), "",
        `**Porte**: ${ports(d)}.`);
      out.push(...options(d.options ?? []));
      out.push(...params(d.params, d.defaults));
      if (d.presets?.length) out.push("", `**Voci della palette**: ${d.presets.map((p) => p.label).join("; ")}.`);
    }
  }
  return out.join("\n") + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(COMPONENTS_FILE, componentReference());
  console.log(`scritto ${COMPONENTS_FILE}`);
}
