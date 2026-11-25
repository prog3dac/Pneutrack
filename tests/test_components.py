import pytest

from pneutrack.model import (
    COMPONENT_TYPES,
    Actuation,
    DirectionalValve,
    DoubleActingCylinder,
    ParameterError,
    PortKind,
    PressureRegulator,
    PressureSource,
    SingleActingCylinder,
    component_from_dict,
    q,
)


def test_valve_ports_follow_iso_5599():
    v = DirectionalValve("V", function="5/2")
    assert set(v.ports) == {"1", "2", "3", "4", "5"}
    assert v.port("1").kind is PortKind.SUPPLY
    assert v.port("3").kind is PortKind.EXHAUST and v.port("3").may_be_open
    assert not v.port("4").may_be_open

    v32 = DirectionalValve("V2", function="3/2")
    assert set(v32.ports) == {"1", "2", "3"}


def test_pilot_actuation_adds_pilot_ports():
    v = DirectionalValve("V", function="5/2", actuation_14="pilot", actuation_12="pilot")
    assert v.port("14").kind is PortKind.PILOT
    assert v.port("12").kind is PortKind.PILOT
    mono = DirectionalValve("M", function="3/2", actuation_14=Actuation.PILOT)
    assert "14" in mono.ports and "12" not in mono.ports


def test_valve_rejects_unknown_function_and_double_spring():
    with pytest.raises(ParameterError):
        DirectionalValve("V", function="7/4")
    with pytest.raises(ParameterError):
        DirectionalValve("V", actuation_14="spring", actuation_12="spring")


def test_unknown_port_raises():
    with pytest.raises(KeyError):
        DirectionalValve("V", function="3/2").port("4")


def test_required_param_missing():
    with pytest.raises(ParameterError, match="pressure"):
        PressureSource("P")


def test_param_wrong_dimension():
    with pytest.raises(ParameterError, match="atteso pressure"):
        PressureSource("P", pressure="6 mm")


def test_param_unknown_and_non_positive():
    with pytest.raises(ParameterError, match="sconosciuti"):
        PressureSource("P", pressure="6 bar", colour="red")
    with pytest.raises(ParameterError, match="positivo"):
        DoubleActingCylinder("C", bore="0 mm", stroke="100 mm")


def test_rod_must_be_smaller_than_bore():
    with pytest.raises(ParameterError, match="stelo"):
        DoubleActingCylinder("C", bore="20 mm", stroke="50 mm", rod="25 mm")


def test_cylinder_force():
    c = DoubleActingCylinder("C", bore="50 mm", stroke="200 mm", rod="20 mm")
    # 6 bar * pi*(50mm)^2/4 = 1178 N
    assert c.theoretical_force("6 bar").to("N") == pytest.approx(1178.1, abs=0.1)
    assert c.theoretical_force("6 bar", retract=True).to("N") == pytest.approx(989.6, abs=0.1)
    assert c.piston_area.unit == "cm2"


def test_single_acting_cylinder_has_one_port():
    assert set(SingleActingCylinder("C", bore="20 mm", stroke="25 mm").ports) == {"A"}


def test_regulator_caps_pressure():
    r = PressureRegulator("R", setpoint="4 bar")
    (path,) = r.internal_paths()
    assert path.cap == q("4 bar")


@pytest.mark.parametrize("type_name", sorted(COMPONENT_TYPES))
def test_every_type_is_registered_and_constructible(type_name):
    samples = {
        "pressure_source": {"params": {"pressure": "6 bar"}},
        "pressure_regulator": {"params": {"setpoint": "4 bar"}},
        "single_acting_cylinder": {"params": {"bore": "20 mm", "stroke": "50 mm"}},
        "double_acting_cylinder": {"params": {"bore": "20 mm", "stroke": "50 mm"}},
        "rotary_actuator": {"params": {"angle": "90 deg"}},
    }
    data = {"id": "X", "type": type_name, **samples.get(type_name, {})}
    comp = component_from_dict(data)
    again = component_from_dict(comp.to_dict())
    assert again.to_dict() == comp.to_dict()
