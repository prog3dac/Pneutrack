/**
 * Finestra del configuratore dei cilindri: tipo (semplice effetto in spinta o in trazione, doppio effetto,
 * stelo passante, senza stelo), molla, accoppiamento del carrello, ammortizzo, pistone magnetico, misure,
 * carico e profilo di forza lungo la corsa, con l'anteprima del simbolo, le forze teoriche e il grafico del
 * profilo. Non tocca lo schema: restituisce il cilindro configurato a `onApply`.
 */
import { buildComponent, cylinderInfo, CUSHIONING_CHOICES, profileForce, TYPES, type ComponentData, type Cushioning } from "../model/components";
import {
  applyCylinderConfig, CYLINDER_KINDS, cylinderConfigOf, isSingleKind, type CylinderConfig, type CylinderKind,
} from "../model/cylinderConfig";
import { STANDARD_BORES, STANDARD_RODS, STANDARD_STROKES } from "../model/cylinders";
import {
  fixedZone, linkChanges, linkedCylinder, rowAt, rowOf, rowPosition, rowProblem,
  type LinkChange, type LinkRow, type LinkTarget,
} from "../model/cylinderLinks";
import { fmtG, Quantity } from "../model/units";
import { geometry } from "./symbols";

export interface CylinderDialogOptions {
  comp: ComponentData;
  /** elementi dello schema che un cilindro può azionare (scheda Sensori e finecorsa) */
  targets?: LinkTarget[];
  /** scheda aperta all'inizio */
  tab?: "cylinder" | "links";
  /** elemento da aggiungere subito alla scheda (collegato dalle sue opzioni) */
  addKey?: string;
  /** solo la scheda Sensori e finecorsa (il cilindro è su un altro foglio) */
  linksOnly?: boolean;
  /** il cilindro configurato e le modifiche da riportare negli elementi che aziona */
  onApply(data: ComponentData, links: LinkChange[]): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}
function row(label: string, control: HTMLElement): HTMLLabelElement {
  const l = el("label", { class: "vc-row" });
  l.append(el("span", {}, label), control);
  return l;
}
function datalist(id: string, values: number[], unit: string): HTMLDataListElement {
  const d = el("datalist", { id });
  for (const v of values) d.append(el("option", { value: `${v} ${unit}` }));
  return d;
}

/** Apre la finestra. Restituisce la funzione che la chiude. */
export function openCylinderDialog(opts: CylinderDialogOptions): () => void {
  const cfg: CylinderConfig = cylinderConfigOf(opts.comp);
  const overlay = el("div", { class: "overlay vc-overlay" });
  const dialog = el("div", { class: "dialog wide vc-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "cc-title" });
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
  header.append(el("h2", { id: "cc-title" }, `Configura cilindro ${opts.comp.id}`), closeBtn);
  const body = el("div", { class: "vc-body" });
  const links = el("div", { class: "cc-links" });
  const footer = el("div", { class: "vc-footer" });
  const tabs = el("div", { class: "cc-tabs", role: "tablist" });
  const tabCyl = el("button", { type: "button", role: "tab", class: "cc-tab", "data-tab": "cylinder" }, "Cilindro");
  const tabLinks = el("button", { type: "button", role: "tab", class: "cc-tab", "data-tab": "links" }, "Sensori e finecorsa");
  tabs.append(tabCyl, tabLinks);
  dialog.append(header, tabs, body, links, footer);
  let tab: "cylinder" | "links" = opts.linksOnly ? "links" : opts.tab ?? "cylinder";
  function showTab(t: "cylinder" | "links") {
    tab = t;
    body.hidden = t !== "cylinder";
    links.hidden = t !== "links";
    tabCyl.classList.toggle("on", t === "cylinder");
    tabLinks.classList.toggle("on", t === "links");
    tabCyl.setAttribute("aria-selected", String(t === "cylinder"));
    tabLinks.setAttribute("aria-selected", String(t === "links"));
  }
  tabCyl.disabled = !!opts.linksOnly;
  if (opts.linksOnly) tabCyl.title = "Il cilindro è su un altro foglio: qui si modificano solo sensori e finecorsa";
  tabCyl.addEventListener("click", () => showTab("cylinder"));
  tabLinks.addEventListener("click", () => showTab("links"));
  const left = el("fieldset", { class: "vc-side" });
  const mid = el("div", { class: "vc-mid" });
  const right = el("fieldset", { class: "vc-side" });
  body.append(left, mid, right);
  body.append(datalist("cc-bores", STANDARD_BORES, "mm"), datalist("cc-rods", STANDARD_RODS, "mm"),
    datalist("cc-strokes", STANDARD_STROKES, "mm"));

  const cancel = el("button", {}, "Annulla");
  cancel.addEventListener("click", close);
  const apply = el("button", { class: "primary" }, "Applica");
  footer.append(el("span", { class: "vc-spacer" }), cancel, apply);

  const desc = el("input", { name: "cc-label", placeholder: "facoltativa" }) as HTMLInputElement;
  desc.value = cfg.label;
  desc.addEventListener("input", () => { cfg.label = desc.value; refresh(); });
  const preview = el("div", { class: "vc-preview" });
  const chart = el("div", { class: "cc-chart" });
  const msgs = el("ul", { class: "vc-msgs" });
  mid.append(row("Descrizione", desc), preview, chart, msgs);

  function renderLeft() {
    left.replaceChildren(el("legend", {}, "Tipo di cilindro"));
    for (const [k, label] of CYLINDER_KINDS) {
      const r = el("input", { type: "radio", name: "cc-kind", value: k }) as HTMLInputElement;
      r.checked = cfg.kind === k;
      r.addEventListener("change", () => { cfg.kind = k as CylinderKind; render(); });
      const l = el("label", { class: "cc-radio" });
      l.append(r, ` ${label}`);
      left.append(l);
      if (k === "single_pull" && isSingleKind(cfg.kind)) {
        const s = el("input", { type: "checkbox", name: "cc-spring" }) as HTMLInputElement;
        s.checked = cfg.spring;
        s.addEventListener("change", () => { cfg.spring = s.checked; render(); });
        const sl = el("label", { class: "cc-radio cc-sub" });
        sl.append(s, " Ritorno a molla");
        left.append(sl);
      }
      if (k === "rodless" && cfg.kind === "rodless") {
        for (const [v, t] of [["slide", "Carrello meccanico"], ["magnetic", "Accoppiamento magnetico"]] as const) {
          const c = el("input", { type: "radio", name: "cc-coupling", value: v }) as HTMLInputElement;
          c.checked = cfg.coupling === v;
          c.addEventListener("change", () => { cfg.coupling = v; render(); });
          const cl = el("label", { class: "cc-radio cc-sub" });
          cl.append(c, ` ${t}`);
          left.append(cl);
        }
      }
    }
  }

  function param(name: string, label: string, list = "", placeholder = "") {
    const i = el("input", { name: `cc-${name}`, spellcheck: "false" }) as HTMLInputElement;
    if (list) i.setAttribute("list", list);
    i.placeholder = placeholder;
    i.value = cfg.params[name] ?? "";
    i.addEventListener("input", () => { cfg.params[name] = i.value; refresh(); if (name === "stroke") renderLinks(); });
    return row(label, i);
  }

  function renderRight() {
    right.replaceChildren(el("legend", {}, "Proprietà e misure"));
    const def = TYPES.get(applyCylinderConfig(opts.comp, cfg).type)!;
    const has = (n: string) => def.params.some((p) => p.name === n);
    if (!isSingleKind(cfg.kind)) {
      const cu = el("select", { name: "cc-cushioning" }) as HTMLSelectElement;
      for (const [v, t] of CUSHIONING_CHOICES) cu.append(el("option", { value: v }, t));
      cu.value = cfg.cushioning;
      cu.addEventListener("change", () => { cfg.cushioning = cu.value as Cushioning; render(); });
      right.append(row("Ammortizzo", cu));
    }
    const mg = el("input", { type: "checkbox", name: "cc-magnet" }) as HTMLInputElement;
    mg.checked = cfg.magnet;
    mg.addEventListener("change", () => { cfg.magnet = mg.checked; refresh(); });
    const ml = el("label", { class: "cc-radio" });
    ml.append(mg, " Pistone magnetico (sensori)");
    right.append(ml);
    right.append(param("bore", "Alesaggio *", "cc-bores", "es. 32 mm"));
    if (has("rod")) right.append(param("rod", cfg.kind === "double_rod" ? "Diametro stelo *" : "Diametro stelo", "cc-rods", "es. 12 mm"));
    if (has("rod2")) right.append(param("rod2", "Secondo stelo", "cc-rods", "uguale allo stelo"));
    right.append(param("stroke", "Corsa *", "cc-strokes", "es. 100 mm"));
    if (!isSingleKind(cfg.kind) && cfg.cushioning !== "none") right.append(param("cushion_length", "Lunghezza ammortizzo", "", "≈ 0,6 × alesaggio"));
    right.append(param("mass", "Massa mobile", "", "predefinita"));
    if (isSingleKind(cfg.kind) && cfg.spring) right.append(param("spring_force", "Forza molla", "", "predefinita 15 N"));
    right.append(param("mounting_angle", "Angolo di montaggio", "", "0 deg: orizzontale"));
    const load = param("load", "Carico costante", "", "0 N");
    if (cfg.profile.length) {
      load.querySelector("input")!.disabled = true;
      load.title = "Con il profilo di forza il carico costante non conta";
    }
    right.append(load);
    right.append(el("div", { class: "vc-caption" }, "Profilo di forza lungo la corsa (posizione dal fondello, forza contro l'uscita)"));
    cfg.profile.forEach((r, i) => {
      const line = el("div", { class: "cc-prow" });
      const x = el("input", { "aria-label": `Posizione ${i + 1}`, placeholder: "mm" }) as HTMLInputElement;
      const f = el("input", { "aria-label": `Forza ${i + 1}`, placeholder: "N" }) as HTMLInputElement;
      x.value = r[0]; f.value = r[1];
      x.addEventListener("input", () => { r[0] = x.value; refresh(); });
      f.addEventListener("input", () => { r[1] = f.value; refresh(); });
      const rm = el("button", { class: "icon", "aria-label": `Togli il punto ${i + 1}` }, "×");
      rm.addEventListener("click", () => { cfg.profile.splice(i, 1); render(); });
      line.append(x, f, rm);
      right.append(line);
    });
    const add = el("button", { type: "button" }, "Aggiungi punto");
    add.addEventListener("click", () => {
      const stroke = cfg.params.stroke ?? "";
      cfg.profile.push(cfg.profile.length ? [stroke.replace(/\s*mm$/, ""), cfg.profile[cfg.profile.length - 1]![1]] : ["0", "0"]);
      render();
    });
    right.append(add);
  }

  let result: ComponentData | null = null;
  function refresh() {
    const notes: [string, string][] = [];
    const data = applyCylinderConfig(opts.comp, cfg);
    result = null;
    let built: ReturnType<typeof buildComponent> | null = null;
    try {
      built = buildComponent({ ...data, id: data.id || "C" });
      result = data;
    } catch (e) {
      notes.push(["error", (e as Error).message.replace(/^[^:]+: /, "")]);
    }
    apply.disabled = !result;
    const g = geometry(data);
    preview.innerHTML = `<svg class="symbol" viewBox="${-g.w / 2 - 20} ${-g.h / 2 - 16} ${g.w + 40} ${g.h + 32}"
      role="img" aria-label="Anteprima del simbolo">${g.svg}</svg>`;
    if (built) {
      const info = cylinderInfo(built, Quantity.parse("6 bar"));
      if (info) {
        const pull = data.single_kind === "pull";
        notes.push(["", cfg.kind === "single_push" ? `A 6 bar spinge con ${info.forceExtend}, meno la molla.`
          : pull ? `A 6 bar tira con ${info.forceRetract}, meno la molla.`
          : `A 6 bar: ${info.forceExtend} in uscita, ${info.forceRetract} in rientro.`]);
      }
      if (isSingleKind(cfg.kind) && !cfg.spring) notes.push(["warn", "Senza molla torna indietro solo se lo spinge il carico o la gravità."]);
      if (cfg.kind === "single_pull" && cfg.spring) notes.push(["", "A riposo lo stelo è fuori: la molla lo spinge, l'aria in A lo fa rientrare."]);
    }
    msgs.replaceChildren(...notes.map(([cls, t]) => el("li", cls ? { class: cls } : {}, t)));
    drawProfile(built?.loadProfile, built?.params.stroke?.si);
  }

  function drawProfile(profile: [number, number][] | undefined, stroke: number | undefined) {
    if (!profile || !stroke) { chart.replaceChildren(); return; }
    const W = 320, H = 110, L = 44, B = 20;
    const fs = profile.map(([, f]) => f);
    const fmax = Math.max(1, ...fs), fmin = Math.min(0, ...fs);
    const X = (x: number) => L + ((W - L - 8) * x) / stroke;
    const Y = (f: number) => 8 + ((H - B - 8) * (fmax - f)) / (fmax - fmin || 1);
    let d = "";
    for (let i = 0; i <= 40; i++) {
      const x = (stroke * i) / 40;
      d += `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(profileForce(profile, x)).toFixed(1)}`;
    }
    chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Profilo di forza">
      <line x1="${L}" y1="${Y(0)}" x2="${W - 8}" y2="${Y(0)}" class="cc-axis"/>
      <line x1="${L}" y1="8" x2="${L}" y2="${H - B}" class="cc-axis"/>
      <path d="${d}" class="cc-line"/>
      ${profile.map(([x, f]) => `<circle cx="${X(x)}" cy="${Y(f)}" r="3" class="cc-dot"/>`).join("")}
      <text x="${L - 4}" y="${Y(fmax) + 4}" text-anchor="end">${Math.round(fmax)} N</text>
      <text x="${L - 4}" y="${Y(0) + 4}" text-anchor="end">0</text>
      <text x="${L}" y="${H - 4}">0</text>
      <text x="${W - 8}" y="${H - 4}" text-anchor="end">${Math.round(stroke * 1000)} mm</text></svg>`;
  }


  // --- scheda Sensori e finecorsa ---------------------------------------------------------
  const cylId = opts.comp.id;
  const targets = opts.targets ?? [];
  const targetOf = new Map(targets.map((t) => [t.key, t]));
  const before: LinkRow[] = targets.filter((t) => linkedCylinder(t) === cylId).map(rowOf);
  const rows: LinkRow[] = before.map((r) => ({ ...r }));
  if (opts.addKey && targetOf.has(opts.addKey) && !rows.some((r) => r.key === opts.addKey)) {
    rows.push({ ...rowOf({ ...targetOf.get(opts.addKey)!, cam: undefined, position: undefined }) });
  }

  /** corsa del cilindro come scritta nella scheda Cilindro [m] */
  function strokeNow(): number | undefined {
    const v = (cfg.params.stroke ?? "").trim();
    if (!v) return undefined;
    try {
      const q = /^[\d.,]+$/.test(v) ? Quantity.of(parseFloat(v.replace(",", ".")), "mm") : Quantity.parse(v);
      return q.dimension === "length" && q.si > 0 ? q.si : undefined;
    } catch { return undefined; }
  }

  function linksCount() {
    tabLinks.textContent = "Sensori e finecorsa";
    if (rows.length) tabLinks.append(el("span", { class: "cc-count" }, String(rows.length)));
  }

  /** Corsa con i punti in cui intervengono gli elementi. */
  function strip(stroke: number | undefined): HTMLElement {
    const box = el("div", { class: "cc-strip" });
    if (!stroke) { box.append(el("p", { class: "help" }, "Indica la corsa nella scheda Cilindro per vedere le quote.")); return box; }
    const W = 760, L = 80, R = 80, X = (x: number) => L + ((W - L - R) * Math.min(x, stroke * 1.15)) / stroke;
    const marks = new Map<number, { names: string[]; bad: boolean; end: boolean }>();
    for (const r of rows) {
      const x = rowPosition(r, stroke);
      if (x === null) continue;
      const k = Math.round(x * 1e4);
      const m = marks.get(k) ?? { names: [], bad: false, end: r.mode !== "at" };
      m.names.push(r.key);
      m.bad ||= x > stroke * (1 + 1e-9);
      marks.set(k, m);
    }
    // righello della corsa: dal fondello (0) a tutto fuori, con le tacche ogni quarto
    let svg = `<line x1="${L}" y1="22" x2="${W - R}" y2="22" class="cc-axis-line"/>` +
      `<text x="${L - 8}" y="26" text-anchor="end">fondello 0</text>` +
      `<text x="${W - R + 8}" y="26">${fmtG(Number((stroke * 1000).toFixed(3)))} mm</text>`;
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      svg += `<line x1="${X(stroke * f)}" y1="16" x2="${X(stroke * f)}" y2="28" class="cc-axis-line"/>`;
    }
    for (const [k, m] of marks) {
      const x = X(k / 1e4);
      const cls = m.bad ? "bad" : m.end ? "end" : "mid";
      svg += `<circle cx="${x}" cy="22" r="4" class="cc-dot-m ${cls}"/>` +
        `<line x1="${x}" y1="28" x2="${x}" y2="38" class="cc-mark ${cls}"/>` +
        `<text x="${x}" y="50" text-anchor="middle" class="cc-mark-t ${cls}">${m.names.map(escapeXml).join(" · ")}</text>`;
    }
    box.innerHTML = `<svg viewBox="0 0 ${W} 58" role="img" aria-label="Quote sulla corsa">${svg}</svg>`;
    return box;
  }

  function renderLinks() {
    const stroke = strokeNow();
    links.replaceChildren(strip(stroke));
    linksCount();
    if (!targets.length) {
      links.append(el("p", { class: "help" }, "Nello schema non ci sono finecorsa, sensori o valvole con comando meccanico."));
      return;
    }
    const table = el("table", { class: "vc-table cc-ltable" });
    const head = el("tr");
    for (const h of ["Elemento dello schema", "Quota dal fondello", "", "Interviene", "Tolleranza (±)", ""]) head.append(el("th", {}, h));
    table.append(el("thead"));
    table.tHead!.append(head);
    const tbody = el("tbody");
    table.append(tbody);
    rows.forEach((r, i) => {
      const t = targetOf.get(r.key)!;
      const tr = el("tr", { "data-key": r.key });
      // elemento: si può passare a un altro elemento libero
      const who = el("select", { "aria-label": `Elemento ${i + 1}` }) as HTMLSelectElement;
      for (const o of targets) {
        const other = linkedCylinder(o);
        if (o.key !== r.key && (rows.some((x) => x.key === o.key))) continue;
        const note = other && other !== cylId ? ` (ora su ${other})` : "";
        who.append(el("option", { value: o.key }, o.label + note));
      }
      who.value = r.key;
      who.addEventListener("change", () => { rows[i] = { ...rowOf({ ...targetOf.get(who.value)!, cam: undefined, position: undefined }), mode: r.mode, at: r.at }; renderLinks(); });
      // quota
      const mode = el("select", { "aria-label": `Quota ${i + 1}` }) as HTMLSelectElement;
      mode.append(el("option", { value: "-" }, `Fine corsa in rientro (${cylId}−)`),
                  el("option", { value: "+" }, `Fine corsa in uscita (${cylId}+)`),
                  el("option", { value: "at" }, "Quota in mm"));
      mode.value = r.mode;
      mode.addEventListener("change", () => {
        r.mode = mode.value as LinkRow["mode"];
        if (r.mode === "at" && !r.at) r.at = stroke ? String(Math.round(stroke * 500)) : "";
        renderLinks();
      });
      const quota = el("div", { class: "cc-quota" });
      quota.append(mode);
      if (r.mode === "at") {
        const at = el("input", { "aria-label": `Quota in mm ${i + 1}`, class: "cc-num", inputmode: "decimal" }) as HTMLInputElement;
        at.value = r.at;
        at.addEventListener("change", () => { r.at = at.value.trim(); renderLinks(); });
        quota.append(at, el("span", { class: "cc-unit" }, "mm"));
      }
      const pos = stroke ? rowPosition(r, stroke) : null;
      const pct = el("td", { class: "cc-pct" }, pos !== null && stroke ? `${Math.round((pos / stroke) * 100)} %` : "");
      // verso
      const dirTd = el("td");
      if (t.kind === "oneway" && r.mode === "at") {
        const dir = el("select", { "aria-label": `Verso ${i + 1}` }) as HTMLSelectElement;
        dir.append(el("option", { value: "+" }, "Solo in uscita"), el("option", { value: "-" }, "Solo in rientro"),
                   el("option", { value: "" }, "In entrambi i versi"));
        dir.value = r.dir;
        dir.addEventListener("change", () => { r.dir = dir.value as LinkRow["dir"]; renderLinks(); });
        dirTd.append(dir);
      } else {
        dirTd.append(el("span", { class: "cc-fixed" }, t.kind === "oneway"
          ? (r.mode === "+" ? "solo in uscita (leva)" : "solo in rientro (leva)") : "in entrambi i versi"));
      }
      // tolleranza
      const tolTd = el("td");
      if (t.kind === "sensor") {
        const rg = el("input", { "aria-label": `Campo di rilevamento ${i + 1}`, class: "cc-num", placeholder: "3" }) as HTMLInputElement;
        rg.value = r.range.replace(/\s*mm$/, "");
        rg.addEventListener("change", () => { r.range = rg.value.trim(); renderLinks(); });
        tolTd.append(rg, el("span", { class: "cc-unit" }, "mm"));
      } else {
        tolTd.append(el("span", { class: "cc-fixed" }, fixedZone(t.kind, r)));
      }
      const rm = el("button", { type: "button", class: "icon", "aria-label": `Scollega ${r.key}` }, "×");
      rm.addEventListener("click", () => { rows.splice(i, 1); renderLinks(); });
      const whoTd = el("td"); whoTd.append(who);
      const qTd = el("td"); qTd.append(quota);
      const rmTd = el("td"); rmTd.append(rm);
      tr.append(whoTd, qTd, pct, dirTd, tolTd, rmTd);
      tbody.append(tr);
      const problem = rowProblem(r, stroke);
      if (problem) {
        tr.classList.add("invalid");
        const pr = el("tr", { class: "invalid" });
        pr.append(el("td", { colspan: "6", class: "cc-problem" }, `${r.key}: ${problem}`));
        tbody.append(pr);
      }
    });
    links.append(table);
    const free = targets.filter((t) => !rows.some((r) => r.key === t.key));
    const foot = el("div", { class: "cc-lfoot" });
    if (free.length) {
      const add = el("select", { "aria-label": "Aggiungi elemento", class: "cc-add" }) as HTMLSelectElement;
      add.append(el("option", { value: "" }, "+ Aggiungi elemento…"));
      // prima i liberi, poi quelli azionati da altri cilindri
      for (const t of [...free.filter((x) => !x.cam), ...free.filter((x) => x.cam)]) {
        const other = linkedCylinder(t);
        add.append(el("option", { value: t.key }, t.label + (other ? ` (ora su ${other})` : "")));
      }
      add.addEventListener("change", () => {
        const t = targetOf.get(add.value);
        if (!t) return;
        rows.push(rowOf({ ...t, cam: undefined, position: undefined }));
        renderLinks();
      });
      foot.append(add);
    }
    foot.append(el("span", { class: "help" },
      "Un elemento è azionato da un solo cilindro: aggiungendone uno già su un altro cilindro, passa a questo."));
    links.append(foot);
    links.append(el("p", { class: "help" },
      "Le quote «Fine corsa» seguono la corsa quando cambia; le quote in mm restano dove sono. " +
      "Il rullo è premuto negli ultimi 2 mm di corsa, la leva unidirezionale negli ultimi 5 mm; una camma a una " +
      "quota intermedia preme il rullo per ±2 mm. Il sensore rileva il pistone entro il suo campo."));
  }

  function render() { renderLeft(); renderRight(); refresh(); renderLinks(); }

  apply.addEventListener("click", () => {
    refresh();
    if (!result) return;
    const out = result;
    // le righe con la quota illeggibile restano come erano
    const changes = linkChanges(cylId, targets, before, rows.filter((r) => r.mode !== "at" || rowAt(r) !== null));
    close();
    opts.onApply(out, changes);
  });

  document.body.append(overlay);
  render();
  showTab(tab);
  if (tab === "cylinder") desc.focus(); else links.querySelector<HTMLElement>("select, input")?.focus();
  return close;
}

const escapeXml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
