"""Grandezze fisiche con unità da catalogo.

I cataloghi pneumatici esprimono i parametri in unità "di officina" (bar, mm,
Nl/min, ...). Qui ogni valore è una :class:`Quantity` che conserva il valore
in unità SI per i calcoli e l'unità originale per la visualizzazione.

Le pressioni sono sempre **relative** (manometriche), come nei cataloghi:
``6 bar`` significa 6 bar sopra la pressione atmosferica.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from functools import total_ordering


class Dimension(str, Enum):
    PRESSURE = "pressure"
    LENGTH = "length"
    AREA = "area"
    VOLUME = "volume"
    FORCE = "force"
    FLOW = "flow"
    TIME = "time"
    ANGLE = "angle"
    DIMENSIONLESS = "dimensionless"


class UnitError(ValueError):
    """Unità sconosciuta, sintassi errata o dimensioni incompatibili."""


# unità -> (dimensione, fattore verso SI)
_UNITS: dict[str, tuple[Dimension, float]] = {
    # pressione (relativa) -> Pa
    "Pa": (Dimension.PRESSURE, 1.0),
    "kPa": (Dimension.PRESSURE, 1e3),
    "MPa": (Dimension.PRESSURE, 1e6),
    "bar": (Dimension.PRESSURE, 1e5),
    "mbar": (Dimension.PRESSURE, 1e2),
    "psi": (Dimension.PRESSURE, 6894.757293168),
    # lunghezza -> m
    "m": (Dimension.LENGTH, 1.0),
    "cm": (Dimension.LENGTH, 1e-2),
    "mm": (Dimension.LENGTH, 1e-3),
    "in": (Dimension.LENGTH, 0.0254),
    # area -> m²
    "m2": (Dimension.AREA, 1.0),
    "cm2": (Dimension.AREA, 1e-4),
    "mm2": (Dimension.AREA, 1e-6),
    # volume -> m³
    "m3": (Dimension.VOLUME, 1.0),
    "l": (Dimension.VOLUME, 1e-3),
    "cm3": (Dimension.VOLUME, 1e-6),
    # forza -> N
    "N": (Dimension.FORCE, 1.0),
    "kN": (Dimension.FORCE, 1e3),
    "daN": (Dimension.FORCE, 10.0),
    # portata (normale) -> Nm³/s
    "Nl/min": (Dimension.FLOW, 1e-3 / 60),
    "Nl/s": (Dimension.FLOW, 1e-3),
    "Nm3/h": (Dimension.FLOW, 1.0 / 3600),
    "Nm3/s": (Dimension.FLOW, 1.0),
    # tempo -> s
    "s": (Dimension.TIME, 1.0),
    "ms": (Dimension.TIME, 1e-3),
    "min": (Dimension.TIME, 60.0),
    # angolo -> rad
    "rad": (Dimension.ANGLE, 1.0),
    "deg": (Dimension.ANGLE, 3.141592653589793 / 180),
    # adimensionale
    "": (Dimension.DIMENSIONLESS, 1.0),
}

# Grafie alternative accettate in ingresso.
_ALIASES = {
    "m²": "m2", "cm²": "cm2", "mm²": "mm2",
    "m³": "m3", "cm³": "cm3", "dm3": "l", "L": "l",
    "NL/min": "Nl/min", "nl/min": "Nl/min", "l/min": "Nl/min",
    "Nm³/h": "Nm3/h", "°": "deg",
}

SI_UNIT = {
    Dimension.PRESSURE: "Pa",
    Dimension.LENGTH: "m",
    Dimension.AREA: "m2",
    Dimension.VOLUME: "m3",
    Dimension.FORCE: "N",
    Dimension.FLOW: "Nm3/s",
    Dimension.TIME: "s",
    Dimension.ANGLE: "rad",
    Dimension.DIMENSIONLESS: "",
}

_QTY_RE = re.compile(r"^\s*([-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][-+]?\d+)?)\s*(.*?)\s*$")


def _lookup(unit: str) -> tuple[str, Dimension, float]:
    unit = _ALIASES.get(unit, unit)
    try:
        dim, factor = _UNITS[unit]
    except KeyError:
        raise UnitError(f"unità sconosciuta: {unit!r}") from None
    return unit, dim, factor


def known_units(dimension: Dimension | None = None) -> list[str]:
    return [u for u, (d, _) in _UNITS.items() if dimension is None or d is dimension]


@total_ordering
@dataclass(frozen=True)
class Quantity:
    """Valore con unità. ``si`` è il valore in unità SI, ``unit`` quella d'origine."""

    si: float
    dimension: Dimension
    unit: str

    @classmethod
    def of(cls, value: float, unit: str) -> "Quantity":
        unit, dim, factor = _lookup(unit)
        return cls(float(value) * factor, dim, unit)

    @classmethod
    def parse(cls, text: str) -> "Quantity":
        """Legge stringhe come ``"6 bar"``, ``"32mm"``, ``"0,5 MPa"``."""
        m = _QTY_RE.match(text)
        if not m:
            raise UnitError(f"grandezza non valida: {text!r}")
        number, unit = m.groups()
        return cls.of(float(number.replace(",", ".")), unit)

    @classmethod
    def coerce(cls, value: "Quantity | str | tuple[float, str]") -> "Quantity":
        if isinstance(value, Quantity):
            return value
        if isinstance(value, str):
            return cls.parse(value)
        if isinstance(value, tuple) and len(value) == 2:
            return cls.of(*value)
        raise UnitError(f"impossibile interpretare {value!r} come grandezza")

    @property
    def value(self) -> float:
        """Valore espresso nell'unità originale."""
        return self.to(self.unit)

    def to(self, unit: str) -> float:
        unit, dim, factor = _lookup(unit)
        if dim is not self.dimension:
            raise UnitError(f"impossibile convertire {self.dimension.value} in {unit!r}")
        return self.si / factor

    def in_unit(self, unit: str) -> "Quantity":
        return Quantity(self.si, self.dimension, _lookup(unit)[0])

    def _check(self, other: "Quantity") -> None:
        if not isinstance(other, Quantity):
            raise TypeError(f"confronto non supportato con {type(other).__name__}")
        if other.dimension is not self.dimension:
            raise UnitError(
                f"dimensioni incompatibili: {self.dimension.value} e {other.dimension.value}"
            )

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Quantity):
            return NotImplemented
        return self.dimension is other.dimension and abs(self.si - other.si) <= 1e-12 * max(
            1.0, abs(self.si), abs(other.si)
        )

    def __hash__(self) -> int:
        return hash((self.dimension, round(self.si, 9)))

    def __lt__(self, other: "Quantity") -> bool:
        self._check(other)
        return self.si < other.si and self != other

    def __str__(self) -> str:
        v = self.value
        txt = f"{v:g}"
        return f"{txt} {self.unit}" if self.unit else txt

    def __repr__(self) -> str:
        return f"Quantity({str(self)!r})"


def q(text: str) -> Quantity:
    """Scorciatoia: ``q("6 bar")``."""
    return Quantity.parse(text)
