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

| Tipo (`type`) | Porte | Parametri da catalogo | Parametri di simulazione (predefinito) |
|---|---|---|---|
| `pressure_source` | 1 | `pressure`, `flow`? | |
| `pressure_regulator` | 1 → 2 | `setpoint`, `max_pressure`? | `conductance` (1 dm³/(s·bar)), `critical_ratio` (0,35) |
| `directional_valve` | ISO 5599: 1, 2, 3, 4, 5, 12/14 se pilotata | `max_pressure`?, `min_pressure`?, `flow`? | `conductance` (1,5), `critical_ratio` (0,35) |
| `flow_control_valve` | 1, 2 | `max_pressure`? | `conductance` (0,3), `critical_ratio` (0,5) |
| `single_acting_cylinder` | A | `bore`, `stroke`, `rod`?, `max_pressure`?, `min_pressure`? | `mass` (1 kg), `load` (0 N), `friction` (5 N), `spring_force` (15 N) |
| `double_acting_cylinder` | A (fondello), B (stelo) | come sopra | `mass`, `load`, `friction` |
| `rotary_actuator` | A, B | `angle`, `max_pressure`?, `min_pressure`? | non ancora simulato |
| `silencer` | 1 | `max_pressure`? | |
| `plug` | 1 | `max_pressure`? | |

Le valvole distributrici hanno `function` (`2/2`, `3/2`, `4/2`, `5/2`, `5/3`) e un comando per
lato (`actuation_14`, `actuation_12`: `solenoid`, `pilot`, `manual`, `mechanical`, `spring`).
Un comando `pilot` aggiunge la porta di pilotaggio. Gli scarichi 3 e 5 possono restare liberi.

Nuovi tipi: una voce in `DEFS` (`src/model/components.ts`) con porte, parametri ed eventualmente
`paths` (percorsi interni della pressione) e `sources`; poi il simbolo in `src/ui/symbols.ts` e,
se va simulato, il comportamento in `src/sim/network.ts`.

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
