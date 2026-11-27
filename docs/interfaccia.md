# Interfaccia grafica

L'editor è un'applicazione web in TypeScript che gira tutta nel browser: modello, validazione e
simulazione sono moduli TypeScript, senza server. Il disegno è in SVG; Vite fa da server di
sviluppo e produce la versione pubblicata.

È online su **<https://prog3dac.github.io/Pneutrack/>**, aggiornata a ogni merge in `main`
dal workflow `.github/workflows/pages.yml`.

## Avvio in locale

```bash
npm install
npm run dev        # http://localhost:5173/Pneutrack/
npm run build      # versione pubblicabile in dist/
```

`BASE=./ npm run build` produce una build con percorsi relativi, da pubblicare in una cartella qualsiasi.

## Uso

La finestra ha due modalità, scelte con l'interruttore al centro della barra in alto:

- **Disegno**: a sinistra la barra delle sezioni (Pneumatica, Elettrico, Blocchi, Foglio) e la palette
  a icone; al centro il foglio; a destra, solo quando serve, la colonna delle proprietà. Sopra la selezione
  compare una barra con ✎ (dati del componente), Ruota, Specchia ↔ / ↕, Duplica ed Elimina; in basso a destra del foglio ci sono
  zoom, *Adatta* e il menu *Mostra*.
- **Simula**: palette e barra delle sezioni si nascondono; a destra ci sono comandi e valori in tempo
  reale, in basso la fascia con Pausa, Ricomincia, velocità, tempo e il diagramma delle fasi.

Nella barra in alto il menu **File** raccoglie Progetti, Nuovo, Salva, Salva copia, Importa ed Esporta;
**Modifica** raccoglie Taglia, Copia, Incolla e Seleziona tutto. Annulla, Ripeti, Esempi e PDF restano a vista.
Il bollino di validazione a destra («✓ Schema valido», oppure il numero di errori e avvisi) apre l'elenco
dei problemi.

- **Inserire** un componente: trascinalo dalla palette sul foglio, oppure fai clic per metterlo al centro.
  La palette è divisa in categorie richiudibili (alimentazione e trattamento aria, valvole
  distributrici, valvole di blocco e logiche, regolazione, attuatori, elettrico) e ha una casella di ricerca;
  la barra delle sezioni porta direttamente ai componenti elettrici o ai blocchi salvati. Un clic sulla
  sezione già attiva nasconde la palette per lasciare più spazio al foglio, un altro clic la riapre; la
  scelta resta salvata nel browser.
  Le valvole distributrici più comuni e i serbatoi di varie taglie sono già configurati.
- **Collegare**: trascina da una porta a un'altra. Più linee sulla stessa porta formano un raccordo a T.
- **Linee**: trascina una linea per piegarla dove vuoi (nasce un punto di piega, agganciato alla
  griglia); trascina i punti per spostarli, doppio clic su un punto per toglierlo. Tutte le porte dei
  simboli cadono sui nodi della griglia, quindi due porte allineate si collegano con un tratto dritto.
  Dopo ogni spostamento la linea perde da sola i gradini di un passo e le pieghe superflue;
  *Raddrizza linea* toglie anche i gradini di due passi, *Togli le pieghe* torna al percorso automatico.
- **Tubi**: seleziona una linea e scegli la misura (Ø4×2,5, Ø6×4, Ø8×5, Ø10×6,5, Ø12×8 o
  personalizzata) e la lunghezza. Il pannello mostra volume e conduttanza stimata; lo spessore
  della linea segue il diametro. *Usa questo tubo per tutte le linee* lo applica a tutte le linee
  di potenza; le nuove linee ricevono l'ultimo tubo scelto. Una linea senza misura è ideale.
- **Colonna di destra**: compare solo quando serve, cioè in Simula e, in Disegno, quando sono
  selezionati testi o forme, una linea, un blocco o più elementi insieme. Con un componente
  selezionato, o niente, il foglio usa tutta la larghezza.
- **Proprietà**: doppio clic su un componente (o *Invio* con il componente selezionato) apre la finestra dei suoi dati; le modifiche si vedono subito, *OK* le tiene in un solo passo annullabile e *Annulla*/*Esc* le scarta. Nella finestra si cambiano sigla, descrizione, funzione della valvola,
  comandi, parametri da catalogo (`6 bar`, `32 mm`, `0,6 MPa`...; un numero senza unità prende
  l'unità tipica del parametro) e parametri di simulazione (conduttanza, massa, carico, attrito).
  Per i cilindri si può scegliere una **misura standard** (ISO 6432, ISO 21287, ISO 15552), che
  imposta alesaggio e stelo; i campi di alesaggio, stelo e corsa suggeriscono i valori
  normalizzati ma accettano qualunque valore. Vengono mostrate aree e forze teoriche. I comandi
  delle valvole seguono ISO 1219: solenoide diretto o con valvola pilota (alimentazione interna o
  esterna), pilotaggio, pulsante, leva, leva con arresto, pedale, rullo, tastatore, rullo
  unidirezionale e molla. Per una valvola con comando meccanico
  si può scegliere il **finecorsa** (cilindro e posizione, per esempio C1+) che la aziona.
- **Ammortizzo**: nei cilindri a doppio effetto si sceglie l'ammortizzo regolabile (ai due fine
  corsa o su uno solo), la sua lunghezza e l'apertura delle viti: una per l'ammortizzo in uscita
  (testata) e una per quello in rientro (fondello), ciascuna con il suo cursore in simulazione.
- **Linee**: la linea selezionata diventa arancione e passa sopra ai simboli, le altre si
  attenuano. Il colore delle linee indica la fascia di pressione (massima raggiungibile mentre si
  disegna, istantanea in simulazione); la legenda è in basso a sinistra.
- **Mostra**: il menu in basso a destra del foglio nasconde o mostra sigle, descrizioni, valori della
  simulazione, numeri delle porte, finecorsa, misure dei tubi, punti di collegamento, linee di
  pilotaggio e di scarico, griglia e legenda. La scelta resta salvata nel browser.
- **Foglio e PDF**: nella finestra *Schema e foglio* (doppio clic su un punto vuoto del foglio, o *Foglio* nella barra delle sezioni) si sceglie il formato
  da A4 ad A0, l'orientamento e i dati del cartiglio (disegnato da, numero disegno, revisione).
  *Formato adatto al disegno* sceglie il formato più piccolo che lo contiene; *Centra sul disegno*
  sposta il foglio. Il pulsante *PDF* scarica il foglio in PDF vettoriale, in tema chiaro e senza
  selezioni; senza un formato scelto usa il più piccolo adatto. Il menu *Mostra* vale anche per il
  PDF.
- **Fogli**: le schede sotto l'area di lavoro mostrano i fogli del progetto. Un clic apre un foglio
  (anche in simulazione; da tastiera *PagSu* / *PagGiù*), *+* ne aggiunge uno dopo quello aperto con lo
  stesso formato e cartiglio, il doppio clic rinomina, il trascinamento riordina; il menu ▾ (o il clic
  destro) rinomina, duplica (con sigle nuove), sposta ed elimina. Ogni foglio ha il suo disegno e il suo
  cartiglio, che riporta «Foglio n di N» e il nome del foglio. Il circuito è uno solo: i rimandi
  (pneumatico e elettrico) con la stessa descrizione collegano i fogli, accanto a ogni rimando compare
  il foglio dove prosegue (un clic ci porta) e la simulazione tratta tutti i fogli insieme. Copia e
  incolla funzionano tra fogli; *Annulla* riporta al foglio dove era avvenuta la modifica. Con più fogli
  PDF, SVG e DXF chiedono se esportare il foglio aperto o tutti: il PDF ha una pagina per foglio, l'SVG
  un file per foglio, il DXF i fogli affiancati. La distinta conta i pezzi di tutti i fogli e indica il
  foglio di ogni sigla.
- **Versione**: il numero accanto al nome dell'app apre le novità di ogni versione
  ([CHANGELOG.md](../CHANGELOG.md)); dopo un aggiornamento si aprono da sole una volta.
- **Manuale d'uso**: *File* → «Manuale d'uso…» apre il manuale (uso e convenzioni, come calcola la
  simulazione, componenti e parametri), con i collegamenti tra le parti; funziona anche senza rete.
- **Validazione**: avviene a ogni modifica. I problemi si aprono con il bollino di validazione nella barra
  in alto (clic su un problema per andare al componente), i componenti con errori sono bordati di rosso, le porte
  scollegate sono rosse e le linee in pressione sono blu (tratteggiate quelle di pilotaggio).
- **Simulazione**: l'interruttore *Simula* anima lo schema, se non ci sono errori. Le linee si colorano con la
  pressione, le caselle delle valvole scorrono nella posizione attiva e gli steli dei cilindri si
  muovono. Pulsanti e rulli si azionano tenendo premuto il loro simbolo (o il bottone nel pannello),
  i solenoidi si eccitano e diseccitano a ogni clic; i pilotaggi commutano da soli quando la
  pressione supera `min_pressure` (2 bar se non indicata), i finecorsa commutano quando lo stelo
  arriva in fondo. Manometri e serbatoi mostrano la pressione, i temporizzatori il tempo che manca. *Pausa* (barra spaziatrice),
  *Ricomincia* e la velocità (da 0,05× a tempo reale) controllano il tempo. Durante la simulazione
  lo schema non si modifica; *Disegno* (o `Esc`) torna al disegno, con la vista com'era prima.
- **Regolazioni in simulazione**: riduttori (anche FRL e filtro riduttore), limitatrici, valvole di
  sequenza, pressostati, strozzatori, viti di ammortizzo, temporizzatori e alimentazione hanno un
  cursore nel pannello («Regolazioni») e uno accanto al simbolo, che si apre con un clic; la rotellina
  sul simbolo cambia il valore di un passo (*Maiusc*: dieci). Il campo è quello di regolazione del
  catalogo (`setpoint_min` … `setpoint_max`), altrimenti da 0 alla pressione max. I valori restano
  finché si resta in Simula; «Riporta nello schema» li scrive nello schema. I gruppi con manometro
  (FRL, riduttore e filtro riduttore «con manometro») mostrano la pressione a valle (porta 2).
- **Progetti**: *Salva* (`Ctrl+S`) registra lo schema nell'archivio dei progetti; da quel momento
  ogni modifica viene salvata in automatico dopo un istante. *Salva copia* crea un nuovo progetto.
  La finestra *Progetti* elenca i progetti (più recenti in alto), con ricerca, apertura,
  rinomina, duplicazione, eliminazione con conferma, nuovo progetto e importazione di un file.
  Alla riapertura della pagina torna l'ultimo progetto aperto; uno schema non ancora salvato
  resta come bozza nel browser.
- **File**: *Esporta* scarica lo schema come `.pneu.json` (formato `pneutrack/circuit` con la
  disposizione grafica in `layout`); *Importa file…* nella finestra Progetti lo ricarica.

## Dove vengono salvati i progetti

| Dove gira la pagina | Archivio |
|---|---|
| GitHub Pages, `npm run dev` o un altro hosting | memoria del browser (`localStorage`), solo su quel dispositivo e quel browser: usare *Esporta* per le copie o per passare a un altro computer |
| Pagina pubblicata su claude.ai | database della pagina, sezione privata di ogni utente (`data/users/<id>`) |

Un progetto è `{"id", "name", "createdAt", "updatedAt", "circuit"}`, dove `circuit` è lo schema.

## Punti di connessione

Per diramare una linea si trascina una nuova linea da una porta fin sopra la linea esistente: la
linea si illumina e, al rilascio, nasce un punto di connessione (pallino pieno, ISO 1219) che la
spezza in due. Allo stesso punto si possono collegare altre linee trascinandole dall'anello
attorno al pallino; trascinando il centro si sposta il punto. Il pulsante *Aggiungi punto di
connessione* nel pannello di una linea fa lo stesso a metà del tratto più lungo, e il *Punto di
connessione* della palette si può lasciare direttamente su una linea. Un tubo spezzato si divide
in proporzione alla lunghezza disegnata. Eliminando un punto che unisce solo due linee, le due
linee tornano una sola.

## Descrizioni dei campi

Passando il mouse su un campo della finestra o del pannello a destra (le etichette con «?») compare una descrizione:
a che cosa serve il dato, le unità accettate, se è obbligatorio e il valore usato se resta vuoto. I
testi sono in `src/ui/help.ts`; un test controlla che ogni parametro e ogni opzione del catalogo ne
abbia uno, quindi un componente nuovo va accompagnato dalle sue descrizioni.

## Ruota e specchia

*Ruota* (`R`) gira il simbolo di 90° in senso orario. *Specchia ↔* (`H`) lo ribalta da sinistra a
destra, *Specchia ↕* (`V`) dall'alto in basso: le porte passano dall'altra parte e le linee le
seguono, mentre le scritte restano leggibili. Con più componenti o un blocco si specchia il gruppo
intero attorno al suo centro, con le pieghe delle linee interne. Nel file la specchiatura è
`"mirror": true` nel `layout` del componente; il circuito pneumatico non cambia.

## Testi e forme

La sezione **Annot.** della barra a sinistra porta alle voci di testo e disegno della palette:

- **Testo**: testo libero, nota in riquadro, richiamo con freccia, indice di revisione (lettera in
  un triangolo).
- **Forme**: linea, freccia, polilinea, rettangolo, cerchio, ellisse.
- **Elementi della norma**: contorno di gruppo tratto-punto (ISO 1219-2, per un assieme o un gruppo
  funzionale, con titolo), linea tratto-punto, collegamento meccanico (doppia linea, ISO 1219-1),
  direzione del flusso (triangolo vuoto).

Si inseriscono come i componenti (clic o trascinamento) e si spostano trascinandone il bordo o il
testo. Le maniglie ridimensionano rettangoli ed ellissi; nelle linee si trascinano i punti, il +
a metà di un tratto aggiunge un punto e un doppio clic su un punto lo toglie. Il pannello a destra
cambia colore (sette colori o uno a scelta), tipo di linea (continua, tratteggiata, tratto-punto,
tratto-due-punti, punteggiata, doppia), spessore (0,25–0,7 mm), riempimento e terminali; per i
testi altezza (2,5–7 mm, ISO 3098), grassetto, corsivo, allineamento, rotazione e riquadro.

- Un **contorno di gruppo** con *Sposta insieme i componenti racchiusi* (attivo per quello della
  palette) si porta dietro i componenti che contiene, con le loro linee.
- La punta di un **richiamo** lasciata su un componente vi si aggancia e lo segue quando lo si
  sposta; trascinandola altrove si sgancia.
- Doppio clic su un testo per scriverlo nel pannello; `R` lo ruota di 90°. *Blocca posizione*
  evita di spostare per sbaglio un riquadro grande.
- Selezione con il riquadro, Maiusc+clic, copia, incolla, duplica, annulla ed elimina valgono anche
  per testi e forme. Le forme stanno sotto le linee, i testi sopra ai simboli.
- PDF, SVG e DXF riportano testi e forme con il loro stile; nel DXF stanno sul layer ANNOTAZIONI.

## Circuito elettrico di comando

Pulsanti, relè, temporizzatori, bobine, finecorsa elettrici, sensori, pressostati e lampade sono nella categoria
«Elettrico» della palette, con i simboli CEI EN 60617 disegnati in verticale come negli schemi a scala. Il circuito
elettrico si disegna accanto a quello pneumatico: i fili sono sottili e marroni, e un filo non si può collegare a
una porta pneumatica. Le due parti si legano per sigla, dal pannello delle proprietà:

- bobina di elettrovalvola: «Solenoide comandato» sceglie valvola e lato (solo i lati con un solenoide); la sigla
  della bobina compare accanto al solenoide della valvola;
- contatto di relè: «Azionato da» sceglie il relè, il temporizzatore o il pressostato;
- finecorsa elettrico e sensore di prossimità: il cilindro e il fine corsa (+ fuori, − dentro).

Rinominando un componente, i riferimenti che lo indicano si aggiornano.

In simulazione si fa clic su pulsanti, interruttori e finecorsa senza cilindro (nel disegno o tra i «Comandi
elettrici» del pannello): a impulso restano azionati finché si tiene premuto, con ritenuta cambiano stato a ogni
clic. I fili sotto tensione diventano rossi, i contatti azionati e le bobine eccitate si colorano e le lampade si
accendono. Un solenoide con una bobina segue il circuito elettrico e non compare più tra i comandi a clic. Il
pannello mostra lo stato di relè, temporizzatori (con il tempo che manca), bobine e lampade, e avvisa in caso di
cortocircuito o di un relè che continua a commutare da solo.

## Diagramma delle fasi

Durante la simulazione il diagramma delle fasi occupa la fascia in basso (il pulsante «📈 Diagramma delle fasi» lo nasconde o lo riapre):
una corsia per ogni cilindro (corsa da 0, tutto dentro, a 1, tutto fuori) e una per ogni bobina, lampada e
contatto di relè (acceso o spento). Senza circuito elettrico al posto delle bobine ci sono le valvole (azionata o
a riposo). «Tempo» mette in orizzontale i secondi (diagramma spostamento-tempo); «Passi» mette a distanza uguale
gli istanti in cui un cilindro arriva a fine corsa (diagramma spostamento-passo). Si registrano gli ultimi 60 s;
«Ricomincia» azzera il diagramma. L'etichetta di un componente compare accanto alla sua sigla.

Ogni manometro ha una corsia con la pressione (da 0 alla pressione di alimentazione più alta, arrotondata al bar).
Accanto a ogni arrivo a fine corsa c'è il tempo della corsa, dalla partenza dal fine corsa opposto all'arrivo.
La fascia «Cicli» in basso mostra ogni ciclo con durata e aria consumata: un ciclo va dalla partenza del primo
cilindro dalla posizione che avevano all'avvio al ritorno di tutti in quella posizione (un cilindro è a fine corsa
entro l'1 % della corsa, o entro 2,5 mm, la zona in cui un rullo è già azionato).

## Misure

Nel pannello della simulazione la sezione «Misure» riporta, con la spiegazione al passaggio del mouse:

- la pressione di ogni manometro;
- l'aria consumata dall'inizio e la portata attuale, in litri normali (Nl e Nl/min, condizioni ANR della ISO 8778:
  20 °C e 1 bar assoluto). È l'aria che esce dalle alimentazioni, compreso il riempimento iniziale delle linee;
- i cicli completati, la durata e l'aria dell'ultimo ciclo, la media per ciclo e il consumo medio in Nl/min (aria dei
  cicli divisa per la loro durata). L'aria di un ciclo parte dall'ultimo istante a portata ferma prima della
  partenza e arriva a quando la portata si ferma dopo il ritorno (o alla partenza del ciclo dopo);
- per ogni cilindro il tempo dell'ultima uscita e dell'ultimo rientro.

## Selezione, copia e incolla

- Un clic seleziona un componente; `Maiusc`+clic aggiunge o toglie un componente dalla selezione.
- Trascinando sul vuoto si disegna un riquadro: sono selezionati i componenti che vi cadono
  dentro (con `Maiusc` si aggiungono a quelli già scelti). `Ctrl+A` seleziona tutto, `Esc` niente.
- `Ctrl+C` copia la selezione con le linee tra i componenti copiati, `Ctrl+X` la taglia, `Ctrl+V`
  la incolla sotto il puntatore (o, dai pulsanti, accanto all'originale) con sigle nuove. Copiando
  un blocco si incolla un blocco. La copia passa dagli appunti del sistema, quindi si incolla
  anche in un altro progetto, in un'altra scheda o in un altro browser.

## Blocchi

Un blocco raggruppa componenti e i condotti che li collegano, con un nome e una descrizione.

- **Unisci** (`Ctrl+G`) crea un blocco dai componenti selezionati; **Dividi** (`Ctrl+Maiusc+G`)
  lo scioglie lasciando i componenti dove sono.
- Un clic su un componente del blocco seleziona il blocco intero, che si sposta, duplica ed
  elimina insieme ai suoi condotti interni; un secondo clic seleziona il singolo componente.
- **Salva nella libreria** copia il blocco nel gruppo *Blocchi salvati* della palette, conservato
  nel browser: si inserisce con un clic o trascinandolo nello schema, in qualsiasi progetto.
- Il filtro *Riquadri dei blocchi* in *Mostra* nasconde le cornici tratteggiate.

Scorciatoie: `R` ruota, `H`/`V` specchia sinistra↔destra / alto↕basso, `Canc` elimina, `Ctrl+Z`/`Ctrl+Y` annulla/ripeti, `Ctrl+D` duplica,
`Ctrl+G`/`Ctrl+Maiusc+G` unisci/dividi, `Ctrl+A` seleziona tutto, `Ctrl+S` salva, `F` adatta la vista, `Ctrl+C`/`Ctrl+X`/`Ctrl+V` copia/taglia/incolla, rotella per lo zoom, `Spazio`+trascina o tasto
centrale del mouse per spostare la vista.

## Struttura

| File | Ruolo |
|---|---|
| `src/model/` | unità, componenti, schema, validazione ([modello-dati.md](modello-dati.md)) |
| `src/sim/` | dallo schema alla rete fisica, simulazione interattiva |
| `src/solver/` | prototipo del solutore (orifizi ISO 6358, RK4): riferimento indipendente per i test del caso base e `npm run demo`; non ha attrito di primo distacco, ammortizzo, peso, bloccaggio né consumo |
| `src/ui/diagram.ts` | diagramma delle fasi (registrazione in `src/sim/recorder.ts`, tempi di corsa e cicli in `src/sim/measures.ts`) |
| `src/ui/symbols.ts` | simboli in stile ISO 1219, posizione delle porte, stato animato |
| `src/ui/app.ts` | stato, disegno, interazioni, annulla/ripeti, progetti, simulazione |
| `src/ui/storage.ts` | archivio dei progetti (database della pagina, browser, memoria) |
| `src/ui/pwa.ts` | app installabile: registrazione del service worker, «Installa l'app…», avviso di versione nuova, file aperti dal sistema |
| `tools/pwa.ts`, `tools/sw.js` | in `npm run build` generano `dist/sw.js`, il service worker che tiene in memoria tutti i file della build per l'uso senza rete; manifest e icone sono in `public/` |
| `src/examples/` | esempi del menu *Esempi…* (ogni `.json` aggiunto qui compare da solo) |

## Test

- `npm test`: Vitest su modello, validazione, solutore e simulazione.
- `npm run e2e`: con `npm run build && npm run preview` attivo, `test/e2e/editor.mjs` usa
  Playwright per costruire uno schema nel browser, verificarne la validazione, annulla/ripeti,
  rinomina, rotazione, tubi e pieghe delle linee, esempi, esportazione, tutto il ciclo dei progetti e la simulazione
  (pulsante che fa uscire il cilindro, bistabile che resta commutata, ritorno).
- `npm run e2e:pwa`: con lo stesso server, `test/e2e/pwa.mjs` controlla manifest e icone, che il
  service worker metta in memoria l'app e che editor, catalogo, simulazione e PDF funzionino senza rete.

La CI (`.github/workflows/ci.yml`) esegue typecheck, test, build ed e2e a ogni pull request.
