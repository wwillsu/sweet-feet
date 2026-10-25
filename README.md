# Sweet Feet

Smart insoles that compare left and right plantar temperature to give early warning of diabetic foot
ulcers. If one spot stays ≥ 2.2 °C warmer than the same spot on the other foot for 2 consecutive days
at rest, the apps raise an alert. This is a screening aid, not a diagnosis.

| Folder | What it is |
| --- | --- |
| [`foot-ulcer-ews/`](foot-ulcer-ews) | Arduino firmware, Python pipeline, Convex backend and the React web dashboard. **Start here.** |
| [`FootTemp/`](FootTemp) | Native SwiftUI iPhone app (Xcode, iOS 17+) |
| [`foot-ulcer-ews-ios/`](foot-ulcer-ews-ios) | Expo / React Native iPhone app (runs in Expo Go, no Xcode needed) |

All three read the same Convex backend, which runs locally on your Mac (port 3210). The iPhone apps
reach it over the same Wi-Fi network. Each folder's README has setup and run instructions.

## Quick start

```bash
cd foot-ulcer-ews
nvm use && npm install
python3.11 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
npm run dev                                         # terminal 1: backend + web dashboard
npm run setup-key                                   # once per machine
.venv/bin/python -m pipeline.push_convex --demo     # terminal 2: replay 14 days of data
```
