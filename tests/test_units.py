import math

import pytest

from pneutrack.model import Dimension, Quantity, UnitError, q


def test_parse_catalog_units():
    assert q("6 bar").to("Pa") == pytest.approx(6e5)
    assert q("0,6 MPa") == q("6 bar")
    assert q("32mm").to("m") == pytest.approx(0.032)
    assert q("90 psi").to("bar") == pytest.approx(6.205, abs=1e-3)
    assert q("500 Nl/min").to("Nm3/h") == pytest.approx(30.0)
    assert q("90 °").to("rad") == pytest.approx(math.pi / 2)


def test_keeps_original_unit_for_display():
    p = q("6 bar")
    assert p.unit == "bar"
    assert p.value == pytest.approx(6)
    assert str(p) == "6 bar"
    assert str(p.in_unit("kPa")) == "600 kPa"


def test_comparison_across_units():
    assert q("5 bar") < q("0.6 MPa")
    assert q("1 bar") == q("100 kPa")
    with pytest.raises(UnitError):
        _ = q("6 bar") < q("6 mm")


def test_conversion_to_wrong_dimension_fails():
    with pytest.raises(UnitError):
        q("6 bar").to("mm")


@pytest.mark.parametrize("bad", ["", "bar", "6 furlong", "abc mm"])
def test_invalid_strings(bad):
    with pytest.raises(UnitError):
        Quantity.parse(bad)


def test_coerce():
    assert Quantity.coerce((6, "bar")) == q("6 bar")
    assert Quantity.coerce(q("1 mm")).dimension is Dimension.LENGTH
    with pytest.raises(UnitError):
        Quantity.coerce(6)
