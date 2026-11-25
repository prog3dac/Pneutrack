# Modello dati a grafo

I moduli in `src/model` rappresentano uno schema pneumatico come grafo. Lo schema è un oggetto
JSON (`CircuitDoc`): il modello lo legge, lo valida e lo trasforma; non ci sono classi da
istanziare a mano.

| Elemento | Dove | Note |
|---|---|---|
| Nodo | `ComponentData` (file) → `Component` (validato) in `components.ts` | ha un `id`, porte e parametri |
| Porta | `PortSpec`, riferimento `"V1.14"` (`parseRef`) | nome e ruolo: `supply`, `work`, `exhaust`, `pilot` |
| Arco | `ConnectionData` in `circuit.ts` | linea non orientata `{from, to}` tra due porte |
| Rete | `nets()` in `circuit.ts` | insieme di porte unite da linee, tutte alla stessa pressione |

Una porta può avere più linee: equivale a un raccordo a T.

## Componenti

Il catalogo (`DEFS` in `components.ts`) è diviso in categorie, come la palette dell'editor.
Le porte seguono la numerazione ISO 5599 (1 alimentazione, 2/4 utilizzo, 3/5 scarico, 12/14 pilotaggio).
Tutti i tipi accettano `max_pressure`; i parametri di simulazione (`conductance` in dm³/(s·bar),
`critical_ratio`) hanno valori predefiniti ragionevoli.

| Categoria | Tipo (`type`) | Nome | Porte | Parametri principali |
|---|---|---|---|---|
| Alimentazione e trattamento aria | `pressure_source` | Alimentazione | 1 | `pressure`, `flow`? |
| | `air_reservoir` | Serbatoio | 1, 2 (stesso volume; 2 può restare tappata) | `volume` |
| | `air_filter` | Filtro | 1 → 2 | |
| | `lubricator` | Lubrificatore | 1 → 2 | |
| | `frl_unit` | Gruppo FRL | 1 → 2 | `setpoint` |
| | `pressure_regulator` | Riduttore di pressione | 1 → 2 | `setpoint` |
| | `pressure_gauge` | Manometro | 1 | |
| | `silencer`, `plug` | Silenziatore, tappo | 1 | |
| Valvole distributrici | `directional_valve` | 2/2, 3/2, 4/2, 5/2, 5/3 (centri chiusi, in scarico, in pressione) | ISO 5599 | `function`, `actuation_14`, `actuation_12`, `cam_14`?, `cam_12`? |
| Valvole di blocco e logiche | `check_valve` | Non ritorno | 1 → 2 | `cracking_pressure` |
| | `pilot_check_valve` | Non ritorno pilotata | 1, 2, 21 (pilotaggio) | `pilot_pressure` |
| | `shuttle_valve` | Selettore (OR) | 1, 3 → 2 | |
| | `and_valve` | Due pressioni (AND) | 1, 3 → 2 | |
| | `quick_exhaust_valve` | Scarico rapido | 1, 2, 3 | |
| Regolazione | `flow_control_valve` | Strozzatore bidirezionale | 1, 2 | `conductance` |
| | `one_way_flow_control` | Regolatore di flusso unidirezionale | 1, 2 | `conductance`, `free_conductance` |
| | `relief_valve` | Valvola limitatrice | 1, 3 | `setpoint` |
| | `sequence_valve` | Valvola di sequenza | 1, 2, 3, 12 | `setpoint` |
| | `time_delay_valve` | Temporizzatore | 1, 2, 3, 12 | `delay`, `pilot_pressure` |
| Attuatori | `single_acting_cylinder` | Cilindro a semplice effetto | A | `bore`, `stroke`, `rod`?, `mass`, `load`, `friction`, `spring_force` |
| | `double_acting_cylinder` | Cilindro a doppio effetto | A, B | come sopra |
| | `double_rod_cylinder` | Cilindro a doppio stelo | A, B | `bore`, `stroke`, `rod` |
| | `rotary_actuator` | Attuatore rotante | A, B | `angle` (non ancora simulato) |
| | `air_motor` | Motore pneumatico | 1, 2 | |

Le valvole distributrici hanno `function` (`2/2`, `3/2`, `4/2`, `5/2`, `5/3`, `5/3E`, `5/3P`) e un
comando per lato (`actuation_14`, `actuation_12`), con i comandi di ISO 1219-1:

| Comando | Valore | Comportamento in simulazione |
|---|---|---|
| Solenoide diretto | `solenoid` | eccitato o diseccitato con un clic |
| Solenoide e valvola pilota, alimentazione interna | `solenoid_pilot` | come il solenoide, ma commuta solo se la porta 1 supera la pressione minima di pilotaggio (`min_pressure`, 2 bar se non indicata) |
| Solenoide e valvola pilota, alimentazione esterna | `solenoid_pilot_ext` | aggiunge la porta 14 (o 12) per l'aria del pilota, che deve superare la pressione minima |
| Pilotaggio pneumatico | `pilot` | aggiunge la porta 14 (o 12); commuta oltre la pressione minima |
| Pulsante, leva, pedale | `manual`, `lever`, `pedal` | azionati finché si tiene premuto |
| Leva con arresto | `lever_detent` | resta dove la si lascia; con l'arresto sui due lati è una sola leva a due posizioni |
| Rullo, tastatore | `mechanical`, `plunger` | a mano, o da un cilindro a fine corsa (finecorsa) |
| Rullo unidirezionale (leva ribaltabile) | `roller_oneway` | con un finecorsa dà un impulso solo mentre lo stelo arriva verso la camma (ultimi 5 mm), non quando torna indietro né da fermo |
| Molla | `spring` | ritorno |

Gli scarichi lasciati liberi scaricano in atmosfera. La palette propone valvole già configurate (`presets`), per esempio
"3/2 NC a rullo" o "5/2 bistabile pneumatica", e serbatoi di volume diverso.

Un comando meccanico (`mechanical`, `plunger`, `roller_oneway`) può essere un **finecorsa** azionato da un cilindro: `"cam_14": "C1+"`
significa che il lato 14 è azionato quando lo stelo di C1 è tutto fuori, `"C1-"` quando è tutto
dentro. Con i finecorsa si costruiscono cicli automatici (esempio "Ciclo automatico A+ A- con
finecorsa").

Nuovi tipi: una voce in `DEFS` (`src/model/components.ts`) con porte, parametri ed eventualmente
`paths` (percorsi interni della pressione) e `sources`; poi il simbolo in `src/ui/symbols.ts` e,
se va simulato, il comportamento in `src/sim/network.ts`.

### Misure normalizzate dei cilindri

`src/model/cylinders.ts` elenca le coppie alesaggio/stelo delle serie ISO 6432 (minicilindri,
Ø8–25), ISO 21287 (compatti, Ø20–100) e ISO 15552 (Ø32–320), più alesaggi e steli normalizzati
(ISO 3320) e corse preferenziali (ISO 4393). Sono solo suggerimenti: nel file i valori restano
`bore`, `rod` e `stroke` e si possono scrivere a mano.

## Tubi

Un collegamento può avere le dimensioni del tubo:

```json
{"from": "V1.4", "to": "C1.A",
 "tube": {"outer_diameter": "6 mm", "inner_diameter": "4 mm", "length": "1.5 m"}}
```

Diametro interno e lunghezza sono obbligatori, l'esterno è facoltativo (serve a riconoscere la
misura commerciale e allo spessore del disegno). Senza `tube` la linea è ideale: le porte unite
sono un solo nodo, con volume trascurabile.

In simulazione un tubo è un orifizio ISO 6358 tra le due porte, con `b = 0,4` e conduttanza stimata
dalla sezione e dalle perdite per attrito (`C ≈ 0,2 · A_eff`, con `A_eff = A / √(1 + 0,03 · L/d)`,
C in dm³/(s·bar) e A in mm²); il suo volume interno va metà a ciascun capo. È una stima: per un
tubo 6×4 lungo 1 m dà circa 0,9 dm³/(s·bar).

Il campo `points` di un collegamento (`[[x, y], ...]`) contiene i punti di piega disegnati
nell'editor e, come `layout`, non conta per il modello.

## Unità da catalogo

I parametri si scrivono come nei cataloghi: `"6 bar"`, `"32 mm"`, `"500 Nl/min"`, `"0,6 MPa"`,
`"90 psi"`, `"90 deg"`. `Quantity` conserva l'unità originale per la visualizzazione e il valore
SI per i calcoli; il confronto tra unità diverse è automatico. Le pressioni sono relative.

## Validazione

`analyze(doc)` (`src/model/validation.ts`) restituisce `{ok, errors, warnings, issues, ports, pressures}`.
È tollerante: un componente o un collegamento non valido diventa un problema
(`INVALID_COMPONENT`, `INVALID_CONNECTION`) invece di fermare l'analisi. La pressione viene propagata dalle sorgenti lungo le reti e attraverso i
percorsi interni dei componenti, prendendo per ogni rete il **massimo raggiungibile in una
qualunque posizione delle valvole** (analisi conservativa); i riduttori limitano al `setpoint`.

| Codice | Gravità | Quando |
|---|---|---|
| `INVALID_COMPONENT` | error | tipo sconosciuto o parametri non validi |
| `INVALID_CONNECTION` | error | collegamento verso una porta inesistente, su se stessa o duplicato |
| `INVALID_TUBE` | error | tubo senza diametro interno o lunghezza, unità sbagliate, interno ≥ esterno |
| `NO_SOURCE` | warning | nessuna sorgente nello schema |
| `UNCONNECTED_PORT` | error | porta scollegata che non può restare aperta (chiuderla con un tappo, `plug`) |
| `SOURCE_CONFLICT` | error | due sorgenti a pressione diversa sulla stessa rete |
| `SUPPLY_VENTED` | error | sorgente collegata direttamente a uno scarico |
| `OVERPRESSURE` | error | pressione raggiungibile oltre `max_pressure` del componente |
| `UNDERPRESSURE` | warning | pressione di comando sotto `min_pressure` |
| `UNSUPPLIED_ACTUATOR` | warning | attuatore che nessuna sorgente alimenta |
| `UNSUPPLIED_PILOT` | warning | pilotaggio collegato ma mai in pressione |
| `INVALID_CAM` | error | finecorsa che indica un cilindro inesistente o su un lato non meccanico |
| `SETPOINT_UNREACHABLE` | warning | valvola di sequenza tarata sopra la pressione che può ricevere |

## Formato file

Gli schemi si salvano nel formato `pneutrack/circuit` versione 1 (`normalizeCircuit` controlla la forma
generale di un file). La disposizione grafica dei componenti, usata dall'editor, è nella chiave
facoltativa `layout` (`{"V1": {"x": 300, "y": 140, "rot": 0}}`) e viene ignorata dal modello.

Esempio: [`src/examples/doppio_effetto_bistabile.json`](../src/examples/doppio_effetto_bistabile.json).

```ts
import { analyze } from "./src/model/validation";

const report = analyze({
  components: [
    { id: "P", type: "pressure_source", params: { pressure: "6 bar" } },
    { id: "V1", type: "directional_valve", function: "5/2", params: { max_pressure: "10 bar" } },
    { id: "C1", type: "double_acting_cylinder", params: { bore: "32 mm", stroke: "100 mm" } },
  ],
  connections: [{ from: "P.1", to: "V1.1" }, { from: "V1.4", to: "C1.A" }, { from: "V1.2", to: "C1.B" }],
});
console.log(report.ok, report.pressures["C1.A"]?.text); // true "6 bar"
```

## Simulazione

`compileSim(doc)` (`src/sim/network.ts`) trasforma uno schema valido in una rete a parametri
concentrati: ogni rete di porte è un volume con una pressione, valvole, riduttori e strozzatori sono
orifizi ISO 6358 (conduttanza C, rapporto critico b), i cilindri sono masse con attrito.
`Simulator` (`src/sim/simulator.ts`) la integra con passi RK4 fissi (20 µs) e lascia cambiare i
comandi delle valvole mentre gira. Le equazioni sono quelle del solutore di riferimento in
`src/solver`, con cui `test/sim.test.ts` confronta i risultati.
