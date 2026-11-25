# Modello dati a grafo

Il pacchetto `pneutrack.model` rappresenta uno schema pneumatico come grafo.

| Elemento | Classe | Note |
|---|---|---|
| Nodo | `Component` e sottoclassi | ha un `id`, porte e parametri |
| Porta | `PortSpec` / `PortRef` | `PortRef("V1", "14")`, o la stringa `"V1.14"` |
| Arco | `Connection` | linea non orientata tra due porte |
| Rete | `Circuit.nets()` | insieme di porte unite da linee, tutte alla stessa pressione |

Una porta può avere più linee: equivale a un raccordo a T.

## Componenti

| Tipo (`type`) | Classe | Porte | Parametri |
|---|---|---|---|
| `pressure_source` | `PressureSource` | 1 | `pressure`, `flow`? |
| `pressure_regulator` | `PressureRegulator` | 1 → 2 | `setpoint`, `max_pressure`? |
| `directional_valve` | `DirectionalValve` | ISO 5599: 1, 2, 3, 4, 5, 12/14 se pilotata | `max_pressure`?, `min_pressure`?, `flow`? |
| `flow_control_valve` | `FlowControlValve` | 1, 2 | `max_pressure`? |
| `single_acting_cylinder` | `SingleActingCylinder` | A | `bore`, `stroke`, `rod`?, `max_pressure`?, `min_pressure`? |
| `double_acting_cylinder` | `DoubleActingCylinder` | A (fondello), B (stelo) | come sopra |
| `rotary_actuator` | `RotaryActuator` | A, B | `angle`, `max_pressure`?, `min_pressure`? |
| `silencer` | `Silencer` | 1 | `max_pressure`? |
| `plug` | `Plug` | 1 | `max_pressure`? |

Le valvole distributrici hanno `function` (`2/2`, `3/2`, `4/2`, `5/2`, `5/3`) e un comando per
lato (`actuation_14`, `actuation_12`: `solenoid`, `pilot`, `manual`, `mechanical`, `spring`).
Un comando `pilot` aggiunge la porta di pilotaggio. Gli scarichi 3 e 5 possono restare liberi.

Nuovi tipi: si deriva `Component`, si dichiarano `TYPE`, `PARAMS`, `_build_ports()` ed
eventualmente `internal_paths()`, e si decora la classe con `@register`.

## Unità da catalogo

I parametri si scrivono come nei cataloghi: `"6 bar"`, `"32 mm"`, `"500 Nl/min"`, `"0,6 MPa"`,
`"90 psi"`, `"90 deg"`. `Quantity` conserva l'unità originale per la visualizzazione e il valore
SI per i calcoli; il confronto tra unità diverse è automatico. Le pressioni sono relative.

## Validazione

`validate(circuit)` restituisce un `ValidationReport` con `issues`, `errors`, `warnings`, `ok`
e `pressure_at(porta)`. La pressione viene propagata dalle sorgenti lungo le reti e attraverso i
percorsi interni dei componenti, prendendo per ogni rete il **massimo raggiungibile in una
qualunque posizione delle valvole** (analisi conservativa); i riduttori limitano al `setpoint`.

| Codice | Gravità | Quando |
|---|---|---|
| `NO_SOURCE` | warning | nessuna sorgente nello schema |
| `UNCONNECTED_PORT` | error | porta scollegata che non può restare aperta (usare `Plug` per chiuderla) |
| `SOURCE_CONFLICT` | error | due sorgenti a pressione diversa sulla stessa rete |
| `SUPPLY_VENTED` | error | sorgente collegata direttamente a uno scarico |
| `OVERPRESSURE` | error | pressione raggiungibile oltre `max_pressure` del componente |
| `UNDERPRESSURE` | warning | pressione di comando sotto `min_pressure` |
| `UNSUPPLIED_ACTUATOR` | warning | attuatore che nessuna sorgente alimenta |
| `UNSUPPLIED_PILOT` | warning | pilotaggio collegato ma mai in pressione |

## Formato file

`Circuit.to_json()` / `Circuit.from_json()` usano il formato `pneutrack/circuit` versione 1.
La disposizione grafica dei componenti, usata dall'editor, è nella chiave facoltativa `layout`
(`{"V1": {"x": 300, "y": 140, "rot": 0}}`) e viene ignorata dal modello.

Esempio: [`src/pneutrack/examples/doppio_effetto_bistabile.json`](../src/pneutrack/examples/doppio_effetto_bistabile.json).

```python
from pneutrack.model import *

c = Circuit("esempio")
c.add(PressureSource("P", pressure="6 bar"))
c.add(DirectionalValve("V1", function="5/2", max_pressure="10 bar"))
c.add(DoubleActingCylinder("C1", bore="32 mm", stroke="100 mm", max_pressure="10 bar"))
c.connect("P.1", "V1.1")
c.connect("V1.4", "C1.A")
c.connect("V1.2", "C1.B")
print(validate(c))  # schema valido
```
