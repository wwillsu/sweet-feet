#!/usr/bin/env python3
"""
Mac receiver for the two FootMonitor boards (FootMonitor-L and FootMonitor-R).

Keeps scanning for any board whose name starts with "FootMonitor" (each one only
advertises ~20 s per cycle). Each upload starts with a header carrying the board's
current uptime, which is used to give every reading a real clock time.
Readings from both feet are appended to foot_data.json.
"""
import asyncio
import json
import os
from datetime import datetime, timedelta

from bleak import BleakClient, BleakScanner

NAME_PREFIX = "FootMonitor"
DATA_UUID   = "19B10001-E8F2-537E-4F6C-D104768A1214"
JSON_PATH   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "foot_data.json")
SITES       = ["T0", "T1", "T2", "T3"]  # A0..A3 on the board


def load_data():
    if os.path.exists(JSON_PATH):
        with open(JSON_PATH) as f:
            return json.load(f)
    return []


def save_data(data):
    tmp = JSON_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, JSON_PATH)  # atomic: never leaves a half-written file


def expand(msg, header, received_at):
    """Turn the board's short keys into readable ones and work out when it was taken."""
    taken_at = None
    # Uptime only means something within the same boot; older-boot readings get no clock time.
    if header is not None and msg["b"] == header["b"]:
        taken_at = (received_at - timedelta(seconds=header["now"] - msg["t"])).isoformat(timespec="seconds")
    return {
        "foot": msg["f"],
        "taken_at": taken_at,
        "received_at": received_at.isoformat(timespec="seconds"),
        "boot": msg["b"],
        "uptime_s": msg["t"],
        "temps_c": dict(zip(SITES, msg["T"])),  # null = sensor fault
        "activity": msg["a"],
        "still": bool(msg["s"]),
    }


async def receive_once():
    print(f"[{datetime.now():%H:%M:%S}] Scanning for {NAME_PREFIX}-L / -R...")
    device = await BleakScanner.find_device_by_filter(
        lambda d, ad: (d.name or ad.local_name or "").startswith(NAME_PREFIX), timeout=30.0)
    if device is None:
        return

    print(f"[{datetime.now():%H:%M:%S}] Found {device.name}, connecting")
    done = asyncio.Event()
    readings = []
    header = None
    expected = None

    def on_disconnect(_client):
        done.set()

    def on_data(_char, data: bytearray):
        nonlocal header, expected
        line = data.decode("utf-8", errors="replace").strip()
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            print(f"  ! bad JSON: {line}")
            return
        if "done" in msg:
            expected = msg["done"]
            done.set()
            return
        if "now" in msg:
            header = {"b": msg["b"], "now": msg["now"], "at": datetime.now()}
            return
        readings.append(expand(msg, header, header["at"] if header else datetime.now()))
        print(f"  {line}")

    try:
        async with BleakClient(device, disconnected_callback=on_disconnect) as client:
            await client.start_notify(DATA_UUID, on_data)  # also subscribes to indications
            try:
                await asyncio.wait_for(done.wait(), timeout=120)
            except asyncio.TimeoutError:
                print("  ! timed out waiting for the board to finish")
    except Exception as e:
        print(f"  ! connection error: {e}")

    if expected is not None and expected != len(readings):
        print(f"  ! board said {expected} readings, got {len(readings)}")

    if readings:
        data = load_data()
        data.extend(readings)
        save_data(data)
        print(f"[{datetime.now():%H:%M:%S}] Saved {len(readings)} readings "
              f"({len(data)} total) to {JSON_PATH}")


async def main():
    while True:
        await receive_once()
        await asyncio.sleep(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
