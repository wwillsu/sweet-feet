import numpy as np
import pandas as pd

from pipeline.rest import find_rest_window, longest_true_run


def day_frame(signal):
    idx = pd.date_range("2026-10-01 12:00", periods=len(signal), freq="5min")
    rng = np.random.default_rng(0)
    return pd.DataFrame({c: signal + rng.normal(0, 0.04, len(signal)) for c in range(4)}, index=idx)


def test_longest_true_run():
    assert longest_true_run(np.array([0, 1, 1, 0, 1, 1, 1, 0], bool)) == (4, 7)
    assert longest_true_run(np.zeros(5, bool)) == (0, 0)


def test_finds_night_plateau_and_skips_warm_up_ramp():
    n = 288  # 24 h at 5 min
    t = np.arange(n)
    rng = np.random.default_rng(3)
    day = 28 + np.cumsum(rng.normal(0, 0.15, n)) * 0.3 + 0.8 * np.sin(t / 3)  # restless daytime
    asleep = (t >= 132) & (t < 222)  # 23:00 - 06:30
    target = np.where(asleep, 31.0, day)
    x = np.empty(n); x[0] = target[0]
    a = 1 - np.exp(-5 / 30)
    for i in range(1, n):
        x[i] = x[i - 1] + a * (target[i] - x[i - 1])
    win = find_rest_window(day_frame(x), 5)
    assert win is not None
    start_h = (win[0] - pd.Timestamp("2026-10-01 12:00")) / pd.Timedelta(hours=1)
    end_h = (win[1] - pd.Timestamp("2026-10-01 12:00")) / pd.Timedelta(hours=1)
    assert 11.5 <= start_h <= 13.0, "window should start after the ~1h warm-up ramp"
    assert 17.5 <= end_h <= 18.5


def test_no_window_when_never_stable():
    t = np.arange(288)
    assert find_rest_window(day_frame(28 + 1.5 * np.sin(t / 4)), 5) is None


def test_no_window_when_stable_run_too_short():
    t = np.arange(288)
    x = 28 + 1.5 * np.sin(t / 4)
    x[100:118] = 30.0  # 90 min flat < 120 min required
    assert find_rest_window(day_frame(x), 5) is None
