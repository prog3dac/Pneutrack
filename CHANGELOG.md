# Registro delle modifiche

Ogni versione pubblicata su https://prog3dac.github.io/Pneutrack/ ha un numero `maggiore.minore.correzione`.
La versione in uso compare accanto al nome dell'app; un clic apre queste note.

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
