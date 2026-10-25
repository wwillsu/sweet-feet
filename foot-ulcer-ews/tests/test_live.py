import time

from pipeline.asymmetry import ALERT, NO_DATA, NORMAL, WARNING, tier_live
from pipeline.live import SimulatedInsoles, hotspot_offset, in_range, map_channels


def tiers(values):
    return [tier_live(values[:i + 1])[0] for i in range(len(values))]


def test_live_tier_needs_three_sustained_same_sign_readings():
    assert tiers([0.2, 1.6, 2.3, 2.4, 2.5, 1.0]) == [NORMAL, WARNING, WARNING, WARNING, ALERT, NORMAL]


def test_live_sign_flip_and_gap_never_alert():
    assert tiers([2.5, -2.5, 2.5, -2.5]) == [WARNING] * 4
    assert tiers([2.5, 2.5, None, 2.5, 2.5]) == [WARNING, WARNING, NO_DATA, WARNING, WARNING]


def test_live_tier_has_no_rest_requirement():
    """Unlike the daily pipeline, any three readings in a row are enough - no rest window."""
    assert tier_live([-2.4, -2.6, -2.8])[0] == ALERT


def test_out_of_range_masked():
    assert in_range(85.0) is None and in_range(-127.0) is None and in_range(30.1) == 30.1


def test_simulator_story_reaches_alert_level_and_returns():
    assert hotspot_offset(5) == 0 and hotspot_offset(30) == 3.0 and hotspot_offset(55) == 0
    sim = SimulatedInsoles(seed=1)
    r = sim.read()
    assert len(r) == 10 and all(25 < v < 35 for v in r.values())
    sim.t0 = time.monotonic() - 39  # jump to the end of the hold phase
    for _ in range(15):
        r = sim.read()
    assert r[("L", "met1")] - r[("R", "met1")] > 2.2


def test_arduino_channels_map_to_configured_sites():
    cfg = {"arduino": {"channels": [["L", "met1"], ["R", "met1"], ["L", "heel"]]}}
    assert map_channels([30.5, 29.0, None], cfg) == {("L", "met1"): 30.5, ("R", "met1"): 29.0, ("L", "heel"): None}
