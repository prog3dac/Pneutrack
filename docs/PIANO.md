# Pneutrack — piano di sviluppo

Obiettivo: editor di schemi pneumatici (ISO 1219) con simulazione animata, sul modello di FluidSIM / Automation Studio.

## Scelte
- Web app TypeScript (React + SVG), solutore indipendente dal browser (Web Worker; Rust→WASM solo se serve).
- Modello fisico a parametri concentrati: nodi-volume con pressione, componenti come resistenze ISO 6358 (C, b), cilindro come massa con attrito, integrazione ODE.
- Schemi salvati in JSON versionato. Simboli ISO 1219 disegnati in proprio (SVG).

## Fasi
0. **Prototipo di fattibilità** (fatto): alimentazione → 5/2 → cilindro doppio effetto, test automatici. Codice in `src/solver`.
1. **Editor** (3-4 sett.): canvas zoom/pan/snap, palette ~20 componenti, collegamenti, undo/redo, salvataggio JSON, validazione.
2. **Simulazione pneumatica** (4-6 sett.): compilazione grafo → rete di volumi/resistenze, tutti i componenti, animazione (colori pressione, pistoni), grafici.
3. **Elettropneumatica** (3-4 sett.): solenoidi, relè, contatti, temporizzatori, fine corsa, diagramma di fase.
4. **Finitura**: esempi didattici, export PDF/SVG, i18n it/en, pacchetto desktop (Tauri).
Dopo la v1: GRAFCET, ladder PLC, catalogo parametri reali.

## Rischi
Stabilità numerica (sistema rigido), qualità simboli ISO, ambito troppo ampio, aspettative di realismo.
