/**
 * Manuale d'uso dentro l'app: le tre parti di docs/manuale lette come testo al momento della build
 * (restano disponibili anche senza rete) e trasformate in HTML da un lettore Markdown ridotto, che conosce
 * solo quello che il manuale usa: titoli, paragrafi, elenchi, tabelle, blocchi di codice, `codice`,
 * **grassetto**, *corsivo*, collegamenti e ancore `<a id>`. Tutto il testo è sottoposto a escape.
 */
import README from "../../docs/manuale/README.md?raw";
import CALCOLI from "../../docs/manuale/calcoli.md?raw";
import COMPONENTI from "../../docs/manuale/componenti.md?raw";

export interface ManualPart { file: string; title: string; text: string }

export const MANUAL_PARTS: ManualPart[] = [
  { file: "README.md", title: "Uso e convenzioni", text: README },
  { file: "calcoli.md", title: "Come calcola la simulazione", text: CALCOLI },
  { file: "componenti.md", title: "Componenti e parametri", text: COMPONENTI },
];

/** documenti fuori dal manuale (../interfaccia.md...): si aprono su GitHub */
const DOCS_URL = "https://github.com/prog3dac/Pneutrack/blob/main/docs/";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Identificativo di un titolo, per i collegamenti interni («## 4. Cilindri» → "4-cilindri"). */
export function slug(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Destinazione di un collegamento: parte del manuale (con ancora), pagina esterna, o null se non ammessa. */
function linkTarget(href: string): { part?: string; anchor?: string; url?: string } | null {
  if (/^https?:\/\//.test(href)) return { url: href };
  const [path = "", anchor] = href.split("#");
  if (!path) return { anchor };
  if (MANUAL_PARTS.some((p) => p.file === path)) return { part: path, anchor };
  if (/^\.\.\/[\w.-]+\.md$/.test(path)) return { url: DOCS_URL + path.slice(3) };
  return null;
}

/** Testo in linea: escape, poi codice, grassetto, corsivo e collegamenti. */
export function inline(src: string): string {
  const codes: string[] = [];
  let s = src.replace(/`([^`]+)`/g, (_, c: string) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text: string, href: string) => {
    const t = linkTarget(href.replace(/&amp;/g, "&"));
    if (!t) return text;
    if (t.url) return `<a href="${t.url}" target="_blank" rel="noopener">${text}</a>`;
    return `<a href="#" data-manual-part="${esc(t.part ?? "")}" data-manual-anchor="${esc(t.anchor ?? "")}">${text}</a>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${esc(codes[Number(i)]!)}</code>`);
}

/** Celle di una riga di tabella `| a | b |` (il `\|` resta un carattere). */
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** HTML di un testo Markdown del manuale. */
export function renderManual(md: string): string {
  const lines = md.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t) { flush(); continue; }
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^<a id="([\w-]+)"><\/a>$/))) { flush(); out.push(`<a id="${m[1]}"></a>`); continue; }
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
      flush();
      const n = m[1]!.length;
      out.push(`<h${n} id="${slug(m[2]!)}">${inline(m[2]!)}</h${n}>`);
      continue;
    }
    if (t.startsWith("```")) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !lines[i]!.trim().startsWith("```")) code.push(lines[i]!);
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (t.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      for (; i < lines.length && lines[i]!.trim().startsWith("|"); i++) rows.push(cells(lines[i]!));
      i--;
      const body = rows.filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
      const [head, ...rest] = body;
      out.push("<div class=\"manual-table\"><table>" +
        (head ? `<tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>` : "") +
        rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + "</table></div>");
      continue;
    }
    if ((m = t.match(/^(-|\d+\.)\s+/))) {
      flush();
      const ordered = m[1] !== "-";
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const l = lines[i]!;
        const mm = l.trim().match(/^(-|\d+\.)\s+(.*)$/);
        if (mm && !/^\s{2,}/.test(l)) items.push(mm[2]!);
        else if (l.trim() && /^\s+/.test(l) && items.length) items[items.length - 1] += ` ${l.trim()}`;
        else if (mm) items[items.length - 1] += ` ${l.trim()}`;
        else break;
      }
      i--;
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(t);
  }
  flush();
  return out.join("\n");
}
