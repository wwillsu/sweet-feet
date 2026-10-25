"""End-to-end validation on the injected synthetic scenarios."""
import copy

import pandas as pd
import pytest

from pipeline.config import CONFIG
from pipeline.generate import SCENARIOS, generate_all
from pipeline.run import run_all
from pipeline.validate import run_validation, validate


@pytest.fixture(scope="session")
def validation():
    return run_validation()


def test_generator_is_deterministic():
    a, b = generate_all(), generate_all()
    pd.testing.assert_frame_equal(a, b)
    assert len(a) == len(SCENARIOS) * 10 * CONFIG["synthetic"]["n_days"] * 288


@pytest.mark.parametrize("pid", list(SCENARIOS))
def test_scenario(validation, pid):
    r = next(r for r in validation["results"] if r["patient_id"] == pid)
    assert r["passed"], "\n".join(r["notes"])


def test_zero_false_alerts(validation):
    assert validation["false_alerts"] == 0


def test_all_scenarios_pass(validation):
    assert validation["scenarios_passed"] == validation["scenarios_total"] == 2


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
def test_robust_across_seeds(seed):
    v = run_validation(seed=seed)
    assert v["false_alerts"] == 0
    assert v["scenarios_passed"] == v["scenarios_total"]


def test_fault_detection_is_what_prevents_s4_false_alert():
    """Negative control: with fault checks disabled, the stuck sensor fakes an alert."""
    cfg = copy.deepcopy(CONFIG)
    cfg["faults"].update(range_min_c=-1e9, range_max_c=1e9, jump_c=1e9, stuck_std_c=-1)
    readings = generate_all()
    readings = readings[readings.patient_id == "S4_sensor_fault"]
    daily, alerts, _ = run_all(readings, cfg)
    assert len(alerts) > 0


def test_unaligned_foot_clocks_still_alert():
    """Two insoles never share exact timestamps: shift the right foot by 1 min."""
    readings = generate_all()
    readings = readings[readings.patient_id == "S1_hotspot"].copy()
    readings.loc[readings.foot == "R", "timestamp"] += pd.Timedelta(minutes=1)
    daily, alerts, _ = run_all(readings)
    assert (daily.tier == "no_data").sum() == 0
    assert set(alerts.site) == {"met1"} and alerts.date.min() == "2026-10-21"


def test_quantized_sensors_pass_validation():
    """DS18B20-style 0.0625 C resolution must not trip the stuck detector."""
    readings = generate_all()
    readings["temp_c"] = (readings.temp_c / 0.0625).round() * 0.0625
    daily, _, status = run_all(readings)
    v = validate(daily, status)
    assert v["false_alerts"] == 0
    assert v["scenarios_passed"] == v["scenarios_total"]
    ok = status[status.patient_id != "S4_sensor_fault"]
    assert (ok.status == "ok").all(), ok[ok.status != "ok"]
