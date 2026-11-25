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

- **Inserire** un componente: trascinalo dalla palette sul foglio, oppure fai clic per metterlo al centro.
- **Collegare**: trascina da una porta a un'altra. Più linee sulla stessa porta formano un raccordo a T.
- **Proprietà**: seleziona un componente per cambiarne sigla, descrizione, funzione della valvola,
  comandi, parametri da catalogo (`6 bar`, `32 mm`, `0,6 MPa`...; un numero senza unità prende
  l'unità tipica del parametro) e parametri di simulazione (conduttanza, massa, carico, attrito).
  Per i cilindri vengono mostrate aree e forze teoriche.
- **Validazione**: avviene a ogni modifica. I problemi compaiono nel pannello in basso a destra
  (clic per andare al componente), i componenti con errori sono bordati di rosso, le porte
  scollegate sono rosse e le linee in pressione sono blu (tratteggiate quelle di pilotaggio).
- **Simulazione**: *Simula* anima lo schema, se non ci sono errori. Le linee si colorano con la
  pressione, le caselle delle valvole scorrono nella posizione attiva e gli steli dei cilindri si
  muovono. Pulsanti e rulli si azionano tenendo premuto il loro simbolo (o il bottone nel pannello),
  i solenoidi si eccitano e diseccitano a ogni clic; i pilotaggi commutano da soli quando la
  pressione supera `min_pressure` (2 bar se non indicata). *Pausa* (barra spaziatrice),
  *Ricomincia* e la velocità (da 0,05× a tempo reale) controllano il tempo. Durante la simulazione
  lo schema non si modifica; *Ferma simulazione* (o `Esc`) torna al disegno.
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

Scorciatoie: `R` ruota, `Canc` elimina, `Ctrl+Z`/`Ctrl+Y` annulla/ripeti, `Ctrl+D` duplica,
`Ctrl+S` salva, `F` adatta la vista, rotella per lo zoom, trascina il foglio per spostare la vista.

## Struttura

| File | Ruolo |
|---|---|
| `src/model/` | unità, componenti, schema, validazione ([modello-dati.md](modello-dati.md)) |
| `src/sim/` | dallo schema alla rete fisica, simulazione interattiva |
| `src/solver/` | solutore di riferimento (orifizi ISO 6358, RK4) |
| `src/ui/symbols.ts` | simboli in stile ISO 1219, posizione delle porte, stato animato |
| `src/ui/app.ts` | stato, disegno, interazioni, annulla/ripeti, progetti, simulazione |
| `src/ui/storage.ts` | archivio dei progetti (database della pagina, browser, memoria) |
| `src/examples/` | esempi del menu *Esempi…* (ogni `.json` aggiunto qui compare da solo) |

## Test

- `npm test`: Vitest su modello, validazione, solutore e simulazione.
- `npm run e2e`: con `npm run build && npm run preview` attivo, `test/e2e/editor.mjs` usa
  Playwright per costruire uno schema nel browser, verificarne la validazione, annulla/ripeti,
  rinomina, rotazione, esempi, esportazione, tutto il ciclo dei progetti e la simulazione
  (pulsante che fa uscire il cilindro, bistabile che resta commutata, ritorno).

La CI (`.github/workflows/ci.yml`) esegue typecheck, test, build ed e2e a ogni pull request.
