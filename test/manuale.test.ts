// Il manuale d'uso (docs/manuale) resta allineato al software.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { typeList } from "../src/model/components";
import { COMPONENTS_FILE, componentReference } from "../tools/manuale";

const read = (name: string) => readFileSync(new URL(`../docs/manuale/${name}`, import.meta.url), "utf8");

describe("manuale d'uso", () => {
  it("il riferimento dei componenti corrisponde al catalogo (rigeneralo con npm run manuale)", () => {
    expect(readFileSync(COMPONENTS_FILE, "utf8")).toBe(componentReference());
  });

  it("descrive come si simula ogni tipo di componente pneumatico", () => {
    const text = read("calcoli.md");
    const missing = typeList().filter((d) => d.domain !== "electric" && !d.hidden && !text.includes(`\`${d.type}\``));
    expect(missing.map((d) => d.type)).toEqual([]);
  });

  it("descrive le regole dei componenti elettrici", () => {
    const text = read("calcoli.md");
    const missing = typeList().filter((d) => d.domain === "electric" && !d.hidden && !text.includes(`\`${d.type}\``));
    expect(missing.map((d) => d.type)).toEqual([]);
  });

  it("è rivisto per la versione corrente dell'app", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(read("README.md")).toContain(`Aggiornato alla versione **${pkg.version}**`);
  });
});
