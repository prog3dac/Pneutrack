/**
 * Finestra del configuratore delle valvole distributrici: vie, caselle scelte dall'elenco ISO 1219-1, comandi
 * dei due lati (con un secondo comando manuale o meccanico), posizione iniziale, segnale dominante e portata,
 * con l'anteprima del simbolo e i passaggi di ogni posizione. Non tocca lo schema: restituisce la valvola
 * configurata a `onApply`, che la scrive (e la rende annullabile).
 */
import {
  ACTUATION_LABELS, ACTUATIONS, AUX_ACTUATIONS, buildComponent, isBistable, isElectric, isMechanical, isReturn,
  OVERRIDE_CHOICES, ParameterError, type Actuation, type ComponentData,
} from "../model/components";
import { applyValveConfig, defaultBoxes, valveConfigOf, type ValveConfig } from "../model/valveConfig";
import { boxPaths, boxPosition, CELLS, formatBox, parseBox, sameBox, WAYS, WAY_PORTS, type Ways } from "../model/valveBody";
import { geometry } from "./symbols";

export interface ValveDialogOptions {
  title: string;
  comp: ComponentData;
  applyLabel: string;
  /** nome proposto per la libreria «Le mie valvole»; con `saveDefault` la casella parte spuntata */
  saveDefault?: boolean;
  onApply(data: ComponentData, saveAs: string | null): void;
}

const POSITION_NAMES: Record<string, string> = { "14": "lato 14", "0": "centro (riposo)", "12": "lato 12" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function select(name: string, choices: [string, string][], value: string, label: string): HTMLSelectElement {
  const s = el("select", { name, "aria-label": label });
  for (const [v, t] of choices) {
    const o = el("option", { value: v }, t);
    s.append(o);
  }
  s.value = value;
  return s;
}

function row(label: string, control: HTMLElement): HTMLLabelElement {
  const l = el("label", { class: "vc-row" });
  l.append(el("span", {}, label), control);
  return l;
}

/** Apre la finestra. Restituisce la funzione che la chiude. */
export function openValveDialog(opts: ValveDialogOptions): () => void {
  const cfg: ValveConfig = valveConfigOf(opts.comp);
  const overlay = el("div", { class: "overlay vc-overlay" });
  const dialog = el("div", { class: "dialog wide vc-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "vc-title" });
  overlay.append(dialog);
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  };
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

  const header = el("header");
  const closeBtn = el("button", { class: "icon", "aria-label": "Chiudi" }, "✕");
  closeBtn.addEventListener("click", close);
  header.append(el("h2", { id: "vc-title" }, opts.title), closeBtn);
  const body = el("div", { class: "vc-body" });
  const footer = el("div", { class: "vc-footer" });
  dialog.append(header, body, footer);

  const left = el("fieldset", { class: "vc-side" });
  const mid = el("div", { class: "vc-mid" });
  const right = el("fieldset", { class: "vc-side" });
  body.append(left, mid, right);

  // --- footer -------------------------------------------------------------------------------
  const saveBox = el("input", { type: "checkbox", id: "vc-save" }) as HTMLInputElement;
  saveBox.checked = !!opts.saveDefault;
  const saveLabel = el("label", { class: "check", for: "vc-save" });
  saveLabel.append(saveBox, " Salva anche in «Le mie valvole»");
  const cancel = el("button", {}, "Annulla");
  cancel.addEventListener("click", close);
  const apply = el("button", { class: "primary" }, opts.applyLabel);
  footer.append(saveLabel, el("span", { class: "vc-spacer" }), cancel, apply);

  const actChoices: [string, string][] = ACTUATIONS.map((a) => [a, ACTUATION_LABELS[a]]);
  const auxChoices: [string, string][] = [["", "Nessuno"], ...AUX_ACTUATIONS.map((a): [string, string] => [a, ACTUATION_LABELS[a]])];

  function renderSide(fs: HTMLFieldSetElement, side: "14" | "12") {
    fs.replaceChildren(el("legend", {}, side === "14" ? "Lato sinistro (14)" : "Lato destro (12)"));
    const act = side === "14" ? cfg.act14 : cfg.act12;
    const main = select(`vc-act-${side}`, actChoices, act, `Comando lato ${side}`);
    main.addEventListener("change", () => {
      if (side === "14") cfg.act14 = main.value as Actuation; else cfg.act12 = main.value as Actuation;
      update();
    });
    fs.append(row("Comando o ritorno", main));
    const aux = select(`vc-aux-${side}`, auxChoices, side === "14" ? cfg.aux14 : cfg.aux12, `Secondo comando lato ${side}`);
    aux.disabled = isReturn(act);
    for (const o of aux.options) o.disabled = !!o.value && isMechanical(o.value as Actuation) && isMechanical(act);
    aux.addEventListener("change", () => {
      if (side === "14") cfg.aux14 = aux.value as Actuation | ""; else cfg.aux12 = aux.value as Actuation | "";
      update();
    });
    const auxRow = row("Secondo comando", aux);
    auxRow.title = isReturn(act) ? "Il lato con il ritorno non ha un secondo comando"
      : "Comando manuale o meccanico in più sullo stesso lato, disegnato sopra il primo";
    fs.append(auxRow);
  }

  // --- centro: descrizione, corpo, posizione iniziale, dominante, portata ---------------------
  const desc = el("input", { name: "vc-label", placeholder: "facoltativa, per esempio 5/2 elettropneumatica" }) as HTMLInputElement;
  desc.value = cfg.label;
  desc.addEventListener("input", () => { cfg.label = desc.value; update(false); });
  const ways = select("vc-ways", WAYS.map((w) => [String(w), `${w} vie`]), String(cfg.ways), "Vie");
  ways.title = "Porte: " + WAYS.map((w) => `${w} vie ${WAY_PORTS[w].map(([n]) => n).join(", ")}`).join("; ");
  const positions = select("vc-positions", [["2", "2 posizioni"], ["3", "3 posizioni"]], String(cfg.boxes.length), "Posizioni");
  ways.addEventListener("change", () => {
    cfg.ways = Number(ways.value) as Ways;
    cfg.boxes = defaultBoxes(cfg.ways, cfg.boxes.length);
    update();
  });
  positions.addEventListener("change", () => {
    cfg.boxes = defaultBoxes(cfg.ways, Number(positions.value));
    update();
  });
  const cells = el("div", { class: "vc-cells" });
  const extra = el("div", { class: "vc-extra" });
  const preview = el("div", { class: "vc-preview" });
  const msgs = el("ul", { class: "vc-msgs" });
  const table = el("table", { class: "vc-table" });
  const flow = el("input", { name: "vc-flow", placeholder: "es. 1000 l/min", inputmode: "decimal" }) as HTMLInputElement;
  flow.value = cfg.flow;
  flow.addEventListener("input", () => { cfg.flow = flow.value; update(false); });

  const head = el("div", { class: "vc-head" });
  head.append(row("Descrizione", desc), row("Vie", ways), row("Posizioni", positions));
  mid.append(head, el("div", { class: "vc-caption" }, "Caselle, da sinistra (lato 14) a destra (lato 12)"), cells,
    preview, extra, row("Portata nominale Qn", flow), msgs, table);

  function renderCells() {
    cells.replaceChildren();
    const list = CELLS[cfg.ways];
    cfg.boxes.forEach((text, i) => {
      const items = parseBox(text);
      const choices: [string, string][] = list.map((c) => [formatBox(c.items), c.label]);
      // una casella scritta a mano nel file che non è nell'elenco resta da scegliere
      if (!list.some((c) => sameBox(c.items, items))) choices.push([text, `personalizzata: ${text}`]);
      const known = list.find((c) => sameBox(c.items, items));
      const s = select(`vc-box-${i}`, choices, known ? formatBox(known.items) : text,
        `Casella ${i + 1}, ${POSITION_NAMES[boxPosition(i, cfg.boxes.length)]}`);
      s.addEventListener("change", () => { cfg.boxes[i] = s.value; update(); });
      const wrap = el("label", { class: "vc-cell" });
      wrap.append(el("span", {}, POSITION_NAMES[boxPosition(i, cfg.boxes.length)]!), s);
      cells.append(wrap);
    });
  }

  function renderExtra(data: ComponentData) {
    extra.replaceChildren();
    if (isBistable(data)) {
      const ini = el("div", { class: "vc-radios", role: "radiogroup", "aria-label": "Posizione iniziale" });
      ini.append(el("span", {}, "Posizione iniziale"));
      for (const side of ["14", "12"] as const) {
        const r = el("input", { type: "radio", name: "vc-initial", value: side }) as HTMLInputElement;
        r.checked = cfg.initial === side;
        r.addEventListener("change", () => { cfg.initial = side; update(false); });
        const l = el("label");
        l.append(r, ` casella ${side}`);
        ini.append(l);
      }
      extra.append(ini);
    }
    if (!isReturn(cfg.act14) && !isReturn(cfg.act12)) {
      const dom = select("vc-dominant", [["", "Nessuno"], ["14", "Lato 14"], ["12", "Lato 12"]], cfg.dominant, "Segnale dominante");
      dom.addEventListener("change", () => { cfg.dominant = dom.value as ValveConfig["dominant"]; update(false); });
      const r = row("Segnale dominante", dom);
      r.title = "Quando 14 e 12 sono comandati insieme vince questo lato; nel simbolo è marcato con «D»";
      extra.append(r);
    }
    if (isElectric(cfg.act14) || isElectric(cfg.act12)) {
      const ovr = select("vc-override", OVERRIDE_CHOICES, cfg.override, "Comando manuale ausiliario");
      ovr.addEventListener("change", () => { cfg.override = ovr.value as ValveConfig["override"]; update(false); });
      extra.append(row("Comando manuale ausiliario", ovr));
    }
  }

  let result: ComponentData | null = null;
  function update(full = true) {
    if (full) { renderSide(left, "14"); renderSide(right, "12"); renderCells(); }
    ways.value = String(cfg.ways);
    positions.value = String(cfg.boxes.length);
    const notes: [string, string][] = [];
    result = null;
    let data: ComponentData | null = null;
    try {
      data = applyValveConfig(opts.comp, cfg);
      // una valvola nuova non ha ancora la sigla: la riceve quando si inserisce
      buildComponent({ ...data, id: data.id || "V" });
      result = data;
    } catch (e) {
      notes.push(["error", e instanceof ParameterError || e instanceof Error ? e.message.replace(/^[^:]+: /, "") : String(e)]);
    }
    if (full || !data) renderExtra(data ?? opts.comp);
    apply.disabled = !result;
    const shown = data ?? opts.comp;
    const g = geometry(shown);
    const pad = 16;
    preview.innerHTML = `<svg class="symbol" viewBox="${-g.w / 2 - pad - 30} ${-g.h / 2 - pad - 10} ${g.w + 2 * pad + 60} ${g.h + 2 * pad + 20}"
      role="img" aria-label="Anteprima del simbolo">${g.svg}</svg>`;
    if (data) {
      const n = cfg.boxes.length;
      const kind = n === 3 ? "a tre posizioni, il centro è la posizione di riposo"
        : isBistable(data) ? "bistabile: resta dove l'ha portata l'ultimo comando" : "monostabile: il ritorno la riporta a riposo";
      notes.unshift(["", `Valvola ${data.function?.replace(/[EP]$/, "")} ${kind}.`]);
      if (data.boxes) notes.push(["", "Corpo personalizzato: nel file la valvola porta le sue caselle."]);
      const dupes = cfg.boxes.some((b, i) => cfg.boxes.some((c, j) => j > i && sameBox(parseBox(b), parseBox(c))));
      if (dupes) notes.push(["warn", "Due caselle uguali: una posizione non cambia nulla."]);
      if (data.dominant) notes.push(["", `Segnale dominante: con 14 e 12 insieme vince il lato ${data.dominant}.`]);
    }
    msgs.replaceChildren(...notes.map(([cls, t]) => el("li", cls ? { class: cls } : {}, t)));
    // passaggi di ogni posizione, come li vede la simulazione
    table.replaceChildren();
    try {
      const boxes = cfg.boxes.map(parseBox);
      const paths = boxPaths(boxes);
      const thead = el("tr");
      thead.append(el("th", {}, "Posizione"), el("th", {}, "Passaggi in simulazione"));
      table.append(thead);
      boxes.forEach((_, i) => {
        const pos = boxPosition(i, boxes.length);
        const tr = el("tr");
        const pairs = paths[pos] ?? [];
        tr.append(el("td", {}, POSITION_NAMES[pos]!), el("td", {}, pairs.length ? pairs.map(([a, b]) => `${a}–${b}`).join(", ") : "tutte chiuse"));
        table.append(tr);
      });
    } catch { /* caselle non leggibili: c'è già il messaggio */ }
  }

  apply.addEventListener("click", () => {
    if (!result) return;
    const name = saveBox.checked ? (cfg.label.trim() || result.function || "Valvola") : null;
    close();
    opts.onApply(result, name);
  });

  document.body.append(overlay);
  update();
  desc.focus();
  return close;
}
