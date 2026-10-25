"""Push pipeline output to Convex (the dashboard's backend).

  python -m pipeline.push_convex           # run the pipeline on data/readings.csv, push everything
  python -m pipeline.push_convex --demo    # wipe, then replay one day every demo.seconds_per_day s

Deployment URL: --url, else $CONVEX_URL, else CONVEX_URL / VITE_CONVEX_URL from
.env.local (written by `npx convex dev`). Ingest key: --key, else $INGEST_KEY, else
INGEST_KEY from .env.local (`npm run setup-key` writes it).
Uses Convex's plain HTTP API - no extra deps.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import time
import urllib.error
import urllib.request

import pandas as pd

from pipeline.config import CONFIG, ROOT
from pipeline.faults import sensor_status
from pipeline.generate import SCENARIOS
from pipeline.run import day_of, process_patient


class ConvexHTTP:
    def __init__(self, url: str, key: str | None = None):
        self.url, self.key = url.rstrip("/"), key

    def mutation(self, path: str, **args):
        if self.key:
            args["key"] = self.key
        body = json.dumps({"path": path, "args": args, "format": "json"}).encode()
        req = urllib.request.Request(f"{self.url}/api/mutation", data=body,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                out = json.load(resp)
        except urllib.error.HTTPError as e:
            try:
                out = json.loads(e.read() or b"{}") or {"errorMessage": str(e)}
            except json.JSONDecodeError:
                out = {"errorMessage": str(e)}
        except urllib.error.URLError as e:
            raise SystemExit(f"Can't reach Convex at {self.url} ({e.reason}). Is `npx convex dev` running?")
        if out.get("status") != "success":
            raise RuntimeError(f"{path} failed: {out.get('errorMessage', out)}")
        return out.get("value")


def _env_local() -> dict[str, str]:
    env = ROOT / ".env.local"
    if not env.exists():
        return {}
    vals = dict(line.split("=", 1) for line in env.read_text().splitlines()
                if "=" in line and not line.lstrip().startswith("#"))
    return {k.strip(): v.split("#")[0].strip().strip("'\"") for k, v in vals.items()}


def deployment_url(cli_url: str | None) -> str:
    if cli_url:
        return cli_url
    if os.environ.get("CONVEX_URL"):
        return os.environ["CONVEX_URL"]
    vals = _env_local()
    for k in ("CONVEX_URL", "VITE_CONVEX_URL"):
        if vals.get(k):
            return vals[k]
    raise SystemExit("No Convex URL: run `npx convex dev` first (writes .env.local) or pass --url.")


def ingest_key(cli_key: str | None) -> str | None:
    return cli_key or os.environ.get("INGEST_KEY") or _env_local().get("INGEST_KEY") or None


def _clean(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def daily_rows(daily: pd.DataFrame) -> list[dict]:
    return [{"patientId": r["patient_id"], "date": r["date"], "site": r["site"],
             "leftC": _clean(r["left_c"]), "rightC": _clean(r["right_c"]), "deltaC": _clean(r["delta_c"]),
             "tier": r["tier"], "reason": r["reason"],
             "restStart": _clean(r["rest_start"]), "restEnd": _clean(r["rest_end"]),
             "message": r["message"]} for r in daily.to_dict("records")]


def sensor_rows(pid: str, flags: pd.DataFrame, as_of: str, cfg: dict) -> list[dict]:
    """Sensor status using only samples from day windows up to and including `as_of`."""
    days = day_of(flags.index, cfg).astype(str)
    st = sensor_status(flags[(days <= as_of).to_numpy()], cfg)
    return [{"patientId": pid, "foot": r["foot"], "site": r["site"],
             "faultFraction": float(r["fault_fraction"]), "nRange": int(r["n_range"]),
             "nJump": int(r["n_jump"]), "nStuck": int(r["n_stuck"]), "status": r["status"],
             "lastFault": _clean(r["last_fault"]), "asOf": as_of} for r in st.to_dict("records")]


def compute(readings: pd.DataFrame, cfg: dict) -> dict[str, tuple[pd.DataFrame, pd.DataFrame]]:
    out = {}
    for pid, g in readings.groupby("patient_id", sort=False):
        daily, _, flags = process_patient(g, cfg)
        out[pid] = (daily, flags)
    return out


def push_all(cx: ConvexHTTP, results, cfg: dict):
    for pid, (daily, flags) in results.items():
        cx.mutation("ingest:upsertPatient", patientId=pid, description=SCENARIOS.get(pid, {}).get("description", ""))
        cx.mutation("ingest:upsertDaily", rows=daily_rows(daily))
        cx.mutation("ingest:upsertSensors", rows=sensor_rows(pid, flags, daily.date.max(), cfg))
        print(f"  {pid}: {len(daily)} daily rows, latest {daily.date.max()}")


def replay(cx: ConvexHTTP, results, cfg: dict, seconds_per_day: float):
    cx.mutation("ingest:reset")
    for pid in results:
        cx.mutation("ingest:upsertPatient", patientId=pid, description=SCENARIOS.get(pid, {}).get("description", ""))
    dates = sorted({d for daily, _ in results.values() for d in daily.date})
    for i, date in enumerate(dates):
        rows = [r for daily, _ in results.values() for r in daily_rows(daily[daily.date == date])]
        cx.mutation("ingest:upsertDaily", rows=rows)
        cx.mutation("ingest:upsertSensors",
                    rows=[r for pid, (_, flags) in results.items() for r in sensor_rows(pid, flags, date, cfg)])
        flagged = [f"{r['patientId']}:{r['site']}" for r in rows if r["tier"] == "alert"]
        print(f"  day {i + 1:>2}/{len(dates)}  {date}  alerts: {', '.join(flagged) or '-'}")
        if i < len(dates) - 1:
            time.sleep(seconds_per_day)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--readings", default=str(ROOT / "data" / "readings.csv"))
    ap.add_argument("--url")
    ap.add_argument("--key", help="ingest key (default: $INGEST_KEY or INGEST_KEY in .env.local)")
    ap.add_argument("--demo", action="store_true", help="wipe Convex, then replay day by day")
    ap.add_argument("--seconds-per-day", type=float, default=CONFIG["demo"]["seconds_per_day"])
    ap.add_argument("--reset", action="store_true", help="wipe Convex before pushing (non-demo mode)")
    args = ap.parse_args()

    cx = ConvexHTTP(deployment_url(args.url), ingest_key(args.key))
    readings = pd.read_csv(args.readings, parse_dates=["timestamp"])
    print(f"running pipeline on {args.readings} ...")
    results = compute(readings, CONFIG)
    print(f"pushing to {cx.url}")
    if args.demo:
        replay(cx, results, CONFIG, args.seconds_per_day)
    else:
        if args.reset:
            cx.mutation("ingest:reset")
        push_all(cx, results, CONFIG)
    print("done")


if __name__ == "__main__":
    main()
