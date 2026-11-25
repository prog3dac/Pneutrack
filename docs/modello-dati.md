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
| | `silencer`, `exhaust`, `plug` | Silenziatore, scarico in atmosfera, tappo | 1 | |
| | `junction` | Punto di connessione: più linee unite nello stesso punto (raccordo a T o a croce) | 1 | può restare scollegata |
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
| Ritorno pneumatico, alimentazione interna | `air_return` | ritorno con l'aria della porta 1; senza pressione la valvola resta dov'è |
| Ritorno pneumatico, alimentazione esterna | `air_return_ext` | aggiunge la porta 12 (o 14) che alimenta il ritorno |

Gli scarichi lasciati liberi scaricano in atmosfera. La palette propone valvole già configurate (`presets`), per esempio
"3/2 NC a rullo" o "5/2 bistabile pneumatica", e serbatoi di volume diverso.

Un comando meccanico (`mechanical`, `plunger`, `roller_oneway`) può essere un **finecorsa** azionato da un cilindro: `"cam_14": "C1+"`
significa che il lato 14 è azionato quando lo stelo di C1 è tutto fuori, `"C1-"` quando è tutto
dentro. Con i finecorsa si costruiscono cicli automatici (esempio "Ciclo automatico A+ A- con
finecorsa").

Nuovi tipi: una voce in `DEFS` (`src/model/components.ts`) con porte, parametri ed eventualmente
`paths` (percorsi interni della pressione) e `sources`; poi il simbolo in `src/ui/symbols.ts` e,
se va simulato, il comportamento in `src/sim/network.ts`.

### Ammortizzo dei cilindri

I cilindri a doppio effetto e a doppio stelo hanno l'opzione `cushioning`: `none`, `both`,
`cap` (fine corsa in rientro) o `rod` (fine corsa in uscita). `cushion_length` è il tratto
ammortizzato (se manca, circa 0,6 × alesaggio, tra 10 e 40 mm); `cushion_opening` è l'apertura
della vite di regolazione, da 0 (chiusa) a 1 (tutta aperta, 0,3 dm³/(s·bar)), predefinita 0,3.
In simulazione, negli ultimi millimetri di corsa l'aria che esce dalla camera passa solo dalla
vite; quella che entra passa libera.

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

## Foglio

La chiave facoltativa `sheet` descrive il foglio di disegno (`src/model/sheet.ts`):

```json
"sheet": {"format": "A3", "orientation": "landscape", "origin": [-120, -80],
          "author": "A. Rossi", "number": "PN-001", "revision": "B"}
```

`format` va da `A4` ad `A0` (ISO 216); `origin` è l'angolo in alto a sinistra in unità dello
schema, con 3 unità per millimetro di carta. Come `layout`, il foglio non conta per il modello.

## Blocchi

La chiave facoltativa `blocks` elenca i gruppi di componenti (`src/model/blocks.ts`):

```json
"blocks": [{"id": "B1", "name": "Comando C1", "description": "Avanzamento e ritorno",
            "components": ["V1", "C1", "SL3"]}]
```

Ogni componente appartiene al massimo a un blocco; gli id inesistenti vengono scartati alla
lettura. Come `layout`, i blocchi non contano per il modello.

## Circuito elettrico di comando

Il circuito elettrico (24 V in corrente continua, simboli CEI EN 60617) sta nello stesso schema, accanto alla
parte pneumatica. I componenti elettrici hanno morsetti di tipo `electric`: le linee tra morsetti sono fili e
formano reti proprie, separate da quelle pneumatiche. Un filo non si collega a una porta pneumatica e non ha
`tube`. La parte elettrica e quella pneumatica si collegano **per sigla**, come negli schemi didattici: la bobina
`Y1` indica il solenoide che eccita (`"drives": "V1.14"`), il contatto `K1a` il relè che lo aziona
(`"relay": "K1"`), il finecorsa `S2` il cilindro (`"cam": "C1+"`).

I componenti elettrici non sono ancora nella palette dell'editor (mancano i simboli); si possono già scrivere nel file.

| Tipo (`type`) | Nome | Sigla | Morsetti | Opzioni, parametri e riferimenti |
|---|---|---|---|---|
| `electric_supply` | Alimentazione elettrica | G | +, 0V | `voltage` (`"24 V"`) |
| `pushbutton` | Pulsante, interruttore | S | secondo `contact` | `contact`, `operation`: `momentary` (a impulso) o `latching` (con ritenuta) |
| `relay_coil` | Bobina di relè | K | A1, A2 | `pickup_time` (tempo di attrazione, 10 ms) |
| `timer_relay` | Relè temporizzato | KT | A1, A2 | `delay`, `timer_mode`: `on_delay` (ritardato all'eccitazione) o `off_delay` |
| `relay_contact` | Contatto di relè | K | secondo `contact` | `contact`, `relay`: relè, temporizzatore o pressostato |
| `valve_solenoid` | Bobina di elettrovalvola | Y | A1, A2 | `drives`: valvola e lato, `"V1.14"` |
| `limit_switch` | Finecorsa elettrico | S | secondo `contact` | `contact`, `cam` (`"C1+"`), `switch_actuation`: `roller` o `roller_oneway` |
| `proximity_sensor` | Sensore di prossimità (PNP, 3 fili) | B | BN (+), BU (0V), BK (uscita) | `cam`, `position` (dal fondello, al posto del fine corsa), `range` (campo di rilevamento ±, 3 mm), `sensor_kind` |
| `pressure_switch` | Pressostato | B | porta pneumatica 1 | `setpoint`, `hysteresis`; i suoi contatti sono `relay_contact` con `"relay": "B1"` |
| `signal_lamp` | Lampada di segnalazione | H | X1, X2 | `lamp_color` |

I morsetti dei contatti (`contact`) seguono la numerazione CEI EN 60947: `no` (NA) 13-14, `nc` (NC) 11-12,
`co` (in scambio) 11 comune, 12 NC, 14 NA; di un contatto in scambio basta collegare uno dei due.

```json
{"components": [
  {"id": "G", "type": "electric_supply", "params": {"voltage": "24 V"}},
  {"id": "S1", "type": "pushbutton", "contact": "no"},
  {"id": "Y1", "type": "valve_solenoid", "drives": "V1.14"}],
 "connections": [{"from": "G.+", "to": "S1.13"}, {"from": "S1.14", "to": "Y1.A1"}, {"from": "Y1.A2", "to": "G.0V"}]}
```

## Unità da catalogo

I parametri si scrivono come nei cataloghi: `"6 bar"`, `"32 mm"`, `"500 Nl/min"`, `"0,6 MPa"`,
`"90 psi"`, `"90 deg"`, `"24 V"`. `Quantity` conserva l'unità originale per la visualizzazione e il valore
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
| `INVALID_CAM` | error | finecorsa o sensore che indica un cilindro inesistente, un lato non meccanico o una posizione oltre la corsa |
| `SETPOINT_UNREACHABLE` | warning | valvola di sequenza o pressostato tarati sopra la pressione che possono ricevere |
| `MIXED_CONNECTION` | error | linea tra un morsetto elettrico e una porta pneumatica |
| `UNCONNECTED_TERMINAL` | warning | morsetto elettrico scollegato (di un contatto in scambio basta uno tra 12 e 14) |
| `NO_ELECTRIC_SUPPLY` | warning | componenti elettrici senza alimentazione elettrica |
| `SHORT_CIRCUIT` | error | + e 0V uniti direttamente da un filo |
| `INVALID_REFERENCE` | error | bobina verso una valvola che non c'è, contatto verso qualcosa che non è un relè, un temporizzatore o un pressostato |
| `NOT_A_SOLENOID` | error | bobina su un lato della valvola senza solenoide |
| `DUPLICATE_COIL` | error | due bobine sullo stesso solenoide |
| `UNLINKED_REFERENCE` | warning | bobina, contatto, finecorsa o sensore che non indica cosa comanda o cosa lo aziona |
| `UNDRIVEN_SOLENOID` | warning | in uno schema con circuito elettrico, solenoide senza bobina (si comanda solo a mano) |
| `UNUSED_RELAY` | warning | relè, temporizzatore o pressostato senza contatti |

## Formato file

Gli schemi si salvano nel formato `pneutrack/circuit` versione 1 (`normalizeCircuit` controlla la forma
generale di un file). La disposizione grafica dei componenti, usata dall'editor, è nella chiave
facoltativa `layout` (`{"V1": {"x": 300, "y": 140, "rot": 0}}`, con `"mirror": true` per un simbolo
specchiato) e viene ignorata dal modello.

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

### Simulazione del circuito elettrico

`compileSim` compila anche la parte elettrica (`src/sim/electric.ts`), e `Simulator` la aggiorna ogni
millisecondo simulato. La simulazione è logica, non circuitale: i fili uniscono i morsetti in nodi, i contatti
chiusi uniscono i nodi, e un carico (bobina, lampada) è eccitato quando un suo morsetto è unito al + e l'altro
al 0V. Se il + e il 0V si uniscono attraverso i contatti c'è un cortocircuito: nessun carico resta eccitato
finché dura.

- Un solenoide con una bobina (`drives`) segue la bobina e non si comanda più a clic (`setCommand` lo ignora).
- `setSwitch(id, on)` aziona pulsanti e interruttori; anche un finecorsa elettrico senza `cam` si aziona a mano.
- Relè: commutano dopo il tempo di attrazione `pickup_time` (10 ms) e rilasciano dopo lo stesso tempo.
  Temporizzatori: `on_delay` chiude i contatti quando la bobina resta eccitata per `delay` e li apre subito;
  `off_delay` li chiude subito e li apre `delay` dopo la diseccitazione.
- Finecorsa elettrici: premuti negli ultimi 2 mm di corsa; quelli unidirezionali solo negli ultimi 5 mm e
  mentre lo stelo va verso la camma.
- Sensori di prossimità: l'uscita BK va a tensione (unita a BN) quando lo stelo è entro `range` (3 mm) dalla
  posizione del sensore.
- Pressostati: intervengono quando la porta 1 raggiunge `setpoint` e rilasciano sotto `setpoint − hysteresis`
  (0,5 bar).
- `electricState()` restituisce carichi eccitati, relè commutati, contatti azionati, potenziale di ogni morsetto
  (`"+"`, `"0"` o `null`), cortocircuito e relè in oscillazione (più di 20 commutazioni al secondo, per esempio una
  bobina alimentata dal proprio contatto NC).
