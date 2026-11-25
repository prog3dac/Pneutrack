import json

import pytest

from pneutrack.model import (
    Circuit,
    CircuitError,
    PortRef,
    PressureSource,
    Silencer,
)


def test_portref_parse():
    assert PortRef.parse("V1.14") == PortRef("V1", "14")
    assert PortRef.parse(("C", "A")) == PortRef("C", "A")
    with pytest.raises(ValueError):
        PortRef.parse("V1")


def test_duplicate_id_rejected():
    c = Circuit()
    c.add(Silencer("S"))
    with pytest.raises(CircuitError):
        c.add(Silencer("S"))


def test_connect_validates_ports(basic_circuit):
    with pytest.raises(CircuitError, match="inesistente"):
        basic_circuit.connect("NOPE.1", "V1.1")
    with pytest.raises(CircuitError, match="porta"):
        basic_circuit.connect("V1.9", "C1.A")
    with pytest.raises(CircuitError, match="se stessa"):
        basic_circuit.connect("V1.1", "V1.1")
    with pytest.raises(CircuitError, match="già presente"):
        basic_circuit.connect("C1.A", "V1.4")  # stessa linea, verso opposto


def test_neighbors_and_connections(basic_circuit):
    assert basic_circuit.neighbors("V1") == {"P", "C1", "S3", "S5"}
    assert basic_circuit.neighbors("C1") == {"V1"}
    assert len(basic_circuit.connections_of("C1.A")) == 1
    assert basic_circuit.is_connected("V1.5")


def test_disconnect_and_remove(basic_circuit):
    basic_circuit.disconnect("C1.B", "V1.2")
    assert not basic_circuit.is_connected("C1.B")
    with pytest.raises(CircuitError):
        basic_circuit.disconnect("C1.B", "V1.2")
    basic_circuit.remove("V1")
    assert "V1" not in basic_circuit
    assert basic_circuit.connections == []


def test_tee_forms_single_net():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(Silencer("A"))
    c.add(Silencer("B"))
    c.connect("P.1", "A.1")
    c.connect("P.1", "B.1")
    net = c.net_of("A.1")
    assert net == {PortRef("P", "1"), PortRef("A", "1"), PortRef("B", "1")}


def test_nets_partition_all_ports(basic_circuit):
    nets = basic_circuit.nets()
    all_ports = [r for r, _ in basic_circuit.ports()]
    assert sorted(r for n in nets for r in n) == sorted(all_ports)
    assert len(nets) == 5


def test_json_roundtrip(basic_circuit):
    text = basic_circuit.to_json()
    data = json.loads(text)
    assert data["format"] == "pneutrack/circuit"
    assert {"id": "C1", "type": "double_acting_cylinder",
            "params": {"bore": "32 mm", "stroke": "100 mm", "rod": "12 mm",
                       "max_pressure": "10 bar"}} in data["components"]
    again = Circuit.from_json(text)
    assert again.to_dict() == basic_circuit.to_dict()


def test_from_dict_rejects_unknown_format():
    with pytest.raises(CircuitError):
        Circuit.from_dict({"format": "altro"})
    with pytest.raises(ValueError):
        Circuit.from_dict({"components": [{"id": "X", "type": "teletrasporto"}]})


def test_example_file_loads_and_is_valid():
    from pathlib import Path

    from pneutrack.model import validate

    path = Path(__file__).parent.parent / "src" / "pneutrack" / "examples" / "doppio_effetto_bistabile.json"
    circuit = Circuit.from_json(path.read_text(encoding="utf-8"))
    assert len(circuit) == 8
    assert validate(circuit).issues == []
