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
  La palette è divisa in categorie richiudibili (alimentazione e trattamento aria, valvole
  distributrici, valvole di blocco e logiche, regolazione, attuatori) e ha una casella di ricerca.
  Le valvole distributrici più comuni e i serbatoi di varie taglie sono già configurati.
- **Collegare**: trascina da una porta a un'altra. Più linee sulla stessa porta formano un raccordo a T.
- **Linee**: trascina una linea per piegarla dove vuoi (nasce un punto di piega, agganciato alla
  griglia); trascina i punti per spostarli, doppio clic su un punto per toglierlo, *Raddrizza linea*
  per tornare al percorso automatico.
- **Tubi**: seleziona una linea e scegli la misura (Ø4×2,5, Ø6×4, Ø8×5, Ø10×6,5, Ø12×8 o
  personalizzata) e la lunghezza. Il pannello mostra volume e conduttanza stimata; lo spessore
  della linea segue il diametro. *Usa questo tubo per tutte le linee* lo applica a tutte le linee
  di potenza; le nuove linee ricevono l'ultimo tubo scelto. Una linea senza misura è ideale.
- **Proprietà**: seleziona un componente per cambiarne sigla, descrizione, funzione della valvola,
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
  corsa o su uno solo), la sua lunghezza e l'apertura della vite.
- **Linee**: la linea selezionata diventa arancione e passa sopra ai simboli, le altre si
  attenuano. Il colore delle linee indica la fascia di pressione (massima raggiungibile mentre si
  disegna, istantanea in simulazione); la legenda è in basso a destra.
- **Mostra**: il menu nella barra in alto nasconde o mostra sigle, descrizioni, valori della
  simulazione, numeri delle porte, finecorsa, misure dei tubi, punti di collegamento, linee di
  pilotaggio e di scarico, griglia e legenda. La scelta resta salvata nel browser.
- **Versione**: il numero accanto al nome dell'app apre le novità di ogni versione
  ([CHANGELOG.md](../CHANGELOG.md)); dopo un aggiornamento si aprono da sole una volta.
- **Validazione**: avviene a ogni modifica. I problemi compaiono nel pannello in basso a destra
  (clic per andare al componente), i componenti con errori sono bordati di rosso, le porte
  scollegate sono rosse e le linee in pressione sono blu (tratteggiate quelle di pilotaggio).
- **Simulazione**: *Simula* anima lo schema, se non ci sono errori. Le linee si colorano con la
  pressione, le caselle delle valvole scorrono nella posizione attiva e gli steli dei cilindri si
  muovono. Pulsanti e rulli si azionano tenendo premuto il loro simbolo (o il bottone nel pannello),
  i solenoidi si eccitano e diseccitano a ogni clic; i pilotaggi commutano da soli quando la
  pressione supera `min_pressure` (2 bar se non indicata), i finecorsa commutano quando lo stelo
  arriva in fondo. Manometri e serbatoi mostrano la pressione, i temporizzatori il tempo che manca. *Pausa* (barra spaziatrice),
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
  rinomina, rotazione, tubi e pieghe delle linee, esempi, esportazione, tutto il ciclo dei progetti e la simulazione
  (pulsante che fa uscire il cilindro, bistabile che resta commutata, ritorno).

La CI (`.github/workflows/ci.yml`) esegue typecheck, test, build ed e2e a ogni pull request.
