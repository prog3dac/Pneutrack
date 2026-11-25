"""Logica delle API dell'editor, indipendente dal server HTTP."""

from __future__ import annotations

import json
from importlib import resources
from typing import Any, Mapping

from ..model.circuit import Circuit, CircuitError, PortRef
from ..model.components import ParameterError, component_from_dict
from ..model.units import UnitError
from ..model.validation import Severity, validate
from .catalog import catalog

_COMPONENT_KEYS = ("id", "type", "label", "params", "function", "actuation_14", "actuation_12")


def _issue(severity: str, code: str, message: str, component: str | None = None,
           ports: list[str] | None = None) -> dict[str, Any]:
    return {"severity": severity, "code": code, "message": message,
            "component": component, "ports": ports or []}


def analyze(data: Mapping[str, Any]) -> dict[str, Any]:
    """Costruisce lo schema in modo tollerante e lo valida.

    A differenza di :meth:`Circuit.from_dict`, un componente con parametri non validi
    o un collegamento errato non bloccano tutto: diventano segnalazioni.
    """
    issues: list[dict[str, Any]] = []
    circuit = Circuit(str(data.get("name", "")))
    ports: dict[str, list[dict[str, Any]]] = {}

    for raw in data.get("components", []) or []:
        cid = raw.get("id") if isinstance(raw, Mapping) else None
        try:
            comp = component_from_dict({k: raw[k] for k in _COMPONENT_KEYS if k in raw})
            circuit.add(comp)
        except (ParameterError, UnitError, CircuitError, ValueError, KeyError, TypeError) as exc:
            msg = exc.args[0] if exc.args else str(exc)
            issues.append(_issue("error", "INVALID_COMPONENT", str(msg), cid))
            continue
        ports[comp.id] = [
            {"name": name, "kind": spec.kind.value, "may_be_open": spec.may_be_open}
            for name, spec in comp.ports.items()
        ]

    for raw in data.get("connections", []) or []:
        try:
            a, b = PortRef.parse(raw["from"]), PortRef.parse(raw["to"])
        except (KeyError, TypeError, ValueError):
            issues.append(_issue("error", "INVALID_CONNECTION", f"collegamento non valido: {raw!r}"))
            continue
        if a.component not in circuit or b.component not in circuit:
            continue  # già segnalato come componente non valido
        try:
            circuit.connect(a, b)
        except CircuitError as exc:
            issues.append(_issue("error", "INVALID_CONNECTION", str(exc), a.component,
                                 [str(a), str(b)]))

    report = validate(circuit)
    for i in report.issues:
        issues.append(_issue(i.severity.value, i.code, i.message, i.component,
                             [str(p) for p in i.ports]))

    pressures = {}
    for net, p in report.net_pressures.items():
        for ref in net:
            pressures[str(ref)] = {"text": str(p), "bar": round(p.to("bar"), 6)}

    errors = sum(1 for i in issues if i["severity"] == Severity.ERROR.value)
    return {
        "ok": errors == 0,
        "errors": errors,
        "warnings": sum(1 for i in issues if i["severity"] == Severity.WARNING.value),
        "issues": issues,
        "ports": ports,
        "pressures": pressures,
    }


def cylinder_info(data: Mapping[str, Any]) -> dict[str, Any]:
    """Valori derivati utili nel pannello proprietà (aree e forze teoriche)."""
    comp = component_from_dict({k: data[k] for k in _COMPONENT_KEYS if k in data})
    pressure = data.get("pressure", "6 bar")
    if not hasattr(comp, "theoretical_force"):
        return {}
    return {
        "piston_area": f"{comp.piston_area.to('cm2'):.2f} cm2",
        "annular_area": f"{comp.annular_area.to('cm2'):.2f} cm2",
        "force_extend": f"{comp.theoretical_force(pressure).to('N'):.0f} N",
        "force_retract": f"{comp.theoretical_force(pressure, retract=True).to('N'):.0f} N",
        "at_pressure": str(pressure),
    }


def list_examples() -> list[dict[str, str]]:
    root = resources.files("pneutrack.examples")
    out = []
    for entry in sorted(root.iterdir(), key=lambda e: e.name):
        if entry.name.endswith(".json"):
            data = json.loads(entry.read_text(encoding="utf-8"))
            out.append({"id": entry.name[:-5], "name": data.get("name", entry.name)})
    return out


def load_example(example_id: str) -> dict[str, Any]:
    if not example_id.replace("_", "").replace("-", "").isalnum():
        raise KeyError(example_id)
    entry = resources.files("pneutrack.examples").joinpath(f"{example_id}.json")
    if not entry.is_file():
        raise KeyError(example_id)
    return json.loads(entry.read_text(encoding="utf-8"))


__all__ = ["analyze", "catalog", "cylinder_info", "list_examples", "load_example"]
