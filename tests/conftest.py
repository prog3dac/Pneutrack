import pytest

from pneutrack.model import (
    Circuit,
    DirectionalValve,
    DoubleActingCylinder,
    PressureSource,
    Silencer,
)


@pytest.fixture
def basic_circuit() -> Circuit:
    """Sorgente 6 bar -> 5/2 monostabile -> cilindro a doppio effetto, scarichi silenziati."""
    c = Circuit("base")
    c.add(PressureSource("P", pressure="6 bar"))
    c.add(DirectionalValve("V1", function="5/2", max_pressure="10 bar"))
    c.add(DoubleActingCylinder("C1", bore="32 mm", stroke="100 mm", rod="12 mm",
                               max_pressure="10 bar"))
    c.add(Silencer("S3", max_pressure="10 bar"))
    c.add(Silencer("S5", max_pressure="10 bar"))
    c.connect("P.1", "V1.1")
    c.connect("V1.4", "C1.A")
    c.connect("V1.2", "C1.B")
    c.connect("V1.3", "S3.1")
    c.connect("V1.5", "S5.1")
    return c
