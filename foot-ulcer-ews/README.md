# Foot ulcer early-warning system

Smart insoles compare left and right plantar temperature at 5 sites. If one spot stays
≥ 2.2 °C warmer than the same spot on the other foot for 2 consecutive days at rest (same side),
the dashboard raises an alert. This is a screening aid, not a diagnosis.

```
hardware/foot_monitor/   Arduino firmware (thermistors + MPU6050, BLE upload)
hardware/foot_receiver.py   Mac BLE receiver -> hardware/foot_data.json (also used by the live demo)
pipeline/                Python: synthetic data, fault masking, rest window, ΔT tiers, push to Convex
convex/                  Backend: schema, ingest mutations (write), dashboard queries (read)
dashboard/               React + Vite dashboard (Daily tracker + Live demo tabs)
config.json              Every threshold, shared by the pipeline and the dashboard
data/dashboard.json      Daily tracker data bundled into the dashboard (python -m pipeline.export_static)
```

## Requirements

- **Node ≥ 20** (Convex needs it; `.nvmrc` pins 22). Run `nvm use` first, because the default shell Node is 18.
- **Python 3.11** with the project venv. Call `.venv/bin/python` directly: on this Mac, `python` is
  aliased to the system Python 3.9, which doesn't have the dependencies.

## First-time setup

```bash
nvm use                                   # Node 22
npm install
python3.11 -m venv .venv                  # skip if .venv already exists
.venv/bin/python -m pip install -r requirements.txt
```

## Run the demo

The **Daily tracker** works on its own: every profile is bundled into the dashboard from
`data/dashboard.json`, so it shows all 14 nights even when Convex and the live demo aren't running
(the header then says "Saved data"). Data pushed to Convex replaces the bundled data for that profile.

**Terminal 1: backend and dashboard**

```bash
nvm use
npm run dev          # starts the local Convex backend (port 3210), then opens the dashboard
```

**Once per machine, while `npm run dev` is running:** create the shared write key.

```bash
npm run setup-key    # generates INGEST_KEY, sets it on Convex, saves it to .env.local
```

**Terminal 2: load data** (from the project root)

```bash
.venv/bin/python -m pipeline.push_convex --demo    # wipe, then replay 14 days, one every 6 s
# or
.venv/bin/python -m pipeline.push_convex --reset   # load everything at once
```

In the **Daily tracker** tab, pick "Developing hotspot" from the "Data" dropdown (next to the day picker). It turns to Warning on
Oct 18–20, then to Alert from Oct 21. The "Faulty sensor" profile shows the
fault guard: a stuck sensor is flagged instead of raising an alert.

**Live demo tab** (one reading per second, rest rule off; needs `npm run dev`):

```bash
.venv/bin/python -m pipeline.live               # connect to the FootMonitor Arduino and track; Ctrl-C to stop
.venv/bin/python -m pipeline.live --simulate    # no board: simulated 60 s hotspot story, loops
.venv/bin/python -m pipeline.live --stdin       # other sensors: 10 comma-separated temps per line
.venv/bin/python -m pipeline.live --clear       # wipe the live stream
```

With the Arduino, `pipeline.live` keeps scanning until the board advertises (in TEST_MODE it stays
connectable for most of each 2-minute cycle), saves any queued readings to `hardware/foot_data.json`,
then shows a reading every second. The board has 3 thermistors; `config.json` → `arduino.channels`
says which foot and site each one is on (default: T0 = left 1st met, T1 = right 1st met,
T2 = left heel). Sites without a sensor show "no data". Stop `hardware/foot_receiver.py` first:
the board takes one connection at a time.

## Tests and validation

```bash
.venv/bin/python -m pytest -q        # 59 unit tests + scenario validation summary
npm run typecheck
.venv/bin/python -m pipeline.generate   # regenerate data/readings.csv (seed 42)
.venv/bin/python -m pipeline.run        # write data/daily.csv, alerts.csv, sensor_status.csv
.venv/bin/python -m pipeline.export_static   # rebuild data/dashboard.json (the Daily tracker's bundled data)
```

## Security

Writes go through public Convex mutations (`convex/ingest.ts`) guarded by a shared `INGEST_KEY`.
Every write without the right key is refused, on every deployment. The local backend listens on all
network interfaces, so without the key anyone on the same Wi-Fi could wipe or forge data.
`npm run setup-key` creates the key. The Python scripts read it from `.env.local`, `$INGEST_KEY`
or `--key`.

`INGEST_KEY` has no `VITE_`/`EXPO_PUBLIC_` prefix, so it is never bundled into the dashboard or the
iPhone app (both are read-only). Reads
(`convex/dashboard.ts`) are public: anyone who can reach the deployment can see the data. That is
fine for the synthetic demo data, but add Convex auth before storing real patient data.

## iPhone apps

- `../FootTemp`: native SwiftUI Xcode project. See its README.
- `../foot-ulcer-ews-ios`: Expo / React Native version that runs in Expo Go without Xcode.

## Hardware (optional)

1. Flash `hardware/foot_monitor/foot_monitor.ino` (see `hardware/FIX_BLE_CHARACTERISTIC.md`). Reflash after
   pulling: the live demo needs the board's live streaming (`streamLive`).
2. Run `.venv/bin/python hardware/foot_receiver.py`. It scans continuously and appends validated
   readings to `hardware/foot_data.json`.
