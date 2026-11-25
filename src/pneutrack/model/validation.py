"""Regole di validazione statica dello schema.

La validazione non simula il ciclo: lavora sul grafo e calcola, per ogni rete,
la **massima pressione raggiungibile** in una qualunque posizione delle valvole
(analisi conservativa). Su questa base segnala:

=====================  ========  ===================================================
Codice                 Gravità   Significato
=====================  ========  ===================================================
``NO_SOURCE``          warning   lo schema non ha alcuna alimentazione
``UNCONNECTED_PORT``   error     porta scollegata che non può restare aperta
``SOURCE_CONFLICT``    error     due sorgenti a pressione diversa sulla stessa rete
``SUPPLY_VENTED``      error     alimentazione collegata direttamente a uno scarico
``OVERPRESSURE``       error     pressione raggiungibile oltre il massimo da catalogo
``UNDERPRESSURE``      warning   pressione disponibile sotto il minimo di funzionamento
``UNSUPPLIED_ACTUATOR``warning   attuatore che nessuna sorgente può alimentare
``UNSUPPLIED_PILOT``   warning   pilotaggio collegato ma mai in pressione
=====================  ========  ===================================================
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .circuit import Circuit, PortRef
from .components import Actuation, Actuator, DirectionalValve, PortKind
from .units import Dimension, Quantity


class Severity(str, Enum):
    ERROR = "error"
    WARNING = "warning"


@dataclass(frozen=True)
class Issue:
    severity: Severity
    code: str
    message: str
    component: str | None = None
    ports: tuple[PortRef, ...] = ()

    def __str__(self) -> str:
        return f"[{self.severity.value}] {self.code}: {self.message}"


@dataclass
class ValidationReport:
    issues: list[Issue] = field(default_factory=list)
    net_pressures: dict[frozenset[PortRef], Quantity] = field(default_factory=dict)

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.severity is Severity.ERROR]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.severity is Severity.WARNING]

    @property
    def ok(self) -> bool:
        """``True`` se non ci sono errori (i warning sono ammessi)."""
        return not self.errors

    def codes(self) -> list[str]:
        return [i.code for i in self.issues]

    def by_code(self, code: str) -> list[Issue]:
        return [i for i in self.issues if i.code == code]

    def pressure_at(self, ref: PortRef | str) -> Quantity:
        r = PortRef.parse(ref)
        for net, p in self.net_pressures.items():
            if r in net:
                return p
        return _ZERO

    def __str__(self) -> str:
        if not self.issues:
            return "schema valido"
        return "\n".join(str(i) for i in self.issues)


_ZERO = Quantity(0.0, Dimension.PRESSURE, "bar")


def _fmt(p: Quantity) -> str:
    return str(p.in_unit("bar"))


def propagate_pressures(circuit: Circuit) -> dict[frozenset[PortRef], Quantity]:
    """Massima pressione raggiungibile su ogni rete (punto fisso monotono)."""
    nets = circuit.nets()
    net_index = {ref: i for i, net in enumerate(nets) for ref in net}
    pressure = [0.0] * len(nets)

    for comp in circuit:
        for port, p in comp.source_pressures().items():
            i = net_index[PortRef(comp.id, port)]
            pressure[i] = max(pressure[i], p.si)

    edges: list[tuple[int, int, float]] = []
    for comp in circuit:
        for path in comp.internal_paths():
            cap = path.cap.si if path.cap is not None else float("inf")
            edges.append((net_index[PortRef(comp.id, path.src)],
                          net_index[PortRef(comp.id, path.dst)], cap))

    changed = True
    while changed:  # ogni passo alza almeno una rete a un valore finito: termina
        changed = False
        for src, dst, cap in edges:
            p = min(pressure[src], cap)
            if p > pressure[dst]:
                pressure[dst] = p
                changed = True

    return {net: Quantity(pressure[i], Dimension.PRESSURE, "bar")
            for i, net in enumerate(nets) if pressure[i] > 0}


def validate(circuit: Circuit) -> ValidationReport:
    report = ValidationReport()
    add = report.issues.append
    nets = circuit.nets()

    # --- alimentazione presente ------------------------------------------
    sources = [c for c in circuit if c.source_pressures()]
    if len(circuit) and not sources:
        add(Issue(Severity.WARNING, "NO_SOURCE", "lo schema non ha alcuna sorgente di pressione"))

    # --- porte scollegate --------------------------------------------------
    for ref, spec in circuit.ports():
        if not spec.may_be_open and not circuit.is_connected(ref):
            what = "di pilotaggio " if spec.kind is PortKind.PILOT else ""
            add(Issue(Severity.ERROR, "UNCONNECTED_PORT",
                      f"la porta {what}{ref} non è collegata", ref.component, (ref,)))

    # --- coerenza delle reti alimentate direttamente --------------------
    for net in nets:
        imposed: dict[PortRef, Quantity] = {}
        for ref in net:
            p = circuit.component(ref.component).source_pressures().get(ref.port)
            if p is not None:
                imposed[ref] = p
        if not imposed:
            continue
        if len({round(p.si, 6) for p in imposed.values()}) > 1:
            desc = ", ".join(f"{r} = {_fmt(p)}" for r, p in sorted(imposed.items()))
            add(Issue(Severity.ERROR, "SOURCE_CONFLICT",
                      f"sorgenti a pressioni diverse sulla stessa linea: {desc}",
                      ports=tuple(sorted(imposed))))
        exhausts = sorted(r for r in net
                          if circuit.component(r.component).port(r.port).kind is PortKind.EXHAUST)
        if exhausts:
            add(Issue(Severity.ERROR, "SUPPLY_VENTED",
                      "l'alimentazione è collegata direttamente allo scarico "
                      + ", ".join(map(str, exhausts)),
                      ports=tuple(sorted(imposed)) + tuple(exhausts)))

    # --- pressioni -------------------------------------------------------
    report.net_pressures = propagate_pressures(circuit)

    for comp in circuit:
        refs = [PortRef(comp.id, name) for name in comp.ports]
        reached = max((report.pressure_at(r) for r in refs), key=lambda p: p.si, default=_ZERO)

        if comp.max_pressure is not None and reached.si > comp.max_pressure.si * (1 + 1e-9):
            worst = [r for r in refs if report.pressure_at(r).si == reached.si]
            add(Issue(Severity.ERROR, "OVERPRESSURE",
                      f"{comp.id} può ricevere {_fmt(reached)} ma il massimo da catalogo è "
                      f"{comp.max_pressure}", comp.id, tuple(worst)))

        if isinstance(comp, Actuator) and reached.si == 0:
            add(Issue(Severity.WARNING, "UNSUPPLIED_ACTUATOR",
                      f"l'attuatore {comp.id} non è alimentato da alcuna sorgente",
                      comp.id, tuple(refs)))

        if isinstance(comp, DirectionalValve):
            for side in ("14", "12"):
                if side in comp.ports:
                    ref = PortRef(comp.id, side)
                    if circuit.is_connected(ref) and report.pressure_at(ref).si == 0:
                        add(Issue(Severity.WARNING, "UNSUPPLIED_PILOT",
                                  f"il pilotaggio {ref} non riceve mai pressione",
                                  comp.id, (ref,)))

        if comp.min_pressure is not None:
            available = _operating_pressure(comp, report)
            if 0 < available.si < comp.min_pressure.si * (1 - 1e-9):
                add(Issue(Severity.WARNING, "UNDERPRESSURE",
                          f"{comp.id} dispone al più di {_fmt(available)}, sotto il minimo di "
                          f"funzionamento {comp.min_pressure}", comp.id))

    return report


def _operating_pressure(comp, report: ValidationReport) -> Quantity:
    """Pressione che fa funzionare il componente (pilotaggio per le valvole pilotate)."""
    if isinstance(comp, DirectionalValve):
        pilots = [s for s, a in (("14", comp.actuation_14), ("12", comp.actuation_12))
                  if a is Actuation.PILOT]
        names = pilots or ["1"]
    else:
        names = list(comp.ports)
    return max((report.pressure_at(PortRef(comp.id, n)) for n in names),
               key=lambda p: p.si, default=_ZERO)
