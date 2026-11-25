import pytest

from pneutrack.model import (
    Circuit,
    DirectionalValve,
    DoubleActingCylinder,
    FlowControlValve,
    Plug,
    PressureRegulator,
    PressureSource,
    RotaryActuator,
    Severity,
    Silencer,
    SingleActingCylinder,
    q,
    validate,
)


def test_basic_circuit_is_valid(basic_circuit):
    report = validate(basic_circuit)
    assert report.ok, str(report)
    assert report.issues == []
    assert report.pressure_at("C1.A") == q("6 bar")
    assert report.pressure_at("C1.B") == q("6 bar")


def test_empty_circuit_is_valid():
    assert validate(Circuit()).issues == []


def test_no_source_warning():
    c = Circuit()
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="50 mm"))
    c.add(Plug("T"))
    c.connect("C.A", "T.1")
    report = validate(c)
    assert report.ok
    assert set(report.codes()) == {"NO_SOURCE", "UNSUPPLIED_ACTUATOR"}


def test_unconnected_ports(basic_circuit):
    basic_circuit.disconnect("V1.2", "C1.B")
    report = validate(basic_circuit)
    assert not report.ok
    refs = sorted(str(i.ports[0]) for i in report.by_code("UNCONNECTED_PORT"))
    assert refs == ["C1.B", "V1.2"]


def test_open_exhaust_is_allowed(basic_circuit):
    basic_circuit.remove("S3")
    assert validate(basic_circuit).ok


def test_plugged_work_port_is_valid():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(DirectionalValve("V", function="5/2"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm"))
    c.add(Plug("T"))
    c.connect("P.1", "V.1")
    c.connect("V.4", "C.A")
    c.connect("V.2", "T.1")
    assert validate(c).issues == []


def test_unconnected_pilot_port():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(DirectionalValve("V", function="3/2", actuation_14="pilot"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm"))
    c.connect("P.1", "V.1")
    c.connect("V.2", "C.A")
    report = validate(c)
    (issue,) = report.by_code("UNCONNECTED_PORT")
    assert "pilotaggio" in issue.message and str(issue.ports[0]) == "V.14"


def test_overpressure_on_actuator():
    c = Circuit()
    c.add(PressureSource("P", pressure="8 bar"))
    c.add(DirectionalValve("V", function="5/2", max_pressure="10 bar"))
    c.add(DoubleActingCylinder("C", bore="16 mm", stroke="50 mm", max_pressure="7 bar"))
    c.connect("P.1", "V.1")
    c.connect("V.4", "C.A")
    c.connect("V.2", "C.B")
    report = validate(c)
    (issue,) = report.errors
    assert issue.code == "OVERPRESSURE"
    assert issue.component == "C"
    assert "8 bar" in issue.message and "7 bar" in issue.message


def test_overpressure_compares_across_units():
    c = Circuit()
    c.add(PressureSource("P", pressure="100 psi"))  # ~6.9 bar
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm", max_pressure="0.6 MPa"))
    c.connect("P.1", "C.A")
    assert validate(c).codes() == ["OVERPRESSURE"]


def test_regulator_protects_downstream():
    c = Circuit()
    c.add(PressureSource("P", pressure="8 bar"))
    c.add(PressureRegulator("R", setpoint="4 bar", max_pressure="16 bar"))
    c.add(DirectionalValve("V", function="5/2", max_pressure="10 bar"))
    c.add(DoubleActingCylinder("C", bore="16 mm", stroke="50 mm", max_pressure="6 bar"))
    c.connect("P.1", "R.1")
    c.connect("R.2", "V.1")
    c.connect("V.4", "C.A")
    c.connect("V.2", "C.B")
    report = validate(c)
    assert report.issues == []
    assert report.pressure_at("C.A") == q("4 bar")


def test_regulator_itself_can_be_overpressured():
    c = Circuit()
    c.add(PressureSource("P", pressure="12 bar"))
    c.add(PressureRegulator("R", setpoint="4 bar", max_pressure="10 bar"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm"))
    c.connect("P.1", "R.1")
    c.connect("R.2", "C.A")
    (issue,) = validate(c).issues
    assert (issue.code, issue.component) == ("OVERPRESSURE", "R")


def test_pressure_flows_through_flow_control_both_ways():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(DirectionalValve("V", function="3/2"))
    c.add(FlowControlValve("F"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm", max_pressure="5 bar"))
    c.connect("P.1", "V.1")
    c.connect("V.2", "F.2")
    c.connect("F.1", "C.A")
    assert validate(c).codes() == ["OVERPRESSURE"]


def test_source_conflict():
    c = Circuit()
    c.add(PressureSource("P1", pressure="6 bar"))
    c.add(PressureSource("P2", pressure="8 bar"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm"))
    c.connect("P1.1", "C.A")
    c.connect("P2.1", "C.A")
    report = validate(c)
    assert report.codes() == ["SOURCE_CONFLICT"]
    assert report.pressure_at("C.A") == q("8 bar")


def test_same_pressure_sources_do_not_conflict():
    c = Circuit()
    c.add(PressureSource("P1", pressure="6 bar"))
    c.add(PressureSource("P2", pressure="0.6 MPa"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm"))
    c.connect("P1.1", "C.A")
    c.connect("P2.1", "C.A")
    assert validate(c).issues == []


def test_supply_vented_into_silencer():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(Silencer("S"))
    c.connect("P.1", "S.1")
    assert validate(c).codes() == ["SUPPLY_VENTED"]


def test_supply_wired_to_valve_exhaust(basic_circuit):
    basic_circuit.remove("S3")
    basic_circuit.connect("P.1", "V1.3")
    (issue,) = validate(basic_circuit).errors
    assert issue.code == "SUPPLY_VENTED"
    assert "V1.3" in issue.message


def test_unsupplied_actuator():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(Plug("T"))
    c.add(RotaryActuator("R", angle="90 deg"))
    c.add(Plug("TA"))
    c.add(Plug("TB"))
    c.connect("P.1", "T.1")
    c.connect("R.A", "TA.1")
    c.connect("R.B", "TB.1")
    (issue,) = validate(c).issues
    assert issue.code == "UNSUPPLIED_ACTUATOR" and issue.severity is Severity.WARNING


def test_pilot_chain_and_unsupplied_pilot():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(DirectionalValve("Vp", function="3/2", actuation_14="manual"))  # pulsante
    c.add(DirectionalValve("V", function="5/2", actuation_14="pilot", actuation_12="pilot",
                           min_pressure="2 bar"))
    c.add(DoubleActingCylinder("C", bore="32 mm", stroke="100 mm"))
    c.add(Plug("T"))
    c.connect("P.1", "Vp.1")
    c.connect("P.1", "V.1")
    c.connect("Vp.2", "V.14")
    c.connect("V.12", "T.1")  # pilotaggio tappato: mai in pressione
    c.connect("V.4", "C.A")
    c.connect("V.2", "C.B")
    report = validate(c)
    assert report.ok
    assert report.codes() == ["UNSUPPLIED_PILOT"]
    assert report.pressure_at("V.14") == q("6 bar")


def test_underpressure_on_pilot():
    c = Circuit()
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(PressureRegulator("R", setpoint="1.5 bar"))
    c.add(DirectionalValve("V", function="3/2", actuation_14="pilot", min_pressure="2.5 bar"))
    c.add(SingleActingCylinder("C", bore="20 mm", stroke="25 mm"))
    c.connect("P.1", "R.1")
    c.connect("P.1", "V.1")
    c.connect("R.2", "V.14")
    c.connect("V.2", "C.A")
    (issue,) = validate(c).issues
    assert issue.code == "UNDERPRESSURE" and issue.severity is Severity.WARNING
    assert "1.5 bar" in issue.message


@pytest.mark.parametrize("code", ["UNCONNECTED_PORT", "OVERPRESSURE"])
def test_issue_str_contains_code(code, basic_circuit):
    if code == "UNCONNECTED_PORT":
        basic_circuit.disconnect("V1.4", "C1.A")
    else:
        basic_circuit.add(PressureSource("P2", pressure="12 bar"))
        basic_circuit.disconnect("P.1", "V1.1")
        basic_circuit.remove("P")
        basic_circuit.connect("P2.1", "V1.1")
    text = str(validate(basic_circuit))
    assert code in text
