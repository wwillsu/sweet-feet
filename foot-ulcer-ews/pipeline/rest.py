"""Rest-window detection via slope stability.

Plantar temperature is only comparable L vs R when the feet are at thermal rest
(not walking, not still warming up after going to bed). We take the mean of all
valid sensors, fit a rolling linear slope, and call a sample "stable" when
|slope| is below max_abs_slope_c_per_h. The longest stable run of at least
min_duration_min inside each day window is that day's rest window.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.config import CONFIG


def rolling_slope_c_per_h(x: pd.Series, window: int, interval_min: float) -> pd.Series:
    """Centred least-squares slope over `window` samples, in C per hour (NaN-tolerant)."""
    t = np.arange(window) - (window - 1) / 2
    t_h = t * interval_min / 60.0

    def slope(v):
        m = ~np.isnan(v)
        if m.sum() < max(3, window // 2):
            return np.nan
        tt, vv = t_h[m], v[m]
        tt = tt - tt.mean()
        return float((tt * (vv - vv.mean())).sum() / (tt ** 2).sum())

    return x.rolling(window, center=True, min_periods=window).apply(slope, raw=True)


def longest_true_run(mask: np.ndarray) -> tuple[int, int]:
    """(start, end_exclusive) of the longest run of True; (0, 0) if none."""
    best, cur_start, best_rng = 0, None, (0, 0)
    for i, v in enumerate(list(mask) + [False]):
        if v and cur_start is None:
            cur_start = i
        elif not v and cur_start is not None:
            if i - cur_start > best:
                best, best_rng = i - cur_start, (cur_start, i)
            cur_start = None
    return best_rng


def find_rest_window(clean_day: pd.DataFrame, interval_min: float, cfg: dict = CONFIG):
    """clean_day: wide frame for one day window. Returns (start_ts, end_ts) or None."""
    r = cfg["rest"]
    window = max(3, int(round(r["slope_window_min"] / interval_min)) | 1)  # odd
    mean_t = clean_day.mean(axis=1, skipna=True)
    slope = rolling_slope_c_per_h(mean_t, window, interval_min)
    stable = (slope.abs() < r["max_abs_slope_c_per_h"]).to_numpy()
    s, e = longest_true_run(stable)
    if (e - s) * interval_min < r["min_duration_min"]:
        return None
    return clean_day.index[s], clean_day.index[e - 1]
