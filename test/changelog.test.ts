import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_VERSION, parseChangelog } from "../src/ui/changelog";

describe("versioni dell'app", () => {
  it("la versione di package.json è la prima del registro delle modifiche", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const releases = parseChangelog();
    expect(APP_VERSION).toBe(pkg.version);
    expect(releases[0]!.version).toBe(pkg.version);
    expect(releases.every((r) => /^\d+\.\d+\.\d+$/.test(r.version) && r.notes.length > 0)).toBe(true);
  });

  it("legge versioni, date e note su più righe", () => {
    const r = parseChangelog("# T\n\nintro\n\n## 1.2.0 · 2026-01-02\n\n- uno\n  continua\n- due\n\n## 1.1.0 · 2026-01-01\n\n- zero\n");
    expect(r).toEqual([
      { version: "1.2.0", date: "2026-01-02", notes: ["uno continua", "due"] },
      { version: "1.1.0", date: "2026-01-01", notes: ["zero"] },
    ]);
  });
});
