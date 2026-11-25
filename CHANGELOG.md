# Registro delle modifiche

Ogni versione pubblicata su https://prog3dac.github.io/Pneutrack/ ha un numero `maggiore.minore.correzione`.
La versione in uso compare accanto al nome dell'app; un clic apre queste note.

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
