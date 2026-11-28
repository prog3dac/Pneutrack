# Manuale d'uso di Pneutrack

Aggiornato alla versione **0.38.2**.

Questo manuale descrive i dati che si inseriscono nei componenti, come sono legati tra loro e le
regole con cui Pneutrack li usa per calcolare la simulazione. Nell'app si apre da *File* → «Manuale
d'uso…», anche senza rete. È diviso in tre parti:

| Parte | Contenuto |
|---|---|
| Questa pagina | Come si lavora con il software, convenzioni, unità di misura, come si ricavano i dati dai cataloghi |
| [calcoli.md](calcoli.md) | Il modello fisico: equazioni, formule di ogni componente, costanti del modello, metodo numerico |
| [componenti.md](componenti.md) | Riferimento di tutti i componenti: porte, opzioni, parametri, unità e valori predefiniti (generato dal catalogo) |

Altri documenti: la guida dell'interfaccia ([../interfaccia.md](../interfaccia.md)), il formato del file
([../modello-dati.md](../modello-dati.md)), il circuito elettrico di comando
([../elettropneumatica.md](../elettropneumatica.md)).

## 1. Flusso di lavoro

1. **Disegno.** Si trascinano i componenti dalla palette sul foglio e si collegano le porte con le linee.
   Una linea senza tubo è un *collegamento ideale*: le porte che unisce sono alla stessa pressione. Una linea
   con il tubo (diametro interno e lunghezza) ha un suo volume e una perdita di carico. I tubi di più linee
   si cambiano insieme: *Maiusc*+clic sulle linee, oppure un riquadro trascinato sul vuoto che le attraversa
   senza prendere componenti (vedi «Tubi» al §3).
2. **Dati.** Doppio clic sul simbolo (o *Invio*) apre la finestra del componente: a destra i parametri,
   divisi in *dati di catalogo* e *parametri di simulazione*. Un campo vuoto usa il valore predefinito
   indicato in [componenti.md](componenti.md). Il valore si scrive con l'unità (`6 bar`, `32 mm`,
   `400 Nl/min`); un'unità sbagliata (per esempio un alesaggio in bar) segna il campo in rosso.
3. **Validazione.** Mentre si disegna, lo schema viene controllato. Gli **errori** (porta di lavoro non
   collegata, sorgenti a pressioni diverse sulla stessa linea, alimentazione che scarica direttamente,
   pressione oltre la `max_pressure` di un componente, finecorsa che indica un cilindro inesistente,
   cortocircuito elettrico...) impediscono la simulazione. Gli **avvisi** (nessuna alimentazione,
   pilotaggio che non riceve mai pressione, taratura fuori dal campo di regolazione...) la lasciano partire.
4. **Simulazione.** *Simula* compila lo schema in una rete fisica (vedi [calcoli.md](calcoli.md)) e la fa
   avanzare nel tempo. Si azionano pulsanti, leve e solenoidi con un clic, si leggono pressioni, posizioni,
   velocità, tempi di corsa, consumo d'aria e la portata dei misuratori di portata (Nl/min accanto alla
   sigla e tra i *Valori*, negativa quando l'aria va da 2 verso 1), e si cambiano le regolazioni (riduttori, strozzatori, viti
   di ammortizzo, ritardi) mentre il circuito gira.

## 2. Convenzioni

### Pressioni

- Tutte le pressioni che si scrivono e che si leggono nell'editor sono **relative** (manometriche):
  `6 bar` significa 6 bar sopra l'atmosfera.
- Dentro la simulazione le pressioni sono **assolute**: p_ass = p_rel + p_atm, con
  **p_atm = 101 325 Pa** (1,013 bar).
- Il vuoto (`vacuum`, `max_vacuum`) si scrive come grado di vuoto positivo: `0.85 bar` vuol dire
  0,85 bar sotto l'atmosfera.

### Portate e aria consumata

- Le portate (`flow`, Qn) e il consumo sono in **condizioni normali ANR** (ISO 8778): 20 °C, 1 bar
  assoluto, 65 % di umidità relativa, densità **ρ_ANR = 1,185 kg/m³**. `Nl/min` sono litri normali al minuto.
- La conduttanza sonica C (ISO 6358) si scrive in `dm3/(s·bar)`, come nei cataloghi.

### Numerazione delle porte (ISO 5599 / ISO 11727)

| Numero | Ruolo |
|---|---|
| 1 | alimentazione |
| 2, 4 | utilizzo (uscite di lavoro) |
| 3, 5 | scarico |
| 12, 14 | pilotaggio: il 14 porta la valvola nella casella che collega 1 con 4, il 12 in quella che collega 1 con 2 |
| 21 | pilotaggio della non ritorno pilotata |
| A, B | camere dei cilindri: A fondello (fa uscire lo stelo), B testata (lo fa rientrare) |

Le caselle di una valvola si chiamano come il lato che le comanda: casella **14** (quella vicino al comando
14), casella **12**, e casella **0** (centrale) nelle valvole a tre posizioni.

### Segni e versi

- La corsa x di un cilindro va da 0 (stelo tutto dentro) alla corsa `stroke` (stelo tutto fuori);
  la velocità è positiva quando lo stelo esce.
- Il **carico** `load` è positivo quando si oppone all'uscita dello stelo.
- L'**angolo di montaggio** `mounting_angle` è 0° in orizzontale, +90° con lo stelo che esce verso l'alto
  (il peso si oppone all'uscita), −90° verso il basso.
- Il fine corsa in uscita di un cilindro si scrive `C1+`, quello in rientro `C1-` (per esempio nei rulli
  `cam_14` e nei finecorsa elettrici).

### Unità ammesse

Ogni valore numerico si scrive con un'unità. Le unità ammesse per ogni grandezza sono elencate in
[componenti.md](componenti.md). Le principali:

| Grandezza | Unità |
|---|---|
| pressione | Pa, kPa, MPa, bar, mbar, psi |
| lunghezza | m, cm, mm, in |
| volume | m3, l, cm3 |
| forza | N, kN, daN |
| portata ANR | Nl/min, Nl/s, Nm3/h, Nm3/s |
| conduttanza | dm3/(s·bar), m3/(s·Pa) |
| massa | kg, g |
| tempo | s, ms, min |
| angolo | deg, rad |
| aperture | % (0–100 %) oppure frazione 0–1 |

Nei file `.pneu.json` i valori sono stringhe con l'unità (`"6 bar"`); un'apertura scritta senza unità è
una frazione (`0.3` = 30 %).

## 3. Come si ricavano i dati

La simulazione usa i dati come si leggono sui cataloghi dei costruttori. Dove il catalogo dà una grandezza
diversa da quella che serve, la conversione è questa.

### Capacità di portata delle valvole e dei componenti in linea

Il modello di ogni passaggio d'aria è quello della norma ISO 6358: una **conduttanza sonica C** e un
**rapporto critico b** (vedi [calcoli.md](calcoli.md), §2).

| Il catalogo dà | Cosa scrivere |
|---|---|
| C e b (ISO 6358) | `conductance` e `critical_ratio` così come sono |
| Portata nominale Qn (Nl/min, 6 bar a monte, Δp = 1 bar) | `flow`: il programma ricava C da Qn e b (formula in [calcoli.md](calcoli.md), §2.2) |
| Coefficiente Cv | C ≈ 5 × Cv dm³/(s·bar) (conversione approssimata dei cataloghi); b ≈ 0,3 se non indicato |
| Area efficace S (mm²) | C ≈ S / 5 dm³/(s·bar) |

Se ci sono sia `conductance` sia `flow`, vale `conductance`. Se mancano entrambi vale il valore predefinito
del tipo (elencato in [componenti.md](componenti.md)).

### Cilindri

| Dato | Da dove si prende |
|---|---|
| `bore`, `rod`, `stroke` | codice d'ordine del cilindro |
| `mass` | massa mobile: pistone e stelo (scheda del cilindro) più tutto ciò che lo stelo trascina (attrezzatura, pezzo) |
| `load` | forza esterna costante che si oppone all'uscita; per un carico che cambia lungo la corsa si usa il profilo di forza |
| `friction` | attrito delle guarnizioni a camere scariche (cataloghi: qualche newton per gli alesaggi piccoli) |
| `static_friction` | attrito di primo distacco, se il catalogo lo dà (di solito 1,5–2 volte quello dinamico) |
| `mounting_angle` | angolo dell'asse del cilindro rispetto all'orizzontale |
| `cushion_length` | lunghezza dell'ammortizzo pneumatico (scheda tecnica; se manca ≈ 0,6 × alesaggio) |
| `cushion_opening_rod`, `cushion_opening_cap` | aperture delle due viti dell'ammortizzo, in uscita (testata) e in rientro (fondello): si trovano provando in simulazione, come in macchina. Negli schemi delle versioni precedenti la vite unica `cushion_opening` vale per tutte e due |

L'attrito che cresce con la pressione nelle camere e l'attrito viscoso non si inseriscono: il programma li
calcola dall'alesaggio e dalle pressioni (vedi [calcoli.md](calcoli.md), §4.3).

### Attuatori rotanti

| Dato | Da dove si prende |
|---|---|
| `angle` | angolo di rotazione del codice d'ordine (90°, 180°...) |
| `displacement` | volume per corsa (cm³) della scheda: l'aria di una camera per tutto l'angolo. Se il catalogo dà la coppia teorica M a una pressione p, `displacement` = M · θ / p (θ in radianti) |
| `mass` | massa equivalente sul raggio primitivo di 10 mm: J / r², con J il momento d'inerzia del carico. Per esempio J = 0,001 kg·m² → 10 kg |
| `load` | coppia resistente divisa per il raggio primitivo: M / 0,01 m |

### Tubi

Diametro interno e lunghezza della linea: dalla misura commerciale (Ø6×4 vuol dire esterno 6 mm, interno
4 mm) e dal percorso reale. Il programma ne ricava volume e conduttanza (vedi [calcoli.md](calcoli.md), §3).

Con più linee selezionate il pannello mostra i campi del tubo comuni a tutte: un campo con valori diversi
resta vuoto con la scritta «valori diversi» (la misura mostra «misure diverse») e, lasciato vuoto, non cambia
niente. Le regole della modifica in blocco:

| Campo | Effetto sulle linee selezionate |
|---|---|
| Misura | stessi diametri per tutte; ogni linea tiene la sua lunghezza, quelle senza tubo prendono la lunghezza dell'ultimo tubo scelto (1 m se non ce n'è uno). «Non specificato» le rende tutte ideali |
| Ø esterno, Ø interno | lo stesso valore su tutte le linee che hanno il tubo |
| Lunghezza | **la stessa lunghezza** su tutte le linee che hanno il tubo |
| Scala le lunghezze | ogni lunghezza moltiplicata per lo stesso fattore, ciascuna dalla sua (120 % o ×1,2 allunga di un quinto), arrotondata al millimetro |

Le linee ideali restano ideali finché non si sceglie una misura; i fili elettrici selezionati insieme non
cambiano. Il pannello riporta la lunghezza e il volume totali dei tubi selezionati. Ogni modifica è un solo
passo di *Ctrl+Z*.

### Riduttori, valvole di pressione, pressostati

`setpoint` è la taratura (pressione relativa). `setpoint_min` e `setpoint_max` sono il campo di regolazione
del catalogo: i cursori della simulazione restano in quel campo e la validazione segnala una taratura fuori
dal campo.

## 4. Tenere aggiornato il manuale

Il manuale fa parte del software: **ogni modifica che cambia parametri, componenti, formule o
convenzioni della simulazione aggiorna il manuale nella stessa modifica.**

- [componenti.md](componenti.md) si rigenera con `npm run manuale` dopo ogni modifica al catalogo
  (`src/model/components.ts`). Il test `test/manuale.test.ts` fallisce se il file non è aggiornato.
- [calcoli.md](calcoli.md) si aggiorna a mano quando cambia il modello fisico (`src/sim`, `src/solver`):
  equazioni, costanti, regole dei componenti. Il test controlla che ogni tipo di componente pneumatico vi
  sia descritto.
- La riga «Aggiornato alla versione» in cima a questa pagina segue la versione di `package.json`: il test
  fallisce se a una nuova versione non corrisponde un manuale rivisto.
