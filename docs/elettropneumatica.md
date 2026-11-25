# Elettropneumatica in Pneutrack

Pneutrack simula insieme la parte pneumatica e il circuito elettrico di comando a 24 V che la governa.
Questa guida spiega come si disegna un comando elettropneumatico e descrive gli esempi pronti
(menu *Esempi…*).

## Come si disegna

1. **Parte pneumatica**: alimentazione, valvole con comando a solenoide (`solenoide` o `elettropilota`),
   cilindri. Le sigle dei cilindri (C1, C2…) servono poi ai finecorsa.
2. **Circuito elettrico**, accanto: dalla categoria «Elettrico» della palette si prendono alimentazione
   (G), pulsanti e interruttori (S), relè (K) con i loro contatti, temporizzatori (KT), bobine delle
   elettrovalvole (Y), finecorsa e sensori (S, B), pressostati (BP) e lampade (H). Si disegna come uno
   schema a scala: una linea del + in alto, una del 0V in basso e, in mezzo, un ramo verticale per ogni
   carico. Per diramare un filo lo si trascina sopra un altro filo: nasce un punto di connessione.
3. **Collegamento per sigla**, dal pannello delle proprietà:
   - la bobina Y1 indica il solenoide che eccita (valvola e lato, per esempio V1.14), e la sigla Y1
     compare accanto al solenoide della valvola;
   - ogni contatto di relè indica il relè, il temporizzatore o il pressostato che lo commuta;
   - finecorsa e sensori indicano il cilindro e il fine corsa: C1+ stelo tutto fuori, C1− tutto dentro.

La validazione segnala i fili verso porte pneumatiche, i cortocircuiti diretti, i riferimenti a
componenti che non ci sono, due bobine sullo stesso solenoide e i solenoidi rimasti senza bobina.

## In simulazione

Si fa clic su pulsanti e interruttori, nel disegno o tra i «Comandi elettrici» del pannello: i
pulsanti restano premuti finché si tiene premuto, gli interruttori cambiano stato a ogni clic. I fili
sotto tensione diventano rossi, i contatti azionati e le bobine eccitate si colorano, le lampade si
accendono. I relè commutano dopo 10 ms (tempo di attrazione), i temporizzatori dopo il ritardo
impostato, che il pannello mostra mentre scorre. Un cortocircuito o un relè che continua a staccarsi
da solo vengono segnalati.

Il circuito elettrico è simulato in modo logico: conta solo se c'è un percorso di contatti chiusi dal +
al 0V attraverso il carico, non le correnti.

Il pulsante «📈 Diagramma» mostra il diagramma delle fasi: corsa dei cilindri e stato di bobine, lampade e
contatti dei relè, nel tempo o per passi. Con l'esempio della sequenza a relè si leggono i quattro passi
A+ B+ B− A− e quale bobina li comanda; con il temporizzatore si vede la sosta tra l'eccitazione di KT1 e la
commutazione dei suoi contatti.

## Esempi

### Marcia e arresto con autoritenuta

Il pulsante *Marcia* S1 eccita il relè K1, che si mantiene da solo con il suo contatto K1a in
parallelo a S1 (autoritenuta). Il pulsante *Arresto* S0, normalmente chiuso, interrompe il ramo e fa
cadere K1. Il contatto K1b eccita Y1 (la 5/2 monostabile fa uscire C1), K1c accende la lampada.
Basta un impulso su S1 per far uscire il cilindro e un impulso su S0 per farlo rientrare.

### Ciclo automatico A+ A− con finecorsa elettrici

Valvola 5/2 bistabile con due bobine: Y1 fa uscire C1, Y2 lo fa rientrare. Con l'interruttore *Ciclo
continuo* S1 chiuso, il finecorsa S2 (a0, C1−) eccita Y1 quando il cilindro è dentro; a fine corsa il
finecorsa S3 (a1, C1+) eccita Y2 e il cilindro torna indietro. Aprendo S1 il ciclo si ferma con il
cilindro dentro.

### Sequenza A+ B+ B− A− con relè di memoria

Due cilindri e due 5/2 bistabili. La sequenza ha un conflitto di segnali: con A fuori e B dentro
bisogna far uscire B la prima volta e rientrare A la seconda. Lo risolve il relè K1, che «ricorda»
che B è già uscito:

| Passo | Condizione | Bobina |
|---|---|---|
| A+ | S1 chiuso, a0 (S2), K1 a riposo (K1e NC) | Y1 |
| B+ | a1 (S4), K1 a riposo (K1b NC) | Y3 |
| memoria | b1 (S6) eccita K1, che resta con K1a finché A non torna in a0 (S3 NC) | K1 |
| B− | K1 eccitato (K1c) | Y4 |
| A− | b0 (S5) e K1 eccitato (K1d) | Y2 |

Quando A torna in a0 il contatto NC S3 si apre, K1 cade e, con S1 chiuso, il ciclo ricomincia.

### Sosta a fine corsa con temporizzatore e pressostato

*Avvio* S1 eccita K1 (con autoritenuta) e Y1: il cilindro esce. A fine corsa il sensore B1 (C1+) eccita
il temporizzatore KT1, ritardato all'eccitazione di 1 s; allo scadere il suo contatto NC KT1a apre il
ramo di K1, che cade, e il cilindro rientra. Il pressostato BP1, collegato alla camera di spinta di C1,
interviene a 5 bar e con il contatto BP1a accende la lampada *Pressione raggiunta*: si vede che la
pressione sale solo quando lo stelo si ferma a fine corsa.
