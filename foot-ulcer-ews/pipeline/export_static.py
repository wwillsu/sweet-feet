"""Write the Daily tracker's built-in dataset (data/dashboard.json).

  python -m pipeline.export_static

The dashboard bundles this file, so every profile shows up in the Daily tracker even
when Convex isn't running. Rows have the same shape as the Convex `daily` / `sensors`
tables; when Convex has data for a profile, the dashboard shows that instead.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from pipeline.config import CONFIG, ROOT
from pipeline.generate import SCENARIOS
from pipeline.push_convex import compute, daily_rows, sensor_rows

OUT = ROOT / "data" / "dashboard.json"


def build(readings: pd.DataFrame, cfg: dict = CONFIG) -> dict:
    patients, daily, sensors = [], [], []
    for pid, (d, flags) in compute(readings, cfg).items():
        patients.append({"patientId": pid, "description": SCENARIOS.get(pid, {}).get("description", "")})
        daily += daily_rows(d)
        sensors += sensor_rows(pid, flags, d.date.max(), cfg)
    return {"patients": patients, "daily": daily, "sensors": sensors}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--readings", default=str(ROOT / "data" / "readings.csv"))
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    data = build(pd.read_csv(args.readings, parse_dates=["timestamp"]))
    Path(args.out).write_text(json.dumps(data, separators=(",", ":")))
    print(f"{len(data['patients'])} profiles, {len(data['daily'])} daily rows -> {args.out}")


if __name__ == "__main__":
    main()
