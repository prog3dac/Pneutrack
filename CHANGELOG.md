# Registro delle modifiche

Ogni versione pubblicata su https://prog3dac.github.io/Pneutrack/ ha un numero `maggiore.minore.correzione`.
La versione in uso compare accanto al nome dell'app; un clic apre queste note.

## 0.38.2 · 2026-11-28

- Simbolo della non ritorno pilotata: la casella è centrata sulla linea, che ora sporge della stessa lunghezza sopra e sotto (prima sotto era molto più lunga). La sfera sta nella parte bassa della casella e il pilotaggio, come nel disegno della ISO 1219-3, sale in diagonale alla sfera ed esce tratteggiato verso la porta 21. Porte e simulazione non cambiano.

## 0.38.1 · 2026-11-28

- Simbolo della non ritorno pilotata (NRP) corretto secondo la ISO 1219-1 (X10720), con il disegno degli esempi della ISO 1219-3: la molla è uno zig-zag centrato sull'asse della linea che occupa la parte alta del corpo, sopra la sfera; prima era un piccolo ricciolo in alto a sinistra. Il pilotaggio tratteggiato ora entra nel corpo e arriva in diagonale alla sfera, che solleva dalla sede. In tutti i simboli con non ritorno (non ritorno, con molla, pilotata, doppia pilotata, strozzatore unidirezionale, innesto rapido, OR e scarico rapido) la sfera è tangente ai due lati della sede. Porte, dimensioni e simulazione non cambiano: gli schemi salvati si aprono come prima.

## 0.38.0 · 2026-11-28

- Tubi di più linee cambiati insieme. Si selezionano più linee con *Maiusc*+clic, con un riquadro trascinato sul vuoto che le attraversa (senza prendere componenti), con «Seleziona le linee con questo tubo» dal pannello di una linea, o con «Seleziona le linee tra questi componenti» da una selezione di componenti. Il pannello mostra misura, diametri e lunghezza comuni («valori diversi» dove non lo sono) e la lunghezza e il volume totali.
- La misura cambia i diametri di tutte tenendo la lunghezza di ognuna; *Lunghezza* dà a tutte la stessa lunghezza; il nuovo campo «Scala le lunghezze» le moltiplica tutte per lo stesso fattore (120 % o ×1,2), ciascuna dalla sua. Le linee senza tubo restano ideali finché non si sceglie una misura, i fili elettrici non cambiano. *Canc* elimina tutte le linee selezionate.

## 0.37.1 · 2026-11-27

- Misuratore di portata: in simulazione mostra la portata che lo attraversa, in Nl/min accanto alla sigla e tra i *Valori* del pannello, con l'aria passata dall'inizio (con il segno − quando l'aria va da 2 verso 1, per esempio nello scarico del rientro). Prima la portata era calcolata ma non compariva da nessuna parte. A cilindro fermo segna zero.

## 0.37.0 · 2026-11-27

- Simulazione più veloce: circa il doppio sugli schemi grandi, e la pagina non si blocca più. L'editor dedica alla simulazione al più 12 ms per fotogramma; se uno schema grande non riesce a tenere la velocità scelta, la simulazione va più piano e accanto al tempo compare «rallentata al N %» (i risultati non cambiano).
- Attuatore rotante simulato (pignone e cremagliera): ruota di tutto l'angolo, a semplice effetto torna con la molla; in simulazione mostra l'angolo raggiunto. Nuovi dati: volume per corsa, massa, carico, attrito e forza della molla. Ora tutti i componenti del catalogo sono simulati.
- Pompa del vuoto: il grado di vuoto si regola anche durante la simulazione.
- Valvole OR e AND: con i due ingressi quasi alla stessa pressione l'uscita passa gradualmente da uno all'altro, senza scatti a ogni passo di calcolo.
- Una bozza non salvata non si perde più aprendo un esempio, un file, un progetto o uno schema nuovo: diventa un progetto («Bozza del …» se non ha nome) e un messaggio lo dice.
- *Adatta* e l'ingresso in Simula centrano lo schema nella parte del foglio non coperta da legenda e zoom.
- Duplicando un foglio, i rimandi copiati finiscono in «(copia)» e restano staccati finché non li si rinomina: prima la copia si collegava da sola alle linee del foglio originale.
- Diagramma delle fasi: le valvole a tre posizioni hanno tre livelli (casella 14, centro, casella 12).
- Tastiera: *Tab* passa da un componente all'altro, le frecce spostano la selezione (con *Maiusc* di cinque passi).
- Le linee in pressione cambiano anche spessore con il livello, non solo colore.
- I file esportati tengono le lettere accentate e i segni + e − del nome dello schema («…_con_relè», «A+_B+»).
- Con più avvisi all'avvio della simulazione il messaggio rimanda al pannello che li elenca tutti.
- Sviluppo: vitest 5 e vite 8 (nessuna vulnerabilità segnalata da npm audit); il sito su GitHub Pages si pubblica solo dopo che test, build e prove nel browser sono passati; test nel browser più stabili.

## 0.36.0 · 2026-11-27

- Cilindri con l'ammortizzo ai due fine corsa: due viti di regolazione separate, «Apertura vite ammortizzo in uscita (testata)» e «in rientro (fondello)», sia nella finestra del componente sia tra i cursori della simulazione. Si vedono solo le viti dell'ammortizzo scelto. Gli schemi salvati con la vite unica si aprono come prima: il valore vale per le due viti.
- A pari apertura il rientro resta un po' più frenato dell'uscita (la spinta agisce sull'area anulare e l'aria da frenare sta sull'area piena): è il comportamento del cilindro reale, e con le due viti si pareggia.
- La vite e i passaggi dell'ammortizzo crescono con l'area del pistone: prima erano uguali per tutti gli alesaggi e i cilindri grandi risultavano molto più frenati (un Ø63 restava nell'ammortizzo quasi quattro volte di più di un Ø32).

## 0.35.0 · 2026-11-27

- Ammortizzo dei cilindri più realistico: niente più rimbalzi e ripartenze a scatti entrando nell'ammortizzo. Lo spillo conico chiude il passaggio con continuità nei primi millimetri invece che di colpo, l'attrito delle guarnizioni cresce con la pressione nelle camere (3 % della forza di pressione) e l'attrito viscoso dipende dall'alesaggio (circa 100 N·s/m per il Ø32). Con la vite molto chiusa e una massa grande resta un piccolo rimbalzo, come in un cilindro reale regolato male.
- Manuale d'uso in docs/manuale: convenzioni e unità, come si ricavano i dati dai cataloghi, il modello fisico con le formule di ogni componente e le costanti, e il riferimento di tutti i parametri dei componenti. Si consulta nell'app da *File* → «Manuale d'uso…» (anche senza rete), con i collegamenti tra le parti. I test controllano che resti aggiornato.

## 0.34.0 · 2026-11-26

- I dati di un componente si cambiano in una finestra, come quelle dei configuratori: doppio clic sul simbolo (oppure *Invio* con il componente selezionato, o ✎ nella barra sopra la selezione). A sinistra simbolo, sigla, descrizione, codice e opzioni, con «Configura valvola…» e «Configura cilindro…»; a destra i parametri da catalogo e di simulazione; sotto porte e valori teorici.
- Le modifiche si vedono subito sul foglio. *OK* (o *Ctrl+Invio*) le tiene in un solo passo di *Ctrl+Z*; *Annulla* (o *Esc*) le scarta tutte.
- Nome dello schema, formato del foglio e cartiglio nella finestra «Schema e foglio»: pulsante *Foglio* nella barra a sinistra o doppio clic su un punto vuoto.
- La colonna di destra compare solo quando serve: in Simula e, in Disegno, per testi e forme, linee e tubi, blocchi e selezioni di più elementi. Con un componente selezionato o niente selezionato il foglio usa tutta la larghezza; una linea appena disegnata resta evidenziata senza aprire la colonna (un clic sulla linea la apre).
- Un parametro con un valore non valido (per esempio un alesaggio in bar) ora si vede segnato in rosso nel suo campo.

## 0.33.0 · 2026-11-26

- Configuratore delle valvole distributrici: nel pannello della valvola «Configura valvola…», nella palette «Le mie valvole» → «Nuova valvola…». Si scelgono vie (2–5) e posizioni (2 o 3), il contenuto di ogni casella da un elenco di caselle ISO 1219-1 (per esempio 4/3 a centri in pressione, 2/2 normalmente aperta, 3/3 con le caselle che servono), i comandi dei due lati, la portata Qn; l'anteprima del simbolo e i passaggi di ogni posizione si aggiornano a ogni scelta. *Applica* si annulla con *Ctrl+Z*.
- Secondo comando sullo stesso lato, manuale o meccanico (per esempio pilotaggio più pulsante): si disegna sopra il primo e in simulazione si aziona con un clic come il comando manuale ausiliario; un rullo come secondo comando può essere premuto da un cilindro.
- Valvole bistabili: si sceglie la casella in cui partono. Segnale dominante: con 14 e 12 comandati insieme vince il lato scelto; nel simbolo è marcato con «D» (la norma non ha un segno per questo).
- «Le mie valvole»: le valvole configurate si salvano nella palette di questo browser, si inseriscono con un clic o trascinandole e si tolgono con ×.
- Simbolo e simulazione leggono le stesse caselle: quello che si disegna è quello che si simula. Le valvole di sempre non cambiano; le monostabili con il ritorno sul lato 14 (per esempio la 3/2 NA) ora mostrano sotto le porte la casella di riposo, come vuole la norma. Le porte restano dove sono: le linee già disegnate non si spostano.
- Configuratore dei cilindri: nel pannello del cilindro «Configura cilindro…». Una sola finestra per semplice effetto in spinta o in trazione, doppio effetto, stelo passante e senza stelo: cambiando tipo restano misure, codice e finecorsa. Si scelgono ammortizzo, pistone magnetico, alesaggio, stelo e corsa (con le misure normalizzate), massa, angolo di montaggio, carico; anteprima del simbolo e forze teoriche a 6 bar.
- Cilindro a semplice effetto in trazione: l'aria in A fa rientrare lo stelo e la molla lo spinge fuori (a riposo è fuori). Semplice effetto senza molla: torna indietro solo per il carico o la gravità. Nuove voci della palette.
- Cilindro senza stelo ad accoppiamento magnetico: nel simbolo i magneti affacciati di pistone e carrello al posto del collegamento meccanico.
- Profilo di forza lungo la corsa: punti posizione → forza (per esempio una molla da comprimere o un carico che cresce), con il grafico nel configuratore; in simulazione sostituisce il carico costante, con la forza interpolata tra i punti.
- Nel file la valvola personalizzata porta le sue caselle nel campo `boxes` (`"1>4 2>3 | 1>4 1>2 x3 | 1>2 4>3"`); nuovi campi facoltativi `aux_14`, `aux_12`, `initial`, `dominant` per le valvole e `single_kind`, `spring_return`, `rodless_kind`, `load_profile` per i cilindri. I file delle versioni precedenti si aprono come prima.

## 0.32.0 · 2026-11-26

- In simulazione si regolano gli elementi mentre il circuito gira: pressione di riduttori, gruppi FRL, filtri riduttori e riduttori con scarico, taratura di valvole limitatrici, di sequenza e pressostati, apertura di strozzatori, regolatori di flusso e viti di ammortizzo, ritardo dei temporizzatori, pressione dell'alimentazione. Il cilindro rallenta o accelera subito, senza ripartire.
- I cursori stanno nel pannello a destra, sotto «Regolazioni» (quello del componente selezionato in cima). Un clic sul simbolo apre il cursore accanto al simbolo; la rotellina sul simbolo cambia il valore a piccoli passi (con *Maiusc* dieci passi). La freccia di regolazione del simbolo si colora quando è regolabile.
- I valori trovati provando valgono finché si resta in Simula, anche dopo *Ricomincia*. «Riporta nello schema» li scrive nello schema (si annulla con *Ctrl+Z*), «Valori dello schema» rimette quelli di partenza.
- Nuovo campo di regolazione (min e max) per riduttori, FRL, limitatrici, valvole di sequenza e pressostati: il cursore resta in quel campo; se manca va da 0 alla pressione max. I riduttori nuovi partono con 0,5…10 bar. La validazione segnala una taratura fuori dal campo.
- I gruppi con il manometro mostrano la pressione regolata: nel gruppo FRL e, con la nuova opzione «Con manometro», nel riduttore e nel filtro riduttore la lancetta si muove e il valore compare accanto alla sigla e tra le misure.

## 0.31.0 · 2026-11-26

- Pneutrack si installa come app: nel menu *File* c'è «Installa l'app…» (in Chrome ed Edge apre la richiesta del browser, in Safari e negli altri mostra come fare). Installata, si apre dal menu Start, dal Dock o dalla schermata Home in una finestra sua, con la sua icona.
- Funziona anche senza rete: dopo la prima apertura l'editor, il catalogo dei simboli, la simulazione e le esportazioni restano disponibili offline, nel browser come nell'app installata. I progetti restano quelli salvati in questo browser.
- Quando esce una versione nuova compare l'avviso «È pronta una versione nuova» con il pulsante *Aggiorna*: la pagina si ricarica senza perdere il lavoro aperto e mostra le novità. Con ✕ si aggiorna alla prossima apertura.
- Con l'app installata in Chrome o Edge i file .pneu.json si aprono anche dal sistema (*Apri con* → Pneutrack).

## 0.30.1 · 2026-11-26

- Catalogo dei simboli allineato alla palette: stesse sezioni e stesso ordine dei componenti, una scheda per ogni voce della palette (le voci con lo stesso disegno, come i serbatoi di volume diverso, stanno nella stessa scheda con i nomi di tutte) e la sigla di ogni componente (V1, C1…).
- Letture dei simboli aggiornate dopo la verifica sulla ISO 1219-1: tipi di filtro, lubrificatore con scarico, FRL semplificato, motore a un senso, attuatore rotante a semplice effetto, generatore di vuoto con soffio di distacco, pressostato elettronico e vacuostato, valvole a tre posizioni, cornice continua dello strozzatore unidirezionale e dell'avviamento progressivo, punto di connessione interno di selettore e scarico rapido, molla pneumatica con alimentazione a linea continua.
- Un test verifica che ogni voce della palette compaia nel catalogo, con lettura del simbolo e sigla, nella sezione e nell'ordine giusti.

## 0.30.0 · 2026-11-26

- Più fogli nello stesso progetto: schede sotto l'area di lavoro per aprire, aggiungere, rinominare (doppio clic), riordinare (trascinando), duplicare ed eliminare i fogli. Ogni foglio ha il suo disegno e il suo cartiglio, con «Foglio n di N» e il nome del foglio. *PagSu* e *PagGiù* passano da un foglio all'altro, anche in simulazione.
- I rimandi collegano i fogli: quelli con la stessa descrizione sono lo stesso punto del circuito. Nuovo rimando elettrico per i fili; accanto a ogni rimando compare il foglio dove prosegue, e un clic ci porta. Nel pannello del rimando i nomi già usati si scelgono da un elenco.
- Validazione, simulazione e distinta vedono tutti i fogli insieme: un pulsante su un foglio comanda la bobina su un altro, un finecorsa può indicare un cilindro di un altro foglio. Nella distinta le sigle sono raggruppate per foglio; nella validazione ogni problema indica il foglio e un clic ci porta.
- Copia e incolla tra fogli con sigle nuove; annulla e ripeti valgono per tutto il progetto e riportano al foglio della modifica.
- Esportazione con più fogli: si sceglie il foglio aperto o tutti. Il PDF ha una pagina per foglio, l'SVG un file per foglio, il DXF i fogli affiancati nello stesso file.
- I file a foglio singolo restano uguali e si aprono come prima; con più fogli il file indica il foglio di ogni componente.

## 0.29.0 · 2026-11-26

- Completate le voci a priorità media e bassa dell'elenco dalla ISO 1219-1, con simbolo, simulazione dove ha senso, descrizioni e scheda nel catalogo dei simboli.
- Valvole distributrici: funzioni 3/3 a centro chiuso, 4/3 a centri chiusi e 4/3 a centri in scarico (il centro è la posizione di riposo). Nuovi comandi: pulsante a tirare e spingere con arresto, selettore rotativo, chiave, pedale a bilanciere, tastatore a corsa regolabile, pilotaggio differenziale, solenoide proporzionale, attuatore piezoelettrico, motore passo passo, ritorno a molla e molla pneumatica. Nuove voci della palette: 3/3, 4/3, 5/3 a selettore, 5/3 proporzionale, 3/2 a chiave.
- Alimentazione e trattamento aria: compressore, filtro riduttore, essiccatore; il filtro ha il tipo (scarico automatico, a coalescenza, a carboni attivi, separatore di condensa, separatore centrifugo, con indicatore di intasamento, doppio), il lubrificatore lo scarico e il gruppo FRL il simbolo semplificato.
- Regolazione: non ritorno con molla, strozzatore a rullo per rallentare a fine corsa, riduttore con scarico, riduttore pilotato a distanza, regolatore proporzionale di pressione, moltiplicatore di pressione.
- Attuatori: cilindro con bloccaggio dello stelo (pilotaggio L) e con bloccaggio di fine corsa, attuatore a soffietto, cilindro a membrana, muscolo pneumatico; attuatore rotante a semplice effetto, motore a un senso, cilindro a doppio stelo con il secondo stelo di diametro diverso.
- Vuoto: pompa del vuoto, soffio di distacco del generatore di vuoto (porta 4), vacuostato (opzione del pressostato, che ha anche la versione elettronica).
- Collegamenti: rubinetto a tre vie, tubo flessibile, giunto rotante, basetta di distribuzione e rimando ad altro foglio (i rimandi con la stessa descrizione sono collegati, anche in simulazione).
- Nuova sezione «Misura e segnalazione»: sensore di pressione analogico, indicatore ottico, digitale o acustico (si accende in simulazione), misuratore di portata, manometro differenziale, termometro.

## 0.28.0 · 2026-11-26

- Simboli verificati sul testo della ISO 1219-1:2006 (regole quotate dei capitoli 5 e 9 e composizione di ogni esempio in elementi base).
- Valvole a cinque vie: casella rettangolare 6M × 4M (elemento 101V8) con le porte a 2M l'una dall'altra (RF020); prima le porte 5, 1 e 3 stavano a 1M. Le valvole a 5 vie sono più larghe e le loro porte si spostano.
- Comandi delle valvole sull'asse 1M sopra il bordo inferiore della casella (RF004), non più a metà altezza; i pilotaggi 12 e 14 si spostano di un passo.
- Molla pneumatica: l'alimentazione (interna o dalla porta esterna) è una linea continua (X10080, X10100), non tratteggiata.
- Strozzatore unidirezionale e valvola di avviamento progressivo: cornice continua (5.9, un componente con due funzioni principali) al posto del tratto e punto, che resta per i gruppi di più componenti come l'FRL (5.10); punti di connessione dove il ramo si stacca.
- Cilindri: porte 0,5M dalle testate e pistone, a riposo, 1M dal fondello (RF044); fuori simulazione il simbolo mostra il cilindro rientrato, la sua posizione di riposo (5.4).
- Selettore di circuito e scarico rapido con il punto di connessione interno (X10740, X10750); non ritorno pilotata con la molla (X10720); leva con arresto con le tacche 0,5M sopra lo stelo (RF006) e lucchetto 1M dalla leva (RF014).
- Generatore di vuoto disegnato come nella norma: corpo con lo strozzatore sulla via 1 → 3 (X12380). Pressostato senza triangolo di pilotaggio, con molla regolabile e contatto di chiusura (X11750). Tappo con lo spessore di linea normale (5.12).

## 0.27.0 · 2026-11-26

- Nuovi componenti dalla ISO 1219-1, con simbolo, simulazione, descrizioni e scheda nel catalogo dei simboli: rubinetto di intercettazione, valvola 3/2 di sezionamento con lucchetto e innesto rapido (nuova sezione «Intercettazione e collegamenti»), doppia non ritorno pilotata, strozzatore fisso (ugello calibrato), valvola di avviamento progressivo, cilindro senza stelo, pinza pneumatica a doppio e semplice effetto, generatore di vuoto (eiettore) e ventosa (nuova sezione «Vuoto»).
- Comando manuale ausiliario sulle elettrovalvole (opzione nel pannello: a impulso o con arresto): si disegna oltre il solenoide e in simulazione aziona la valvola senza corrente, anche quando il solenoide segue una bobina.
- Pistone magnetico (opzione dei cilindri e della pinza): due piccoli magneti sul pistone nel simbolo e la voce in distinta.
- Rubinetto e valvola di sezionamento partono aperti in simulazione; un clic li chiude. L'innesto rapido si disegna innestato o staccato e, staccato, chiude il lato con il non ritorno e scarica l'altro.
- Un finecorsa o un sensore può indicare anche la pinza («PZ1+» è la pinza chiusa).

## 0.26.0 · 2026-11-26

- Linee dei tubi sulla griglia: tutte le porte dei simboli cadono ora sui nodi della griglia, in ogni rotazione e specchiate, e il tratto d'uscita dalla porta è lungo un passo. Due porte sulla stessa verticale o orizzontale si collegano con un tratto dritto, senza più i piccoli scalini di prima, e tutti i gomiti cadono sui nodi. Le porte di valvole, cilindri, gruppo FRL, filtro, lubrificatore, manometro, non ritorno, strozzatori, scarico rapido, limitatrice, sorgente, silenziatore, scarico e sensore si sono spostate di pochi punti.
- Raddrizza automatico: dopo aver spostato un componente, un gruppo o una piega, la linea perde da sola i gradini di un passo, i tratti allineati e le pieghe che non servono più. Gli schemi salvati con la versione precedente si sistemano allo stesso modo quando si aprono.
- «Raddrizza linea» nel pannello del collegamento toglie i gradini fino a due passi e tiene le pieghe che servono; il vecchio comportamento (togliere tutte le pieghe) è nel nuovo pulsante «Togli le pieghe».

## 0.25.0 · 2026-11-26

- Testi e forme sullo schema: nuova sezione «Annot.» nella barra a sinistra con testo, nota in riquadro, richiamo con freccia, indice di revisione, linea, freccia, polilinea, rettangolo, cerchio ed ellisse.
- Elementi grafici della norma: contorno di gruppo tratto-punto con titolo (ISO 1219-2), linea tratto-punto, collegamento meccanico a doppia linea e freccia di direzione del flusso (ISO 1219-1).
- Per ogni elemento si scelgono colore (sette colori o uno a piacere), tipo di linea (continua, tratteggiata, tratto-punto, tratto-due-punti, punteggiata, doppia), spessore da 0,25 a 0,7 mm, riempimento e punte delle frecce; per i testi altezza ISO 3098, grassetto, corsivo, allineamento, rotazione e riquadro.
- Il contorno di gruppo sposta con sé i componenti che racchiude; la punta di un richiamo si aggancia a un componente e lo segue.
- Testi e forme finiscono nel PDF, nell'SVG e nel DXF, dove stanno sul layer ANNOTAZIONI con colore, tipo di linea e spessore propri.

## 0.24.1 · 2026-11-26

- Simboli dei cilindri in simulazione: il pistone e i tamponi degli ammortizzi restano sempre dentro la camicia per tutta la corsa, anche nei cilindri ammortizzati (prima, a cilindro rientrato, il tampone lato fondello usciva dal fondo). Lo stelo sporge sempre dalla testata, anche a cilindro tutto rientrato, e nel cilindro a stelo passante sporge da entrambi i lati anche a fine corsa. Vale per singolo e doppio effetto, ammortizzati e stelo passante, negli schemi, negli esempi e nel catalogo dei simboli.

## 0.24.0 · 2026-11-26

- Libreria di componenti da catalogo: nel pannello di valvole distributrici, regolatori di flusso unidirezionali e cilindri a doppio effetto il menu «Codice da catalogo» compila in un colpo i dati della scheda tecnica e le opzioni. Ci sono i regolatori Festo GRLA (M5–1/2), le elettrovalvole Festo VUVG-L14 e L18 e SMC SY3000, SY5000 e SY7000 (monostabili e bistabili), i cilindri ISO 15552 Festo DSBC e SMC CP96 (Ø32–125).
- Il codice scelto finisce nel campo «Codice articolo», quindi anche nella distinta; sotto il menu compaiono il costruttore, come sono stati ricavati i valori e il collegamento alla scheda tecnica.

## 0.23.1 · 2026-11-26

- Simulazione: un cilindro fermo a fine corsa e spinto contro l'arresto non consuma più aria. Prima, nei passi intermedi del calcolo, il pistone entrava appena nell'arresto e tornava indietro a ogni passo, e a impianto fermo si contavano circa 0,9 Nl/min che non esistono.

## 0.23.0 · 2026-11-26

- Esportazione DXF per AutoCAD (menu File → Esporta DXF): il foglio con cornice, cartiglio ed eventuale distinta, in millimetri reali e formato R12, che aprono anche LibreCAD, DraftSight e QCAD. Ogni tipo di elemento ha il suo layer (CORNICE, LINEE, PILOTAGGI a tratti, SCARICHI, FILI, SIMBOLI, TESTI, BLOCCHI); sigle e descrizioni restano testi modificabili.
- Esportazione SVG (menu File → Esporta SVG): il foglio in grafica vettoriale per Inkscape, Illustrator o il browser.
- Nel menu File c'è anche «Esporta PDF», oltre al pulsante PDF nella barra in alto.

## 0.22.0 · 2026-11-26

- Simula: nuova sezione «Misure» nel pannello, con la pressione dei manometri, l'aria consumata e la portata attuale in litri normali (Nl e Nl/min, ANR), i cicli completati con durata e aria dell'ultimo ciclo, la media per ciclo, il consumo medio in Nl/min e il tempo dell'ultima uscita e dell'ultimo rientro di ogni cilindro. Ogni voce si spiega al passaggio del mouse.
- Diagramma delle fasi: una corsia per ogni manometro con la pressione nel tempo, il tempo di ogni corsa accanto all'arrivo a fine corsa e la fascia «Cicli» con durata e aria di ogni ciclo.

## 0.21.0 · 2026-11-25

- Distinta componenti (menu File): i pezzi dello schema raggruppati per tipo, varianti, dati da catalogo e codice articolo, con sigle e quantità. Si scarica in CSV (si apre con Excel o LibreOffice) o in PDF su A4.
- Nuovo campo «Codice articolo» nel pannello di ogni componente, con la descrizione al passaggio del mouse: compare nella distinta e non cambia la simulazione.
- Distinta sul foglio: con «Distinta sul foglio» (pannello Foglio o finestra della distinta) la tabella compare sopra il cartiglio, come vuole la ISO 7573, e finisce anche nel PDF del foglio.
- Restano fuori dalla distinta i simboli che non si ordinano: punti di connessione, scarichi liberi, alimentazioni, contatti dei relè e bobine delle elettrovalvole.

## 0.20.0 · 2026-11-25

- Allineamento dei componenti selezionati (almeno 2), dal menu Modifica o dal pannello della selezione multipla: bordi a sinistra, a destra, in alto, in basso, oppure centri sulla stessa verticale (valvola sotto il suo cilindro) o sulla stessa orizzontale (fila di valvole). Le posizioni restano sulla griglia e Ctrl+Z annulla.
- Distribuzione in orizzontale o in verticale (almeno 3 componenti): il primo e l'ultimo restano fermi, gli altri prendono lo stesso passo tra i centri.

## 0.19.0 · 2026-11-25

- Strozzatore bidirezionale e regolatore di flusso unidirezionale: nuovo campo «Apertura», da 0 % (chiuso) a 100 % (tutto aperto). La conduttanza C ora è quella a tutta apertura, come a catalogo, e la simulazione usa apertura × C; nel regolatore unidirezionale il verso libero non cambia. Un regolatore nuovo parte al 20 % di 1,5 dm³/(s·bar). Gli schemi salvati con la sola C simulano come prima; quelli con C vuota ora usano 1,5 dm³/(s·bar) tutto aperto: per ritrovare la velocità di prima basta scrivere 20 % nell'apertura.
- Portata nominale Qn su valvole distributrici, filtri, riduttori, valvole logiche e di regolazione e motore pneumatico: se la conduttanza C è vuota, la simulazione la ricava da Qn (6 bar a monte, 5 bar a valle) con la formula ISO 6358. Corretto il suggerimento della conduttanza: C ≈ Qn / 260, non Qn / 600.
- Apertura della vite dell'ammortizzo in percentuale (0–100 %); i valori già scritti come frazione restano validi e compaiono in %.
- Cilindri: nuovi parametri «Attrito statico (di primo distacco)», per lo spunto da fermo, e «Angolo di montaggio», che aggiunge il peso della massa mobile lungo l'asse (90° stelo verso l'alto, −90° verso il basso).

## 0.18.2 · 2026-11-25

- Valvole a 5 vie (5/2 e posizioni esterne delle 5/3): nelle caselle compare il simbolo della bocca chiusa sullo scarico che non lavora (5 col comando 14, 3 col comando 12), come vuole la ISO 1219-1.
- I numeri delle bocche stanno accanto al tratto tra simbolo e porta (a destra per le porte in alto e in basso, sopra per quelle laterali), dove le linee collegate non li coprono.

## 0.18.1 · 2026-11-25

- Un clic sulla sezione già attiva della barra a sinistra nasconde la palette, un altro clic la riapre; la scelta resta salvata nel browser.
- Scegliendo Elettrico o Blocchi nella barra a sinistra la sezione resta evidenziata anche quando la palette non scorre fino in cima al gruppo.

## 0.18.0 · 2026-11-25

- Simboli pneumatici ricontrollati sulla ISO 1219-1 e sugli esempi di schema delle ISO 1219-2 e 1219-3: pilotaggi, elettropiloti e motore pneumatico con il triangolo vuoto dell'aria (quello pieno indica l'olio); triangoli del motore rivolti verso l'interno.
- Alimentazione disegnata come triangolo vuoto con la punta sulla linea, senza cerchio; molla pneumatica di ritorno nel suo riquadro con il triangolo.
- Non ritorno, non ritorno pilotata, regolatore di flusso unidirezionale, valvola selettrice e scarico rapido: la sfera ora è appoggiata dentro la sede a V, orientata secondo il verso di passaggio libero; lo scarico rapido ha anche la sede verso lo scarico 3.
- Riduttore di pressione e gruppo FRL: freccia in linea con le porte (valvola normalmente aperta) e molla regolabile; gruppo FRL e regolatore di flusso unidirezionale racchiusi dalla cornice a tratto e punto dei componenti montati in un unico corpo.
- Filtro con separatore e scarico manuale, lubrificatore con il tubo di pescaggio, come negli esempi della ISO 1219-2.
- Valvola limitatrice: pilotaggio sul lato opposto alla molla. Valvola di sequenza: molla di taratura regolabile. Cilindro a semplice effetto: molla a tutta altezza e sfiato in atmosfera disegnato col triangolo al posto del tappo.
- Nuova pagina «Catalogo dei simboli» (menu File e finestra delle Novità): tutti i componenti con simbolo, descrizione, lettura del simbolo e porte, più i comandi delle valvole.
- Sigla e descrizione dei componenti vanno sul lato del simbolo libero dalle connessioni, così non coprono le linee; si possono trascinare dove si vuole e un doppio clic le rimette al loro posto.

## 0.17.0 · 2026-11-25

- Interfaccia riorganizzata in due modalità, Disegno e Simula, scelte con l'interruttore al centro della barra in alto.
- Barra in alto più leggera: i comandi dei progetti sono nel menu File, taglia/copia/incolla nel menu Modifica.
- Palette a icone su due colonne, con una barra laterale che porta a componenti pneumatici, elettrici, blocchi salvati e foglio.
- Ruota, Specchia, Duplica ed Elimina compaiono in una barra sopra la selezione; zoom, Adatta e Mostra sono in basso a destra del foglio.
- Il bollino di validazione apre l'elenco dei problemi, così il pannello delle proprietà usa tutta l'altezza.
- In Simula il diagramma delle fasi ha una fascia fissa in basso, insieme a Pausa, Ricomincia, velocità e tempo.

## 0.16.0 · 2026-11-25

- Diagramma delle fasi in simulazione: il pulsante «Diagramma» mostra la corsa dei cilindri e lo stato di bobine, lampade e contatti dei relè, nel tempo o per passi del ciclo.

## 0.15.0 · 2026-11-25

- Quattro esempi elettropneumatici nel menu Esempi: marcia e arresto con autoritenuta, ciclo automatico A+ A− con finecorsa elettrici, sequenza A+ B+ B− A− con relè di memoria, sosta a fine corsa con temporizzatore e pressostato.
- Nuova guida all'elettropneumatica (docs/elettropneumatica.md) con la spiegazione degli esempi.

## 0.14.0 · 2026-11-25

- Il circuito elettrico si simula nell'editor: pulsanti, interruttori e finecorsa senza cilindro si azionano con un clic sul disegno o dal pannello, i fili sotto tensione diventano rossi, i contatti si chiudono, bobine e lampade si accendono.
- I solenoidi comandati da una bobina seguono il circuito elettrico e non si azionano più a mano; relè e temporizzatori mostrano lo stato e il tempo che manca.
- Cortocircuiti e relè che continuano a commutare da soli vengono segnalati nel pannello di simulazione.

## 0.13.0 · 2026-11-25

- Circuito elettrico di comando: nella nuova categoria «Elettrico» della palette ci sono alimentazione 24 V, pulsanti e interruttori, relè e loro contatti, temporizzatori, bobine di elettrovalvola, finecorsa elettrici, sensori di prossimità, pressostati e lampade, con i simboli CEI EN 60617.
- I fili elettrici si disegnano accanto alle linee pneumatiche, più sottili e di un altro colore; un filo non si collega a una porta pneumatica.
- Bobine, contatti, finecorsa e sensori si legano alla parte pneumatica per sigla dal pannello delle proprietà; la sigla della bobina compare accanto al solenoide della valvola.

## 0.12.0 · 2026-11-25

- Griglia più visibile: punti più grandi e più scuri, e ora compare anche sopra il foglio di disegno (non viene stampata nel PDF).

## 0.11.0 · 2026-11-25

- Ogni campo da compilare ha una descrizione al passaggio del mouse (segnalata da un «?» accanto all'etichetta): a che cosa serve il dato, come incide sul circuito e sulla simulazione, le unità accettate, se è obbligatorio e il valore usato quando resta vuoto.
- Coperti parametri e opzioni di tutti i componenti, tubi, misure standard dei cilindri, finecorsa, foglio e cartiglio, blocchi.

## 0.10.0 · 2026-11-25

- Specchia i componenti, oltre a ruotarli: «Specchia ↔» (tasto H) da sinistra a destra e «Specchia ↕» (tasto V) dall'alto in basso. Porte e linee seguono il simbolo, le scritte restano leggibili.
- Con più componenti o un blocco si specchia il gruppo intero attorno al suo centro, con le pieghe delle linee interne.

## 0.9.0 · 2026-11-25

- Copia, taglia e incolla (Ctrl+C, Ctrl+X, Ctrl+V e pulsanti nella barra): si copiano i componenti scelti con le linee tra loro, e un blocco resta un blocco. Si incolla sotto il puntatore, anche in un altro progetto o in un'altra scheda.
- Selezione a riquadro trascinando sul vuoto, con Maiusc per aggiungere alla selezione.
- La vista si sposta con Spazio+trascina o con il tasto centrale del mouse.

## 0.8.0 · 2026-11-25

- Punti di connessione: si trascina una linea sopra un'altra per diramarla, e allo stesso punto si collegano tutte le linee che servono. Il pallino prende il colore della pressione.
- «Aggiungi punto di connessione» nel pannello della linea; eliminando un punto tra due sole linee la linea si ricuce.
- Simbolo di scarico diretto in atmosfera (triangolo ISO 1219), oltre al silenziatore.

## 0.7.0 · 2026-11-25

- Blocchi: gruppi di componenti con i loro condotti, con nome e descrizione. «Unisci» (Ctrl+G) crea il blocco dalla selezione, «Dividi» (Ctrl+Maiusc+G) lo scioglie.
- Un blocco si sposta, duplica (Ctrl+D) ed elimina per intero; un secondo clic seleziona il singolo componente.
- Selezione multipla con Maiusc+clic o trascinando un riquadro con Maiusc; Ctrl+A seleziona tutto.
- Libreria «Blocchi salvati» nella palette per riusare un blocco in altri progetti.
- Filtro «Riquadri dei blocchi» in «Mostra».

## 0.6.0 · 2026-11-25

- Fogli di disegno da A4 ad A0, orizzontali o verticali, con cornice ISO 5457 e cartiglio (titolo, autore, data, numero disegno, revisione, formato).
- Scelta automatica del formato più piccolo che contiene il disegno e centratura del foglio.
- Esportazione del foglio in PDF vettoriale (pulsante PDF).

## 0.5.0 · 2026-11-25

- Ammortizzo pneumatico regolabile nei cilindri a doppio effetto e a doppio stelo: ai due fine corsa o su uno solo, con lunghezza e apertura della vite.
- Comandi di ritorno pneumatico delle valvole, con alimentazione interna (dalla porta 1) o esterna (porta 12/14).
- La linea selezionata diventa arancione e passa in primo piano; le altre si attenuano per seguirne il percorso.
- Colori delle linee per fascia di pressione e legenda in basso a destra.
- Numero di versione dell'app e finestra "Novità".

## 0.4.0 · 2026-11-25

- Comandi delle valvole ISO 1219: solenoide con valvola pilota (alimentazione interna o esterna), leva, leva con arresto, pedale, tastatore, rullo unidirezionale.
- Cilindri: misure standard ISO 6432, ISO 21287, ISO 15552 e suggerimenti di alesaggi, steli e corse normalizzati.

## 0.3.0 · 2026-11-25

- Catalogo di 25 componenti in categorie, con ricerca nella palette e valvole già configurate.
- Serbatoi, trattamento aria, valvole logiche e di blocco, regolatori, temporizzatore, finecorsa comandati dai cilindri.
- Esempio di ciclo automatico A+ A- con finecorsa.

## 0.2.0 · 2026-11-25

- Tubi con misura e lunghezza, che influenzano la simulazione.
- Punti di piega trascinabili per organizzare le linee.

## 0.1.0 · 2026-11-25

- Prima versione: editor grafico, validazione, simulazione nel browser, archivio dei progetti, pubblicazione su GitHub Pages.
