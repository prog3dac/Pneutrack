# Pneutrack — piano di sviluppo

Obiettivo: editor di schemi pneumatici (ISO 1219) con simulazione animata, sul modello di FluidSIM / Automation Studio.

## Scelte
- Web app TypeScript (SVG, Vite), tutta nel browser e pubblicata su GitHub Pages; solutore indipendente dall'interfaccia (Web Worker o Rust→WASM solo se serve).
- Modello fisico a parametri concentrati: nodi-volume con pressione, componenti come resistenze ISO 6358 (C, b), cilindro come massa con attrito, integrazione ODE.
- Schemi salvati in JSON versionato. Simboli ISO 1219 disegnati in proprio (SVG).

## Fasi
0. **Prototipo di fattibilità** (fatto): alimentazione → 5/2 → cilindro doppio effetto, test automatici. Codice in `src/solver`.
1. **Editor** (fatto, base): canvas zoom/pan/snap, palette, collegamenti, undo/redo, progetti, validazione. Da ampliare: canvas zoom/pan/snap, palette ~20 componenti, collegamenti, undo/redo, salvataggio JSON, validazione.
2. **Simulazione pneumatica** (avviata: valvole, riduttore, strozzatore, cilindri animati; mancano attuatore rotante e grafici): compilazione grafo → rete di volumi/resistenze, tutti i componenti, animazione (colori pressione, pistoni), grafici.
3. **Elettropneumatica** (avviata: modello dati, validazione e solutore del circuito elettrico; poi simboli e simulazione nell'editor): solenoidi, relè, contatti, temporizzatori, fine corsa, diagramma di fase.
4. **Finitura**: esempi didattici, export PDF/SVG, i18n it/en, pacchetto desktop (Tauri).
Dopo la v1: GRAFCET, ladder PLC, catalogo parametri reali.

## Rischi
Stabilità numerica (sistema rigido), qualità simboli ISO, ambito troppo ampio, aspettative di realismo.
