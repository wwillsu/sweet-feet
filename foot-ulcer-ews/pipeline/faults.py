"""Per-sample sensor fault detection: out-of-range, jumps/spikes, stuck values.

Works on a wide frame: index = timestamp, columns = (foot, site), values = temp_c.
Faulty samples are masked to NaN before any downstream analysis.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from pipeline.config import CONFIG


def range_faults(x: pd.Series, cfg: dict = CONFIG) -> pd.Series:
    f = cfg["faults"]
    return (x < f["range_min_c"]) | (x > f["range_max_c"]) | x.isna()


def jump_faults(x: pd.Series, cfg: dict = CONFIG) -> pd.Series:
    """Hampel-style: sample deviates from its centred rolling median by more than jump_c.
    Catches isolated spikes without flagging the slow night-time warm-up."""
    f = cfg["faults"]
    med = x.rolling(f["hampel_window"], center=True, min_periods=1).median()
    return (x - med).abs() > f["jump_c"]


def stuck_faults(x: pd.Series, cfg: dict = CONFIG, peers: pd.Series | None = None) -> pd.Series:
    """Flag every sample inside a run of >= stuck_window_samples with ~zero variance.

    A coarse-resolution sensor (e.g. 0.0625 C steps) legitimately reads one constant
    value for hours at thermal rest, so with `peers` (median of the other sensors) a
    flat run only counts as stuck if the peers moved by > stuck_peer_move_c during it."""
    f = cfg["faults"]
    w = f["stuck_window_samples"]
    flat_end = x.rolling(w, min_periods=w).std() < f["stuck_std_c"]
    # spread the flag back over the whole window that ended flat
    flat = flat_end[::-1].rolling(w, min_periods=1).max()[::-1].astype(bool)
    if peers is None or not flat.any():
        return flat
    run_id = (flat != flat.shift()).cumsum()
    p = peers.where(flat)
    peer_move = p.groupby(run_id).transform("max") - p.groupby(run_id).transform("min")
    return flat & (peer_move > f["stuck_peer_move_c"])


def detect_faults(wide: pd.DataFrame, cfg: dict = CONFIG) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (clean, flags). flags holds '' / 'range' / 'jump' / 'stuck' per sample.
    Range is checked first and range-faulty samples are excluded from jump/stuck checks."""
    clean = wide.copy()
    flags = pd.DataFrame("", index=wide.index, columns=wide.columns)
    in_range = wide.mask(wide.apply(range_faults, cfg=cfg))
    for col in wide.columns:
        x = wide[col]
        r = range_faults(x, cfg)
        xr = x.mask(r)
        peers = in_range.drop(columns=col).median(axis=1) if wide.shape[1] > 1 else None
        s = stuck_faults(xr, cfg, peers)
        j = jump_faults(xr.mask(s), cfg) & ~s
        flags.loc[s, col] = "stuck"
        flags.loc[j, col] = "jump"
        flags.loc[r, col] = "range"
        clean[col] = x.mask(r | s | j)
    return clean, flags


def sensor_status(flags: pd.DataFrame, cfg: dict = CONFIG) -> pd.DataFrame:
    """Summarise per sensor: fault fraction, dominant fault type, ok/degraded/fault."""
    f = cfg["faults"]
    rows = []
    for col in flags.columns:
        col_flags = flags[col]
        bad = col_flags != ""
        frac = float(bad.mean())
        counts = col_flags[bad].value_counts()
        status = ("fault" if frac >= f["sensor_fault_fraction"]
                  else "degraded" if frac >= f["sensor_degraded_fraction"] or bad.any()
                  else "ok")
        rows.append({"foot": col[0], "site": col[1], "fault_fraction": round(frac, 4),
                     "n_range": int(counts.get("range", 0)), "n_jump": int(counts.get("jump", 0)),
                     "n_stuck": int(counts.get("stuck", 0)), "status": status,
                     "last_fault": (str(col_flags[bad].index.max()) if bad.any() else None)})
    return pd.DataFrame(rows)
