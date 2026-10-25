"""End-to-end pipeline: readings -> fault masking -> rest window -> daily dT -> tiers/alerts."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline.asymmetry import ALERT, classify_site_series, delta_t, screening_message
from pipeline.config import CONFIG, FEET, ROOT, SITES
from pipeline.faults import detect_faults, sensor_status
from pipeline.rest import find_rest_window


def to_wide(readings: pd.DataFrame, interval_min: float) -> pd.DataFrame:
    """Snap every sensor onto a shared regular grid (nearest slot, mean of duplicates).
    Separate insoles never share exact timestamps; missing slots become NaN rows so
    sample-count rolling windows always span real time."""
    step = pd.Timedelta(minutes=interval_min)
    snapped = readings.assign(timestamp=readings["timestamp"].dt.round(step))
    wide = snapped.pivot_table(index="timestamp", columns=["foot", "site"], values="temp_c", aggfunc="mean")
    grid = pd.date_range(wide.index.min(), wide.index.max(), freq=step, name="timestamp")
    cols = pd.MultiIndex.from_tuples([(f, s) for f in FEET for s in SITES])
    return wide.reindex(index=grid, columns=cols)


def day_of(ts: pd.DatetimeIndex, cfg: dict = CONFIG) -> pd.Series:
    """Calendar date a sample's day window belongs to (window [D-1 boundary, D boundary))."""
    h = cfg["sampling"]["day_boundary_hour"]
    return pd.Series((ts + pd.Timedelta(hours=24 - h)).normalize().date, index=ts)


def process_patient(readings: pd.DataFrame, cfg: dict = CONFIG, interval_min: float | None = None):
    interval_min = interval_min or cfg["sampling"]["interval_min"]
    pid = readings["patient_id"].iloc[0]
    wide = to_wide(readings, interval_min)
    clean, flags = detect_faults(wide, cfg)
    days = day_of(wide.index, cfg)

    per_site: dict[str, list] = {s: [] for s in SITES}
    meta = {}
    for d, idx in days.groupby(days).groups.items():
        cd = clean.loc[idx]
        win = find_rest_window(cd, interval_min, cfg)
        vals, cover = {}, {}
        if win is not None:
            seg = cd.loc[win[0]:win[1]]
            for col in cd.columns:
                frac = float(seg[col].notna().mean())
                cover[col] = frac
                vals[col] = float(seg[col].median()) if frac >= cfg["rest"]["min_valid_fraction"] else None
        meta[d] = (win, vals, cover)
        for s in SITES:
            per_site[s].append((d, delta_t(vals.get(("L", s)), vals.get(("R", s)))))

    rows = []
    for s in SITES:
        for r in classify_site_series(per_site[s], cfg):
            win, vals, cover = meta[r["date"]]
            rows.append({
                "patient_id": pid, "date": str(r["date"]), "site": s,
                "left_c": _r(vals.get(("L", s))), "right_c": _r(vals.get(("R", s))),
                "delta_c": _r(r["delta_c"]), "tier": r["tier"], "reason": r["reason"],
                "rest_start": str(win[0]) if win else None, "rest_end": str(win[1]) if win else None,
                "message": screening_message(cfg["site_labels"][s], r["delta_c"], r["tier"]),
            })
    daily = pd.DataFrame(rows).sort_values(["date", "site"]).reset_index(drop=True)
    status = sensor_status(flags, cfg)
    status.insert(0, "patient_id", pid)
    return daily, status, flags


def alerts_from_daily(daily: pd.DataFrame) -> pd.DataFrame:
    return daily[daily.tier == ALERT].copy()


def run_all(readings: pd.DataFrame, cfg: dict = CONFIG):
    dailies, statuses = [], []
    for pid, g in readings.groupby("patient_id", sort=False):
        d, st, _ = process_patient(g, cfg)
        dailies.append(d)
        statuses.append(st)
    daily = pd.concat(dailies, ignore_index=True)
    return daily, alerts_from_daily(daily), pd.concat(statuses, ignore_index=True)


def _r(v):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--readings", default=str(ROOT / "data" / "readings.csv"))
    ap.add_argument("--out", default=str(ROOT / "data"))
    args = ap.parse_args()
    readings = pd.read_csv(args.readings, parse_dates=["timestamp"])
    daily, alerts, status = run_all(readings)
    out = Path(args.out)
    daily.to_csv(out / "daily.csv", index=False)
    alerts.to_csv(out / "alerts.csv", index=False)
    status.to_csv(out / "sensor_status.csv", index=False)
    print(f"{len(daily)} daily rows, {len(alerts)} alert rows -> {out}")
    print(alerts[["patient_id", "date", "site", "delta_c", "reason"]].to_string(index=False))


if __name__ == "__main__":
    main()
