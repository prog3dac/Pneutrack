# Manuale · Come calcola la simulazione

Questa parte descrive il modello fisico con cui Pneutrack simula uno schema: le equazioni, la regola
applicata a ogni componente, le costanti del modello e il metodo numerico. Il codice di riferimento è
`src/sim/network.ts` (dallo schema alla rete fisica), `src/sim/simulator.ts` (integrazione nel tempo),
`src/solver/flow.ts` (portata ISO 6358) e `src/sim/electric.ts` (circuito di comando).

Simboli usati: p pressione assoluta [Pa], p_rel = p − p_atm, V volume [m³], ṁ portata in massa [kg/s],
C conduttanza sonica [m³/(s·Pa)], b rapporto critico, x corsa del cilindro [m], v = dx/dt.

## 1. Dallo schema alla rete

Lo schema diventa una **rete a parametri concentrati**:

- **Nodi.** Le porte unite da collegamenti ideali formano un nodo: un volume con una sola pressione.
  Ogni nodo ha un volume proprio di **1 cm³** (raccordi). A questo si aggiungono il volume dei tubi
  (metà a ciascun capo), dei serbatoi, delle basette, delle ventose e delle camere dei cilindri.
- **Nodi a pressione imposta.** Alimentazioni e compressori fissano la pressione del loro nodo; scarichi,
  silenziatori e porte di scarico lasciate libere sono all'atmosfera.
- **Orifizi.** Ogni passaggio d'aria (via di una valvola, strozzatore, filtro, tubo...) è un orifizio
  ISO 6358 tra due nodi, con C e b. Un orifizio può essere attivo solo in certe caselle di una valvola,
  solo in un verso (non ritorno), o aperto in parte da una funzione delle pressioni (valvole logiche e di
  pressione).
- **Cilindri.** Masse mobili che cambiano il volume delle loro camere (§4).
- **Valvole.** Stato discreto (casella 14, 12 o 0) aggiornato dopo ogni passo di calcolo (§5).

Componenti non ancora simulati (per esempio l'attuatore rotante) restano nello schema con le porte
chiuse, e la simulazione lo segnala con un avviso.

## 2. Portata attraverso un passaggio (ISO 6358)

### 2.1 Formula

Con p₁ la pressione a monte e p₂ quella a valle (assolute), r = p₂/p₁:

- flusso sonico (strozzato), r ≤ b: ṁ = C · ρ_ANR · p₁ · √(T_ANR / T₁)
- flusso subsonico, r > b: ṁ = C · ρ_ANR · p₁ · √(T_ANR / T₁) · √(1 − ((r − b)/(1 − b))²)

con ρ_ANR = 1,185 kg/m³ e T_ANR = 293,15 K. La portata cambia verso se p₂ > p₁. La temperatura dell'aria
è presa costante, T = 293,15 K (20 °C).

### 2.2 Conduttanza dalla portata nominale Qn

Se il componente ha la portata nominale `flow` e non la `conductance`, C si ricava dalla prova di
catalogo (6 bar relativi a monte, 5 bar a valle):

C = Qn / (p₁ · √(1 − x²)), con p₁ = 7,013 bar ass., p₂ = 6,013 bar ass., x = (p₂/p₁ − b)/(1 − b)

(`conductanceFromFlow` in `src/model/components.ts`).

### 2.3 Aperture

Negli strozzatori la conduttanza è quella a tutta apertura moltiplicata per l'apertura (0–100 %):
C = C_max · `opening`.

## 3. Tubi

Un collegamento con il tubo (diametro interno d, lunghezza L) diventa un orifizio tra i nodi dei suoi due
capi, più un volume:

- volume V = π d²/4 · L, metà a ciascun capo;
- area efficace A_eff = (π d²/4) / √(1 + λ L/d), con coefficiente d'attrito di Darcy **λ = 0,03**;
- conduttanza C = 1,99·10⁻³ · A_eff [m³/(s·Pa)], cioè C [dm³/(s·bar)] ≈ 0,2 · A_eff [mm²];
- rapporto critico **b = 0,4**.

Il tubo flessibile disegnato come componente (`flexible_hose`) usa invece la sua `conductance` e, se ci
sono diametro e lunghezza, aggiunge lo stesso volume.

## 4. Cilindri e attuatori lineari

### 4.1 Camere

- Area del fondello A₁ = π D²/4 (D = `bore`); area anulare A₂ = A₁ − π d²/4 (d = `rod`).
- Doppio stelo: A₁ = A₁ − π d₂²/4 (d₂ = `rod2`, se manca uguale a `rod`). Senza stelo: A₁ = A₂ = π D²/4.
- Volume della camera A: V_A = V₀ + A₁ x; della camera B: V_B = V₀ + A₂ (s − x), con s la corsa e
  **V₀ = 5 cm³** di volume morto per camera.
- Semplice effetto in spinta: la camera B è all'atmosfera. In trazione (`single_kind: pull`) la porta A
  è la camera stelo, la camera fondello sfiata e lo stelo parte fuori (x = s).
- Pinza, soffietto, cilindro a membrana e muscolo pneumatico sono modellati come cilindri con la loro
  corsa e area (soffietto, membrana e muscolo come semplice effetto con la molla `spring_force`).

### 4.2 Equazione del moto

m ẍ = p_A A₁ − p_B A₂ − p_atm (A₁ − A₂) − F_molla − F_carico − F_peso − F_attrito

- m = `mass`; F_carico = `load` (positivo contro l'uscita) oppure il profilo di forza `load_profile`,
  interpolato linearmente tra i punti.
- F_peso = m · g · sin(`mounting_angle`), g = 9,81 m/s².
- F_molla = `spring_force`, costante lungo la corsa (semplice effetto; negativa in trazione, perché spinge
  lo stelo fuori).
- **Fine corsa**: arresto anelastico. Arrivato a 0 o a s, lo stelo si ferma (v = 0) e ci resta finché la
  forza non lo spinge via.
- **Bloccaggi**: con il cilindro con bloccaggio dello stelo, sotto la pressione di sblocco
  `unlock_pressure` sulla porta L lo stelo resta fermo in qualunque posizione; con il bloccaggio di fine
  corsa resta fermo solo tutto rientrato, finché la pressione in A non supera `unlock_pressure`.

### 4.3 Attrito

F_attrito = [F_c + F_p + (F_s − F_c) · e^(−(v/v_s)²)] · tanh(v / 1 mm/s) + c_v · v

| Termine | Significato | Valore |
|---|---|---|
| F_c | attrito coulombiano a camere scariche | `friction` (predefinito 5 N) |
| F_s | attrito di primo distacco (Stribeck) | `static_friction` (predefinito uguale a `friction`) |
| v_s | velocità di Stribeck: sotto questa l'attrito sale verso F_s | 0,01 m/s |
| F_p | attrito delle guarnizioni dovuto alla pressione: le labbra premono di più sulla canna quando la camera è in pressione | μ_p · (p_rel,A · A₁ + p_rel,B · A₂), **μ_p = 0,03** |
| c_v | attrito viscoso, proporzionale alla circonferenza del pistone (lunghezza delle guarnizioni) | c_v = 1000 N·s/m² · π D (≈ 100 N·s/m per l'alesaggio 32) |

La tanh rende continuo il passaggio per v = 0 (l'attrito cambia verso con la velocità senza gradino).
Con μ_p = 0,03 un cilindro Ø32 a 6 bar ha circa 15 N di attrito in più, nell'ordine di grandezza dei
cataloghi (3–8 % della forza teorica). I valori di c_v misurati in letteratura per questi alesaggi sono
50–150 N·s/m.

### 4.4 Ammortizzo pneumatico di fine corsa

Con `cushioning` diverso da `none` la camera ammortizzata è un nodo a sé, collegato alla porta del
cilindro da un orifizio speciale:

- **Fuori dall'ammortizzo** l'aria passa libera: C_libera = 5 dm³/(s·bar) · (D / 32 mm)², b = 0,4.
- **Dentro l'ammortizzo** (gli ultimi L metri di corsa verso quella camera, L = `cushion_length`) l'aria
  che esce dalla camera passa solo dalla vite di quel lato: C_vite = apertura × 0,3 dm³/(s·bar) · (D / 32 mm)².
  Le viti sono due: `cushion_opening_rod` per l'ammortizzo in uscita (testata, frena la camera B) e
  `cushion_opening_cap` per quello in rientro (fondello, frena la camera A). L'apertura minima è 1 %
  (anche a vite chiusa resta un piccolo trafilamento).
- **Scala con l'alesaggio.** I passaggi della testata e la vite crescono con l'area del pistone: così a pari
  apertura la velocità di avvicinamento nell'ammortizzo, v ≈ Q_vite / A, è simile per tutti gli alesaggi.
- **Spillo conico.** Il passaggio libero non si chiude di colpo: nel primo tratto dell'ammortizzo,
  lungo L_c = 0,2 · L (tra 1 e 5 mm), la conduttanza scende con continuità da C_libera a C_vite. Con
  s = profondità / L_c e k = s² (3 − 2 s):
  C = exp(ln C_libera + (ln C_vite − ln C_libera) · k).
- **Valvola di non ritorno dell'ammortizzo.** L'aria che entra nella camera (ripartenza dal fine corsa)
  passa sempre libera.
- Se `cushion_length` manca: L = 0,6 · D, tra 10 e 40 mm, e mai più della corsa (della metà con
  l'ammortizzo ai due lati).

**Perché uscita e rientro non sono uguali a pari apertura.** In uscita l'aria da frenare sta sull'area
anulare A₂ e spinge l'area piena A₁; in rientro è il contrario: la spinta agisce su A₂ e la camera frenata
ha l'area piena A₁, con più aria da far uscire dalla vite. Con la stessa apertura il rientro è quindi più
lento nell'ammortizzo (per un Ø32 con stelo 12 circa il 20–35 % in più di tempo; la differenza cresce con
il diametro dello stelo). Le due viti separate servono proprio a pareggiare i due fine corsa, come sul
cilindro reale.

L'aria chiusa nella camera si comprime e frena lo stelo come una molla d'aria; l'energia si dissipa
nell'aria che passa dalla vite e nell'attrito. Con la vite molto chiusa e una massa grande lo stelo può
ancora rimbalzare una volta di qualche millimetro, come in un cilindro reale regolato male: la vite si
apre fino a quando l'arrivo è morbido e senza ritorni.

## 5. Valvole distributrici e comandi

- Ogni casella della valvola ha i suoi passaggi (letti dalle stesse caselle del simbolo); ogni passaggio è
  un orifizio con la C e la b della valvola, attivo solo con la valvola in quella casella. La
  commutazione è istantanea.
- **Pilotaggio pneumatico**: il lato è comandato quando la pressione relativa sulla porta 12 o 14 supera la
  soglia `min_pressure` (predefinita **2 bar**).
- **Servopilotata** (`solenoid_pilot`): il solenoide comanda solo se la porta 1 (pilotaggio interno) o
  la porta di pilotaggio esterna ha almeno la soglia. Ritorno pneumatico (`air_return`): riporta la valvola
  solo se c'è pressione.
- **Molla**: riporta sempre la valvola nella casella di riposo quando l'altro lato non è comandato.
- **Bistabile**: senza comandi resta dov'è; parte nella casella `initial`.
- **Tre posizioni**: con un solo lato comandato va in quella casella, altrimenti nella centrale.
- **Segnale dominante** (`dominant`): con 14 e 12 comandati insieme vince il lato indicato.
- **Rulli e tastatori** (`cam_14`, `cam_12`): premuti negli ultimi **2 mm** di corsa del cilindro indicato
  (le stesse soglie valgono per i finecorsa elettrici: `ROLLER_ZONE`, `ONEWAY_ZONE`, `ONEWAY_MIN_SPEED` in
  `src/solver/constants.ts`).
  **Leva ribaltabile** (`roller_oneway`): azionata negli ultimi 5 mm, solo mentre lo stelo va verso quel
  fine corsa a più di 1 mm/s.
- **Comando manuale ausiliario e secondo comando** (`aux_14`, `aux_12`): si azionano con un clic; un rullo
  come secondo comando può essere premuto da un cilindro.

## 6. Regole dei singoli componenti

### Alimentazione e trattamento aria

| Tipo | Modello |
|---|---|
| `pressure_source`, `compressor` | nodo a pressione imposta p_atm + `pressure` |
| `air_reservoir` | volume `volume` aggiunto al nodo; le porte 1 e 2 sono sullo stesso nodo |
| `air_filter`, `lubricator`, `air_dryer` | orifizio 1 → 2 (con C e b del componente) |
| `pressure_regulator`, `frl_unit`, `filter_regulator` | orifizio 1 → 2 che si chiude quando la pressione a valle raggiunge `setpoint`: portata × min(1, max(0, (p_set − p₂)/0,1 bar)), solo da 1 a 2 |
| `pressure_gauge` | nessun effetto: legge la pressione del nodo |
| `silencer`, `exhaust` | nodo all'atmosfera |
| `plug`, `junction` | nessun effetto (la porta tappata o il punto di unione fanno parte del nodo) |

### Intercettazione e collegamenti

| Tipo | Modello |
|---|---|
| `shutoff_valve` | 2/2 a leva con arresto: parte aperto, un clic lo chiude |
| `lockout_valve` | 3/2 a leva: parte aperta; chiusa scarica l'utilizzo da 3 |
| `three_way_cock` | 1 collegato a 2 (all'avvio) o a 4 |
| `quick_coupling` | innestato: orifizio 1 – 2. Staccato: la metà con la non ritorno resta chiusa, quella senza scarica in atmosfera |
| `flexible_hose` | orifizio 1 – 2 e, con `inner_diameter` e `length`, il volume della linea |
| `rotary_joint` | orifizio 1 – 2 |
| `manifold` | tutte le porte sullo stesso nodo, con il volume `volume` |
| `sheet_reference` | i rimandi con la stessa descrizione sono lo stesso nodo |

### Valvole di blocco e logiche

Le aperture «progressive» qui sotto sono rampe lineari da chiuso a aperto: evitano commutazioni a scatto
che renderebbero instabile il calcolo.

| Tipo | Modello |
|---|---|
| `directional_valve` | §5 |
| `check_valve` | solo 1 → 2; apre quando p₁ − p₂ supera la pressione di apertura `cracking_pressure` (0,1 bar, 0,5 bar con la molla), del tutto 0,05 bar più su |
| `pilot_check_valve` | 1 → 2 libero; 2 → 1 solo con il pilotaggio 21 sopra `pilot_pressure` (apertura progressiva da −0,1 a +0,1 bar attorno alla soglia) |
| `double_pilot_check` | 1 → 2 e 3 → 4 liberi; i ritorni 2 → 1 e 4 → 3 aperti dalla pressione dell'altra linea, come sopra |
| `shuttle_valve` (OR) | l'uscita 2 è collegata all'ingresso a pressione maggiore; con gli ingressi entro 0,02 bar l'uno dall'altro la sfera passa gradualmente da una sede all'altra (restano aperti entrambi in parte) |
| `and_valve` (AND) | l'uscita 2 è collegata all'ingresso a pressione minore, con lo stesso passaggio graduale di 0,02 bar |
| `quick_exhaust_valve` | 1 → 2 libero; 2 → 3 (conduttanza `exhaust_conductance`) quando p₂ supera p₁ di più di 0,1 bar, del tutto a 0,2 bar |

### Regolazione di portata e pressione

| Tipo | Modello |
|---|---|
| `flow_control_valve` | orifizio 1 – 2 con C = C_max · `opening`, nei due versi |
| `fixed_orifice` | orifizio con C = `conductance` oppure, dal diametro d [mm] dell'ugello, C = 0,128 · d² dm³/(s·bar) |
| `one_way_flow_control` | strozzato 1 → 2 (C_max · `opening`), libero 2 → 1 con `free_conductance` |
| `roller_flow_control` | libero a rullo rilasciato; con il rullo premuto (dal cilindro di `cam_14`) C × `pressed_opening` |
| `soft_start_valve` | riempie a valle con C × `fill_opening`; apre del tutto quando p_rel,2 raggiunge `switch_ratio` · p_rel,1 (apertura progressiva da 0,05 bar sotto a 0,05 bar sopra la soglia); da 2 a 1 scarica libera |
| `relieving_regulator`, `proportional_regulator` | come il riduttore, più lo scarico 2 → 3 che apre quando la pressione a valle supera la taratura di 0,1 bar, del tutto a 0,2 bar |
| `piloted_regulator` | riduttore con taratura `ratio` × pressione relativa del pilotaggio 12 |
| `pressure_intensifier` | solo 1 → 2, con la pressione a monte equivalente p_atm + `ratio` · p_rel,1; il nodo 1 cede `ratio` volte la massa che passa |
| `relief_valve` | scarico 1 → 3 che apre quando p_rel,1 supera `setpoint`, del tutto 0,2 bar più su |
| `sequence_valve` | 3/2 normalmente chiusa (1 → 2) pilotata da 12, che commuta quando il pilotaggio supera `setpoint` |
| `time_delay_valve` | 3/2 normalmente chiusa pilotata da 12 (soglia `pilot_pressure`): commuta dopo che il pilotaggio è rimasto attivo per `delay` |

### Attuatori

| Tipo | Modello |
|---|---|
| `single_acting_cylinder`, `double_acting_cylinder`, `double_rod_cylinder`, `rodless_cylinder` | §4 |
| `locking_cylinder`, `end_lock_cylinder` | §4, con il bloccaggio (§4.2) |
| `gripper`, `bellows_cylinder`, `diaphragm_cylinder`, `pneumatic_muscle` | §4.1 (cilindri con la loro corsa e area); la pinza non sente il peso |
| `air_motor` | orifizio 1 – 2 (solo 1 → 2 se `motor_kind` è `one_way`): ne simula il consumo, non la rotazione |
| `rotary_actuator` | pignone e cremagliera con raggio primitivo r = 10 mm: la rotazione θ (`angle`) è la corsa r·θ di un pistone di area A = `displacement` / (r·θ), uguale nelle due camere (A e B; a semplice effetto B sfiata e la molla `spring_force` lo riporta). `mass`, `load` e `friction` sono riportati al raggio primitivo (massa equivalente J / r², carico M / r). Coppia teorica M = p · `displacement` / θ. In simulazione mostra l'angolo raggiunto |

### Vuoto

| Tipo | Modello |
|---|---|
| `vacuum_pump` | nodo a pressione imposta p_atm − `vacuum` (almeno 0,05 bar assoluti); il grado di vuoto si regola anche durante la simulazione |
| `vacuum_ejector` | consuma aria da 1 a 3; aspira dalla porta 2 verso un nodo a p_atm − `max_vacuum` con `suction_conductance`. Il vuoto cresce con l'alimentazione: nullo sotto 0,5 bar, pieno sopra 4 bar. Senza aria la porta 2 sfiata all'atmosfera. Con il soffio (`blowoff`) l'aria della porta 4 entra nella porta 2 |
| `suction_cup` | volume π d²/4 · d/4 aggiunto al nodo |

### Misura e segnalazione

| Tipo | Modello |
|---|---|
| `pressure_sensor`, `pressure_indicator`, `differential_gauge`, `thermometer` | nessun effetto sul circuito: leggono le grandezze dei loro nodi |
| `flow_meter` | orifizio 1 – 2: legge la portata che lo attraversa |

## 7. Circuito elettrico di comando

Il circuito elettrico (componenti in [componenti.md](componenti.md), categoria «Elettrico») è simulato in
modo **logico**: i fili uniscono i morsetti in nodi, i contatti chiusi uniscono i nodi, un carico è
eccitato quando un suo morsetto è unito al + e l'altro allo 0V. Se + e 0V finiscono uniti è un
cortocircuito e tutto resta senza tensione. Il circuito si aggiorna ogni **1 ms** di tempo simulato.

| Componente | Regola |
|---|---|
| `relay_coil` | il relè attrae (e rilascia) dopo `pickup_time` (predefinito 10 ms) |
| `timer_relay` | ritardato all'eccitazione (`on_delay`) o alla diseccitazione (`off_delay`) di `delay` |
| `valve_solenoid` | comanda subito il solenoide della valvola indicata |
| `limit_switch` | azionato negli ultimi 2 mm di corsa del cilindro; a leva ribaltabile negli ultimi 5 mm e solo andando verso il fine corsa |
| `proximity_sensor` | chiuso quando |x − `position`| ≤ `range` (predefinito 3 mm); senza `position`, al fine corsa indicato |
| `pressure_switch` | interviene quando la pressione relativa della porta 1 raggiunge `setpoint`, rilascia sotto `setpoint` − `hysteresis` (predefinita 0,5 bar); il vacuostato lavora sul grado di vuoto |
| `pushbutton`, `relay_contact`, `signal_lamp`, `electric_supply`, `wire_reference` | contatti, carichi, sorgente e rimandi della rete logica |

Dettagli e esempi in [../elettropneumatica.md](../elettropneumatica.md).

## 8. Metodo numerico

- **Equazione dei nodi** (gas perfetto, compressione adiabatica, temperatura dell'aria che entra costante):
  dp/dt = (κ R T / V) · ṁ_entrante − (κ p / V) · dV/dt, con κ = 1,4 e R = 287,05 J/(kg·K).
- **Integrazione**: Runge-Kutta del 4° ordine a passo fisso **Δt = 20 µs**. Stato: pressione di ogni
  nodo libero, posizione e velocità di ogni cilindro, massa d'aria uscita dalle alimentazioni.
- Dopo ogni passo: lo stelo è riportato dentro la corsa (fine corsa anelastico), le pressioni non scendono
  sotto 1 kPa assoluto, la logica delle valvole si aggiorna; ogni 50 passi (1 ms) si aggiorna il circuito
  elettrico.
- Le **regolazioni** cambiate durante la simulazione (riduttori, strozzatori, viti, ritardi, pressione
  dell'alimentazione, grado di vuoto) agiscono subito sulla rete, senza ripartire.
- **Tempo di calcolo**: l'editor dedica alla simulazione al più 12 ms per fotogramma (`SIM_BUDGET_MS`,
  `src/ui/app.ts`). Con schemi grandi, se il calcolo non tiene la velocità scelta, la simulazione va più
  piano e accanto al tempo compare «rallentata al N %»: i passi e quindi i risultati restano gli stessi.

## 9. Grandezze misurate

- **Consumo d'aria**: massa uscita dalle alimentazioni (quella che vi rientra si sottrae) divisa per
  ρ_ANR, in litri normali; la portata istantanea in Nl/min.
- **Tempi di corsa**: da quando lo stelo lascia un fine corsa a quando arriva all'altro, con una tolleranza
  dell'1 % della corsa.
- **Cicli**: dalla partenza del primo cilindro dalla posizione di riposo al ritorno di tutti a riposo; il
  consumo del ciclo parte quando la portata scende sotto 1 Nl/min.

## 10. Costanti del modello

| Costante | Valore | Dove |
|---|---|---|
| p_atm | 101 325 Pa | `src/solver/constants.ts` |
| T (aria) | 293,15 K | `src/sim/network.ts` |
| κ, R | 1,4; 287,05 J/(kg·K) | `src/solver/constants.ts` |
| ρ_ANR | 1,185 kg/m³ | `src/solver/constants.ts` |
| volume di un nodo | 1 cm³ | `NODE_VOLUME`, `src/sim/network.ts` |
| volume morto di una camera | 5 cm³ | `DEAD_VOLUME`, `src/sim/network.ts` |
| soglia di pilotaggio predefinita | 2 bar | `DEFAULT_PILOT_THRESHOLD`, `src/sim/network.ts` |
| attrito delle guarnizioni con la pressione μ_p | 0,03 | `SEAL_PRESSURE_FRICTION`, `src/solver/constants.ts` |
| attrito viscoso per circonferenza | 1000 N·s/m² | `VISCOUS_PER_PERIMETER`, `src/solver/constants.ts` |
| velocità di Stribeck | 0,01 m/s | `STRIBECK_V`, `src/sim/simulator.ts` |
| ammortizzo: C libera, C vite a tutta apertura (Ø32, crescono con D²), apertura minima | 5 e 0,3 dm³/(s·bar), 1 % | `src/sim/network.ts` |
| ammortizzo: tratto conico | 0,2 × lunghezza, tra 1 e 5 mm | `cushionTaper`, `src/sim/network.ts` |
| tubi: λ, b | 0,03; 0,4 | `src/model/tubes.ts` |
| passo di integrazione | 20 µs | `DT`, `src/sim/simulator.ts` |
| aggiornamento del circuito elettrico | 1 ms | `ELECTRIC_EVERY`, `src/sim/simulator.ts` |
| finecorsa: rullo, leva ribaltabile, velocità minima della leva | 2 mm; 5 mm; 1 mm/s | `ROLLER_ZONE`, `ONEWAY_ZONE`, `ONEWAY_MIN_SPEED`, `src/solver/constants.ts` |
| valvole OR e AND: passaggio tra gli ingressi | 0,02 bar | `LOGIC_SWAP`, `src/sim/network.ts` |
| attuatore rotante: raggio primitivo | 10 mm | `ROTARY_PITCH_RADIUS`, `src/sim/network.ts` |
