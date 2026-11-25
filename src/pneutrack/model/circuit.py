"""Lo schema pneumatico come grafo.

* **Nodi**: i componenti (:class:`~pneutrack.model.components.Component`).
* **Archi**: i collegamenti (:class:`Connection`), ciascuno tra due porte.

Una porta può avere più collegamenti (equivale a un raccordo a T). L'insieme di
porte unite da collegamenti forma una **rete** (:meth:`Circuit.nets`): tutte le
porte di una rete sono alla stessa pressione.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable, Iterator, Mapping

from .components import Component, PortSpec, component_from_dict


@dataclass(frozen=True, order=True)
class PortRef:
    component: str
    port: str

    @classmethod
    def parse(cls, value: "PortRef | str | tuple[str, str]") -> "PortRef":
        if isinstance(value, PortRef):
            return value
        if isinstance(value, tuple):
            return cls(*value)
        comp, sep, port = value.rpartition(".")
        if not sep or not comp or not port:
            raise ValueError(f"riferimento porta non valido: {value!r} (atteso 'componente.porta')")
        return cls(comp, port)

    def __str__(self) -> str:
        return f"{self.component}.{self.port}"


@dataclass(frozen=True)
class Connection:
    """Linea pneumatica tra due porte. Non orientata: ``a``/``b`` sono normalizzati."""

    a: PortRef
    b: PortRef
    id: str = ""

    def __post_init__(self) -> None:
        if self.b < self.a:
            a, b = self.b, self.a
            object.__setattr__(self, "a", a)
            object.__setattr__(self, "b", b)

    @property
    def key(self) -> tuple[PortRef, PortRef]:
        return (self.a, self.b)

    def other(self, ref: PortRef) -> PortRef:
        if ref == self.a:
            return self.b
        if ref == self.b:
            return self.a
        raise ValueError(f"{ref} non appartiene a {self}")

    def __str__(self) -> str:
        return f"{self.a} — {self.b}"


class CircuitError(ValueError):
    """Operazione non valida sul grafo (id duplicato, porta inesistente, ...)."""


class Circuit:
    def __init__(self, name: str = "") -> None:
        self.name = name
        # Posizione grafica dei componenti (id -> {"x":..,"y":..,"rot":..}); ignorata dal modello.
        self.layout: dict[str, dict[str, Any]] = {}
        self._components: dict[str, Component] = {}
        self._connections: dict[tuple[PortRef, PortRef], Connection] = {}

    # --- nodi ----------------------------------------------------------
    def add(self, component: Component) -> Component:
        if component.id in self._components:
            raise CircuitError(f"id duplicato: {component.id}")
        self._components[component.id] = component
        return component

    def add_all(self, components: Iterable[Component]) -> None:
        for c in components:
            self.add(c)

    def remove(self, component_id: str) -> None:
        """Rimuove il componente e tutti i suoi collegamenti."""
        self.component(component_id)
        self._connections = {k: c for k, c in self._connections.items()
                             if component_id not in (c.a.component, c.b.component)}
        del self._components[component_id]
        self.layout.pop(component_id, None)

    def component(self, component_id: str) -> Component:
        try:
            return self._components[component_id]
        except KeyError:
            raise CircuitError(f"componente inesistente: {component_id}") from None

    def __contains__(self, component_id: object) -> bool:
        return component_id in self._components

    def __iter__(self) -> Iterator[Component]:
        return iter(self._components.values())

    def __len__(self) -> int:
        return len(self._components)

    @property
    def components(self) -> list[Component]:
        return list(self._components.values())

    # --- archi ---------------------------------------------------------
    def _resolve(self, ref: PortRef) -> PortSpec:
        comp = self.component(ref.component)
        try:
            return comp.port(ref.port)
        except KeyError as exc:
            raise CircuitError(str(exc.args[0])) from None

    def connect(self, a: PortRef | str, b: PortRef | str, id: str = "") -> Connection:
        ra, rb = PortRef.parse(a), PortRef.parse(b)
        if ra == rb:
            raise CircuitError(f"una porta non può essere collegata a se stessa: {ra}")
        self._resolve(ra)
        self._resolve(rb)
        conn = Connection(ra, rb, id)
        if conn.key in self._connections:
            raise CircuitError(f"collegamento già presente: {conn}")
        self._connections[conn.key] = conn
        return conn

    def disconnect(self, a: PortRef | str, b: PortRef | str) -> None:
        key = Connection(PortRef.parse(a), PortRef.parse(b)).key
        if key not in self._connections:
            raise CircuitError(f"collegamento inesistente: {key[0]} — {key[1]}")
        del self._connections[key]

    @property
    def connections(self) -> list[Connection]:
        return list(self._connections.values())

    def connections_of(self, ref: PortRef | str) -> list[Connection]:
        r = PortRef.parse(ref)
        return [c for c in self._connections.values() if r in (c.a, c.b)]

    def is_connected(self, ref: PortRef | str) -> bool:
        return bool(self.connections_of(ref))

    def neighbors(self, component_id: str) -> set[str]:
        """Componenti collegati direttamente da una linea."""
        self.component(component_id)
        out: set[str] = set()
        for c in self._connections.values():
            if c.a.component == component_id:
                out.add(c.b.component)
            elif c.b.component == component_id:
                out.add(c.a.component)
        out.discard(component_id)
        return out

    def ports(self) -> Iterator[tuple[PortRef, PortSpec]]:
        for comp in self._components.values():
            for name, spec in comp.ports.items():
                yield PortRef(comp.id, name), spec

    # --- reti ----------------------------------------------------------
    def nets(self) -> list[frozenset[PortRef]]:
        """Partizione delle porte in reti (componenti connesse dei collegamenti).

        Le porte scollegate formano reti di un solo elemento.
        """
        parent: dict[PortRef, PortRef] = {ref: ref for ref, _ in self.ports()}

        def find(x: PortRef) -> PortRef:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for c in self._connections.values():
            ra, rb = find(c.a), find(c.b)
            if ra != rb:
                parent[rb] = ra

        groups: dict[PortRef, set[PortRef]] = {}
        for ref in parent:
            groups.setdefault(find(ref), set()).add(ref)
        return sorted((frozenset(g) for g in groups.values()), key=lambda s: min(s))

    def net_of(self, ref: PortRef | str) -> frozenset[PortRef]:
        r = PortRef.parse(ref)
        self._resolve(r)
        for net in self.nets():
            if r in net:
                return net
        raise AssertionError("porta non trovata nelle reti")  # pragma: no cover

    # --- serializzazione -----------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        return {
            "format": "pneutrack/circuit",
            "version": 1,
            "name": self.name,
            "components": [c.to_dict() for c in self._components.values()],
            "connections": [
                {"from": str(c.a), "to": str(c.b), **({"id": c.id} if c.id else {})}
                for c in self._connections.values()
            ],
            **({"layout": {k: v for k, v in self.layout.items() if k in self._components}}
               if self.layout else {}),
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Circuit":
        if data.get("format", "pneutrack/circuit") != "pneutrack/circuit":
            raise CircuitError(f"formato non riconosciuto: {data.get('format')!r}")
        if data.get("version", 1) != 1:
            raise CircuitError(f"versione non supportata: {data.get('version')!r}")
        circuit = cls(data.get("name", ""))
        for cd in data.get("components", []):
            circuit.add(component_from_dict(cd))
        for conn in data.get("connections", []):
            circuit.connect(conn["from"], conn["to"], conn.get("id", ""))
        circuit.layout = {k: dict(v) for k, v in data.get("layout", {}).items() if k in circuit}
        return circuit

    def to_json(self, **kwargs: Any) -> str:
        kwargs.setdefault("indent", 2)
        kwargs.setdefault("ensure_ascii", False)
        return json.dumps(self.to_dict(), **kwargs)

    @classmethod
    def from_json(cls, text: str) -> "Circuit":
        return cls.from_dict(json.loads(text))

    def __repr__(self) -> str:
        return f"<Circuit {self.name!r}: {len(self._components)} componenti, " \
               f"{len(self._connections)} collegamenti>"
