# Sweet Feet: iPhone app

iPhone version of the foot-ulcer early-warning dashboard. It's an Expo (React Native) app that reads
the same Convex backend as the web dashboard in `../foot-ulcer-ews`, live over Wi-Fi.

- **My feet** tab: nightly left/right comparison. It has status tiles, a foot map (tap a sensor), a
  ΔT chart (tap or drag to pick a night), the nights grid and insole health.
- **Live demo** tab: one reading per second with the rest rule off, a live foot map, and a chart you
  can drag to look back.

The app is read-only. It never holds `INGEST_KEY`. Thresholds come from
`../foot-ulcer-ews/config.json`, which `npm start` copies in.

## Requirements

- The `foot-ulcer-ews` folder next to this one, set up as described in its README.
- Node ≥ 20 (`nvm use 22`).
- An iPhone with **Expo Go** from the App Store, on the **same Wi-Fi** as the Mac. Xcode isn't needed.

## Run it

```bash
# 1. Backend + data (in ../foot-ulcer-ews)
nvm use && npm run dev                               # terminal 1: Convex backend on port 3210
npm run setup-key                                    # once per machine
.venv/bin/python -m pipeline.push_convex --demo      # terminal 2: replay 14 nights
.venv/bin/python -m pipeline.live                    # optional: fills the Live demo tab

# 2. The app (in this folder)
nvm use 22
npm install          # first time only
npm start            # prints the backend URL + a QR code
```

Scan the QR code with the iPhone Camera app. It opens in Expo Go. If iOS asks for **Local Network**
access, allow it.

`npm start` points the app at this Mac's Wi-Fi address (`http://<mac-ip>:3210`) and writes it to
`.env.local`. Always start with `npm start`, not `npx expo start`, so that address stays current.
To use a different backend, run `CONVEX_URL=http://<host>:3210 npm start`.

## Troubleshooting

- **Red "Can't reach …" banner**: the phone can't reach the backend. Check that `npm run dev` is
  running, that both devices are on the same Wi-Fi, and that the network doesn't isolate clients
  (some venue and guest networks do). Fallback: use your phone's hotspot for both devices, then
  restart `npm start` so it picks up the new IP.
- **QR code won't connect**: run `npx expo start --tunnel`. The tunnel only covers the app bundle, so
  the phone still needs to reach the backend on port 3210.
- **`xcrun simctl … code 72` in the log**: harmless. Expo looked for iOS simulators, and there aren't
  any without Xcode.

## Checks

```bash
npm run typecheck
npm run lint
npx expo-doctor
```

## Building a real app later

Use EAS to build an installable `.ipa` in the cloud. It needs an Apple Developer account but no local
Xcode: `npx eas-cli@latest build -p ios`. For a production build, point `EXPO_PUBLIC_CONVEX_URL` at
an HTTPS Convex cloud deployment, and add authentication before using real patient data.

## Known audit findings

`npm audit` reports `node-forge` and `zod` advisories. Both come from `@expo/cli`, the dev-machine
tooling. Neither is bundled into the app, and no patched `node-forge` has been released yet.
