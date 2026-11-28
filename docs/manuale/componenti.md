# Manuale · Riferimento dei componenti

<!-- File generato da tools/manuale.ts a partire dal catalogo (src/model/components.ts): non modificarlo a mano,
     esegui `npm run manuale`. Il test test/manuale.test.ts controlla che sia aggiornato. -->

Per ogni tipo di componente: nome nel file (`type`), porte, opzioni e parametri con le unità ammesse.
Come la simulazione usa questi dati è spiegato in [calcoli.md](calcoli.md); le convenzioni (pressioni
relative, numerazione delle porte, unità) in [README.md](README.md).

- **catalogo**: dato che si legge sulla scheda del costruttore; se manca e la simulazione non lo usa, resta vuoto.
- **simulazione**: parametro del modello fisico; se manca vale il valore della colonna «Se manca, in simulazione».
- **Valore della palette**: valore con cui il componente viene inserito dalla palette.
- **—**: il parametro non ha un valore predefinito; dove la simulazione lo usa, il suo ruolo è spiegato in [calcoli.md](calcoli.md).

## Indice

- **Alimentazione e trattamento aria**: [Alimentazione](#pressure-source), [Compressore](#compressor), [Serbatoio](#air-reservoir), [Filtro](#air-filter), [Lubrificatore](#lubricator), [Gruppo FRL](#frl-unit), [Riduttore di pressione](#pressure-regulator), [Filtro riduttore](#filter-regulator), [Essiccatore](#air-dryer), [Manometro](#pressure-gauge), [Silenziatore](#silencer), [Scarico](#exhaust), [Punto di connessione](#junction), [Tappo](#plug)
- **Intercettazione e collegamenti**: [Rubinetto di intercettazione](#shutoff-valve), [Valvola di sezionamento con lucchetto](#lockout-valve), [Innesto rapido](#quick-coupling), [Rubinetto a tre vie](#three-way-cock), [Tubo flessibile](#flexible-hose), [Giunto rotante](#rotary-joint), [Basetta di distribuzione](#manifold), [Rimando ad altro foglio](#sheet-reference)
- **Valvole distributrici**: [Valvola distributrice](#directional-valve)
- **Valvole di blocco e logiche**: [Valvola di non ritorno](#check-valve), [Non ritorno pilotata](#pilot-check-valve), [Doppia non ritorno pilotata](#double-pilot-check), [Valvola selettrice (OR)](#shuttle-valve), [Valvola a due pressioni (AND)](#and-valve), [Valvola di scarico rapido](#quick-exhaust-valve)
- **Regolazione di portata e pressione**: [Strozzatore bidirezionale](#flow-control-valve), [Strozzatore fisso (ugello)](#fixed-orifice), [Regolatore di flusso unidirezionale](#one-way-flow-control), [Strozzatore a rullo (rallentamento)](#roller-flow-control), [Valvola di avviamento progressivo](#soft-start-valve), [Riduttore di pressione con scarico](#relieving-regulator), [Riduttore pilotato a distanza](#piloted-regulator), [Regolatore proporzionale di pressione](#proportional-regulator), [Moltiplicatore di pressione](#pressure-intensifier), [Valvola limitatrice di pressione](#relief-valve), [Valvola di sequenza](#sequence-valve), [Temporizzatore pneumatico](#time-delay-valve)
- **Attuatori**: [Cilindro semplice effetto](#single-acting-cylinder), [Cilindro doppio effetto](#double-acting-cylinder), [Cilindro a doppio stelo](#double-rod-cylinder), [Cilindro senza stelo](#rodless-cylinder), [Pinza pneumatica](#gripper), [Cilindro con bloccaggio dello stelo](#locking-cylinder), [Cilindro con bloccaggio di fine corsa](#end-lock-cylinder), [Attuatore a soffietto](#bellows-cylinder), [Cilindro a membrana](#diaphragm-cylinder), [Muscolo pneumatico](#pneumatic-muscle), [Attuatore rotante](#rotary-actuator), [Motore pneumatico](#air-motor)
- **Vuoto**: [Generatore di vuoto (eiettore)](#vacuum-ejector), [Pompa del vuoto](#vacuum-pump), [Ventosa](#suction-cup)
- **Misura e segnalazione**: [Sensore di pressione analogico](#pressure-sensor), [Indicatore di pressione](#pressure-indicator), [Misuratore di portata](#flow-meter), [Manometro differenziale](#differential-gauge), [Termometro](#thermometer)
- **Elettrico**: [Alimentazione elettrica](#electric-supply), [Pulsante](#pushbutton), [Bobina di relè](#relay-coil), [Relè temporizzato](#timer-relay), [Contatto di relè](#relay-contact), [Bobina di elettrovalvola](#valve-solenoid), [Finecorsa elettrico](#limit-switch), [Sensore di prossimità](#proximity-sensor), [Pressostato](#pressure-switch), [Rimando elettrico](#wire-reference), [Lampada di segnalazione](#signal-lamp)

## Alimentazione e trattamento aria

<a id="pressure-source"></a>

### Alimentazione · `pressure_source`

Alimentazione d'aria compressa (compressore / rete) a pressione nota.

**Porte**: `1` alimentazione.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `pressure` | Pressione | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `6 bar` | obbligatorio |
| `flow` | Portata | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |

<a id="compressor"></a>

### Compressore · `compressor`

Compressore con il suo motore: in simulazione mantiene la porta 1 alla pressione di mandata, come un'alimentazione.

**Porte**: `1` alimentazione.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `pressure` | Pressione di mandata | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `8 bar` | obbligatorio |
| `flow` | Portata resa | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |

<a id="air-reservoir"></a>

### Serbatoio · `air_reservoir`

Serbatoio d'aria (polmone): accumula aria e smorza i picchi di consumo. Le porte 1 e 2 sono sullo stesso volume; la 2 può restare tappata.

**Porte**: `1` utilizzo, `2` utilizzo (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `volume` | Volume | volume (m3, l, cm3) | catalogo, obbligatorio | `1 l` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `11 bar` | — |

**Voci della palette**: Serbatoio 1 l; Serbatoio 10 l; Serbatoio 50 l; Serbatoio 0,1 l (temporizzazione).

<a id="air-filter"></a>

### Filtro · `air_filter`

Filtro dell'aria compressa: trattiene impurità e condensa. Il tipo cambia il simbolo, non la simulazione.

**Porte**: `1` alimentazione, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `filter_kind` | Tipo | `manual` Con scarico manuale della condensa; `auto` Con scarico automatico della condensa; `coalescing` A coalescenza (disoleatore, microfiltro); `carbon` A carboni attivi; `separator` Separatore di condensa; `centrifugal` Separatore centrifugo (ciclone); `indicator` Con indicatore di intasamento; `double` Doppio (prefiltro e filtro fine) | `manual` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

**Voci della palette**: Filtro con scarico manuale; Filtro con scarico automatico; Filtro a coalescenza (disoleatore); Filtro a carboni attivi; Separatore di condensa; Separatore centrifugo; Filtro con indicatore di intasamento; Filtro doppio.

<a id="lubricator"></a>

### Lubrificatore · `lubricator`

Lubrificatore: nebulizza olio nell'aria.

**Porte**: `1` alimentazione, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `lub_drain` | Scarico | `no` Senza scarico; `yes` Con scarico manuale | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="frl-unit"></a>

### Gruppo FRL · `frl_unit`

Gruppo filtro, riduttore con manometro e lubrificatore: l'uscita 2 non supera la pressione regolata.

**Porte**: `1` alimentazione, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `frl_style` | Simbolo | `detailed` Dettagliato (filtro, riduttore, manometro, lubrificatore); `simplified` Semplificato | `detailed` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione regolata | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `6 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `0.5 bar` | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

**Voci della palette**: Gruppo FRL; Gruppo FRL, simbolo semplificato.

<a id="pressure-regulator"></a>

### Riduttore di pressione · `pressure_regulator`

Riduttore di pressione: l'uscita 2 non supera la pressione regolata.

**Porte**: `1` alimentazione, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `gauge_fitted` | Manometro | `no` Senza manometro; `yes` Con manometro | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione regolata | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `4 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `0.5 bar` | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

**Voci della palette**: Riduttore di pressione; Riduttore di pressione con manometro.

<a id="filter-regulator"></a>

### Filtro riduttore · `filter_regulator`

Filtro e riduttore di pressione in un solo corpo, con scarico della condensa: l'uscita 2 non supera la pressione regolata.

**Porte**: `1` alimentazione, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `gauge_fitted` | Manometro | `no` Senza manometro; `yes` Con manometro | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione regolata | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `6 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `0.5 bar` | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

**Voci della palette**: Filtro riduttore; Filtro riduttore con manometro.

<a id="air-dryer"></a>

### Essiccatore · `air_dryer`

Essiccatore: toglie l'umidità dall'aria compressa. In simulazione è un passaggio con la sua conduttanza.

**Porte**: `1` alimentazione, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="pressure-gauge"></a>

### Manometro · `pressure_gauge`

Manometro: mostra la pressione della linea (in simulazione, il valore istantaneo).

**Porte**: `1` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |

<a id="silencer"></a>

### Silenziatore · `silencer`

Silenziatore / scarico in atmosfera.

**Porte**: `1` scarico.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |

<a id="exhaust"></a>

### Scarico · `exhaust`

Scarico diretto in atmosfera, senza silenziatore (simbolo ISO 1219: triangolo).

**Porte**: `1` scarico.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |

<a id="junction"></a>

### Punto di connessione · `junction`

Punto di connessione (raccordo a T o a croce): più linee unite nello stesso punto, tutte alla stessa pressione. Trascina una linea su un'altra per crearne uno.

**Porte**: `1` utilizzo (può restare libera).

Nessun parametro.

<a id="plug"></a>

### Tappo · `plug`

Tappo: chiude una porta che non si vuole usare.

**Porte**: `1` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |

## Intercettazione e collegamenti

<a id="shutoff-valve"></a>

### Rubinetto di intercettazione · `shutoff_valve`

Rubinetto (valvola a sfera) che apre o chiude la linea tra 1 e 2. In simulazione parte aperto; un clic lo chiude e un altro lo riapre.

**Porte**: `1` alimentazione, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 3 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="lockout-valve"></a>

### Valvola di sezionamento con lucchetto · `lockout_valve`

Valvola 3/2 manuale con arresto, da mettere all'inizio dell'impianto: aperta alimenta 2 da 1, chiusa blocca l'alimentazione e scarica l'impianto da 3. Chiusa si blocca con un lucchetto (messa in sicurezza). In simulazione parte aperta; un clic sul comando la chiude.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="quick-coupling"></a>

### Innesto rapido · `quick_coupling`

Innesto rapido tra la presa (1) e la spina (2). Staccato, il lato con la valvola di non ritorno resta chiuso e quello senza scarica in atmosfera.

**Porte**: `1` alimentazione, `2` utilizzo (può restare libera).

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `coupling` | Valvole di non ritorno | `plain` Nessuna; `check_one` Una, nella presa; `check_both` Due, nella presa e nella spina | `check_one` |
| `coupling_state` | Stato | `coupled` Innestato; `uncoupled` Staccato | `coupled` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

**Voci della palette**: Innesto rapido con non ritorno, innestato; Innesto rapido con non ritorno, staccato; Innesto rapido senza non ritorno; Innesto rapido con due non ritorno.

<a id="three-way-cock"></a>

### Rubinetto a tre vie · `three_way_cock`

Rubinetto deviatore a tre vie: manda l'ingresso 1 sull'uscita 2 o sull'uscita 4; l'uscita non alimentata resta chiusa. In simulazione parte su 2; un clic sulla leva lo sposta.

**Porte**: `1` alimentazione, `2` utilizzo, `4` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="flexible-hose"></a>

### Tubo flessibile · `flexible_hose`

Tubo flessibile tra due parti che si muovono l'una rispetto all'altra (ISO 1219: linea curva). In simulazione è un passaggio con la sua conduttanza e il suo volume.

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `length` | Lunghezza | lunghezza (m, cm, mm, in) | catalogo, facoltativo | `1 m` | — |
| `inner_diameter` | Diametro interno | lunghezza (m, cm, mm, in) | catalogo, facoltativo | `6 mm` | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 3 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.45 |

<a id="rotary-joint"></a>

### Giunto rotante · `rotary_joint`

Giunto rotante a una via: porta l'aria a una parte che gira (tavola rotante, mandrino).

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="manifold"></a>

### Basetta di distribuzione · `manifold`

Basetta (collettore) che distribuisce l'alimentazione 1 su quattro uscite, per esempio verso le valvole di un'isola: tutte le porte sono sullo stesso volume. Le uscite non usate restano tappate.

**Porte**: `1` alimentazione, `21` utilizzo (può restare libera), `22` utilizzo (può restare libera), `23` utilizzo (può restare libera), `24` utilizzo (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `volume` | Volume interno | volume (m3, l, cm3) | simulazione, facoltativo |  | 0.05 l |

<a id="sheet-reference"></a>

### Rimando ad altro foglio · `sheet_reference`

Rimando: la linea continua su un altro foglio o in un'altra parte dello schema. Tutti i rimandi con la stessa descrizione sono collegati tra loro, anche in simulazione; scrivi nella descrizione il nome del rimando, per esempio «A1»: accanto al simbolo compare il foglio dove prosegue.

**Porte**: `1` utilizzo (può restare libera).

Nessun parametro.

## Valvole distributrici

<a id="directional-valve"></a>

### Valvola distributrice · `directional_valve`

Valvola distributrice n/m con comandi sui lati 14 e 12.

**Porte**: `1` alimentazione, `2` utilizzo, `4` utilizzo, `3` scarico (può restare libera), `5` scarico (può restare libera).

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `function` | Funzione | `2/2` 2/2; `3/2` 3/2; `3/3` 3/3 centro chiuso; `4/2` 4/2; `4/3` 4/3 centri chiusi; `4/3E` 4/3 centri in scarico; `5/2` 5/2; `5/3` 5/3 centri chiusi; `5/3E` 5/3 centri in scarico; `5/3P` 5/3 centri in pressione | `5/2` |
| `actuation_14` | Comando lato 14 | `solenoid` Elettrico: solenoide diretto; `solenoid_pilot` Elettrico: solenoide e valvola pilota (alimentazione interna); `solenoid_pilot_ext` Elettrico: solenoide e valvola pilota (alimentazione esterna); `proportional` Elettrico: solenoide proporzionale; `piezo` Elettrico: attuatore piezoelettrico; `stepper` Elettrico: motore passo passo; `pilot` Pneumatico: pilotaggio in pressione; `pilot_differential` Pneumatico: pilotaggio differenziale; `manual` Manuale: pulsante; `pushpull_detent` Manuale: pulsante a tirare e spingere con arresto; `rotary_knob` Manuale: selettore rotativo; `key` Manuale: chiave; `lever` Manuale: leva; `lever_detent` Manuale: leva con arresto; `pedal` Manuale: pedale; `pedal_double` Manuale: pedale a bilanciere (due versi); `mechanical` Meccanico: rullo; `plunger` Meccanico: tastatore; `plunger_adjustable` Meccanico: tastatore a corsa regolabile; `roller_oneway` Meccanico: rullo unidirezionale (leva ribaltabile); `spring` Ritorno a molla; `air_return` Ritorno pneumatico (alimentazione interna); `air_return_ext` Ritorno pneumatico (alimentazione esterna); `spring_air_return` Ritorno a molla e molla pneumatica | `solenoid` |
| `actuation_12` | Comando lato 12 | `solenoid` Elettrico: solenoide diretto; `solenoid_pilot` Elettrico: solenoide e valvola pilota (alimentazione interna); `solenoid_pilot_ext` Elettrico: solenoide e valvola pilota (alimentazione esterna); `proportional` Elettrico: solenoide proporzionale; `piezo` Elettrico: attuatore piezoelettrico; `stepper` Elettrico: motore passo passo; `pilot` Pneumatico: pilotaggio in pressione; `pilot_differential` Pneumatico: pilotaggio differenziale; `manual` Manuale: pulsante; `pushpull_detent` Manuale: pulsante a tirare e spingere con arresto; `rotary_knob` Manuale: selettore rotativo; `key` Manuale: chiave; `lever` Manuale: leva; `lever_detent` Manuale: leva con arresto; `pedal` Manuale: pedale; `pedal_double` Manuale: pedale a bilanciere (due versi); `mechanical` Meccanico: rullo; `plunger` Meccanico: tastatore; `plunger_adjustable` Meccanico: tastatore a corsa regolabile; `roller_oneway` Meccanico: rullo unidirezionale (leva ribaltabile); `spring` Ritorno a molla; `air_return` Ritorno pneumatico (alimentazione interna); `air_return_ext` Ritorno pneumatico (alimentazione esterna); `spring_air_return` Ritorno a molla e molla pneumatica | `spring` |
| `override` | Comando manuale ausiliario | `none` Nessuno; `push` A impulso; `detent` Con arresto | `none` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

**Voci della palette**: 3/2 NC a pulsante; 3/2 NC a rullo (finecorsa); 3/2 NC a solenoide; 3/2 NC pilotata; 3/2 NA a pulsante; 2/2 a pulsante (intercettazione); 5/2 monostabile a solenoide; 5/2 monostabile elettropneumatica; 5/2 monostabile pilotata; 5/2 bistabile pneumatica; 5/2 bistabile elettrica; 5/2 bistabile elettropneumatica; 5/2 elettropneumatica, ritorno pneumatico; 5/2 elettropneumatica, pilota esterno; 5/2 elettropneumatica con comando manuale ausiliario; 5/2 a leva con arresto; 3/2 NC a pedale; 3/2 NC a tastatore; 3/2 NC a rullo unidirezionale; 5/3 centri chiusi; 5/3 centri in scarico; 5/3 centri in pressione; 3/3 centro chiuso; 4/3 centri chiusi a leva; 4/3 centri in scarico; 5/2 a pulsante a tirare e spingere; 5/3 a selettore rotativo; 3/2 NC a chiave; 5/3 proporzionale.

## Valvole di blocco e logiche

<a id="check-valve"></a>

### Valvola di non ritorno · `check_valve`

Valvola di non ritorno: l'aria passa solo da 1 a 2. Con la molla apre solo quando la differenza di pressione supera la pressione di apertura.

**Porte**: `1` alimentazione, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `check_spring` | Molla | `no` Senza molla; `yes` Con molla | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `cracking_pressure` | Pressione di apertura | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 0,1 bar (0,5 bar con la molla) |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

**Voci della palette**: Valvola di non ritorno; Valvola di non ritorno con molla.

<a id="pilot-check-valve"></a>

### Non ritorno pilotata · `pilot_check_valve`

Non ritorno pilotata: passa da 1 a 2; da 2 a 1 solo con il pilotaggio 21 in pressione.

**Porte**: `1` alimentazione, `2` utilizzo, `21` pilotaggio.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `pilot_pressure` | Pressione di pilotaggio | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 1.5 bar |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="double-pilot-check"></a>

### Doppia non ritorno pilotata · `double_pilot_check`

Due non ritorno pilotate in un corpo, da montare sulle due linee di un cilindro: l'aria passa libera da 1 a 2 e da 3 a 4; il ritorno da 2 a 1 si apre solo con 3 in pressione, quello da 4 a 3 solo con 1 in pressione. Senza comando il cilindro resta bloccato dove si trova.

**Porte**: `1` alimentazione, `2` utilizzo, `3` alimentazione, `4` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `pilot_pressure` | Pressione di pilotaggio | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 1.5 bar |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="shuttle-valve"></a>

### Valvola selettrice (OR) · `shuttle_valve`

Funzione O: l'uscita 2 riceve l'aria dall'ingresso (1 o 3) a pressione maggiore.

**Porte**: `1` alimentazione, `3` alimentazione, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="and-valve"></a>

### Valvola a due pressioni (AND) · `and_valve`

Funzione E: l'uscita 2 è in pressione solo se lo sono entrambi gli ingressi 1 e 3.

**Porte**: `1` alimentazione, `3` alimentazione, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="quick-exhaust-valve"></a>

### Valvola di scarico rapido · `quick_exhaust_valve`

Scarico rapido: l'aria va da 1 a 2; quando 1 si scarica, 2 sfoga subito dallo scarico 3.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |
| `exhaust_conductance` | Conduttanza di scarico | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 4 dm3/(s·bar) |

## Regolazione di portata e pressione

<a id="flow-control-valve"></a>

### Strozzatore bidirezionale · `flow_control_valve`

Strozzatore regolabile: riduce la portata nei due versi.

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `flow` | Portata nominale Qn a tutta apertura | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `opening` | Apertura | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo | `20 %` | 100 % |
| `conductance` | Conduttanza C a tutta apertura | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.5 |

<a id="fixed-orifice"></a>

### Strozzatore fisso (ugello) · `fixed_orifice`

Ugello calibrato non regolabile: riduce la portata nei due versi. Se la conduttanza C è vuota, la simulazione la ricava dal diametro (C ≈ 0,13 × d² con d in mm).

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `diameter` | Diametro dell'ugello | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `0.5 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | dal diametro |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.5 |

<a id="one-way-flow-control"></a>

### Regolatore di flusso unidirezionale · `one_way_flow_control`

Strozzatore con non ritorno: da 1 a 2 strozzato, da 2 a 1 libero.

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn a tutta apertura | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `opening` | Apertura | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo | `20 %` | 100 % |
| `conductance` | Conduttanza C a tutta apertura | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.5 |
| `free_conductance` | Conduttanza in senso libero | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |

<a id="roller-flow-control"></a>

### Strozzatore a rullo (rallentamento) · `roller_flow_control`

Strozzatore comandato da un rullo: a riposo l'aria passa libera; con il rullo premuto passa solo dallo strozzatore regolabile, così il cilindro rallenta nell'ultimo tratto di corsa. Il finecorsa (cam) indica il cilindro che preme il rullo, per esempio «C1+».

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |
| `pressed_opening` | Apertura con il rullo premuto | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 15 % |

<a id="soft-start-valve"></a>

### Valvola di avviamento progressivo · `soft_start_valve`

Riempie l'impianto a valle lentamente, attraverso uno strozzatore, finché la pressione in 2 arriva alla soglia (una frazione di quella in 1); poi apre del tutto. All'indietro l'aria passa libera, così l'impianto si scarica dalla valvola a monte.

**Porte**: `1` alimentazione, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |
| `fill_opening` | Apertura dello strozzatore di riempimento | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 10 % |
| `switch_ratio` | Soglia di apertura piena | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 50 % |

<a id="relieving-regulator"></a>

### Riduttore di pressione con scarico · `relieving_regulator`

Riduttore con scarico (a tre vie): l'uscita 2 non supera la pressione regolata e, se la pressione a valle sale oltre la taratura (per esempio quando la si abbassa), l'eccesso esce dallo scarico 3.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione regolata | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `4 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `0.5 bar` | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

<a id="piloted-regulator"></a>

### Riduttore pilotato a distanza · `piloted_regulator`

Riduttore di pressione con la taratura data da un pilotaggio: l'uscita 2 segue la pressione del pilotaggio 12 (moltiplicata per il rapporto), che può arrivare da un riduttore lontano.

**Porte**: `1` alimentazione, `2` utilizzo, `12` pilotaggio.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `ratio` | Rapporto uscita / pilotaggio | numero puro (numero) | simulazione, facoltativo |  | 1 |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

<a id="proportional-regulator"></a>

### Regolatore proporzionale di pressione · `proportional_regulator`

Riduttore con la taratura impostata da un segnale elettrico (solenoide proporzionale). In simulazione l'uscita 2 resta alla pressione impostata.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione impostata dal segnale | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `3 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

<a id="pressure-intensifier"></a>

### Moltiplicatore di pressione · `pressure_intensifier`

Moltiplicatore (booster): porta l'uscita 2 a una pressione più alta di quella in ingresso, fino al rapporto indicato. In simulazione il consumo d'aria è approssimato.

**Porte**: `1` alimentazione, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `ratio` | Rapporto di moltiplicazione | numero puro (numero) | catalogo, obbligatorio | `2` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 0.5 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

<a id="relief-valve"></a>

### Valvola limitatrice di pressione · `relief_valve`

Valvola di sicurezza: scarica da 1 a 3 quando la pressione supera la taratura.

**Porte**: `1` alimentazione, `3` scarico (può restare libera).

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione di taratura | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `7 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 2 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

<a id="sequence-valve"></a>

### Valvola di sequenza · `sequence_valve`

3/2 NC che commuta quando il pilotaggio 12 raggiunge la pressione di taratura.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera), `12` pilotaggio.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione di commutazione | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `4 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

<a id="time-delay-valve"></a>

### Temporizzatore pneumatico · `time_delay_valve`

3/2 NC che commuta quando il pilotaggio 12 resta in pressione per il tempo impostato.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera), `12` pilotaggio.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `delay` | Ritardo | tempo (s, ms, min) | catalogo, obbligatorio | `2 s` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `pilot_pressure` | Pressione di pilotaggio | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 2 bar |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.35 |

## Attuatori

<a id="single-acting-cylinder"></a>

### Cilindro semplice effetto · `single_acting_cylinder`

Cilindro a semplice effetto. In spinta l'aria in A fa uscire lo stelo e la molla lo riporta dentro; in trazione A è sulla camera stelo, l'aria lo fa rientrare e la molla lo spinge fuori (a riposo è fuori). Senza molla torna indietro solo per il carico o la gravità.

**Porte**: `A` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `single_kind` | Verso di lavoro | `push` In spinta: l'aria fa uscire lo stelo; `pull` In trazione: l'aria fa rientrare lo stelo | `push` |
| `spring_return` | Ritorno a molla | `yes` Sì; `no` No (ritorna per il carico o la gravità) | `yes` |
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `20 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `50 mm` | obbligatorio |
| `rod` | Diametro stelo | lunghezza (m, cm, mm, in) | catalogo, facoltativo | `8 mm` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `static_friction` | Attrito statico (di primo distacco) | forza (N, kN, daN) | simulazione, facoltativo |  | uguale all'attrito |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |
| `spring_force` | Forza molla | forza (N, kN, daN) | simulazione, facoltativo |  | 15 N |

**Voci della palette**: Cilindro semplice effetto; Cilindro semplice effetto in trazione.

<a id="double-acting-cylinder"></a>

### Cilindro doppio effetto · `double_acting_cylinder`

Cilindro a doppio effetto. A: camera fondello (uscita), B: camera stelo (rientro).

**Porte**: `A` utilizzo, `B` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `cushioning` | Ammortizzo | `none` Nessuno; `both` Regolabile ai due fine corsa; `cap` Regolabile solo in rientro (fondello); `rod` Regolabile solo in uscita (testata) | `none` |
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `32 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `100 mm` | obbligatorio |
| `rod` | Diametro stelo | lunghezza (m, cm, mm, in) | catalogo, facoltativo | `12 mm` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `static_friction` | Attrito statico (di primo distacco) | forza (N, kN, daN) | simulazione, facoltativo |  | uguale all'attrito |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |
| `cushion_length` | Lunghezza ammortizzo | lunghezza (m, cm, mm, in) | catalogo, facoltativo |  | ≈ 0,6 × alesaggio |
| `cushion_opening_rod` | Apertura vite ammortizzo in uscita (testata) | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 30 % |
| `cushion_opening_cap` | Apertura vite ammortizzo in rientro (fondello) | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 30 % |

**Voci della palette**: Cilindro doppio effetto; Cilindro doppio effetto ammortizzato; Cilindro doppio effetto con pistone magnetico.

<a id="double-rod-cylinder"></a>

### Cilindro a doppio stelo · `double_rod_cylinder`

Cilindro a doppio effetto con stelo passante: stessa area e stessa forza nei due versi. Se il secondo stelo ha un diametro diverso, le aree (e le forze) nei due versi cambiano.

**Porte**: `A` utilizzo, `B` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `cushioning` | Ammortizzo | `none` Nessuno; `both` Regolabile ai due fine corsa; `cap` Regolabile solo in rientro (fondello); `rod` Regolabile solo in uscita (testata) | `none` |
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `32 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `100 mm` | obbligatorio |
| `rod` | Diametro stelo | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `12 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `static_friction` | Attrito statico (di primo distacco) | forza (N, kN, daN) | simulazione, facoltativo |  | uguale all'attrito |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |
| `rod2` | Diametro del secondo stelo | lunghezza (m, cm, mm, in) | catalogo, facoltativo |  | uguale allo stelo |
| `cushion_length` | Lunghezza ammortizzo | lunghezza (m, cm, mm, in) | catalogo, facoltativo |  | ≈ 0,6 × alesaggio |
| `cushion_opening_rod` | Apertura vite ammortizzo in uscita (testata) | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 30 % |
| `cushion_opening_cap` | Apertura vite ammortizzo in rientro (fondello) | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 30 % |

<a id="rodless-cylinder"></a>

### Cilindro senza stelo · `rodless_cylinder`

Cilindro a doppio effetto senza stelo: il pistone trascina un carrello che corre lungo la canna. Stessa area e stessa forza nei due versi. A: camera che spinge il carrello verso destra, B: verso sinistra.

**Porte**: `A` utilizzo, `B` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `cushioning` | Ammortizzo | `none` Nessuno; `both` Regolabile ai due fine corsa; `cap` Regolabile solo in rientro (fondello); `rod` Regolabile solo in uscita (testata) | `none` |
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |
| `rodless_kind` | Accoppiamento del carrello | `slide` Meccanico (carrello attraverso la fessura); `magnetic` Magnetico (canna chiusa) | `slide` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `25 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `200 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `8 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `static_friction` | Attrito statico (di primo distacco) | forza (N, kN, daN) | simulazione, facoltativo |  | uguale all'attrito |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |
| `cushion_length` | Lunghezza ammortizzo | lunghezza (m, cm, mm, in) | catalogo, facoltativo |  | ≈ 0,6 × alesaggio |
| `cushion_opening_rod` | Apertura vite ammortizzo in uscita (testata) | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 30 % |
| `cushion_opening_cap` | Apertura vite ammortizzo in rientro (fondello) | numero puro (% (0–100 %) o frazione 0–1) | simulazione, facoltativo |  | 30 % |

**Voci della palette**: Cilindro senza stelo; Cilindro senza stelo ad accoppiamento magnetico.

<a id="gripper"></a>

### Pinza pneumatica · `gripper`

Pinza a griffe parallele. A chiude le griffe, B le apre; nella pinza a semplice effetto c'è solo A e una molla la riapre. La corsa è quella di una griffa; nei finecorsa e nei sensori «+» vuol dire chiusa.

**Porte**: `A` utilizzo, `B` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `gripper_kind` | Tipo | `double` Doppio effetto; `single` Semplice effetto (si apre a molla) | `double` |
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio del pistone | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `16 mm` | obbligatorio |
| `stroke` | Corsa di una griffa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `5 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `8 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 0.1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 2 N |
| `spring_force` | Forza molla | forza (N, kN, daN) | simulazione, facoltativo |  | 10 N |

**Voci della palette**: Pinza a doppio effetto; Pinza a semplice effetto.

<a id="locking-cylinder"></a>

### Cilindro con bloccaggio dello stelo · `locking_cylinder`

Cilindro a doppio effetto con l'unità di bloccaggio sullo stelo: senza pressione sul pilotaggio L lo stelo resta bloccato dove si trova; con L in pressione è libero.

**Porte**: `A` utilizzo, `B` utilizzo, `L` pilotaggio.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `32 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `100 mm` | obbligatorio |
| `rod` | Diametro stelo | lunghezza (m, cm, mm, in) | catalogo, facoltativo | `12 mm` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `static_friction` | Attrito statico (di primo distacco) | forza (N, kN, daN) | simulazione, facoltativo |  | uguale all'attrito |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |
| `unlock_pressure` | Pressione di sblocco | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 3 bar |

<a id="end-lock-cylinder"></a>

### Cilindro con bloccaggio di fine corsa · `end_lock_cylinder`

Cilindro a doppio effetto con l'arresto meccanico in posizione di riposo: rientrato resta agganciato finché la camera A non arriva alla pressione di sblocco (tiene il carico anche senz'aria).

**Porte**: `A` utilizzo, `B` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `magnet` | Pistone magnetico | `no` No; `yes` Sì (per sensori magnetici) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Alesaggio | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `32 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `100 mm` | obbligatorio |
| `rod` | Diametro stelo | lunghezza (m, cm, mm, in) | catalogo, facoltativo | `12 mm` | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `static_friction` | Attrito statico (di primo distacco) | forza (N, kN, daN) | simulazione, facoltativo |  | uguale all'attrito |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |
| `unlock_pressure` | Pressione di sblocco | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 3 bar |

<a id="bellows-cylinder"></a>

### Attuatore a soffietto · `bellows_cylinder`

Attuatore a soffietto a semplice effetto: si allunga con la porta A in pressione e torna per il carico o per la propria elasticità (forza di ritorno). L'alesaggio è il diametro efficace.

**Porte**: `A` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Diametro efficace | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `80 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `40 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `8 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 1 N |
| `spring_force` | Forza di ritorno | forza (N, kN, daN) | simulazione, facoltativo |  | 30 N |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |

<a id="diaphragm-cylinder"></a>

### Cilindro a membrana · `diaphragm_cylinder`

Cilindro a membrana a semplice effetto con ritorno a molla: corsa breve, senza attriti di guarnizione.

**Porte**: `A` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Diametro della membrana | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `60 mm` | obbligatorio |
| `stroke` | Corsa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `10 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `8 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 0.5 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 1 N |
| `spring_force` | Forza molla | forza (N, kN, daN) | simulazione, facoltativo |  | 30 N |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |

<a id="pneumatic-muscle"></a>

### Muscolo pneumatico · `pneumatic_muscle`

Muscolo pneumatico: con la porta A in pressione si accorcia e tira; scaricato torna lungo per il carico. La simulazione lo tratta come un attuatore a semplice effetto con area efficace costante (approssimazione).

**Porte**: `A` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `bore` | Diametro interno | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `20 mm` | obbligatorio |
| `stroke` | Contrazione | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `25 mm` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `6 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `mass` | Massa mobile | massa (kg, g) | simulazione, facoltativo |  | 1 kg |
| `load` | Carico | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 1 N |
| `spring_force` | Forza di ritorno | forza (N, kN, daN) | simulazione, facoltativo |  | 20 N |
| `mounting_angle` | Angolo di montaggio (ammette valori negativi) | angolo (rad, deg) | simulazione, facoltativo |  | 0 deg |

<a id="rotary-actuator"></a>

### Attuatore rotante · `rotary_actuator`

Attuatore rotante ad angolo limitato (pignone e cremagliera), a doppio effetto o a semplice effetto con richiamo a molla. Il volume per corsa è quello di catalogo (aria per una rotazione completa dell'angolo, una camera).

**Porte**: `A` utilizzo, `B` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `rotary_kind` | Tipo | `double` Doppio effetto; `single` Semplice effetto (richiamo a molla) | `double` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `angle` | Angolo | angolo (rad, deg) | catalogo, obbligatorio | `90 deg` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `min_pressure` | Pressione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `displacement` | Volume per corsa | volume (m3, l, cm3) | simulazione, facoltativo |  | 30 cm3 |
| `mass` | Massa equivalente sul raggio primitivo | massa (kg, g) | simulazione, facoltativo |  | 0.5 kg |
| `load` | Carico sul raggio primitivo | forza (N, kN, daN) | simulazione, facoltativo |  | 0 N |
| `friction` | Attrito | forza (N, kN, daN) | simulazione, facoltativo |  | 5 N |
| `spring_force` | Forza molla (semplice effetto) | forza (N, kN, daN) | simulazione, facoltativo |  | 30 N |

**Voci della palette**: Attuatore rotante a doppio effetto; Attuatore rotante a semplice effetto.

<a id="air-motor"></a>

### Motore pneumatico · `air_motor`

Motore pneumatico: gira consumando aria tra le porte 1 e 2. Reversibile gira nei due sensi; a un senso lavora solo con l'aria che entra da 1.

**Porte**: `1` utilizzo, `2` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `motor_kind` | Senso di rotazione | `reversible` Due sensi (reversibile); `one_way` Un senso | `reversible` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `8 bar` | — |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.4 |

**Voci della palette**: Motore pneumatico reversibile; Motore pneumatico a un senso.

## Vuoto

<a id="vacuum-ejector"></a>

### Generatore di vuoto (eiettore) · `vacuum_ejector`

Eiettore: l'aria compressa entra da 1, passa nell'ugello ed esce da 3, e crea il vuoto sulla porta 2. Senza alimentazione la porta 2 torna alla pressione atmosferica attraverso l'eiettore. Con il soffio di distacco, l'aria sulla porta 4 soffia nella porta 2 e stacca subito il pezzo dalla ventosa.

**Porte**: `1` alimentazione, `2` utilizzo, `3` scarico (può restare libera).

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `blowoff` | Soffio di distacco | `no` No; `yes` Sì (porta 4) | `no` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `8 bar` | — |
| `max_vacuum` | Vuoto massimo | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 0.85 bar |
| `flow` | Portata nominale Qn | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 0.1 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.5 |
| `suction_conductance` | Conduttanza di aspirazione | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 0.3 dm3/(s·bar) |

**Voci della palette**: Generatore di vuoto (eiettore); Generatore di vuoto con soffio di distacco.

<a id="vacuum-pump"></a>

### Pompa del vuoto · `vacuum_pump`

Pompa del vuoto con il suo motore: in simulazione tiene la porta 1 al vuoto indicato.

**Porte**: `1` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `vacuum` | Vuoto | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `0.8 bar` | obbligatorio |
| `flow` | Portata aspirata | portata (ANR) (Nl/min, Nl/s, Nm3/h, Nm3/s) | catalogo, facoltativo |  | — |

<a id="suction-cup"></a>

### Ventosa · `suction_cup`

Ventosa: tiene il pezzo quando la porta 1 è in vuoto. La forza di presa è il vuoto per l'area della ventosa.

**Porte**: `1` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `diameter` | Diametro della ventosa | lunghezza (m, cm, mm, in) | catalogo, obbligatorio | `20 mm` | obbligatorio |

## Misura e segnalazione

<a id="pressure-sensor"></a>

### Sensore di pressione analogico · `pressure_sensor`

Trasduttore di pressione con uscita analogica (per esempio 0–10 V o 4–20 mA) proporzionale alla pressione sulla porta 1. In simulazione mostra la pressione come un manometro.

**Porte**: `1` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `range_max` | Fondo scala | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `10 bar` | obbligatorio |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `16 bar` | — |

<a id="pressure-indicator"></a>

### Indicatore di pressione · `pressure_indicator`

Indicatore che segnala la presenza di pressione sulla porta 1: ottico (si colora), digitale (display) o acustico. In simulazione si accende sopra la soglia.

**Porte**: `1` utilizzo.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `indicator_kind` | Tipo | `optical` Ottico; `digital` Digitale (display); `acoustic` Acustico | `optical` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `threshold` | Soglia | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 1 bar |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |

**Voci della palette**: Indicatore ottico; Indicatore digitale; Segnalatore acustico.

<a id="flow-meter"></a>

### Misuratore di portata · `flow_meter`

Flussometro in linea tra 1 e 2: in simulazione mostra la portata che lo attraversa.

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `conductance` | Conduttanza C | conduttanza sonica C (dm3/(s·bar), m3/(s·Pa)) | simulazione, facoltativo |  | 3 dm3/(s·bar) |
| `critical_ratio` | Rapporto critico b (minore di 1) | numero puro (numero) | simulazione, facoltativo |  | 0.45 |

<a id="differential-gauge"></a>

### Manometro differenziale · `differential_gauge`

Manometro differenziale: mostra la differenza di pressione tra le porte 1 e 2 (per esempio a cavallo di un filtro, per vedere quando è intasato).

**Porte**: `1` utilizzo, `2` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |

<a id="thermometer"></a>

### Termometro · `thermometer`

Termometro sulla linea (la simulazione è a temperatura costante, 20 °C).

**Porte**: `1` utilizzo.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |

## Elettrico

<a id="electric-supply"></a>

### Alimentazione elettrica · `electric_supply`

Alimentazione in corrente continua: morsetti + e 0V.

**Porte**: `+` morsetto elettrico, `0V` morsetto elettrico.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `voltage` | Tensione | tensione (V, mV, kV) | catalogo, obbligatorio | `24 V` | obbligatorio |

<a id="pushbutton"></a>

### Pulsante · `pushbutton`

Pulsante o interruttore: a impulso resta azionato finché si tiene premuto, con ritenuta resta dove lo si lascia.

**Porte**: `13` morsetto elettrico, `14` morsetto elettrico.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `contact` | Contatto | `no` NA (normalmente aperto); `nc` NC (normalmente chiuso); `co` In scambio | `no` |
| `operation` | Azionamento | `momentary` A impulso; `latching` Con ritenuta | `momentary` |

Nessun parametro.

**Voci della palette**: Pulsante NA; Pulsante NC; Interruttore NA; Pulsante di emergenza (NC con ritenuta).

<a id="relay-coil"></a>

### Bobina di relè · `relay_coil`

Bobina di relè (K): eccitata, commuta tutti i contatti che la indicano.

**Porte**: `A1` morsetto elettrico, `A2` morsetto elettrico.

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `pickup_time` | Tempo di attrazione | tempo (s, ms, min) | simulazione, facoltativo |  | 10 ms |

<a id="timer-relay"></a>

### Relè temporizzato · `timer_relay`

Temporizzatore (KT): i suoi contatti commutano con ritardo dopo l'eccitazione o dopo la diseccitazione.

**Porte**: `A1` morsetto elettrico, `A2` morsetto elettrico.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `timer_mode` | Funzione | `on_delay` Ritardato all'eccitazione; `off_delay` Ritardato alla diseccitazione | `on_delay` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `delay` | Ritardo | tempo (s, ms, min) | catalogo, obbligatorio | `2 s` | obbligatorio |

**Voci della palette**: Temporizzatore ritardato all'eccitazione; Temporizzatore ritardato alla diseccitazione.

<a id="relay-contact"></a>

### Contatto di relè · `relay_contact`

Contatto azionato da un relè, da un temporizzatore o da un pressostato, indicato per sigla (relay: "K1").

**Porte**: `13` morsetto elettrico, `14` morsetto elettrico.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `contact` | Contatto | `no` NA (normalmente aperto); `nc` NC (normalmente chiuso); `co` In scambio | `no` |

Nessun parametro.

**Voci della palette**: Contatto NA; Contatto NC; Contatto in scambio.

<a id="valve-solenoid"></a>

### Bobina di elettrovalvola · `valve_solenoid`

Bobina (Y) del solenoide di una valvola, indicato con valvola e lato (drives: "V1.14").

**Porte**: `A1` morsetto elettrico, `A2` morsetto elettrico.

Nessun parametro.

<a id="limit-switch"></a>

### Finecorsa elettrico · `limit_switch`

Microinterruttore a rullo azionato da un cilindro (cam: "C1+" stelo tutto fuori, "C1-" tutto dentro, "C1@80 mm" camma a 80 mm dal fondello; con la leva unidirezionale "C1+@80 mm" scatta solo in uscita). Il collegamento si imposta nella scheda Sensori e finecorsa del cilindro.

**Porte**: `13` morsetto elettrico, `14` morsetto elettrico.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `contact` | Contatto | `no` NA (normalmente aperto); `nc` NC (normalmente chiuso); `co` In scambio | `no` |
| `switch_actuation` | Azionamento | `roller` Rullo; `roller_oneway` Rullo unidirezionale (leva ribaltabile) | `roller` |

Nessun parametro.

**Voci della palette**: Finecorsa NA; Finecorsa NC; Finecorsa in scambio; Finecorsa NA unidirezionale.

<a id="proximity-sensor"></a>

### Sensore di prossimità · `proximity_sensor`

Sensore a tre fili, uscita PNP: BN al +, BU al 0V, BK è l'uscita, che va a tensione quando lo stelo è nella posizione indicata (cam: "C1+" o "C1-" a fine corsa, "C1@80 mm" a 80 mm dal fondello; negli schemi delle versioni precedenti anche il parametro posizione). Il collegamento si imposta nella scheda Sensori e finecorsa del cilindro.

**Porte**: `BN` morsetto elettrico, `BU` morsetto elettrico, `BK` morsetto elettrico.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `sensor_kind` | Tipo | `reed` Magnetico (reed); `inductive` Induttivo; `capacitive` Capacitivo; `optical` Ottico | `reed` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `position` | Posizione dal fondello (versioni precedenti) | lunghezza (m, cm, mm, in) | catalogo, facoltativo |  | — |
| `range` | Campo di rilevamento (±) | lunghezza (m, cm, mm, in) | simulazione, facoltativo |  | 3 mm |

<a id="pressure-switch"></a>

### Pressostato · `pressure_switch`

Pressostato: si collega alla linea pneumatica con la porta 1 e aziona i contatti che lo indicano quando la pressione supera la taratura. Il vacuostato interviene quando il vuoto supera la taratura (scritta come grado di vuoto, per esempio 0,5 bar).

**Porte**: `1` pilotaggio.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `switch_kind` | Tipo | `mechanical` Meccanico (a molla); `electronic` Elettronico; `vacuum` Vacuostato (interviene sul vuoto) | `mechanical` |

| Parametro | Descrizione | Grandezza (unità ammesse) | Tipo | Valore della palette | Se manca, in simulazione |
|---|---|---|---|---|---|
| `setpoint` | Pressione di intervento | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, obbligatorio | `4 bar` | obbligatorio |
| `setpoint_min` | Campo di regolazione min | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `setpoint_max` | Campo di regolazione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo |  | — |
| `max_pressure` | Pressione max | pressione (Pa, kPa, MPa, bar, mbar, psi) | catalogo, facoltativo | `10 bar` | — |
| `hysteresis` | Isteresi | pressione (Pa, kPa, MPa, bar, mbar, psi) | simulazione, facoltativo |  | 0.5 bar |

**Voci della palette**: Pressostato; Pressostato elettronico; Vacuostato.

<a id="wire-reference"></a>

### Rimando elettrico · `wire_reference`

Rimando di un filo: il filo continua su un altro foglio o in un'altra parte dello schema. Tutti i rimandi elettrici con la stessa descrizione sono collegati tra loro, anche in simulazione; scrivi nella descrizione il nome del potenziale o del filo, per esempio «L+», «0V» o «13».

**Porte**: `1` morsetto elettrico (può restare libera).

Nessun parametro.

<a id="signal-lamp"></a>

### Lampada di segnalazione · `signal_lamp`

Lampada (H): accesa quando ha tensione tra i morsetti X1 e X2.

**Porte**: `X1` morsetto elettrico, `X2` morsetto elettrico.

| Opzione | Descrizione | Scelte | Predefinita |
|---|---|---|---|
| `lamp_color` | Colore | `green` Verde; `red` Rossa; `yellow` Gialla; `white` Bianca; `blue` Blu | `green` |

Nessun parametro.
