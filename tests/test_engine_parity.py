"""Il motore JavaScript della pagina statica deve dare gli stessi risultati di Python."""

import json
import random
import shutil
import subprocess
from pathlib import Path

import pytest

from pneutrack.gui import api

SCRIPT = Path(__file__).parent / "e2e" / "engine_parity.mjs"
pytestmark = pytest.mark.skipif(not shutil.which("node"), reason="serve Node.js")

PRESSURES = ["6 bar", "8 bar", "4 bar", "0.6 MPa", "90 psi", "1.5 bar", "12 bar", "600 kPa",
             "0 bar", "6 mm", "abc", "7,5 bar"]
LENGTHS = ["20 mm", "32 mm", "12 mm", "50 mm", "2 in", "0 mm", "40 bar", "1e1 mm"]
PORTS = {
    "pressure_source": ["1"], "silencer": ["1"], "plug": ["1"], "pressure_regulator": ["1", "2"],
    "flow_control_valve": ["1", "2"], "single_acting_cylinder": ["A"],
    "double_acting_cylinder": ["A", "B"], "rotary_actuator": ["A", "B"],
    "directional_valve": ["1", "2", "3", "4", "5", "12", "14"],
}


def random_component(rng: random.Random, i: int) -> dict:
    t = rng.choice(list(PORTS))
    p = lambda: rng.choice(PRESSURES)  # noqa: E731
    params = {
        "pressure_source": {"pressure": p()},
        "pressure_regulator": {"setpoint": p()},
        "single_acting_cylinder": {"bore": rng.choice(LENGTHS), "stroke": rng.choice(LENGTHS)},
        "double_acting_cylinder": {"bore": rng.choice(LENGTHS), "stroke": rng.choice(LENGTHS)},
        "rotary_actuator": {"angle": rng.choice(["90 deg", "180 °", "0 deg", "1 rad"])},
    }.get(t, {})
    if rng.random() < 0.6 and t != "pressure_source":
        params["max_pressure"] = p()
    if rng.random() < 0.3 and t in ("directional_valve", "single_acting_cylinder", "rotary_actuator"):
        params["min_pressure"] = p()
    if rng.random() < 0.3 and t.endswith("_cylinder"):
        params["rod"] = rng.choice(LENGTHS)
    if rng.random() < 0.03:
        params["colore"] = "rosso"
    comp = {"id": f"K{i}", "type": t, "params": params}
    if t == "directional_valve":
        comp["function"] = rng.choice(["2/2", "3/2", "4/2", "5/2", "5/3", "5/2", "7/4"][: 6 if rng.random() > .05 else 7])
        comp["actuation_14"] = rng.choice(["solenoid", "pilot", "manual", "spring", "pilot"])
        comp["actuation_12"] = rng.choice(["spring", "pilot", "solenoid", "mechanical"])
    if rng.random() < 0.02:
        comp["type"] = "teletrasporto"
    return comp


def random_case(rng: random.Random) -> dict:
    comps = [random_component(rng, i) for i in range(rng.randint(1, 9))]
    if rng.random() < 0.05:
        comps.append(dict(comps[0]))  # id duplicato
    refs = [f"{c['id']}.{p}" for c in comps for p in PORTS.get(c["type"], ["1"])]
    conns = []
    for _ in range(rng.randint(0, len(refs) + 2)):
        conns.append({"from": rng.choice(refs), "to": rng.choice(refs)})
    if rng.random() < 0.05:
        conns.append({"from": "senza-porta", "to": refs[0]})
    return {"components": comps, "connections": conns}


def run_node(payload: dict) -> dict:
    proc = subprocess.run(["node", str(SCRIPT)], input=json.dumps(payload), capture_output=True,
                          text=True, timeout=120)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_engines_agree():
    rng = random.Random(1219)
    cases = [random_case(rng) for _ in range(400)]
    cases.append(api.load_example("doppio_effetto_bistabile"))
    cylinders = [
        {"id": "C", "type": "double_acting_cylinder",
         "params": {"bore": b, "stroke": "100 mm", "rod": "12 mm"}, "pressure": pr}
        for b in ("32 mm", "50 mm", "2 in", "10 mm") for pr in ("6 bar", "0.4 MPa", "90 psi")
    ]
    numbers = [0.0, 6.0, 1.5, 0.1, 100.0, 1234567.0, 0.00001234, 6.89475729, 123456.0, 2.5e-7]
    js = run_node({"catalog": api.catalog(), "cases": cases, "cylinders": cylinders,
                   "numbers": numbers})

    for i, case in enumerate(cases):
        assert js["analyze"][i] == api.analyze(case), f"caso {i}: {json.dumps(case)}"
    for i, c in enumerate(cylinders):
        try:
            expected = api.cylinder_info(c)
        except ValueError as exc:
            expected = {"error": str(exc)}
        assert js["cylinder"][i] == expected
    assert js["fmt"] == [f"{n:g}" for n in numbers]

    # il campione deve davvero esercitare le regole
    codes = {i["code"] for r in js["analyze"] for i in r["issues"]}
    assert codes >= {"INVALID_COMPONENT", "INVALID_CONNECTION", "UNCONNECTED_PORT", "OVERPRESSURE",
                     "SOURCE_CONFLICT", "SUPPLY_VENTED", "UNDERPRESSURE", "UNSUPPLIED_ACTUATOR",
                     "UNSUPPLIED_PILOT", "NO_SOURCE"}
