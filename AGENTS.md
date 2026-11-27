# Regole per chi modifica Pneutrack

## Manuale d'uso sempre aggiornato

Il manuale d'uso (`docs/manuale/`) va aggiornato **nella stessa modifica** ogni volta che cambiano
componenti, parametri, opzioni, formule, costanti o convenzioni della simulazione, o quando si aggiunge
una funzione nuova.

- `docs/manuale/componenti.md` è generato dal catalogo: dopo ogni modifica a `src/model/components.ts`
  esegui `npm run manuale`. Non modificarlo a mano.
- `docs/manuale/calcoli.md` descrive il modello fisico (`src/sim`, `src/solver`, `src/model/tubes.ts`):
  aggiornalo a mano quando cambiano equazioni, costanti o la regola di un componente. Ogni tipo di
  componente deve esservi nominato con il suo `type`.
- `docs/manuale/README.md` contiene convenzioni, unità e come si ricavano i dati; la riga «Aggiornato alla
  versione» segue la versione di `package.json`.
- Con una nuova versione: `package.json`, la voce in cima a `CHANGELOG.md` e la riga di versione del manuale.

`test/manuale.test.ts` fallisce se il riferimento dei componenti non è aggiornato, se un componente non è
descritto in `calcoli.md` o se il manuale non è rivisto per la versione corrente.

## Controlli prima di consegnare

```bash
npm run typecheck
npm test
```
