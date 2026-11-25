/**
 * Versioni dell'app: il registro delle modifiche (CHANGELOG.md) letto come testo e
 * diviso in versioni, per la finestra "Novità".
 */
import CHANGELOG from "../../CHANGELOG.md?raw";

export interface Release { version: string; date: string; notes: string[] }

export const APP_VERSION: string = __APP_VERSION__;

/** Versioni dal registro, dalla più recente; ogni nota è una voce dell'elenco. */
export function parseChangelog(text: string = CHANGELOG): Release[] {
  return text.split(/^## /m).slice(1).map((block) => {
    const [head = "", ...lines] = block.split("\n");
    const [version = "", date = ""] = head.split("·").map((s) => s.trim());
    const notes: string[] = [];
    for (const line of lines) {
      if (line.startsWith("- ")) notes.push(line.slice(2).trim());
      else if (line.trim() && notes.length) notes[notes.length - 1] += ` ${line.trim()}`;
    }
    return { version, date, notes };
  });
}
