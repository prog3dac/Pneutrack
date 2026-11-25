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
- **File**: *Salva* scarica un `.pneu.json` (formato `pneutrack/circuit` con la disposizione
  grafica in `layout`); *Apri* lo ricarica. Lo schema corrente è anche salvato nel browser.

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

API: `GET /api/catalog`, `GET /api/examples`, `GET /api/examples/<id>`,
`POST /api/analyze` (schema → problemi, porte, pressioni), `POST /api/cylinder-info`.

## Test

`pytest` prova le API e il server. Se Node.js con Playwright è disponibile, lancia anche
`tests/e2e/editor.mjs`, che costruisce uno schema nel browser, ne verifica la validazione,
annulla/ripeti, rinomina, rotazione, esempi e salvataggio.
