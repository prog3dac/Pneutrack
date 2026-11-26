/**
 * Catalogo dei simboli: tutti i componenti della palette, con le varianti, la descrizione
 * del componente, la lettura del simbolo e le porte. Generato dagli stessi dati dell'editor,
 * così un componente nuovo compare qui senza altro lavoro.
 */
import {
  ACTUATIONS, ACTUATION_LABELS, isReturn, typeList, type ComponentData, type PortKind, type TypeDef,
} from "../model/components";
import { geometry } from "./symbols";

/** Come si legge il simbolo (pneumatici: ISO 1219-1; elettrici: CEI EN 60617). */
export const SYMBOL_NOTES: Record<string, string> = {
  pressure_source: "Triangolo vuoto con la punta sulla linea: sorgente di energia pneumatica (il triangolo vuoto indica l'aria, quello pieno l'olio).",
  air_reservoir: "Rettangolo con i lati corti arrotondati, disteso: serbatoio d'aria.",
  air_filter: "Rombo (elemento di trattamento) con il tratteggio della cartuccia perpendicolare al flusso; in basso il separatore di condensa con scarico manuale.",
  lubricator: "Rombo attraversato dalla linea di flusso, con il tubo di pescaggio che scende dal vertice superiore.",
  frl_unit: "Filtro, riduttore con manometro e lubrificatore racchiusi da una linea a tratto e punto, che delimita un gruppo montato come unità unica.",
  pressure_regulator: "Casella con freccia in linea con le porte (valvola normalmente aperta), molla regolabile (freccia obliqua) e pilotaggio tratteggiato dall'uscita sul lato opposto alla molla.",
  pressure_gauge: "Cerchio con freccia obliqua: strumento di misura della pressione.",
  silencer: "Triangolo di scarico con l'elemento silenziatore.",
  exhaust: "Triangolo vuoto con la punta sulla linea: uscita d'aria in atmosfera, senza raccordo.",
  junction: "Pallino pieno: le linee che si incrociano qui sono collegate. Senza pallino, due linee che si incrociano non sono collegate.",
  plug: "Tratto trasversale in fondo alla linea: porta chiusa con un tappo.",
  directional_valve: "Una casella per ogni posizione; le frecce indicano i passaggi, la T le porte chiuse. Le linee esterne sono disegnate sulla casella di riposo. Ai lati, i comandi che portano in ciascuna posizione; il pulsante oltre il solenoide è il comando manuale ausiliario, con la tacca se ha l'arresto.",
  check_valve: "Sfera appoggiata nella sede a V: il flusso passa solo dal vertice della sede verso la sfera. Con la molla, la molla sta sulla linea sopra la sfera e la preme sulla sede (ISO 1219-1 X10700).",
  pilot_check_valve: "Non ritorno racchiuso in una casella, con il pilotaggio tratteggiato che solleva la sfera dalla sede.",
  shuttle_valve: "Casella con una sede a ciascun ingresso e una sfera tra le due: l'uscita prende l'aria dall'ingresso a pressione maggiore (funzione O).",
  and_valve: "Casella con un otturatore tra due sedi: l'uscita è in pressione solo se lo sono entrambi gli ingressi (funzione E).",
  quick_exhaust_valve: "Casella con la sfera appoggiata alla sede dell'alimentazione 1 e una seconda sede verso lo scarico 3: quando 1 si svuota, 2 scarica direttamente da 3.",
  flow_control_valve: "Due archi che restringono la linea (strozzamento) attraversati dalla freccia obliqua di regolazione.",
  one_way_flow_control: "Strozzatore regolabile in parallelo a un non ritorno, racchiusi da una cornice a tratto e punto perché stanno nello stesso corpo: strozza in un verso, nell'altro l'aria passa libera dalla valvola di ritegno.",
  relief_valve: "Casella con freccia spostata rispetto alle porte (normalmente chiusa), molla regolabile e pilotaggio dall'ingresso sul lato opposto alla molla.",
  sequence_valve: "Valvola 3/2 normalmente chiusa comandata da un pilotaggio che agisce contro una molla tarabile: commuta alla pressione impostata.",
  time_delay_valve: "Valvola 3/2 normalmente chiusa pilotata attraverso uno strozzatore e un piccolo serbatoio: commuta con ritardo.",
  single_acting_cylinder: "Rettangolo (camicia), linea spessa (pistone) e stelo; la molla occupa la camera stelo e riporta indietro il pistone. Una sola porta; il triangolo sotto la camera stelo è lo sfiato in atmosfera senza raccordo.",
  double_acting_cylinder: "Camicia, pistone e stelo, con una porta per camera. Con l'ammortizzo: tampone sul pistone e freccia obliqua di regolazione sulla testata. Con il pistone magnetico: due piccoli rettangoli pieni sul bordo del pistone.",
  double_rod_cylinder: "Cilindro a doppio effetto con lo stelo che esce dai due lati.",
  rotary_actuator: "Cerchio con freccia curva a due punte: attuatore rotante ad angolo limitato, nei due versi.",
  air_motor: "Cerchio con due triangoli vuoti rivolti verso l'interno (l'energia entra) e albero sul lato: motore pneumatico a due sensi di rotazione.",
  shutoff_valve: "Due triangoli con i vertici affacciati sulla linea (ISO 1219-1 8.7.23): rubinetto di intercettazione, con la leva di comando. In simulazione, chiuso, la leva è di traverso e un tratto spesso sbarra il passaggio.",
  lockout_valve: "Valvola 3/2 con leva ad arresto e lucchetto sopra il comando (ISO 1219-1 X10260): aperta alimenta 2 da 1; chiusa, la molla la porta nello scarico 2→3 e il lucchetto la blocca.",
  quick_coupling: "Ogni metà ha una punta rivolta verso l'altra e, oltre la punta, il tratto della faccia di accoppiamento: staccate, le facce sono separate e la linea è interrotta; innestate, la linea è continua con un solo tratto al centro. Nella metà con la valvola di non ritorno la sfera sta dentro la punta (ISO 1219-1 X11690–X11740).",
  double_pilot_check: "Due non ritorno racchiuse nello stesso corpo, con il pilotaggio tratteggiato a croce: la pressione su una linea apre il ritorno dell'altra (ISO 1219-1 X10730).",
  fixed_orifice: "Due archi che restringono la linea, senza freccia: strozzatore fisso, non regolabile (come nella ISO 1219-3, all. C).",
  soft_start_valve: "Valvola 2/2 normalmente chiusa pilotata dall'uscita contro una molla, con lo strozzatore regolabile di riempimento in parallelo; la cornice a tratto e punto indica un solo corpo (ISO 1219-1 X10250).",
  rodless_cylinder: "Canna chiusa ai due lati con il pistone che trascina il carrello disegnato sopra la canna (ISO 1219-1 X11480, 8.4.16).",
  gripper: "Corpo della pinza con le due griffe parallele in alto, che si chiudono verso il centro; nella pinza a semplice effetto la molla nel corpo riapre le griffe (ISO 1219-1 X11630–X11660).",
  vacuum_ejector: "Casella con l'ugello convergente e il diffusore tra l'alimentazione 1 e lo scarico 3; la freccia indica l'aria aspirata dalla porta del vuoto 2 (ISO 1219-1 X12380).",
  suction_cup: "Campana aperta verso il pezzo, con il bordo di tenuta (ISO 1219-1 X12420).",
  compressor: "Cerchio con il triangolo vuoto rivolto verso l'esterno, sulla mandata, e l'albero del motore (ISO 1219-1 X11380).",
  vacuum_pump: "Cerchio con il triangolo vuoto rivolto verso lo scarico e l'aspirazione in alto: pompa del vuoto (ISO 1219-1 X12370).",
  filter_regulator: "Filtro con lo scarico della condensa e riduttore con la molla regolabile nello stesso corpo: cornice continua, perché è un componente solo con due funzioni (ISO 1219-1 5.9).",
  air_dryer: "Rombo dell'elemento di trattamento con i due triangoli pieni dell'essiccante (ISO 1219-1 X12300).",
  three_way_cock: "Tre triangoli con i vertici al centro: rubinetto a tre vie. La leva indica l'uscita aperta; in simulazione si sposta da 2 a 4 con un clic.",
  flexible_hose: "Linea curva tra le due porte: tubo flessibile (ISO 1219-1 X10630).",
  rotary_joint: "Due cerchi concentrici sulla linea: giunto rotante a una via (ISO 1219-1 X11680).",
  manifold: "Canale comune con i punti di connessione delle uscite: basetta di distribuzione, come nei moduli dei simboli della ISO 1219-3.",
  sheet_reference: "Freccia in fondo alla linea: la linea prosegue nel rimando con lo stesso nome, su un altro foglio o altrove nello schema.",
  roller_flow_control: "Strozzatore regolabile sulla linea con il rullo che lo chiude e la molla che lo riapre: strozzatore a comando meccanico (ISO 1219-1 X10660).",
  relieving_regulator: "Casella con la freccia 1 → 2 e la freccia dello scarico 2 → 3, il pilotaggio dall'uscita e la molla regolabile: riduttore a tre vie con scarico (ISO 1219-1 X10520).",
  piloted_regulator: "Casella del riduttore con il pilotaggio esterno 12 al posto della molla: la pressione del pilotaggio dà la taratura (ISO 1219-1 X10540).",
  proportional_regulator: "Riduttore a tre vie con il solenoide proporzionale (rettangolo con la freccia obliqua) al posto della molla (ISO 1219-1 X10560).",
  pressure_intensifier: "Camera grande e camera piccola con il pistone comune: l'aria sulla superficie grande spinge l'uscita a una pressione più alta (ISO 1219-1 X11590).",
  locking_cylinder: "Cilindro a doppio effetto con l'unità di bloccaggio sulla testata: i due ceppi pieni stringono lo stelo, il pilotaggio tratteggiato L li apre (ISO 1219-1 X11580).",
  end_lock_cylinder: "Cilindro a doppio effetto con l'aggancio pieno nel fondello, che trattiene il pistone a riposo.",
  bellows_cylinder: "Pieghe del soffietto tra il fondo fisso e il piatto mobile (ISO 1219-1 X11610).",
  diaphragm_cylinder: "Camicia con la membrana curva al posto del pistone e la molla di ritorno.",
  pneumatic_muscle: "Tubo con la calza intrecciata (tratti incrociati): muscolo pneumatico, che si accorcia quando è in pressione.",
  pressure_sensor: "Riquadro con la lettera P e l'uscita del segnale: trasduttore di pressione con uscita analogica (ISO 1219-1 X11780).",
  pressure_indicator: "Ottico: cerchio con la croce (ISO 1219-1 X11820); digitale: display; acustico: tromba. In simulazione si accende quando c'è pressione.",
  flow_meter: "Cerchio sulla linea con la freccia del flusso: misuratore di portata (ISO 1219-1 X11850).",
  differential_gauge: "Strumento di misura con due attacchi: manometro differenziale (ISO 1219-1 X11800).",
  thermometer: "Cerchio con il bulbo del termometro (ISO 1219-1 X11830).",
  electric_supply: "Tratto lungo (+) e tratto corto spesso (0V): sorgente in corrente continua.",
  pushbutton: "Contatto con la lama mobile e il comando a pulsante collegato dalla linea tratteggiata; con ritenuta, la tacca d'arresto.",
  relay_coil: "Rettangolo: bobina del relè.",
  timer_relay: "Bobina con la casella del ritardo: piena se ritardata all'eccitazione, con la croce se ritardata alla diseccitazione.",
  relay_contact: "Contatto NA, NC o in scambio, azionato dalla bobina che porta la stessa sigla.",
  valve_solenoid: "Rettangolo con la diagonale: bobina di un'elettrovalvola.",
  limit_switch: "Contatto azionato da un rullo (o da un rullo su leva ribaltabile).",
  proximity_sensor: "Riquadro con il rombo del sensore: sensore senza contatto a tre fili.",
  pressure_switch: "Pilotaggio pneumatico (triangolo vuoto) contro una molla regolabile che aziona un contatto elettrico.",
  signal_lamp: "Cerchio con la croce: lampada di segnalazione.",
  wire_junction: "Pallino pieno: morsetto comune di più fili.",
};

/** Come si legge ciascun comando delle valvole (ISO 1219-1). */
export const ACTUATION_NOTES: Record<string, string> = {
  solenoid: "Rettangolo con una diagonale: solenoide a un avvolgimento.",
  solenoid_pilot: "Solenoide che comanda una valvola pilota (rettangolo con triangolo vuoto), alimentata dall'interno.",
  solenoid_pilot_ext: "Come sopra, con la linea tratteggiata dell'alimentazione esterna del pilota.",
  pilot: "Linea tratteggiata di pilotaggio con triangolo vuoto: comando pneumatico diretto in pressione.",
  manual: "Pulsante: testa arrotondata.",
  lever: "Leva inclinata.",
  lever_detent: "Leva con il dispositivo di arresto (tacche) che la tiene in posizione.",
  pedal: "Pedale.",
  mechanical: "Rullo: azionamento meccanico da una camma o dal cilindro a fine corsa.",
  plunger: "Tastatore: asta a testa arrotondata.",
  roller_oneway: "Rullo su leva ribaltabile: aziona la valvola in un solo verso di passaggio.",
  spring: "Molla di ritorno.",
  air_return: "Molla pneumatica: riquadro con triangolo vuoto, alimentata dall'interno della valvola.",
  air_return_ext: "Molla pneumatica con la linea tratteggiata dell'alimentazione esterna.",
  proportional: "Solenoide attraversato dalla freccia obliqua: solenoide proporzionale (ISO 1219-1 X10170).",
  piezo: "Rettangolo con la pila di dischi: attuatore piezoelettrico.",
  stepper: "Cerchio del motore con il gradino: motore passo passo.",
  pilot_differential: "Pilotaggio con due superfici di area diversa sullo stesso lato: pilotaggio differenziale.",
  pushpull_detent: "Pulsante con la testa a fungo, da spingere e da tirare, con le tacche di arresto (ISO 1219-1 X10030).",
  rotary_knob: "Manopola con l'indice e le tacche delle posizioni: selettore rotativo.",
  key: "Chiave con i denti e l'impugnatura ad anello (ISO 1219-1 X10060).",
  pedal_double: "Pedale imperniato al centro: si aziona nei due versi.",
  plunger_adjustable: "Tastatore attraversato dalla freccia obliqua: la corsa è regolabile.",
  spring_air_return: "Molla meccanica e molla pneumatica insieme sullo stesso lato.",
};

const PORT_KIND: Record<PortKind, string> = {
  supply: "alimentazione", work: "utilizzo", exhaust: "scarico", pilot: "pilotaggio", electric: "morsetto",
};

const esc = (t: string) => t.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function symbolSvg(comp: ComponentData, scale = 1.4): string {
  const g = geometry(comp);
  const pad = 14;
  const w = g.w + 2 * pad, h = g.h + 2 * pad;
  return `<svg class="symbol" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" width="${Math.round(w * scale)}" ` +
    `height="${Math.round(h * scale)}" role="img">${g.svg}</svg>`;
}

/** Varianti di un tipo: una per voce della palette, oppure la sola configurazione predefinita. */
export function variants(def: TypeDef): { label: string; comp: ComponentData }[] {
  const base = (opts: Record<string, string | undefined> = {}): ComponentData => {
    const c: ComponentData = { id: "X", type: def.type, params: { ...def.defaults } };
    for (const o of def.options ?? []) (c as unknown as Record<string, string>)[o.name] = o.default;
    for (const [k, v] of Object.entries(opts)) if (v !== undefined) (c as unknown as Record<string, string>)[k] = v;
    return c;
  };
  if (!def.presets?.length) return [{ label: def.label, comp: base() }];
  return def.presets.map((p) => ({ label: p.label, comp: base(p.options) }));
}

/** Varianti con simbolo diverso: le voci che cambiano solo i parametri (es. il volume) hanno lo stesso disegno. */
export function distinctVariants(def: TypeDef): { label: string; comp: ComponentData }[] {
  const seen = new Set<string>();
  return variants(def).filter((v) => {
    const svg = geometry(v.comp).svg;
    if (seen.has(svg)) return false;
    seen.add(svg);
    return true;
  });
}

function card(def: TypeDef, label: string, comp: ComponentData, showDoc: boolean): string {
  // le porte dipendono solo dalle opzioni, che hanno gli stessi nomi nel file e nel componente validato
  const ports = def.ports(comp as never);
  const portList = ports.map((p) => `<span class="cat-port"><b>${esc(p.name)}</b> ${PORT_KIND[p.kind]}</span>`).join(" ");
  return `<article class="cat-card" data-type="${def.type}">` +
    `<div class="cat-symbol">${symbolSvg(comp)}</div>` +
    `<h3>${esc(label)}</h3>` +
    (showDoc ? `<p class="cat-doc">${esc(def.doc)}</p><p class="cat-note">${esc(SYMBOL_NOTES[def.type] ?? "")}</p>` : "") +
    `<p class="cat-ports">${portList}</p>` +
    `</article>`;
}

/** Corpo HTML del catalogo. */
export function renderCatalog(): string {
  const defs = typeList().filter((d) => !d.hidden);
  const categories = [...new Set(defs.map((d) => d.category))];
  let html = "";
  const toc: string[] = [];
  categories.forEach((cat, i) => {
    const id = `cat-${i}`;
    toc.push(`<a href="#${id}">${esc(cat)}</a>`);
    html += `<section id="${id}"><h2>${esc(cat)}</h2>`;
    // i componenti con un solo simbolo stanno in un'unica griglia; quelli con più varianti hanno un blocco proprio
    let singles = "", groups = "";
    for (const def of defs.filter((d) => d.category === cat)) {
      const vs = distinctVariants(def);
      if (vs.length === 1) singles += card(def, def.label, vs[0]!.comp, true);
      else {
        groups += `<div class="cat-type"><h3>${esc(def.label)}</h3><p class="cat-doc">${esc(def.doc)}</p>` +
          `<p class="cat-note">${esc(SYMBOL_NOTES[def.type] ?? "")}</p>` +
          `<div class="cat-grid">${vs.map((v) => card(def, v.label, v.comp, false)).join("")}</div></div>`;
      }
    }
    if (singles) html += `<div class="cat-grid">${singles}</div>`;
    html += groups;
    html += `</section>`;
  });
  // comandi delle valvole, ciascuno disegnato su una 3/2
  toc.push(`<a href="#cat-act">Comandi delle valvole</a>`);
  html += `<section id="cat-act"><h2>Comandi delle valvole</h2><p class="cat-doc">Ogni comando è mostrato a ` +
    `sinistra di una valvola 3/2 con ritorno a molla (la molla a destra), tranne i ritorni, mostrati a destra.</p><div class="cat-grid">`;
  for (const a of ACTUATIONS) {
    const ret = isReturn(a);
    const comp: ComponentData = { id: "X", type: "directional_valve", function: "3/2",
      actuation_14: ret ? "manual" : a, actuation_12: ret ? a : "spring" };
    html += `<article class="cat-card"><div class="cat-symbol">${symbolSvg(comp)}</div>` +
      `<h3>${esc(ACTUATION_LABELS[a])}</h3><p class="cat-note">${esc(ACTUATION_NOTES[a] ?? "")}</p></article>`;
  }
  html += `</div></section>`;
  return `<nav class="cat-toc">${toc.join("")}</nav>${html}`;
}
