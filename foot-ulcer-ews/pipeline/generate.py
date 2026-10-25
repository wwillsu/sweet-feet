"""Synthetic plantar-temperature dataset with injected, labelled scenarios.

Model per patient (5-min samples, 10 sensors = 5 sites x 2 feet):
  target(t) = systemic(t) + site offset + small fixed L/R offset
              + per-foot daytime wander + injected effects
  reading   = first-order thermal lag of target (tau 30 min) + sensor noise
Systemic: ~28 C with activity wander while awake, ~31 C plateau while asleep.
A "day" D is the window [D-1 12:00, D 12:00), so it contains one night of rest.

Scenarios (day indices are 0-based):
  P0_control       healthy, no injections                 -> no warnings, no alerts
  S1_hotspot       L met1 sustained ramp to +3.0 C        -> warning d7-d9, alert from d10
  S4_sensor_fault  R met5 stuck at 25 C over d8-d9 nights, -> no alert, sensor flagged
                   plus 85 C glitches and a spike
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline.config import CONFIG, FEET, ROOT, SITES

SITE_BASE = {"hallux": -0.8, "met1": 0.0, "met3": 0.3, "met5": -0.2, "heel": -0.4}
TAU_MIN = 30.0

S1_RAMP = {6: 1.0, 7: 1.8, 8: 1.9, 9: 2.8, 10: 3.0, 11: 3.0, 12: 3.1, 13: 3.1}

SCENARIOS = {
    "P0_control": {
        "description": "Healthy control, no injected asymmetry.",
        "injections": [],
        "faults": [],
        "expect": {"alerts": [], "warning_days": {}, "no_warnings": True},
    },
    "S1_hotspot": {
        "description": "Sustained left 1st-metatarsal hotspot ramping to +3.0 C (pre-ulcer inflammation pattern).",
        "injections": [{"foot": "L", "site": "met1", "days": S1_RAMP, "when": "all"}],
        "faults": [],
        "expect": {"alerts": [{"site": "met1", "first_day": 10, "sign": 1}],
                   "warning_days": {"met1": [7, 8, 9]}},
    },
    "S4_sensor_fault": {
        "description": "Right met5 sensor stuck at 25.00 C across two days (would fake a +5 C asymmetry), "
                       "plus 85 C power-on glitches on L hallux and a single-sample spike on L heel.",
        "injections": [],
        "faults": [
            # hours are offsets from the day-window start (12:00 the previous calendar day)
            {"type": "stuck", "foot": "R", "site": "met5", "start_day": 8, "start_hour": 8,
             "end_day": 9, "end_hour": 20, "value": 25.0},
            {"type": "glitch", "foot": "L", "site": "hallux", "day": 5, "hour": 15, "n": 3, "value": 85.0},
            {"type": "spike", "foot": "L", "site": "heel", "day": 6, "hour": 14, "delta": 6.0},
        ],
        "expect": {"alerts": [], "warning_days": {}, "no_warnings": True,
                   "flagged_sensors": [["R", "met5"], ["L", "hallux"], ["L", "heel"]],
                   "insufficient": {"met5": [8, 9]}},
    },
}


def _timeline(start_date: str, n_days: int, interval_min: int, boundary_h: int):
    start = pd.Timestamp(start_date) - pd.Timedelta(days=1) + pd.Timedelta(hours=boundary_h)
    n = int(n_days * 24 * 60 / interval_min)
    ts = start + pd.to_timedelta(np.arange(n) * interval_min, unit="min")
    # day index of each sample: day D covers [start + D days, start + D+1 days)
    day_idx = ((ts - start) / pd.Timedelta(days=1)).astype(int).to_numpy()
    return ts, day_idx


def _sleep_mask(ts, day_idx, n_days, rng) -> np.ndarray:
    """Asleep from ~23:00 (evening before day D) until ~06:30 (morning of day D)."""
    hours_since_start = ((ts - ts[0]) / pd.Timedelta(hours=1)).to_numpy()
    asleep = np.zeros(len(ts), dtype=bool)
    for d in range(n_days):
        bed = d * 24 + 11 + rng.normal(0, 0.5)    # 11 h after noon = 23:00
        wake = d * 24 + 18.5 + rng.normal(0, 0.33)  # 06:30
        asleep |= (hours_since_start >= bed) & (hours_since_start < wake)
    return asleep


def _ar1(n, phi, sigma, rng):
    x = np.zeros(n)
    e = rng.normal(0, sigma, n)
    for i in range(1, n):
        x[i] = phi * x[i - 1] + e[i]
    return x


def _walking(n, steps_per_hour, rng) -> np.ndarray:
    """Intermittent walking bouts: 5-25 min of +0.6..1.5 C every ~20-80 min."""
    x = np.zeros(n)
    i = int(rng.integers(0, steps_per_hour))
    while i < n:
        dur = int(rng.integers(1, 6))
        x[i:i + dur] = rng.uniform(0.6, 1.5)
        i += dur + int(rng.integers(steps_per_hour // 3, steps_per_hour * 4 // 3))
    return x


def _lag(target: np.ndarray, interval_min: int) -> np.ndarray:
    alpha = 1 - np.exp(-interval_min / TAU_MIN)
    out = np.empty_like(target)
    out[0] = target[0]
    for i in range(1, len(target)):
        out[i] = out[i - 1] + alpha * (target[i] - out[i - 1])
    return out


def generate_patient(pid: str, spec: dict, rng: np.random.Generator, cfg: dict = CONFIG,
                     interval_min: int | None = None) -> pd.DataFrame:
    syn, samp = cfg["synthetic"], cfg["sampling"]
    interval_min = interval_min or samp["interval_min"]
    n_days = syn["n_days"]
    ts, day_idx = _timeline(syn["start_date"], n_days, interval_min, samp["day_boundary_hour"])
    n = len(ts)
    steps_per_hour = 60 // interval_min
    asleep = _sleep_mask(ts, day_idx, n_days, rng)

    day_level = 28.0 + rng.normal(0, 0.3) + _ar1(n, 0.97, 0.12, rng) + _walking(n, steps_per_hour, rng)
    night_level = 31.0 + rng.normal(0, 0.2)
    systemic = np.where(asleep, night_level, day_level)

    cols = {}
    for foot in FEET:
        foot_wander = _ar1(n, 0.95, 0.06, rng) * (~asleep)
        for site in SITES:
            lr_offset = float(np.clip(rng.normal(0, 0.15), -0.3, 0.3)) / 2
            target = systemic + SITE_BASE[site] + (lr_offset if foot == "L" else -lr_offset) + foot_wander
            for inj in spec["injections"]:
                if inj["foot"] != foot or inj["site"] != site:
                    continue
                for d, val in inj["days"].items():
                    m = day_idx == int(d)
                    if inj["when"] == "awake":
                        m &= ~asleep
                    target = target + np.where(m, val, 0.0)
            cols[(foot, site)] = _lag(target, interval_min) + rng.normal(0, 0.04, n)

    for f in spec["faults"]:
        x = cols[(f["foot"], f["site"])]
        if f["type"] == "stuck":
            i0 = f["start_day"] * 24 * steps_per_hour + f["start_hour"] * steps_per_hour
            i1 = f["end_day"] * 24 * steps_per_hour + f["end_hour"] * steps_per_hour
            x[i0:i1] = f["value"]
        elif f["type"] == "glitch":
            i0 = f["day"] * 24 * steps_per_hour + f["hour"] * steps_per_hour
            x[i0:i0 + f["n"]] = f["value"]
        elif f["type"] == "spike":
            i0 = f["day"] * 24 * steps_per_hour + f["hour"] * steps_per_hour
            x[i0] += f["delta"]

    frames = []
    for (foot, site), x in cols.items():
        frames.append(pd.DataFrame({"patient_id": pid, "timestamp": ts, "foot": foot,
                                    "site": site, "temp_c": np.round(x, 2)}))
    return pd.concat(frames, ignore_index=True)


def generate_all(cfg: dict = CONFIG, seed: int | None = None) -> pd.DataFrame:
    rng = np.random.default_rng(cfg["synthetic"]["seed"] if seed is None else seed)
    return pd.concat([generate_patient(pid, spec, rng, cfg) for pid, spec in SCENARIOS.items()],
                     ignore_index=True)


def ground_truth(cfg: dict = CONFIG) -> dict:
    start = pd.Timestamp(cfg["synthetic"]["start_date"])
    out = {}
    for pid, spec in SCENARIOS.items():
        out[pid] = {"description": spec["description"], "expect": spec["expect"],
                    "day0_date": str(start.date())}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(ROOT / "data"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    df = generate_all()
    df.to_csv(out / "readings.csv", index=False)
    (out / "ground_truth.json").write_text(json.dumps(ground_truth(), indent=2))
    print(f"wrote {len(df):,} readings for {df.patient_id.nunique()} patients -> {out/'readings.csv'}")


if __name__ == "__main__":
    main()
