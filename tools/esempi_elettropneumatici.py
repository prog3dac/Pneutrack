# Genera gli esempi elettropneumatici in src/examples (schema a scala con le guide + e 0V).
# Uso: python3 tools/esempi_elettropneumatici.py src/examples
import json, sys
out = sys.argv[1]

class Doc:
    def __init__(s, name):
        s.d = {"format": "pneutrack/circuit", "version": 1, "name": name, "components": [], "connections": [], "layout": {}}
        s.nj = 0
    def comp(s, id, type, x, y, **kw):
        c = {"id": id, "type": type}
        c.update(kw)
        s.d["components"].append(c)
        s.d["layout"][id] = {"x": x, "y": y, "rot": 0}
        return id
    def wire(s, a, b, **kw):
        s.d["connections"].append({"from": a, "to": b, **kw})
    def junction(s, x, y):
        s.nj += 1
        jid = f"N{s.nj}"
        s.comp(jid, "wire_junction", x, y)
        return f"{jid}.1"

# porte dei contatti
TOPBOT = {"no": ("13", "14"), "nc": ("11", "12")}
def tb(item):
    id, type, kw = item
    if type in ("relay_coil", "timer_relay", "valve_solenoid"): return f"{id}.A1", f"{id}.A2"
    if type == "signal_lamp": return f"{id}.X1", f"{id}.X2"
    if type == "proximity_sensor": return f"{id}.BN", f"{id}.BK"
    t, b = TOPBOT[kw.get("contact", "no")]
    return f"{id}.{t}", f"{id}.{b}"

def ladder(doc, x0, rungs, top=-260, bottom=280, dx=110, gx=None):
    """rungs: liste di elementi in serie dall'alto; un elemento è (id, type, kw) o ("par", [a, b])."""
    gx = gx if gx is not None else x0 - 100
    doc.comp("G", "electric_supply", gx, 10, params={"voltage": "24 V"})
    tops, bots, sensors = [], [], []
    x = x0 - dx
    for i, rung in enumerate(rungs):
        x += dx + (80 if i and any(it[0] == "par" for it in rungs[i - 1]) else 0)
        jt, jb = doc.junction(x, top), doc.junction(x, bottom)
        tops.append(jt); bots.append(jb)
        prev = jt
        pts = None
        n = len(rung)
        span = bottom - top
        for k, item in enumerate(rung):
            y = round((top + span * (k + 1) / (n + 1)) / 10) * 10
            if item[0] == "par":
                a, b = item[1]
                ja, jb2 = doc.junction(x, y - 50), doc.junction(x, y + 50)
                doc.wire(prev, ja)
                for j, it in enumerate((a, b)):
                    id, type, kw = it
                    doc.comp(id, type, x + j * 80, y, **kw)
                    t, bb = tb(it)
                    doc.wire(ja, t); doc.wire(bb, jb2)
                prev = jb2
            else:
                id, type, kw = item
                doc.comp(id, type, x, y, **kw)
                t, b = tb(item)
                if pts: doc.wire(prev, t, points=[p_ if p_[1] != "Y" else [p_[0], y - 45] for p_ in pts])
                else: doc.wire(prev, t)
                pts = None
                prev = b
                if type == "proximity_sensor":
                    # BU al 0V passando a sinistra, l'uscita BK scende a destra verso il carico
                    doc.wire(f"{id}.BU", jb, points=[[x, y + 45], [x - 30, y + 45], [x - 30, bottom]])
                    pts = [[x + 40, y], [x + 40, "Y"], [x, "Y"]]
        doc.wire(prev, jb)
    doc.wire("G.+", tops[0], points=[[gx, top]])
    doc.wire("G.0V", bots[0], points=[[gx, bottom]])
    for a, b in zip(tops, tops[1:]): doc.wire(a, b)
    for a, b in zip(bots, bots[1:]): doc.wire(a, b)

def pneumatic(doc, cyl, valve, x, a14="solenoid", a12="spring", src=True, flow=None):
    doc.comp(cyl, "double_acting_cylinder", x, -60, label=None, params={"bore": "32 mm", "rod": "12 mm", "stroke": "100 mm", "max_pressure": "10 bar"})
    doc.d["components"][-1].pop("label")
    doc.comp(valve, "directional_valve", x, 100, function="5/2", actuation_14=a14, actuation_12=a12, params={"max_pressure": "10 bar"})
    doc.wire(f"{cyl}.A", f"{valve}.4"); doc.wire(f"{cyl}.B", f"{valve}.2")

def el(id, type, label=None, **kw):
    if label: kw["label"] = label
    return (id, type, kw)

# 1. autoritenuta ---------------------------------------------------------------
d = Doc("Elettropneumatica: marcia e arresto con autoritenuta")
pneumatic(d, "C1", "V1", 160)
d.comp("P", "pressure_source", 180, 260, params={"pressure": "6 bar"})
d.wire("P.1", "V1.1")
ladder(d, 560, [
    [el("S0", "pushbutton", "Arresto", contact="nc"),
     ("par", [el("S1", "pushbutton", "Marcia", contact="no"), el("K1a", "relay_contact", contact="no", relay="K1")]),
     el("K1", "relay_coil")],
    [el("K1b", "relay_contact", contact="no", relay="K1"), el("Y1", "valve_solenoid", drives="V1.14")],
    [el("K1c", "relay_contact", contact="no", relay="K1"), el("H1", "signal_lamp", "In marcia", lamp_color="green")],
])
json.dump(d.d, open(f"{out}/elettro_autoritenuta.json", "w"), ensure_ascii=False, indent=1)

# 2. ciclo A+ A- con finecorsa elettrici -----------------------------------------
d = Doc("Elettropneumatica: ciclo automatico A+ A- con finecorsa elettrici")
pneumatic(d, "C1", "V1", 160, a12="solenoid")
d.comp("P", "pressure_source", 180, 260, params={"pressure": "6 bar"})
d.wire("P.1", "V1.1")
ladder(d, 560, [
    [el("S1", "pushbutton", "Ciclo continuo", contact="no", operation="latching"),
     el("S2", "limit_switch", "a0", contact="no", cam="C1-"), el("Y1", "valve_solenoid", drives="V1.14")],
    [el("S3", "limit_switch", "a1", contact="no", cam="C1+"), el("Y2", "valve_solenoid", drives="V1.12")],
])
json.dump(d.d, open(f"{out}/elettro_ciclo_finecorsa.json", "w"), ensure_ascii=False, indent=1)

# 3. A+ B+ B- A- con relè di memoria -------------------------------------------------
d = Doc("Elettropneumatica: sequenza A+ B+ B- A- con relè")
pneumatic(d, "C1", "V1", 120, a12="solenoid")
pneumatic(d, "C2", "V2", 380, a12="solenoid")
d.comp("P", "pressure_source", 260, 260, params={"pressure": "6 bar"})
d.wire("P.1", "V1.1"); d.wire("P.1", "V2.1")
ladder(d, 720, [
    [el("S1", "pushbutton", "Ciclo continuo", contact="no", operation="latching"),
     el("S2", "limit_switch", "a0", contact="no", cam="C1-"),
     el("K1e", "relay_contact", contact="nc", relay="K1"), el("Y1", "valve_solenoid", "A+", drives="V1.14")],
    [el("S4", "limit_switch", "a1", contact="no", cam="C1+"),
     el("K1b", "relay_contact", contact="nc", relay="K1"), el("Y3", "valve_solenoid", "B+", drives="V2.14")],
    [("par", [el("S6", "limit_switch", "b1", contact="no", cam="C2+"), el("K1a", "relay_contact", contact="no", relay="K1")]),
     el("S3", "limit_switch", "a0", contact="nc", cam="C1-"), el("K1", "relay_coil", "Memoria B fatto")],
    [el("K1c", "relay_contact", contact="no", relay="K1"), el("Y4", "valve_solenoid", "B-", drives="V2.12")],
    [el("S5", "limit_switch", "b0", contact="no", cam="C2-"),
     el("K1d", "relay_contact", contact="no", relay="K1"), el("Y2", "valve_solenoid", "A-", drives="V1.12")],
], gx=620)
json.dump(d.d, open(f"{out}/elettro_sequenza_relè.json".replace("è", "e"), "w"), ensure_ascii=False, indent=1)

# 4. temporizzatore, sensore e pressostato -----------------------------------------
d = Doc("Elettropneumatica: sosta a fine corsa con temporizzatore e pressostato")
pneumatic(d, "C1", "V1", 160)
d.comp("P", "pressure_source", 180, 260, params={"pressure": "6 bar"})
d.comp("BP1", "pressure_switch", 20, 40, label="Pressione in spinta", params={"setpoint": "5 bar", "max_pressure": "10 bar"})
d.wire("P.1", "V1.1"); d.wire("BP1.1", "C1.A")
ladder(d, 560, [
    [el("S0", "pushbutton", "Arresto", contact="nc"),
     ("par", [el("S1", "pushbutton", "Avvio", contact="no"), el("K1a", "relay_contact", contact="no", relay="K1")]),
     el("KT1a", "relay_contact", "Fine sosta", contact="nc", relay="KT1"), el("K1", "relay_coil")],
    [el("K1b", "relay_contact", contact="no", relay="K1"), el("Y1", "valve_solenoid", drives="V1.14")],
    [el("B1", "proximity_sensor", "Stelo fuori", cam="C1+"),
     el("KT1", "timer_relay", "Sosta", timer_mode="on_delay", params={"delay": "1 s"})],
    [el("BP1a", "relay_contact", contact="no", relay="BP1"), el("H1", "signal_lamp", "Pressione raggiunta", lamp_color="yellow")],
], dx=120)
json.dump(d.d, open(f"{out}/elettro_temporizzatore.json", "w"), ensure_ascii=False, indent=1)
