"""Descrizione dei tipi di componente per l'interfaccia grafica.

Il modello resta indipendente dalla GUI: qui si aggiungono solo etichette in
italiano, categorie della palette, opzioni e valori iniziali sensati.
"""

from __future__ import annotations

from typing import Any

from ..model.components import COMPONENT_TYPES, Actuation
from ..model.units import Dimension, known_units

PARAM_LABELS = {
    "pressure": "Pressione",
    "flow": "Portata",
    "max_pressure": "Pressione max",
    "min_pressure": "Pressione min",
    "setpoint": "Pressione regolata",
    "bore": "Alesaggio",
    "stroke": "Corsa",
    "rod": "Diametro stelo",
    "angle": "Angolo",
}

ACTUATION_LABELS = {
    Actuation.SOLENOID.value: "Elettrico (solenoide)",
    Actuation.PILOT.value: "Pneumatico (pilotaggio)",
    Actuation.MANUAL.value: "Manuale (pulsante)",
    Actuation.MECHANICAL.value: "Meccanico (rullo)",
    Actuation.SPRING.value: "Molla",
}

# tipo -> (etichetta, categoria, parametri iniziali, opzioni)
_TYPES: dict[str, dict[str, Any]] = {
    "pressure_source": {
        "label": "Alimentazione", "category": "Alimentazione e scarichi",
        "defaults": {"pressure": "6 bar"},
    },
    "pressure_regulator": {
        "label": "Riduttore di pressione", "category": "Alimentazione e scarichi",
        "defaults": {"setpoint": "4 bar", "max_pressure": "16 bar"},
    },
    "silencer": {
        "label": "Silenziatore", "category": "Alimentazione e scarichi", "defaults": {},
    },
    "plug": {"label": "Tappo", "category": "Alimentazione e scarichi", "defaults": {}},
    "directional_valve": {
        "label": "Valvola distributrice", "category": "Valvole",
        "defaults": {"max_pressure": "10 bar"},
        "options": [
            {"name": "function", "label": "Funzione",
             "choices": [["2/2", "2/2"], ["3/2", "3/2"], ["4/2", "4/2"], ["5/2", "5/2"],
                         ["5/3", "5/3 centri chiusi"]],
             "default": "5/2"},
            {"name": "actuation_14", "label": "Comando lato 14",
             "choices": [[a.value, ACTUATION_LABELS[a.value]] for a in Actuation],
             "default": Actuation.SOLENOID.value},
            {"name": "actuation_12", "label": "Comando lato 12",
             "choices": [[a.value, ACTUATION_LABELS[a.value]] for a in Actuation],
             "default": Actuation.SPRING.value},
        ],
    },
    "flow_control_valve": {
        "label": "Regolatore di flusso", "category": "Valvole", "defaults": {},
    },
    "single_acting_cylinder": {
        "label": "Cilindro semplice effetto", "category": "Attuatori",
        "defaults": {"bore": "20 mm", "stroke": "50 mm", "max_pressure": "10 bar"},
    },
    "double_acting_cylinder": {
        "label": "Cilindro doppio effetto", "category": "Attuatori",
        "defaults": {"bore": "32 mm", "stroke": "100 mm", "rod": "12 mm",
                     "max_pressure": "10 bar"},
    },
    "rotary_actuator": {
        "label": "Attuatore rotante", "category": "Attuatori",
        "defaults": {"angle": "90 deg", "max_pressure": "10 bar"},
    },
}

_UNIT_HINTS = {
    Dimension.PRESSURE: ["bar", "MPa", "kPa", "psi"],
    Dimension.LENGTH: ["mm", "cm", "m", "in"],
    Dimension.FLOW: ["Nl/min", "Nm3/h"],
    Dimension.ANGLE: ["deg", "rad"],
}


def catalog() -> list[dict[str, Any]]:
    out = []
    for type_name, cls in COMPONENT_TYPES.items():
        meta = _TYPES.get(type_name, {})
        out.append({
            "type": type_name,
            "label": meta.get("label", type_name),
            "category": meta.get("category", "Altro"),
            "doc": (cls.__doc__ or "").strip().splitlines()[0] if cls.__doc__ else "",
            "params": [
                {
                    "name": p.name,
                    "label": PARAM_LABELS.get(p.name, p.name),
                    "dimension": p.dimension.value,
                    "required": p.required,
                    "units": _UNIT_HINTS.get(p.dimension, known_units(p.dimension)),
                }
                for p in cls.PARAMS
            ],
            "options": meta.get("options", []),
            "defaults": meta.get("defaults", {}),
        })
    return out
