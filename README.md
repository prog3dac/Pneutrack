# Pneutrack

Software open source per il **disegno e la simulazione di schemi pneumatici**.

Pneutrack nasce per offrire a tecnici, progettisti, docenti e studenti uno strumento libero
con cui disegnare un circuito pneumatico, verificarne la correttezza e simularne il
comportamento. Prende ispirazione dal tipo di lavoro che si fa con strumenti commerciali
come FluidSim o Automation Studio, ma è un progetto originale: codice, simboli e interfaccia
sono sviluppati da zero.

**Prova l'editor: <https://prog3dac.github.io/Pneutrack/>** (gira tutto nel browser, nessuna
installazione). Disegna lo schema, guarda la validazione in tempo reale e premi *Simula* per
animarlo.

> Stato: prima versione. Editor, archivio dei progetti, validazione e simulazione di valvole,
> riduttori, strozzatori e cilindri. Dettagli in [docs/interfaccia.md](docs/interfaccia.md),
> [docs/modello-dati.md](docs/modello-dati.md) e [docs/PIANO.md](docs/PIANO.md).

## Sviluppo

Pneutrack è scritto in TypeScript e richiede Node.js 22.

```bash
npm install
npm run dev     # editor su http://localhost:5173/Pneutrack/
npm test        # test del modello e della simulazione
npm run build   # versione pubblicabile in dist/
```

## Obiettivi

- **Disegno** di schemi pneumatici con simboli conformi a ISO 1219 (cilindri, valvole
  distributrici, valvole di regolazione, gruppi FRL, sorgenti di aria compressa, scarichi).
- **Validazione** dello schema prima della simulazione, con messaggi chiari che indicano
  il componente o la linea che causa il problema.
- **Simulazione** del funzionamento: pressioni, portate, posizione e velocità degli
  attuatori, tempi di ciclo.
- **Parametri reali**: ogni componente si descrive con i valori che si trovano sul
  catalogo del produttore, nelle unità usate dal catalogo.
- **Formato aperto** per salvare gli schemi, leggibile e versionabile con git.
- **Software libero** distribuito con licenza GPL, così che miglioramenti e derivati
  restino a disposizione di tutti.

## Architettura: lo schema come grafo

Il modello interno di uno schema è un **grafo**:

- i **nodi** sono i componenti (cilindro, valvola 5/2, regolatore di flusso, sorgente,
  scarico, ...);
- gli **archi** sono le linee pneumatiche (tubi) che collegano le porte dei componenti.

Ogni componente espone delle **porte** con nome e ruolo, secondo la numerazione ISO 5599
(1 alimentazione, 2 e 4 utilizzi, 3 e 5 scarichi, 12 e 14 pilotaggi). Un arco collega
sempre una porta di un componente alla porta di un altro, e porta con sé le proprie
proprietà (diametro interno, lunghezza).

```
 [Sorgente 6 bar] --(tubo Ø6, 2 m)--> [1] Valvola 5/2 [4] --(tubo Ø6, 1 m)--> [A] Cilindro
                                          [2] --(tubo Ø6, 1 m)--> [B] Cilindro
                                          [3] --> Scarico
                                          [5] --> Scarico
```

Questa rappresentazione separa nettamente tre livelli:

1. **Modello** (grafo di componenti e linee, con i loro parametri): è la fonte di verità
   e ciò che viene salvato su file.
2. **Vista** (posizione dei simboli sul foglio, percorso grafico delle linee): serve solo
   al disegno e non influisce sulla simulazione.
3. **Simulazione**: legge il grafo, costruisce il sistema di equazioni a partire dai
   collegamenti e lo integra nel tempo.

Grazie al grafo, operazioni come trovare i percorsi dall'alimentazione agli attuatori,
individuare porte scollegate o rami isolati diventano normali visite del grafo.

## Parametri in unità da catalogo

I parametri dei componenti si inseriscono nelle unità in cui compaiono sui cataloghi,
senza conversioni a mano. Alcuni esempi:

| Grandezza                  | Unità di inserimento        |
|----------------------------|-----------------------------|
| Pressione                  | bar (relativa)              |
| Alesaggio, corsa, Ø tubo   | mm                          |
| Lunghezza tubo             | m                           |
| Portata nominale           | Nl/min                      |
| Conduttanza sonica         | C in dm³/(s·bar), con *b*   |
| Coefficiente di portata    | Kv, Cv                      |
| Volume                     | l, cm³                      |
| Tempo di commutazione      | ms                          |

Ogni valore è memorizzato insieme alla propria unità. Il motore di simulazione converte
internamente tutto in unità SI (Pa assoluti, m, m³/s, kg/s) e i risultati si mostrano di
nuovo nelle unità scelte dall'utente. In questo modo un componente si configura copiando
i dati dalla scheda tecnica, e lo stesso schema resta coerente anche mescolando cataloghi
che usano unità diverse.

## Validazione degli schemi

Prima di simulare, lo schema passa attraverso una serie di controlli. Ogni problema è
segnalato come **errore** (la simulazione non parte) o **avviso** (la simulazione parte,
ma il risultato potrebbe non essere quello atteso). Esempi di controlli:

- **Connessioni**: porte obbligatorie scollegate, porte collegate più volte quando non è
  ammesso, linee con un solo estremo.
- **Compatibilità delle porte**: alimentazione collegata direttamente a uno scarico,
  utilizzo collegato a un altro utilizzo senza componenti intermedi.
- **Topologia**: componenti o rami non raggiungibili da nessuna sorgente, circuiti senza
  alimentazione, attuatori senza via di scarico.
- **Parametri**: valori mancanti, fuori campo o incoerenti (per esempio pressione di
  esercizio superiore alla pressione massima ammessa dal componente, Ø tubo superiore
  alla filettatura della porta).
- **Unità**: valori con unità non compatibili con la grandezza richiesta.

I controlli lavorano sul grafo, quindi sono indipendenti dalla parte grafica e si
possono eseguire anche da riga di comando o nei test automatici. Quelli già attivi sono
elencati in [docs/modello-dati.md](docs/modello-dati.md#validazione).

## Contribuire

Il progetto è aperto a contributi: segnalazioni, proposte di componenti, simboli,
modelli di simulazione e documentazione. Apri una issue per discutere una modifica prima
di inviare una pull request di grandi dimensioni.

## Licenza

Pneutrack è software libero: puoi ridistribuirlo e/o modificarlo secondo i termini della
GNU General Public License pubblicata dalla Free Software Foundation, versione 3 della
licenza o (a tua scelta) qualsiasi versione successiva.

Pneutrack è distribuito nella speranza che sia utile, ma SENZA ALCUNA GARANZIA. Consulta
il file [LICENSE](LICENSE) per il testo completo.

SPDX-License-Identifier: GPL-3.0-or-later
