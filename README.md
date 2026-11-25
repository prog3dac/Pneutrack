# Pneutrack
Schemi e simulazione pneumatica.

Stato: Fase 0 completata (solutore + modello a grafo). Vedi [docs/PIANO.md](docs/PIANO.md).

```bash
npm install
npm test        # test del solutore
npm run demo    # simula estensione/rientro, scrive out/cylinder.csv
```

## Modello a grafo
Uno schema è un JSON (`examples/cylinder-52.json`) con componenti e connessioni tra porte (`"V1.4"` → `"A1.cap"`).
`compile()` (src/solver/network.ts) valida lo schema e costruisce la rete di nodi-volume; `simulateNetwork()` la integra.
Componenti disponibili: supply, atmosphere, valve52, valve32, throttle, oneWayThrottle, checkValve, cylinderDA.

## Licenza
GPL-3.0-or-later (il testo completo in `LICENSE` va ancora aggiunto).
