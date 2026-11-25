# Interfaccia grafica

L'editor è un'applicazione web locale: un piccolo server Python (solo libreria standard)
serve la pagina e mette a disposizione il modello e la validazione via API JSON.
Il disegno è in SVG con JavaScript a moduli ES, senza passaggi di build.

## Avvio

```bash
pip install -e .
pneutrack-gui            # oppure: python -m pneutrack.gui
```

Si apre il browser su <http://127.0.0.1:8765>. Opzioni: `--port`, `--host`, `--no-browser`.

## Uso

- **Inserire** un componente: trascinalo dalla palette sul foglio, oppure fai clic per metterlo al centro.
- **Collegare**: trascina da una porta a un'altra. Più linee sulla stessa porta formano un raccordo a T.
- **Proprietà**: seleziona un componente per cambiarne sigla, descrizione, funzione della valvola,
  comandi e parametri da catalogo (`6 bar`, `32 mm`, `0,6 MPa`...; un numero senza unità prende
  l'unità tipica del parametro). Per i cilindri vengono mostrate aree e forze teoriche.
- **Validazione**: avviene a ogni modifica. I problemi compaiono nel pannello in basso a destra
  (clic per andare al componente), i componenti con errori sono bordati di rosso, le porte
  scollegate sono rosse e le linee in pressione sono blu (tratteggiate quelle di pilotaggio).
- **Progetti**: *Salva* (`Ctrl+S`) registra lo schema nell'archivio dei progetti; da quel momento
  ogni modifica viene salvata in automatico dopo un istante. *Salva copia* crea un nuovo progetto.
  La finestra *Progetti* elenca i progetti (più recenti in alto), con ricerca, apertura,
  rinomina, duplicazione, eliminazione con conferma, nuovo progetto e importazione di un file.
  Alla riapertura della pagina torna l'ultimo progetto aperto; uno schema non ancora salvato
  resta come bozza nel browser.
- **File**: *Esporta* scarica lo schema come `.pneu.json` (formato `pneutrack/circuit` con la
  disposizione grafica in `layout`); *Importa file…* nella finestra Progetti lo ricarica.

## Dove vengono salvati i progetti

| Modalità | Archivio |
|---|---|
| Server locale (`pneutrack-gui`) | un file `<id>.pneu.json` per progetto in `~/Pneutrack/progetti` (`--projects-dir` o la variabile `PNEUTRACK_PROJECTS` per cambiarla) |
| Pagina pubblicata su claude.ai | database della pagina, sezione privata di ogni utente (`data/users/<id>`) |
| Pagina statica su un altro hosting | memoria del browser (`localStorage`), solo su quel dispositivo: usare *Esporta* per le copie |

Un progetto è `{"id", "name", "createdAt", "updatedAt", "circuit"}`, dove `circuit` è lo schema.

Scorciatoie: `R` ruota, `Canc` elimina, `Ctrl+Z`/`Ctrl+Y` annulla/ripeti, `Ctrl+D` duplica,
`Ctrl+S` salva, `F` adatta la vista, rotella per lo zoom, trascina il foglio per spostare la vista.

## Struttura

| File | Ruolo |
|---|---|
| `src/pneutrack/gui/server.py` | server HTTP e routing |
| `src/pneutrack/gui/api.py` | analisi tollerante dello schema, esempi, valori dei cilindri |
| `src/pneutrack/gui/catalog.py` | etichette, categorie, opzioni e valori iniziali per la palette |
| `src/pneutrack/gui/static/js/symbols.js` | simboli in stile ISO 1219 e posizione delle porte |
| `src/pneutrack/gui/static/js/app.js` | stato, disegno, interazioni, annulla/ripeti |

| `src/pneutrack/gui/static/js/storage.js` | archivio dei progetti (server, database della pagina, browser) |
| `src/pneutrack/gui/static/js/engine.js` | motore di validazione in JavaScript per la versione senza server |
| `src/pneutrack/gui/projects.py` | archivio dei progetti su disco |
| `src/pneutrack/gui/build_static.py` | genera la versione statica pubblicabile |

API: `GET /api/projects`, `GET|PUT|DELETE /api/projects/<id>`, `GET /api/catalog`, `GET /api/examples`, `GET /api/examples/<id>`,
`POST /api/analyze` (schema → problemi, porte, pressioni), `POST /api/cylinder-info`.

## Versione web senza server

```bash
python -m pneutrack.gui.build_static sito/
```

genera una cartella pubblicabile su qualunque hosting statico. Senza server l'editor usa
`js/engine.js`, la trascrizione in JavaScript del modello e della validazione Python; i due
motori sono confrontati da `tests/test_engine_parity.py` su centinaia di schemi casuali e
devono dare risultati identici. Ogni modifica alle regole va fatta in entrambi.

## Test

`pytest` prova le API e il server. Se Node.js con Playwright è disponibile, lancia anche
`tests/e2e/editor.mjs` due volte, con il server e sulla versione statica: costruisce uno schema
nel browser, ne verifica la validazione, annulla/ripeti, rinomina, rotazione, esempi,
esportazione e tutto il ciclo dei progetti (salva, autosalvataggio, ricarica, copia, rinomina,
duplica, elimina, ricerca, apri).
