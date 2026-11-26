# Registro delle modifiche

Ogni versione pubblicata su https://prog3dac.github.io/Pneutrack/ ha un numero `maggiore.minore.correzione`.
La versione in uso compare accanto al nome dell'app; un clic apre queste note.

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
