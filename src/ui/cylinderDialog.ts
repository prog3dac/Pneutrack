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
import { Quantity } from "../model/units";
import { geometry } from "./symbols";

export interface CylinderDialogOptions {
  comp: ComponentData;
  onApply(data: ComponentData): void;
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
  const footer = el("div", { class: "vc-footer" });
  dialog.append(header, body, footer);
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
    i.addEventListener("input", () => { cfg.params[name] = i.value; refresh(); });
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

  function render() { renderLeft(); renderRight(); refresh(); }

  apply.addEventListener("click", () => {
    refresh();
    if (!result) return;
    const out = result;
    close();
    opts.onApply(out);
  });

  document.body.append(overlay);
  render();
  desc.focus();
  return close;
}
