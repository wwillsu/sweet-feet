import numpy as np
import pandas as pd

from pipeline.faults import detect_faults, jump_faults, range_faults, sensor_status, stuck_faults


def series(values):
    idx = pd.date_range("2026-10-01", periods=len(values), freq="5min")
    return pd.Series(values, index=idx, dtype=float)


def noisy(n=200, level=30.0, seed=0):
    return series(level + np.random.default_rng(seed).normal(0, 0.04, n))


def test_clean_signal_has_no_faults():
    x = noisy()
    assert not range_faults(x).any()
    assert not jump_faults(x).any()
    assert not stuck_faults(x).any()


def test_range_catches_85c_power_on_value_and_disconnect():
    x = noisy()
    x.iloc[10] = 85.0
    x.iloc[20] = -127.0
    assert set(np.flatnonzero(range_faults(x))) == {10, 20}


def test_single_spike_flagged():
    x = noisy()
    x.iloc[50] += 5.0
    assert list(np.flatnonzero(jump_faults(x))) == [50]


def test_night_warm_up_ramp_not_flagged_as_jump():
    t = np.arange(100)
    x = series(28 + 3 * (1 - np.exp(-t * 5 / 30)) + np.random.default_rng(1).normal(0, 0.04, 100))
    assert not jump_faults(x).any()


def test_stuck_run_flagged_entirely():
    x = noisy()
    x.iloc[60:100] = 25.0
    flagged = np.flatnonzero(stuck_faults(x))
    assert flagged.min() == 60 and flagged.max() == 99


def test_short_flat_run_not_stuck():
    x = noisy()
    x.iloc[60:65] = 30.0
    assert not stuck_faults(x).any()


def test_detect_faults_masks_and_reports():
    peer = noisy(seed=1)
    peer.iloc[100:] += 3.0  # e.g. going to bed: other sensors warm up while R-met1 stays frozen
    wide = pd.DataFrame({("L", "met1"): peer, ("R", "met1"): noisy(seed=2)})
    wide.iloc[10, 0] = 85.0
    wide.iloc[50:150, 1] = 25.0
    clean, flags = detect_faults(wide)
    assert np.isnan(clean.iloc[10, 0]) and flags.iloc[10, 0] == "range"
    assert clean.iloc[50:150, 1].isna().all()
    st = sensor_status(flags).set_index(["foot", "site"])
    assert st.loc[("L", "met1"), "status"] == "degraded"
    assert st.loc[("R", "met1"), "status"] == "fault"   # 50% bad


def quantized(x, step=0.0625):
    return (x / step).round() * step


def test_quantized_sensor_at_rest_not_stuck_when_peers_also_quiet():
    """Coarse sensors read one constant value for hours at thermal rest - that is not a fault."""
    rng = np.random.default_rng(0)
    wide = pd.DataFrame({(f, "met1"): quantized(series(31 + rng.normal(0, 0.02, 200))) for f in ("L", "R")})
    assert stuck_faults(wide[("L", "met1")]).any(), "precondition: flat by variance alone"
    _, flags = detect_faults(wide)
    assert (flags == "").all().all()


def test_stuck_flagged_when_peers_move_during_flat_run():
    rng = np.random.default_rng(0)
    peer = series(np.r_[np.full(100, 28.0), np.full(100, 31.0)] + rng.normal(0, 0.04, 200))
    x = noisy()
    x.iloc[50:150] = 25.0
    flagged = np.flatnonzero(stuck_faults(x, peers=peer))
    assert flagged.min() == 50 and flagged.max() == 149
