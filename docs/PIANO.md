# Pneutrack — piano di sviluppo

Obiettivo: editor di schemi pneumatici (ISO 1219) con simulazione animata, sul modello di FluidSIM / Automation Studio.

## Scelte
- Web app TypeScript (SVG, Vite), tutta nel browser e pubblicata su GitHub Pages; solutore indipendente dall'interfaccia (Web Worker o Rust→WASM solo se serve).
- Modello fisico a parametri concentrati: nodi-volume con pressione, componenti come resistenze ISO 6358 (C, b), cilindro come massa con attrito, integrazione ODE.
- Schemi salvati in JSON versionato. Simboli ISO 1219 disegnati in proprio (SVG).

## Fasi
0. **Prototipo di fattibilità** (fatto): alimentazione → 5/2 → cilindro doppio effetto, test automatici. Codice in `src/solver`, oggi riferimento per i test del caso base.
1. **Editor** (fatto): canvas zoom/pan/snap, palette con tutto il catalogo ISO 1219, collegamenti, linee e tubi, più fogli con rimandi, blocchi, testi e forme, undo/redo, progetti, validazione, uso da tastiera.
2. **Simulazione pneumatica** (fatta): compilazione grafo → rete di volumi/resistenze, tutti i 73 componenti del catalogo (anche l'attuatore rotante), ammortizzo, regolazioni durante la simulazione, animazione, diagramma delle fasi e misure di consumo.
3. **Elettropneumatica** (fatta, guida in [elettropneumatica.md](elettropneumatica.md)): solenoidi, relè, contatti, temporizzatori, fine corsa, sensori, pressostati, diagramma delle fasi.
4. **Finitura** (in corso): esempi didattici e manuale d'uso (fatti), export PDF, SVG, DXF e distinta (fatti), app installabile e uso senza rete (fatti); da fare: i18n it/en, pacchetto desktop (Tauri).
Dopo la v1: GRAFCET, ladder PLC, catalogo parametri reali.

## Rischi
Stabilità numerica (sistema rigido), qualità simboli ISO, ambito troppo ampio, aspettative di realismo.
