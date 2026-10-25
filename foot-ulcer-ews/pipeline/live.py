"""Live demo mode: take a reading every second and push it straight to the dashboard.

  python -m pipeline.live                 # the FootMonitor Arduino over Bluetooth (hardware/foot_monitor)
  python -m pipeline.live --simulate      # simulated insoles, scripted 60 s hotspot story, loops
  python -m pipeline.live --stdin         # other sensors: one line per reading on stdin,
                                          #   10 comma-separated temps in order L hallux..heel, R hallux..heel
  python -m pipeline.live --clear         # wipe the live stream and exit

Arduino: keeps scanning and reconnecting; once connected, the board sends one reading per
second. Which thermistor sits where is set in config.json -> arduino.channels. Sites
without a sensor show as "no data". Don't run hardware/foot_receiver.py at the same time:
the board accepts one connection. Queued readings it uploads are still saved to
hardware/foot_data.json.

DISREGARDS THE RESTING RULE. The normal pipeline only compares left vs right inside
each night's rest window; here every reading is compared immediately, so walking,
touching a sensor, etc. will move dT. That is the point for a demo - it is not how
the screening rule is meant to be used. Out-of-range samples (e.g. 85 C power-on
glitches) are still masked. Alerts need live_demo.alert_consecutive_samples readings
in a row at |dT| >= alert_c, same sign (see pipeline.asymmetry.tier_live).
"""
from __future__ import annotations

import _thread
import argparse
import asyncio
import sys
import threading
import time
from collections import deque

import numpy as np

from pipeline.asymmetry import delta_t, tier_live
from pipeline.config import CONFIG, FEET, SITES
from pipeline.generate import SITE_BASE
from pipeline.push_convex import ConvexHTTP, deployment_url, ingest_key

CYCLE_S = 60
TAU_S = 3.0  # sensor lag, so scripted steps look like real warming


def hotspot_offset(t: float) -> float:
    """Scripted L 1st-met hotspot over a 60 s loop: calm, ramp to +3 C, hold, cool down."""
    s = t % CYCLE_S
    if s < 10:
        return 0.0
    if s < 25:
        return 3.0 * (s - 10) / 15
    if s < 40:
        return 3.0
    if s < 50:
        return 3.0 * (50 - s) / 10
    return 0.0


class SimulatedInsoles:
    def __init__(self, seed: int = 0):
        self.rng = np.random.default_rng(seed)
        self.t0 = time.monotonic()
        self.lr = {s: float(self.rng.normal(0, 0.08)) for s in SITES}
        self.state: dict[tuple[str, str], float] | None = None

    def read(self) -> dict[tuple[str, str], float]:
        t = time.monotonic() - self.t0
        common = 30.0 + 0.4 * np.sin(t / 9)  # slow systemic drift, same on both feet
        target = {}
        for foot in FEET:
            for s in SITES:
                v = common + SITE_BASE[s] + (self.lr[s] if foot == "L" else -self.lr[s])
                if foot == "L" and s == "met1":
                    v += hotspot_offset(t)
                target[(foot, s)] = v
        if self.state is None:
            self.state = dict(target)
        a = 1 - np.exp(-CONFIG["live_demo"]["interval_s"] / TAU_S)
        for k, v in target.items():
            self.state[k] += a * (v - self.state[k])
        return {k: round(v + float(self.rng.normal(0, 0.04)), 2) for k, v in self.state.items()}


class StdinInsoles:
    """Keeps the latest line from stdin; read() returns it once per tick."""
    def __init__(self):
        self.latest: dict[tuple[str, str], float] | None = None
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        cols = [(f, s) for f in FEET for s in SITES]
        for line in sys.stdin:
            try:
                vals = [float(x) for x in line.replace(";", ",").split(",") if x.strip()]
            except ValueError:
                continue
            if len(vals) == len(cols):
                self.latest = dict(zip(cols, vals))

    def read(self):
        return self.latest


def map_channels(temps: list, cfg: dict = CONFIG) -> dict[tuple[str, str], float | None]:
    """Board thermistor i -> the (foot, site) in config arduino.channels; null stays None."""
    return {(foot, site): None if t is None else float(t)
            for (foot, site), t in zip(cfg["arduino"]["channels"], temps)}


class ArduinoInsoles:
    """The FootMonitor board over BLE. read() returns its latest live reading, or None once
    nothing has arrived for arduino.stale_s (the dashboard then shows the stream as paused).
    run() does the Bluetooth side and must own the main thread: CoreBluetooth wants it."""
    def __init__(self, cfg: dict = CONFIG):
        from hardware.foot_receiver import receive_once  # needs bleak; only for real hardware
        self.receive_once, self.cfg = receive_once, cfg
        self.latest: dict[tuple[str, str], float | None] | None = None
        self.at = 0.0

    def _on_live(self, temps):
        self.latest, self.at = map_channels(temps, self.cfg), time.monotonic()

    def read(self):
        if self.latest is None or time.monotonic() - self.at > self.cfg["arduino"]["stale_s"]:
            return None
        return self.latest

    def run(self, max_seconds: float | None = None):
        async def forever():
            while True:
                await self.receive_once(on_live=self._on_live)
                await asyncio.sleep(1)
        try:
            asyncio.run(asyncio.wait_for(forever(), max_seconds))
        except asyncio.TimeoutError:
            pass


def in_range(v: float | None, cfg: dict = CONFIG) -> float | None:
    f = cfg["faults"]
    return v if v is not None and f["range_min_c"] <= v <= f["range_max_c"] else None


def stream(cx: ConvexHTTP, source, cfg: dict = CONFIG, max_seconds: float | None = None):
    interval = cfg["live_demo"]["interval_s"]
    n_hist = cfg["live_demo"]["alert_consecutive_samples"]
    hist = {s: deque(maxlen=n_hist) for s in SITES}
    start = next_t = time.monotonic()
    while max_seconds is None or time.monotonic() - start < max_seconds:
        raw = source.read()
        if raw is not None:
            sites = []
            for s in SITES:
                left, right = in_range(raw.get(("L", s)), cfg), in_range(raw.get(("R", s)), cfg)
                dt = delta_t(left, right)
                hist[s].append(dt)
                tier, reason = tier_live(list(hist[s]), cfg)
                sites.append({"site": s, "leftC": left, "rightC": right,
                              "deltaC": None if dt is None else round(dt, 2), "tier": tier, "reason": reason})
            cx.mutation("ingest:pushLive", t=time.time() * 1000, sites=sites,
                        keepMs=cfg["live_demo"]["history_s"] * 1000)
            top = max(sites, key=lambda r: abs(r["deltaC"] or 0))
            print(f"\r  {time.strftime('%H:%M:%S')}  largest dT {top['deltaC'] or 0:+.2f} C at "
                  f"{top['site']:<6} [{top['tier']}]   ", end="", flush=True)
        next_t += interval
        time.sleep(max(0.0, next_t - time.monotonic()))


def stream_then_stop(*args):
    """stream() in a worker thread; if it ends or fails, stop the Bluetooth loop in main too."""
    try:
        stream(*args)
    except BaseException as e:
        print(f"\n  ! {e}")
    finally:
        _thread.interrupt_main()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url")
    ap.add_argument("--key", help="ingest key (default: $INGEST_KEY or INGEST_KEY in .env.local)")
    src = ap.add_mutually_exclusive_group()
    src.add_argument("--simulate", action="store_true", help="scripted hotspot story instead of the Arduino")
    src.add_argument("--stdin", action="store_true", help="read sensor lines from stdin instead of the Arduino")
    ap.add_argument("--seconds", type=float, help="stop after this many seconds (default: run until Ctrl-C)")
    ap.add_argument("--clear", action="store_true", help="wipe the live stream and exit")
    args = ap.parse_args()

    cx = ConvexHTTP(deployment_url(args.url), ingest_key(args.key))
    cx.mutation("ingest:clearLive")
    if args.clear:
        print("live stream cleared")
        return
    source = "simulated insoles" if args.simulate else "stdin" if args.stdin else "Arduino (Bluetooth)"
    print(f"live demo from {source} -> {cx.url}  "
          f"(rest rule OFF, 1 reading / {CONFIG['live_demo']['interval_s']} s, Ctrl-C to stop)")
    try:
        if args.simulate or args.stdin:
            stream(cx, SimulatedInsoles() if args.simulate else StdinInsoles(), CONFIG, args.seconds)
        else:
            board = ArduinoInsoles()
            threading.Thread(target=stream_then_stop, args=(cx, board, CONFIG, args.seconds), daemon=True).start()
            board.run(args.seconds)
    except KeyboardInterrupt:
        pass
    print("\nstopped")


if __name__ == "__main__":
    main()
