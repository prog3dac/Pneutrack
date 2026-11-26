/**
 * Descrizioni dei campi da compilare, mostrate al passaggio del mouse.
 *
 * Parametri e opzioni dei componenti sono cercati prima come "tipo.nome" (descrizione
 * specifica di un componente) e poi come "nome". Un parametro senza voce riceve una
 * descrizione generica costruita dai suoi metadati, così un componente nuovo non resta
 * mai senza aiuto.
 */
import type { OptionSpec, ParamSpec } from "../model/components";

const UNITS: Record<string, string> = {
  pressure: "bar (anche mbar, kPa, MPa, Pa, psi). Le pressioni sono relative all'atmosfera",
  length: "mm (anche cm, m, in)",
  force: "N (anche kN, daN)",
  mass: "kg (anche g)",
  time: "s (anche ms, min)",
  volume: "l (anche cm3, dm3, m3)",
  flow: "Nl/min (anche l/min, Nl/s, Nm3/h)",
  conductance: "dm3/(s·bar), il coefficiente C della ISO 6358",
  angle: "gradi, deg o ° (anche rad)",
  voltage: "V (anche mV, kV)",
  dimensionless: "numero puro, senza unità",
  percent: "% (0 % chiuso, 100 % tutto aperto); nei file vale anche la frazione, 0.3 = 30 %",
};

/** Parametri dei componenti. */
const PARAMS: Record<string, string> = {
  max_pressure:
    "Pressione massima di esercizio dichiarata a catalogo. Se nella rete a cui è collegato il " +
    "componente la pressione può superarla, la validazione segnala un errore di sovrapressione.",
  min_pressure:
    "Pressione minima di funzionamento dichiarata a catalogo: sotto questo valore il componente " +
    "non commuta o non si muove in modo affidabile. Se la pressione disponibile è più bassa compare un avviso.",
  conductance:
    "Conduttanza sonica C (ISO 6358): quanta aria lascia passare il componente in regime sonico, per " +
    "bar di pressione a monte. Più è alta, più il componente è 'largo' e veloce. Si legge a catalogo; " +
    "se non c'è e scrivi la portata nominale Qn, la simulazione ricava C da quella (circa C ≈ Qn [Nl/min] / 260). " +
    "Con entrambi vale C. Serve solo alla simulazione: se lasci vuoti C e Qn si usa il valore predefinito " +
    "indicato nel campo.",
  critical_ratio:
    "Rapporto critico di pressione b (ISO 6358), tra 0 e 1: rapporto valle/monte sotto il quale il flusso " +
    "diventa sonico e non cresce più. Valori tipici 0,2–0,5. Serve solo alla simulazione.",
  flow:
    "Portata nominale Qn dichiarata a catalogo (qnN di Festo), misurata con 6 bar a monte e 5 bar a valle. " +
    "Se la conduttanza C è vuota, la simulazione ricava C da Qn con la formula ISO 6358 e il rapporto " +
    "critico b; se scrivi anche C vale C.",
  opening:
    "Apertura della vite di regolazione, da 0 % (chiuso, l'aria non passa) a 100 % (tutto aperto). " +
    "La conduttanza effettiva è apertura × C a tutta apertura: nel flusso sonico la portata è proporzionale, " +
    "quindi 50 % dà circa metà della portata massima. Serve solo alla simulazione.",
  static_friction:
    "Attrito di primo distacco delle guarnizioni, da vincere per far partire lo stelo da fermo; di solito " +
    "è più alto dell'attrito in movimento (1,2–2 volte). Oltre circa 1 cm/s l'attrito scende al valore " +
    "di «Attrito». Se vuoto è uguale all'attrito. Serve solo alla simulazione.",
  mounting_angle:
    "Inclinazione del cilindro: 0° orizzontale, 90° verticale con lo stelo verso l'alto (il peso della massa " +
    "mobile frena l'uscita), −90° verticale con lo stelo verso il basso (il peso aiuta l'uscita). La " +
    "simulazione aggiunge la componente del peso lungo l'asse. Serve solo alla simulazione.",
  pressure: "Pressione relativa fornita dall'alimentazione (compressore o rete), ad esempio 6 bar.",
  volume:
    "Volume interno del serbatoio. Un volume grande smorza i picchi di consumo; un volume piccolo " +
    "(0,1 l) insieme a uno strozzatore crea un ritardo di tempo.",
  bore:
    "Alesaggio: diametro interno della canna, cioè del pistone. Determina la forza in uscita " +
    "(F = p × π × D² / 4) e il consumo d'aria. Usa il menu «Misura standard» per i valori ISO.",
  stroke:
    "Corsa: distanza percorsa dallo stelo da tutto dentro a tutto fuori. Insieme all'alesaggio dà il " +
    "volume d'aria consumato a ogni ciclo e incide sul tempo di corsa.",
  rod:
    "Diametro dello stelo. Riduce l'area utile della camera lato stelo, quindi la forza e il volume " +
    "in rientro. Se non lo indichi la simulazione considera la camera lato stelo senza stelo.",
  mass:
    "Massa in movimento: pistone, stelo e tutto ciò che vi è fissato. Rallenta l'avvio e determina " +
    "l'energia da smorzare a fine corsa. Serve solo alla simulazione.",
  load:
    "Forza esterna che si oppone all'uscita dello stelo, per esempio un peso da sollevare o un pezzo " +
    "da spingere. Serve solo alla simulazione.",
  friction:
    "Attrito delle guarnizioni, come forza costante che si oppone al moto nei due versi. Valori tipici " +
    "pari al 3–10 % della forza teorica. Serve solo alla simulazione.",
  spring_force:
    "Forza della molla che riporta dentro lo stelo del cilindro a semplice effetto. Se la spinta " +
    "dell'aria non la vince lo stelo non esce.",
  cushion_length:
    "Lunghezza dell'ammortizzo: tratto finale di corsa in cui l'aria in uscita passa solo dalla vite " +
    "di regolazione e frena il pistone. Se vuoto vale circa 0,6 volte l'alesaggio.",
  cushion_opening:
    "Apertura della vite di regolazione dell'ammortizzo, da 0 % (chiusa: frenata massima, rischio di " +
    "rimbalzo) a 100 % (tutta aperta: quasi nessuna frenata). Serve solo alla simulazione.",
  setpoint: "Pressione di taratura del componente.",
  setpoint_min:
    "Valore più basso a cui si può regolare la taratura (campo di regolazione del catalogo, per esempio " +
    "0,5 bar). In simulazione il cursore della regolazione parte da qui; se vuoto parte da 0.",
  setpoint_max:
    "Valore più alto a cui si può regolare la taratura (campo di regolazione del catalogo, per esempio " +
    "10 bar). In simulazione il cursore della regolazione arriva fin qui; se vuoto arriva alla pressione max.",
  cracking_pressure:
    "Differenza di pressione minima tra ingresso 1 e uscita 2 perché la valvola di non ritorno si apra " +
    "(precarico della molla). Serve solo alla simulazione.",
  pilot_pressure:
    "Pressione minima sul pilotaggio perché la valvola commuti. Sotto questo valore resta in posizione " +
    "di riposo. Serve solo alla simulazione.",
  exhaust_conductance:
    "Conduttanza C del passaggio verso lo scarico 3 della valvola di scarico rapido: più è alta, più " +
    "velocemente si svuota il cilindro. Serve solo alla simulazione.",
  free_conductance:
    "Conduttanza C nel verso libero (da 2 a 1), attraverso il non ritorno in parallelo allo strozzatore. " +
    "Serve solo alla simulazione.",
  delay: "Tempo di ritardo impostato.",
  angle: "Angolo di rotazione dell'attuatore da un fine corsa all'altro, per esempio 90° o 180°.",
  voltage: "Tensione di alimentazione del circuito di comando, per esempio 24 V in corrente continua.",
  pickup_time:
    "Tempo che passa tra l'arrivo della tensione sulla bobina e la commutazione dei contatti del relè. " +
    "Serve solo alla simulazione.",
  position:
    "Posizione del sensore lungo la corsa del cilindro, misurata dal fondello (lato porta A), cioè dallo " +
    "stelo tutto dentro. Il sensore dà il segnale quando il pistone è a questa distanza, entro il campo di " +
    "rilevamento. In alternativa lo si lega a un fine corsa del cilindro (C1+ o C1−).",
  range:
    "Campo di rilevamento: il sensore resta attivo finché il pistone è entro più o meno questo tratto dalla " +
    "posizione impostata. Serve solo alla simulazione.",
  hysteresis: "Isteresi: differenza tra il punto in cui il componente si attiva e quello in cui si disattiva.",
  diameter: "Diametro nominale del componente, come indicato a catalogo.",
  rod2:
    "Diametro del secondo stelo del cilindro a doppio stelo, se è diverso dal primo: la camera A ha l'area del " +
    "pistone meno questo stelo, la camera B meno il primo, così forze e velocità nei due versi cambiano. Se " +
    "vuoto è uguale allo stelo.",
  unlock_pressure:
    "Pressione relativa alla quale il bloccaggio si apre e lascia muovere lo stelo. Sotto questo valore lo stelo " +
    "resta fermo. Serve solo alla simulazione.",
  ratio:
    "Rapporto tra la pressione in uscita e quella di comando: nel moltiplicatore l'uscita arriva fino a " +
    "rapporto × pressione in ingresso; nel riduttore pilotato l'uscita è rapporto × pressione del pilotaggio.",
  pressed_opening:
    "Apertura dello strozzatore quando il rullo è premuto, da 0 % (chiuso) a 100 %: la portata in quel tratto è " +
    "questa frazione di quella libera. Serve solo alla simulazione.",
  length: "Lunghezza del tubo. Con il diametro interno dà il volume d'aria che la simulazione aggiunge alla linea.",
  inner_diameter:
    "Diametro interno del tubo flessibile. Con la lunghezza dà il volume d'aria della linea, che la simulazione " +
    "divide tra le due porte.",
  vacuum:
    "Vuoto prodotto dalla pompa, come pressione sotto l'atmosfera: 0,8 bar vuol dire 0,2 bar assoluti. La " +
    "simulazione tiene la porta 1 a questo vuoto.",
  range_max:
    "Fondo scala del sensore: la pressione a cui l'uscita analogica arriva al massimo (per esempio 10 V o 20 mA).",
  threshold:
    "Pressione relativa sopra la quale l'indicatore segnala la presenza d'aria. Serve solo alla simulazione.",
  max_vacuum:
    "Vuoto massimo che l'eiettore raggiunge con la bocca di aspirazione chiusa, come valore positivo: 0,85 bar " +
    "vuol dire 0,85 bar sotto la pressione atmosferica (circa 0,15 bar assoluti). Lo si raggiunge con circa 4 bar " +
    "di alimentazione. Serve solo alla simulazione.",
  suction_conductance:
    "Conduttanza C dalla porta del vuoto 2 verso l'eiettore: dice quanto in fretta si svuota la ventosa. " +
    "Serve solo alla simulazione.",
  fill_opening:
    "Apertura dello strozzatore di riempimento, in percentuale della conduttanza C: più è piccola, più lento è " +
    "il riempimento dell'impianto a valle. Serve solo alla simulazione.",
  switch_ratio:
    "Soglia, in percentuale della pressione in ingresso 1, a cui la valvola apre del tutto: con 50 % e 6 bar " +
    "a monte apre in pieno quando a valle ci sono 3 bar. Serve solo alla simulazione.",
};

/** Descrizioni specifiche di un tipo di componente ("tipo.nome"), prioritarie sulle generiche. */
const TYPE_PARAMS: Record<string, string> = {
  "fixed_orifice.diameter":
    "Diametro del foro dell'ugello calibrato, per esempio 0,5 mm. Se la conduttanza C è vuota, la simulazione " +
    "la ricava da qui con C ≈ 0,13 × d² dm³/(s·bar), d in mm (foro a spigolo vivo).",
  "fixed_orifice.conductance":
    "Conduttanza sonica C (ISO 6358) dell'ugello, se è indicata a catalogo. Se è vuota la simulazione la ricava " +
    "dal diametro del foro.",
  "suction_cup.diameter":
    "Diametro della ventosa a contatto con il pezzo. La forza di presa è il vuoto per l'area: con Ø 20 mm e " +
    "0,7 bar di vuoto circa 22 N, da dividere per un fattore di sicurezza.",
  "gripper.bore":
    "Diametro del pistone della pinza, dal catalogo: con la pressione dà la forza di chiusura (le griffe la " +
    "dividono in due).",
  "gripper.stroke":
    "Corsa di una griffa da tutta aperta a tutta chiusa, dal catalogo (spesso indicata come corsa per griffa).",
  "frl_unit.setpoint":
    "Pressione regolata dal riduttore del gruppo FRL: l'uscita 2 non la supera qualunque sia la pressione " +
    "in ingresso (purché più alta).",
  "pressure_regulator.setpoint":
    "Pressione regolata: l'uscita 2 non la supera qualunque sia la pressione in ingresso (purché più alta). " +
    "A valle tutte le linee sono limitate a questo valore.",
  "relief_valve.setpoint":
    "Pressione di taratura della valvola di sicurezza: oltre questo valore la valvola apre da 1 verso lo " +
    "scarico 3 e impedisce che la pressione salga ancora.",
  "sequence_valve.setpoint":
    "Pressione sul pilotaggio 12 alla quale la valvola di sequenza commuta e mette in comunicazione 1 con 2. " +
    "Si usa per far partire un movimento solo quando il precedente ha raggiunto una certa forza.",
  "pressure_switch.setpoint":
    "Pressione alla quale il pressostato commuta il suo contatto elettrico.",
  "pressure_switch.hysteresis":
    "Isteresi del pressostato: il contatto torna a riposo quando la pressione scende di questo valore " +
    "sotto la pressione di intervento. Serve solo alla simulazione.",
  "time_delay_valve.delay":
    "Tempo per cui il pilotaggio 12 deve restare in pressione prima che il temporizzatore commuti.",
  "time_delay_valve.pilot_pressure":
    "Pressione sul pilotaggio 12 dalla quale comincia a contare il ritardo. Serve solo alla simulazione.",
  "timer_relay.delay":
    "Tempo di ritardo del relè temporizzato: all'eccitazione o alla diseccitazione, secondo la funzione scelta.",
  "flow_control_valve.flow":
    "Portata nominale Qn del catalogo con la vite tutta aperta (6 bar a monte, 5 bar a valle). Se la " +
    "conduttanza C a tutta apertura è vuota, la simulazione la ricava da qui; l'apertura la riduce.",
  "one_way_flow_control.flow":
    "Portata nominale Qn del catalogo nel verso strozzato (da 1 a 2) con la vite tutta aperta, misurata " +
    "con 6 bar a monte e 5 bar a valle. Se la conduttanza C a tutta apertura è vuota, la simulazione la " +
    "ricava da qui; l'apertura la riduce. Il verso libero non dipende dall'apertura.",
  "flow_control_valve.conductance":
    "Conduttanza sonica C (ISO 6358) con la vite tutta aperta, dal catalogo. La simulazione usa apertura × C. " +
    "Se è vuota e scrivi la portata nominale Qn, C si ricava da quella (circa C ≈ Qn [Nl/min] / 260).",
  "one_way_flow_control.conductance":
    "Conduttanza sonica C (ISO 6358) nel verso strozzato (da 1 a 2) con la vite tutta aperta, dal catalogo. " +
    "La simulazione usa apertura × C. Se è vuota e scrivi la portata nominale Qn, C si ricava da quella " +
    "(circa C ≈ Qn [Nl/min] / 260).",
  "pressure_source.flow":
    "Portata massima che l'alimentazione può fornire. È un dato informativo.",
};

/** Opzioni dei componenti (menu a tendina). */
const OPTIONS: Record<string, string> = {
  function:
    "Funzione della valvola, nella forma vie/posizioni. 2/2: apre o chiude una linea. 3/2: alimenta o scarica " +
    "un'utenza (NC chiusa a riposo, NA aperta). 4/2 e 5/2: comandano un cilindro a doppio effetto. 3/3, 4/3 e " +
    "5/3: tre posizioni, con il centro chiuso (blocca il cilindro), in scarico (lo lascia libero) o in pressione; " +
    "il centro è la posizione di riposo.",
  actuation_14:
    "Comando che porta la valvola nella posizione «14» (la casella collegata a 1→4 / 1→2 attivo). Per esempio " +
    "solenoide, pilotaggio pneumatico, pulsante, leva o rullo. Con un comando meccanico puoi scegliere qui " +
    "sotto quale cilindro lo aziona a fine corsa.",
  actuation_12:
    "Comando sul lato opposto, che riporta la valvola nella posizione di riposo «12». Una molla rende la " +
    "valvola monostabile; un altro comando attivo (solenoide, pilota) la rende bistabile, cioè con memoria.",
  cushioning:
    "Ammortizzo pneumatico regolabile: frena il pistone nell'ultimo tratto di corsa per evitare urti. Puoi " +
    "averlo a entrambi i fine corsa, solo sul fondello (rientro) o solo sulla testata (uscita).",
  contact:
    "Tipo di contatto. NA (normalmente aperto): chiude il circuito quando è azionato. NC (normalmente chiuso): " +
    "lo apre quando è azionato. In scambio: un comune con un'uscita NA e una NC.",
  operation:
    "A impulso: il contatto resta azionato solo finché lo tieni premuto. Con ritenuta: resta nella nuova " +
    "posizione finché non lo azioni di nuovo, come un interruttore.",
  timer_mode:
    "Ritardato all'eccitazione: i contatti commutano trascorso il ritardo dopo l'arrivo della tensione. " +
    "Ritardato alla diseccitazione: commutano subito e tornano a riposo trascorso il ritardo dopo che la " +
    "tensione è stata tolta.",
  switch_actuation:
    "Come viene azionato il finecorsa: rullo (in entrambi i versi di passaggio della camma) oppure rullo " +
    "unidirezionale a leva ribaltabile, azionato in un solo verso.",
  sensor_kind:
    "Principio di funzionamento del sensore. Magnetico (reed): legge il magnete del pistone attraverso la " +
    "canna. Induttivo: rileva metalli. Capacitivo: rileva anche materiali non metallici. Ottico: a fascio di luce.",
  override:
    "Comando manuale ausiliario dei solenoidi, presente su quasi tutte le elettrovalvole: permette di azionare " +
    "la valvola a mano senza corrente, per provare l'impianto. A impulso torna indietro quando lo si rilascia; " +
    "con arresto resta azionato finché non lo si sblocca. Si disegna e funziona solo sui lati con un solenoide.",
  magnet:
    "Pistone con l'anello magnetico, necessario per i sensori magnetici (reed) montati sulla canna. Cambia solo " +
    "il simbolo e il codice da ordinare, non la simulazione.",
  gripper_kind:
    "Doppio effetto: l'aria chiude da A e apre da B. Semplice effetto: l'aria chiude da A e una molla riapre " +
    "le griffe quando A scarica.",
  coupling:
    "Valvole di non ritorno nell'innesto. Senza: staccato, i due lati restano aperti in atmosfera. Con una " +
    "(nella presa, lato 1): staccato, la linea di alimentazione resta chiusa. Con due: restano chiusi entrambi.",
  coupling_state:
    "Innestato: l'aria passa tra 1 e 2. Staccato: le due metà sono separate; si usa per disegnare un punto di " +
    "collegamento aperto, per esempio per un attrezzo da staccare.",
  check_spring:
    "Con la molla la sfera è tenuta sulla sede: la valvola apre solo quando la differenza di pressione tra 1 e 2 " +
    "supera la pressione di apertura (se non la indichi, 0,5 bar) e si chiude anche montata in verticale.",
  rotary_kind:
    "Doppio effetto: l'aria fa ruotare da A in un verso e da B nell'altro. Semplice effetto: l'aria ruota da A " +
    "e una molla riporta indietro l'albero quando A scarica.",
  motor_kind:
    "Reversibile: il motore gira in un verso con l'aria da 1 e nell'altro con l'aria da 2. A un senso: gira solo " +
    "con l'aria che entra da 1 ed esce da 2.",
  filter_kind:
    "Tipo di filtro, come si disegna nella ISO 1219-1. Scarico manuale o automatico della condensa; a " +
    "coalescenza per togliere olio e particelle fini; a carboni attivi per gli odori e i vapori d'olio; " +
    "separatore di condensa o centrifugo senza cartuccia; con indicatore di intasamento; doppio, con prefiltro. " +
    "Cambia il simbolo, non la simulazione.",
  frl_style:
    "Dettagliato: filtro, riduttore con manometro e lubrificatore, racchiusi nella cornice del gruppo. " +
    "Semplificato: una sola casella, utile negli schemi piccoli. Non cambia la simulazione: in tutti e due i " +
    "casi Simula mostra la pressione del manometro, a valle del riduttore.",
  lub_drain:
    "Lubrificatore con lo scarico manuale sul fondo della tazza (per scaricare la condensa o l'olio in eccesso).",
  gauge_fitted:
    "Manometro montato sul corpo del riduttore: compare nel simbolo e in simulazione mostra la pressione " +
    "regolata, a valle (porta 2). Non cambia il passaggio dell'aria.",
  switch_kind:
    "Meccanico: contatto azionato contro una molla regolabile. Elettronico: sensore con uscita di commutazione " +
    "(con l'amplificatore nel simbolo). Vacuostato: interviene quando il vuoto sulla porta 1 supera la taratura, " +
    "scritta come grado di vuoto (0,5 bar vuol dire 0,5 bar sotto l'atmosfera).",
  indicator_kind:
    "Come segnala la pressione: ottico (un disco colorato che compare), digitale (un display) o acustico (un " +
    "fischio o una tromba). In simulazione il simbolo si accende sopra la soglia.",
  blowoff:
    "Soffio di distacco: una porta 4 in più, che quando è in pressione soffia aria nella porta del vuoto 2 e " +
    "stacca subito il pezzo dalla ventosa, invece di aspettare che il vuoto si esaurisca.",
  lamp_color:
    "Colore della lampada secondo la norma CEI EN 60204-1: verde marcia o stato normale, rosso emergenza o " +
    "guasto, giallo condizione anomala, bianco o blu informazioni.",
};

/** Altri campi dei pannelli, per chiave. */
export const FIELD_HELP: Record<string, string> = {
  id:
    "Sigla del componente: un codice breve e unico nello schema (per esempio V1, C2, P). Compare sul disegno " +
    "e nei riferimenti alle porte (C1.A). Solo lettere, numeri, - e _; cambiandola si aggiornano linee e camme.",
  code:
    "Codice articolo del costruttore (per esempio «DSBC-32-100-PPVA-N3»). Compare nella distinta componenti " +
    "(menu File) e la separa: pezzi con codici diversi stanno su righe diverse. Non cambia la simulazione.",
  "sheet-bom":
    "Disegna la distinta componenti sopra il cartiglio, con posizione, sigle, descrizione, codice e quantità. " +
    "Compare anche nel PDF del foglio; lascia libero lo spazio sopra il cartiglio.",
  label:
    "Descrizione libera del componente, per esempio «Pulsante avanti» o «Cilindro di bloccaggio». Compare " +
    "accanto alla sigla sul disegno se nel menu Mostra sono attive le descrizioni.",
  cam:
    "Cilindro che preme questo comando meccanico a fine corsa: «C1+» quando lo stelo di C1 è tutto fuori, " +
    "«C1−» quando è tutto dentro. In simulazione la valvola commuta da sola quando il cilindro arriva in " +
    "posizione. Lascia «a mano» per azionarla con un clic.",
  drives:
    "Valvola e lato (14 o 12) il cui solenoide è eccitato da questa bobina. Compaiono solo i lati con un comando " +
    "elettrico. In simulazione il solenoide segue la bobina e non si comanda più con un clic.",
  relay:
    "Relè, temporizzatore o pressostato che commuta questo contatto. Un relè può avere quanti contatti servono, " +
    "NA, NC o in scambio, sparsi in punti diversi dello schema.",
  "switch-cam":
    "Cilindro che preme il rullo di questo finecorsa elettrico: «C1+» quando lo stelo è tutto fuori, «C1−» quando " +
    "è tutto dentro. Senza cilindro il finecorsa si aziona a mano in simulazione.",
  "sensor-cam":
    "Cilindro di cui il sensore rileva il pistone: «C1+» a fine corsa in uscita, «C1−» in rientro. Con il " +
    "parametro Posizione dal fondello il sensore sta in un punto intermedio della corsa.",
  "catalog-part":
    "Articolo reale da catalogo Festo o SMC. Scegliendolo si compilano insieme i dati della scheda tecnica " +
    "(portata nominale Qn o conduttanza C e b, pressioni, alesaggio, stelo, ammortizzo) e le opzioni del " +
    "componente; i dati di catalogo scritti prima vengono sostituiti, corsa, massa, carico e apertura " +
    "restano. Il codice va nella distinta. Dopo la scelta puoi ancora correggere ogni valore a mano.",
  "cylinder-size":
    "Misure normalizzate di alesaggio e stelo secondo le serie ISO 15552, ISO 6432 e ISO 21287. Scegliendone " +
    "una si compilano insieme alesaggio e diametro stelo; «Personalizzata» lascia i valori scritti a mano.",
  "block-name":
    "Nome del blocco, mostrato sul riquadro tratteggiato e nella libreria dei blocchi salvati.",
  "block-description":
    "Descrizione del blocco: che cosa fa, quando si usa, eventuali tarature. Appare al passaggio del mouse " +
    "sul riquadro e viene salvata nella libreria insieme al blocco.",
  "circuit-name":
    "Nome dello schema. Compare nel titolo, nell'archivio dei progetti, nel cartiglio del foglio e nel nome " +
    "dei file esportati.",
  "page-name":
    "Nome del foglio, mostrato sulla scheda sotto l'area di lavoro e nel cartiglio accanto al numero del foglio " +
    "(per esempio «Pneumatico», «Comando elettrico»). Le schede si rinominano anche con un doppio clic.",
  "sheet-format":
    "Formato del foglio di disegno, da A4 ad A0 (ISO 216), con cornice e cartiglio. «Nessuno» lascia l'area " +
    "di lavoro libera, senza foglio. Il PDF esportato ha il formato scelto.",
  "sheet-orientation":
    "Orientamento del foglio: orizzontale (lato lungo in basso) o verticale.",
  "sheet-author": "Nome di chi ha disegnato lo schema, riportato nel cartiglio.",
  "sheet-number": "Numero o codice del disegno, riportato nel cartiglio (per esempio PN-001).",
  "sheet-revision":
    "Indice di revisione del disegno (A, B, C… oppure 0, 1, 2…), da aggiornare a ogni modifica rilasciata.",
  "tube-size":
    "Misura del tubo in poliuretano, diametro esterno × interno in mm. «Non specificato» considera la linea senza " +
    "volume e senza perdite; con un tubo la simulazione conta il volume da riempire e la perdita di carico. " +
    "«Personalizzato» permette di scrivere i diametri.",
  "tube-outer_diameter":
    "Diametro esterno del tubo, quello del raccordo a innesto (per esempio 6 mm). Serve al disegno e alla " +
    "scelta dei raccordi; la simulazione usa il diametro interno.",
  "tube-inner_diameter":
    "Diametro interno del tubo, il passaggio dell'aria. Determina volume e perdita di carico: un tubo " +
    "stretto e lungo rallenta il cilindro.",
  "tube-length":
    "Lunghezza del tubo tra le due porte, in metri. Determina il volume d'aria da riempire a ogni ciclo e la " +
    "perdita di carico.",
};

/** Descrizione di un parametro di un componente, con unità e valore predefinito. */
export function paramHelp(type: string, p: ParamSpec): string {
  const base = TYPE_PARAMS[`${type}.${p.name}`] ?? PARAMS[p.name] ?? `${p.label}.`;
  const parts = [base];
  const unit = UNITS[p.percent ? "percent" : p.dimension];
  if (unit) parts.push(`Unità: ${unit}; se scrivi solo il numero si usa l'unità principale.`);
  if (p.required) parts.push("Obbligatorio.");
  if (p.simDefault) parts.push(`Se vuoto: ${p.simDefault}.`);
  if (p.below !== undefined) parts.push(`Deve essere minore di ${p.below}.`);
  return parts.join(" ");
}

/** Descrizione di un'opzione (menu) di un componente. */
export function optionHelp(type: string, o: OptionSpec): string {
  return TYPE_PARAMS[`${type}.${o.name}`] ?? OPTIONS[o.name] ?? `${o.label}.`;
}

/** Nomi dei parametri e delle opzioni descritti in modo specifico (usato dai test). */
export const describedParams = (): string[] => Object.keys(PARAMS);
export const describedOptions = (): string[] => Object.keys(OPTIONS);
