#!/usr/bin/env python3
"""
Mac receiver for the FootMonitor Arduino.

Keeps scanning for the board (it only advertises ~20 s per cycle). It is matched by
its service UUID, because macOS often shows it by its default name "Arduino"
rather than the advertised "FootMonitor".
Each reading arrives as a JSON line; uploads are appended to foot_data.json
as a list of readable objects.

pipeline/live.py (the dashboard's live demo) reuses receive_once(on_live=...): it stays
connected after the upload and gets the board's once-a-second {"live":[...]} readings.
"""
import asyncio
import json
import os
from datetime import datetime

from bleak import BleakClient, BleakScanner

DEVICE_NAME = "FootMonitor"
SERVICE_UUID = "19b10000-e8f2-537e-4f6c-d104768a1214"
DATA_UUID   = "19B10001-E8F2-537E-4F6C-D104768A1214"
JSON_PATH   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "foot_data.json")
TRANSFER_TIMEOUT_S = 120.0  # 200 queued readings take ~10 s over indications; generous margin
HANGUP_GRACE_S = 3.0  # after {"done"}, let the BOARD disconnect: if the Mac hangs up first,
                      # the board thinks the transfer failed and resends everything next time
MAX_PER_CONNECTION = 250  # the board queues at most 200; anything beyond is not our board
NUM_THERMS = 3


def load_data():
    if not os.path.exists(JSON_PATH):
        return []
    try:
        with open(JSON_PATH) as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        backup = f"{JSON_PATH}.corrupt-{datetime.now():%Y%m%d-%H%M%S}"
        os.replace(JSON_PATH, backup)
        print(f"  ! {JSON_PATH} unreadable ({e}); moved to {backup}")
        return []
    return [r for r in data if isinstance(r, dict) and valid_saved(r)] if isinstance(data, list) else []


def reading_key(r):
    """A reading is identified by its boot number and minute; resends repeat both."""
    return (r["boot"], r["time_min"], tuple(r["temps_c"]))


def dedupe(data):
    seen, out = set(), []
    for r in data:
        if reading_key(r) not in seen:
            seen.add(reading_key(r))
            out.append(r)
    return out


def save_data(data):
    tmp = JSON_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, JSON_PATH)  # atomic: never leaves a half-written file


def _num(x, lo, hi):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and lo <= x <= hi


def valid_temps(temps) -> bool:
    return (isinstance(temps, list) and len(temps) == NUM_THERMS
            and all(t is None or _num(t, -100, 200) for t in temps))


def valid_msg(msg) -> bool:
    """Shape/range check on one BLE line; anything nearby can advertise our name or UUID."""
    return (isinstance(msg, dict)
            and _num(msg.get("b"), 0, 255) and _num(msg.get("t"), 0, 2**32 - 1)
            and valid_temps(msg.get("T"))
            and _num(msg.get("a"), 0, 100) and msg.get("s") in (0, 1, True, False))


def valid_saved(r) -> bool:
    return valid_msg({"b": r.get("boot"), "t": r.get("time_min"), "T": r.get("temps_c"),
                      "a": r.get("activity"), "s": r.get("still")})


def expand(msg, received_at):
    """Turn the board's short keys into readable ones."""
    return {
        "received_at": received_at,
        "boot": msg["b"],
        "time_min": msg["t"],
        "temps_c": msg["T"],          # [T0, T1, T2], null = sensor fault
        "activity": msg["a"],
        "still": bool(msg["s"]),
    }


def store(readings, expected):
    if expected is not None and expected != len(readings):
        print(f"  ! board said {expected} readings, got {len(readings)}")
    if not readings:
        return
    data = load_data()
    before = len(data)
    data = dedupe(data + readings)
    save_data(data)
    new = len(data) - before
    dup = f", {len(readings) - new} already saved" if new < len(readings) else ""
    print(f"[{datetime.now():%H:%M:%S}] Saved {new} new readings{dup} "
          f"({len(data)} total) to {JSON_PATH}")


async def receive_once(on_live=None):
    """One connection: save the board's queued readings. With on_live, stay connected
    afterwards and call on_live(temps) for each live reading until the board hangs up."""
    print(f"[{datetime.now():%H:%M:%S}] Scanning for {DEVICE_NAME}...")
    device = await BleakScanner.find_device_by_filter(
        lambda d, adv: SERVICE_UUID in [u.lower() for u in adv.service_uuids]
        or DEVICE_NAME in (adv.local_name, d.name),
        timeout=30.0)
    if device is None:
        return

    print(f"[{datetime.now():%H:%M:%S}] Found it, connecting")
    done = asyncio.Event()          # board sent {"done":N}, or the link dropped
    disconnected = asyncio.Event()
    readings = []
    expected = None

    def on_disconnect(_client):
        disconnected.set()
        done.set()

    def on_data(_char, data: bytearray):
        nonlocal expected
        line = data.decode("utf-8", errors="replace").strip()
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            print(f"  ! bad JSON: {line}")
            return
        if isinstance(msg, dict) and "live" in msg:
            if on_live and valid_temps(msg["live"]):
                on_live(msg["live"])
            return
        if isinstance(msg, dict) and "done" in msg:
            expected = msg["done"]
            done.set()
            return
        if not valid_msg(msg):
            print(f"  ! ignoring malformed reading: {line[:80]}")
            return
        if len(readings) >= MAX_PER_CONNECTION:
            print("  ! too many readings in one connection; ignoring the rest")
            done.set()
            return
        readings.append(expand(msg, datetime.now().isoformat(timespec="seconds")))
        print(f"  {line}")

    try:
        async with BleakClient(device, disconnected_callback=on_disconnect) as client:
            await client.start_notify(DATA_UUID, on_data)  # also subscribes to indications
            try:
                await asyncio.wait_for(done.wait(), timeout=TRANSFER_TIMEOUT_S)
            except asyncio.TimeoutError:
                print("  ! timed out waiting for the board to finish")
            store(readings, expected)  # now: a live session can last a long time
            readings, expected = [], None
            if on_live and not disconnected.is_set():
                print(f"[{datetime.now():%H:%M:%S}] Streaming live readings")
                await disconnected.wait()  # the board stops when its live time is up
            else:
                try:
                    await asyncio.wait_for(disconnected.wait(), timeout=HANGUP_GRACE_S)
                except asyncio.TimeoutError:
                    pass
    except Exception as e:
        print(f"  ! connection error: {e}")

    store(readings, expected)


async def main():
    while True:
        await receive_once()
        await asyncio.sleep(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
