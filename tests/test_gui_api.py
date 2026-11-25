import json
import shutil
import subprocess
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from pneutrack.gui import api
from pneutrack.gui.server import make_server
from pneutrack.model import COMPONENT_TYPES


@pytest.fixture(scope="module")
def base_url():
    server = make_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    server.server_close()


def get(url):
    with urllib.request.urlopen(url) as r:
        return r.status, r.headers.get("Content-Type"), r.read()


def post(url, data):
    body = data if isinstance(data, bytes) else json.dumps(data).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def test_catalog_covers_every_component_type():
    cat = api.catalog()
    assert {t["type"] for t in cat} == set(COMPONENT_TYPES)
    valve = next(t for t in cat if t["type"] == "directional_valve")
    assert [o["name"] for o in valve["options"]] == ["function", "actuation_14", "actuation_12"]
    assert all(t["label"] and t["category"] for t in cat)


def test_catalog_defaults_build_valid_components():
    for t in api.catalog():
        comp = {"id": "X", "type": t["type"], "params": t["defaults"],
                **{o["name"]: o["default"] for o in t["options"]}}
        result = api.analyze({"components": [comp]})
        assert "INVALID_COMPONENT" not in [i["code"] for i in result["issues"]], t["type"]


def test_analyze_tolerates_bad_components_and_connections():
    result = api.analyze({
        "components": [
            {"id": "P", "type": "pressure_source", "params": {"pressure": "6 bar"}},
            {"id": "C", "type": "single_acting_cylinder", "params": {"bore": "20 bar", "stroke": "5 mm"}},
            {"id": "V", "type": "directional_valve", "function": "3/2"},
            {"id": "Z", "type": "teletrasporto"},
        ],
        "connections": [
            {"from": "P.1", "to": "V.1"},
            {"from": "P.1", "to": "C.A"},       # C non valido: ignorato
            {"from": "V.9", "to": "P.1"},       # porta inesistente
            {"from": "sbagliato"},
        ],
    })
    codes = [(i["code"], i["component"]) for i in result["issues"]]
    assert ("INVALID_COMPONENT", "C") in codes
    assert ("INVALID_COMPONENT", "Z") in codes
    assert ("INVALID_CONNECTION", "V") in codes
    assert ("INVALID_CONNECTION", None) in codes
    assert ("UNCONNECTED_PORT", "V") in codes
    assert set(result["ports"]) == {"P", "V"}
    assert result["pressures"]["V.2"] == {"text": "6 bar", "bar": 6.0}
    assert not result["ok"]


def test_example_is_valid_and_has_layout():
    ex = api.load_example("doppio_effetto_bistabile")
    assert set(ex["layout"]) == {c["id"] for c in ex["components"]}
    assert api.analyze(ex)["issues"] == []


def test_load_example_rejects_traversal():
    with pytest.raises(KeyError):
        api.load_example("../server")


def test_cylinder_info():
    info = api.cylinder_info({"id": "C", "type": "double_acting_cylinder",
                              "params": {"bore": "50 mm", "stroke": "100 mm", "rod": "20 mm"},
                              "pressure": "6 bar"})
    assert info["force_extend"] == "1178 N"
    assert info["piston_area"] == "19.63 cm2"


def test_server_static_and_api(base_url):
    status, ctype, body = get(base_url + "/")
    assert status == 200 and ctype.startswith("text/html") and b"Pneutrack" in body
    status, ctype, _ = get(base_url + "/js/app.js")
    assert ctype.startswith("text/javascript")
    _, _, body = get(base_url + "/api/examples")
    assert json.loads(body)[0]["id"] == "doppio_effetto_bistabile"
    result = post(base_url + "/api/analyze", api.load_example("doppio_effetto_bistabile"))
    assert result["ok"] and result["errors"] == 0


@pytest.mark.parametrize("path", ["/nope.js", "/../pyproject.toml", "/js/../../server.py",
                                  "/api/nope", "/api/examples/nope"])
def test_server_404(base_url, path):
    with pytest.raises(urllib.error.HTTPError) as exc:
        get(base_url + path)
    assert exc.value.code == 404


def test_server_rejects_bad_json(base_url):
    with pytest.raises(urllib.error.HTTPError) as exc:
        post(base_url + "/api/analyze", b"{non json")
    assert exc.value.code == 400


def _playwright_available() -> bool:
    if not shutil.which("node"):
        return False
    probe = subprocess.run(["node", "-e", "require('playwright')"], capture_output=True,
                           cwd=Path(__file__).parent)
    return probe.returncode == 0


@pytest.mark.skipif(not _playwright_available(), reason="serve Node.js con Playwright")
def test_editor_end_to_end(base_url):
    script = Path(__file__).parent / "e2e" / "editor.mjs"
    proc = subprocess.run(["node", str(script), base_url + "/"], capture_output=True, text=True,
                          timeout=180)
    assert proc.returncode == 0, proc.stdout + proc.stderr
