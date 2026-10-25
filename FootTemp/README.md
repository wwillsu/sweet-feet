# Sweet Feet: native iOS app (Xcode)

SwiftUI version of the foot-ulcer early-warning dashboard. It reads the same Convex backend as the web
dashboard in `../foot-ulcer-ews` and refreshes every second over Wi-Fi.

- **Daily tracker**: daily resting left/right comparison. It has a profile picker ("Healthy feet",
  "Developing hotspot", "Faulty sensor"), a day stepper, status tiles, alert boxes, a tappable foot
  map, a Swift Charts ΔT graph (touch to pick a day), the every-day grid and sensor health. **It works
  offline:** the profiles are bundled in the app (`dashboard.json`), and Convex data replaces a
  profile's bundled data whenever the backend is reachable. The header shows "Saved data" or
  "Updated … ago".
- **Live demo**: one reading per second from the Arduino (`pipeline.live`) or the simulator
  (`pipeline.live --simulate`), with the rest rule off. Sites without a thermistor show "no data".
  This tab needs the backend.
- **Settings** (gear icon): the backend address and connection status.

It has no third-party dependencies (SwiftUI, Swift Charts, URLSession) and needs iOS 17 or later. The
app is read-only: it calls the public `dashboard:*` queries and never holds `INGEST_KEY`.

## One-time Xcode setup

1. Xcode 26 doesn't include the iOS platform. Open **Xcode › Settings › Components** and click **Get**
   next to iOS 26.5 (about 8 GB). This also installs the iPhone simulators. From the terminal:
   `xcodebuild -downloadPlatform iOS`.
2. Optional: make this Xcode the default for command-line tools:
   `sudo xcode-select -s /Applications/Xcode.app`.

## Run it

```bash
# 1. Backend + data (in ../foot-ulcer-ews)
nvm use && npm run dev                               # terminal 1: Convex on port 3210
npm run setup-key                                    # once per machine
.venv/bin/python -m pipeline.push_convex --demo      # terminal 2: replay 14 days
.venv/bin/python -m pipeline.live --simulate         # optional: Live demo tab (drop --simulate for the Arduino)

# 2. Point the app at this Mac and sync thresholds + bundled data from the web app
#    (re-run when you change Wi-Fi or rebuild data/dashboard.json, then rebuild in Xcode)
cd ../FootTemp && scripts/configure.sh

# 3. Open in Xcode
open FootTemp.xcodeproj
```

**Simulator:** pick an iPhone simulator and press ⌘R.

**Your iPhone:**
1. Plug in the iPhone, or pair it over Wi-Fi.
2. Select it as the run destination.
3. Under **Signing & Capabilities**, choose your Team. A free Apple ID works. If the bundle ID
   `com.calhacks.foottemp` is taken, change it to something unique.
4. Press ⌘R.
5. On the phone, trust the developer under **Settings › General › VPN & Device Management**.
6. Allow **Local Network** access when iOS asks.

The phone must be on the same Wi-Fi as the Mac. If venue Wi-Fi blocks device-to-device traffic, use
your phone's hotspot for the Mac, re-run `scripts/configure.sh` and rebuild. You can also change the
address in the app's Settings.

## How it's wired

| File | Role |
|---|---|
| `Store.swift` | Polls `dashboard:overview` / `dashboard:patient` (Daily tracker tab) or `dashboard:live` (Live tab) once per second, only while the app is in the foreground |
| `ConvexAPI.swift` | `POST /api/query` against Convex's HTTP API |
| `Models.swift` | Codable mirrors of `convex/schema.ts` |
| `SavedData.swift` + `dashboard.json` | Bundled Daily tracker data, copied from `../foot-ulcer-ews/data/dashboard.json` by `scripts/configure.sh` |
| `config.json` | Thresholds, copied from `../foot-ulcer-ews/config.json` by `scripts/configure.sh` |
| `Config.xcconfig` | Default backend URL, written by `scripts/configure.sh`, read via `ConvexURL` in `FootTemp-Info.plist` |
| `FootTemp-Info.plist` | Allows plain HTTP only to local-network hosts (`NSAllowsLocalNetworking`), plus the Local Network prompt text |

The project uses Xcode's synchronized folders: any file added to `FootTemp/` is picked up
automatically, without editing the project file.

## Simulator screenshots (debug builds only)

`simctl` can't tap or scroll, so debug builds read three environment variables:

```bash
SIMCTL_CHILD_FT_TAB=live SIMCTL_CHILD_FT_PROFILE=S1_hotspot SIMCTL_CHILD_FT_SCROLL=chart \
  xcrun simctl launch booted com.calhacks.foottemp
```

`FT_SCROLL` accepts `map`, `chart` or `sensors`. Release builds compile these hooks out.

## Production notes

Plain HTTP is only allowed to local-network addresses. For a real deployment, point the app at an
HTTPS Convex cloud URL and add authentication before storing real patient data. The read queries are
public today.
