"""Componenti pneumatici: i nodi del grafo.

Ogni componente dichiara:

* le sue **porte** (:class:`PortSpec`), con la numerazione ISO 5599 per le
  valvole (1 alimentazione, 2/4 utilizzi, 3/5 scarichi, 12/14 pilotaggi);
* i suoi **parametri** (:class:`ParamSpec`), espressi in unità da catalogo;
* i **percorsi interni** lungo cui la pressione può trasmettersi da una porta
  all'altra (usati dalla validazione per propagare la pressione).

Per aggiungere un tipo di componente basta derivare :class:`Component` e
decorarlo con :func:`register`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from typing import Any, ClassVar, Mapping

from .units import Dimension, Quantity, UnitError


class PortKind(str, Enum):
    SUPPLY = "supply"      # alimentazione (1, uscita di una sorgente)
    WORK = "work"          # utilizzo (2, 4, camere dei cilindri)
    EXHAUST = "exhaust"    # scarico (3, 5, ingresso silenziatore)
    PILOT = "pilot"        # pilotaggio (12, 14)


@dataclass(frozen=True)
class PortSpec:
    name: str
    kind: PortKind
    may_be_open: bool = False  # può restare scollegata (es. scarico libero in atmosfera)
    description: str = ""


@dataclass(frozen=True)
class ParamSpec:
    name: str
    dimension: Dimension
    required: bool = True
    default: str | None = None
    positive: bool = True
    description: str = ""


@dataclass(frozen=True)
class InternalPath:
    """La pressione presente su ``src`` può arrivare su ``dst``, al più ``cap``."""

    src: str
    dst: str
    cap: Quantity | None = None


class ParameterError(ValueError):
    """Parametro mancante, sconosciuto o fuori dominio."""


COMPONENT_TYPES: dict[str, type["Component"]] = {}


def register(cls: type["Component"]) -> type["Component"]:
    if cls.TYPE in COMPONENT_TYPES:
        raise ValueError(f"tipo di componente già registrato: {cls.TYPE}")
    COMPONENT_TYPES[cls.TYPE] = cls
    return cls


def component_from_dict(data: Mapping[str, Any]) -> "Component":
    try:
        cls = COMPONENT_TYPES[data["type"]]
    except KeyError:
        raise ValueError(f"tipo di componente sconosciuto: {data.get('type')!r}") from None
    return cls.from_dict(data)


class Component:
    """Base dei componenti. Le sottoclassi definiscono ``TYPE`` e ``PARAMS``."""

    TYPE: ClassVar[str] = ""
    PARAMS: ClassVar[tuple[ParamSpec, ...]] = ()

    def __init__(self, id: str, label: str = "", **params: Any) -> None:
        if not id:
            raise ValueError("ogni componente deve avere un id")
        self.id = id
        self.label = label
        self.params: dict[str, Quantity] = self._validate_params(params)
        self._ports = {p.name: p for p in self._build_ports()}

    # --- parametri -----------------------------------------------------
    def _validate_params(self, raw: Mapping[str, Any]) -> dict[str, Quantity]:
        specs = {s.name: s for s in self.PARAMS}
        unknown = set(raw) - set(specs)
        if unknown:
            raise ParameterError(f"{self.id}: parametri sconosciuti {sorted(unknown)}")
        out: dict[str, Quantity] = {}
        for spec in self.PARAMS:
            value = raw.get(spec.name, spec.default)
            if value is None:
                if spec.required:
                    raise ParameterError(f"{self.id}: parametro obbligatorio '{spec.name}' mancante")
                continue
            try:
                qty = Quantity.coerce(value)
            except UnitError as exc:
                raise ParameterError(f"{self.id}.{spec.name}: {exc}") from None
            if qty.dimension is not spec.dimension:
                raise ParameterError(
                    f"{self.id}.{spec.name}: atteso {spec.dimension.value}, "
                    f"ricevuto {qty.dimension.value} ({qty})"
                )
            if spec.positive and qty.si <= 0:
                raise ParameterError(f"{self.id}.{spec.name}: deve essere positivo ({qty})")
            out[spec.name] = qty
        return out

    def param(self, name: str) -> Quantity | None:
        return self.params.get(name)

    # --- porte ---------------------------------------------------------
    def _build_ports(self) -> list[PortSpec]:
        raise NotImplementedError

    @property
    def ports(self) -> dict[str, PortSpec]:
        return dict(self._ports)

    def port(self, name: str) -> PortSpec:
        try:
            return self._ports[name]
        except KeyError:
            raise KeyError(
                f"{self.id} ({self.TYPE}) non ha la porta '{name}'; porte: {sorted(self._ports)}"
            ) from None

    # --- comportamento pneumatico (statico) ----------------------------
    def internal_paths(self) -> list[InternalPath]:
        """Percorsi interni di trasmissione della pressione (in qualunque posizione)."""
        return []

    def source_pressures(self) -> dict[str, Quantity]:
        """Porte su cui il componente *impone* una pressione (sorgenti)."""
        return {}

    @property
    def max_pressure(self) -> Quantity | None:
        return self.params.get("max_pressure")

    @property
    def min_pressure(self) -> Quantity | None:
        return self.params.get("min_pressure")

    # --- serializzazione -----------------------------------------------
    def _extra_dict(self) -> dict[str, Any]:
        return {}

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"id": self.id, "type": self.TYPE}
        if self.label:
            d["label"] = self.label
        d.update(self._extra_dict())
        d["params"] = {k: str(v) for k, v in self.params.items()}
        return d

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Component":
        extra = {k: v for k, v in data.items() if k not in ("id", "type", "label", "params")}
        return cls(data["id"], data.get("label", ""), **extra, **dict(data.get("params", {})))

    def __repr__(self) -> str:
        return f"<{type(self).__name__} {self.id}>"


_MAX_P = ParamSpec("max_pressure", Dimension.PRESSURE, required=False,
                   description="pressione massima di esercizio da catalogo")
_MIN_P = ParamSpec("min_pressure", Dimension.PRESSURE, required=False,
                   description="pressione minima di funzionamento da catalogo")


# ---------------------------------------------------------------------------
# Sorgenti e scarichi
# ---------------------------------------------------------------------------

@register
class PressureSource(Component):
    """Alimentazione d'aria compressa (compressore / rete) a pressione nota."""

    TYPE = "pressure_source"
    PARAMS = (
        ParamSpec("pressure", Dimension.PRESSURE, description="pressione di alimentazione"),
        ParamSpec("flow", Dimension.FLOW, required=False, description="portata disponibile"),
    )

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("1", PortKind.SUPPLY, description="uscita aria compressa")]

    @property
    def pressure(self) -> Quantity:
        return self.params["pressure"]

    def source_pressures(self) -> dict[str, Quantity]:
        return {"1": self.pressure}


@register
class Silencer(Component):
    """Silenziatore / scarico in atmosfera."""

    TYPE = "silencer"
    PARAMS = (_MAX_P,)

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("1", PortKind.EXHAUST, description="ingresso scarico")]


@register
class Plug(Component):
    """Tappo: chiude una porta che non si vuole usare (es. utilizzo 4 di una 5/2 usata come 3/2)."""

    TYPE = "plug"
    PARAMS = (_MAX_P,)

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("1", PortKind.WORK)]


# ---------------------------------------------------------------------------
# Valvole
# ---------------------------------------------------------------------------

class Actuation(str, Enum):
    SOLENOID = "solenoid"
    PILOT = "pilot"
    MANUAL = "manual"
    MECHANICAL = "mechanical"
    SPRING = "spring"


# ISO 5599: lato 14 attiva il collegamento 1->4 (o 1->2 per le 3/2), lato 12 l'opposto.
_VALVE_PORTS: dict[str, tuple[tuple[str, PortKind], ...]] = {
    "2/2": (("1", PortKind.SUPPLY), ("2", PortKind.WORK)),
    "3/2": (("1", PortKind.SUPPLY), ("2", PortKind.WORK), ("3", PortKind.EXHAUST)),
    "4/2": (("1", PortKind.SUPPLY), ("2", PortKind.WORK), ("4", PortKind.WORK), ("3", PortKind.EXHAUST)),
    "5/2": (("1", PortKind.SUPPLY), ("2", PortKind.WORK), ("4", PortKind.WORK),
            ("3", PortKind.EXHAUST), ("5", PortKind.EXHAUST)),
    "5/3": (("1", PortKind.SUPPLY), ("2", PortKind.WORK), ("4", PortKind.WORK),
            ("3", PortKind.EXHAUST), ("5", PortKind.EXHAUST)),
}


@register
class DirectionalValve(Component):
    """Valvola distributrice n/m con comandi sui lati 14 e 12.

    ``function`` è la designazione da catalogo (``"3/2"``, ``"5/2"``, ...).
    Un comando ``pilot`` aggiunge la porta di pilotaggio corrispondente (14 o 12),
    che deve essere collegata.
    """

    TYPE = "directional_valve"
    PARAMS = (
        _MAX_P,
        _MIN_P,
        ParamSpec("flow", Dimension.FLOW, required=False, description="portata nominale"),
    )

    def __init__(self, id: str, label: str = "", *, function: str = "5/2",
                 actuation_14: Actuation | str = Actuation.SOLENOID,
                 actuation_12: Actuation | str = Actuation.SPRING,
                 **params: Any) -> None:
        if function not in _VALVE_PORTS:
            raise ParameterError(f"{id}: funzione valvola non supportata {function!r}; "
                                 f"ammesse {sorted(_VALVE_PORTS)}")
        self.function = function
        self.actuation_14 = Actuation(actuation_14)
        self.actuation_12 = Actuation(actuation_12)
        if self.actuation_14 is Actuation.SPRING and self.actuation_12 is Actuation.SPRING:
            raise ParameterError(f"{id}: almeno un lato deve avere un comando attivo")
        super().__init__(id, label, **params)

    def _build_ports(self) -> list[PortSpec]:
        ports = [PortSpec(name, kind, may_be_open=(kind is PortKind.EXHAUST))
                 for name, kind in _VALVE_PORTS[self.function]]
        if self.actuation_14 is Actuation.PILOT:
            ports.append(PortSpec("14", PortKind.PILOT))
        if self.actuation_12 is Actuation.PILOT:
            ports.append(PortSpec("12", PortKind.PILOT))
        return ports

    def internal_paths(self) -> list[InternalPath]:
        # Analisi conservativa: in qualche posizione l'alimentazione raggiunge ogni utilizzo,
        # e ogni utilizzo scarica verso gli scarichi.
        names = set(self._ports)
        work = [p for p in ("2", "4") if p in names]
        exhausts = [p for p in ("3", "5") if p in names]
        paths = [InternalPath("1", w) for w in work]
        paths += [InternalPath(w, e) for w in work for e in exhausts]
        return paths

    def _extra_dict(self) -> dict[str, Any]:
        return {"function": self.function,
                "actuation_14": self.actuation_14.value,
                "actuation_12": self.actuation_12.value}


@register
class PressureRegulator(Component):
    """Riduttore di pressione: l'uscita 2 non supera ``setpoint``."""

    TYPE = "pressure_regulator"
    PARAMS = (
        ParamSpec("setpoint", Dimension.PRESSURE, description="pressione regolata"),
        _MAX_P,
    )

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("1", PortKind.SUPPLY), PortSpec("2", PortKind.WORK)]

    def internal_paths(self) -> list[InternalPath]:
        return [InternalPath("1", "2", cap=self.params["setpoint"])]


@register
class FlowControlValve(Component):
    """Regolatore di flusso (strozzatore), eventualmente unidirezionale."""

    TYPE = "flow_control_valve"
    PARAMS = (_MAX_P,)

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("1", PortKind.WORK), PortSpec("2", PortKind.WORK)]

    def internal_paths(self) -> list[InternalPath]:
        return [InternalPath("1", "2"), InternalPath("2", "1")]


# ---------------------------------------------------------------------------
# Attuatori
# ---------------------------------------------------------------------------

class Actuator(Component):
    """Base degli attuatori: devono ricevere aria da una sorgente."""


class _Cylinder(Actuator):
    PARAMS = (
        ParamSpec("bore", Dimension.LENGTH, description="alesaggio"),
        ParamSpec("stroke", Dimension.LENGTH, description="corsa"),
        ParamSpec("rod", Dimension.LENGTH, required=False, description="diametro stelo"),
        _MAX_P,
        _MIN_P,
    )

    def _validate_params(self, raw: Mapping[str, Any]) -> dict[str, Quantity]:
        params = super()._validate_params(raw)
        rod = params.get("rod")
        if rod is not None and rod.si >= params["bore"].si:
            raise ParameterError(f"{self.id}: lo stelo ({rod}) deve essere minore dell'alesaggio "
                                 f"({params['bore']})")
        return params

    @property
    def piston_area(self) -> Quantity:
        d = self.params["bore"].si
        return Quantity(math.pi * d * d / 4, Dimension.AREA, "m2").in_unit("cm2")

    @property
    def annular_area(self) -> Quantity:
        d = self.params["bore"].si
        rod = self.params.get("rod")
        r = rod.si if rod else 0.0
        return Quantity(math.pi * (d * d - r * r) / 4, Dimension.AREA, "m2").in_unit("cm2")

    def theoretical_force(self, pressure: Quantity | str, retract: bool = False) -> Quantity:
        """Forza teorica (senza attriti) alla pressione data, in N."""
        p = Quantity.coerce(pressure)
        if p.dimension is not Dimension.PRESSURE:
            raise UnitError("serve una pressione")
        area = self.annular_area if retract else self.piston_area
        return Quantity(p.si * area.si, Dimension.FORCE, "N")


@register
class SingleActingCylinder(_Cylinder):
    """Cilindro a semplice effetto con ritorno a molla. Porta A: camera di spinta."""

    TYPE = "single_acting_cylinder"

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("A", PortKind.WORK, description="camera di spinta")]


@register
class DoubleActingCylinder(_Cylinder):
    """Cilindro a doppio effetto. A: camera fondello (uscita), B: camera stelo (rientro)."""

    TYPE = "double_acting_cylinder"

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("A", PortKind.WORK, description="camera fondello"),
                PortSpec("B", PortKind.WORK, description="camera stelo")]


@register
class RotaryActuator(Actuator):
    """Attuatore rotante (a pignone-cremagliera o a palette) a doppio effetto."""

    TYPE = "rotary_actuator"
    PARAMS = (
        ParamSpec("angle", Dimension.ANGLE, description="angolo di rotazione"),
        _MAX_P,
        _MIN_P,
    )

    def _build_ports(self) -> list[PortSpec]:
        return [PortSpec("A", PortKind.WORK), PortSpec("B", PortKind.WORK)]
