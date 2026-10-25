# Sweet Feet hardware

Firmware for the insole boards and the Mac Bluetooth receiver.

## Hardware (per foot)

- Arduino Nano 33 IoT
- MPU-6050 accelerometer on I2C: SDA = A4, SCL = A5, VCC = 3.3V, GND
- 4 x 10k NTC thermistors (B = 3950), T0..T3 on A0..A3, each wired as a voltage divider:
  `D2 -> thermistor -> analog pin -> 10k resistor -> GND`
- A4/A5 are taken by I2C. A 5th thermistor would go on A6.

D2 powers the dividers only while reading, to save battery.

## Flashing the boards

1. Install the Arduino IDE 2.x and, in Boards Manager, **Arduino SAMD Boards**.
2. Install these libraries: Adafruit MPU6050, ArduinoBLE, Arduino Low Power, FlashStorage.
3. Update the board's Bluetooth firmware once: **Tools -> Firmware Updater**, latest WiFiNINA firmware
   (3.0.0 or newer). Without this, `BLE.begin()` fails.
4. Open `foot_monitor/foot_monitor.ino`, select **Tools -> Board -> Arduino Nano 33 IoT**.
5. Set `const char FOOT = 'L';` and upload to the left board. Change it to `'R'` and upload to the right board.
   They advertise as `FootMonitor-L` and `FootMonitor-R`.
6. Close the Serial Monitor before uploading, or the upload fails with "No device found".

`TEST_MODE = true` (default) uses short timings and prints to the Serial Monitor (115200 baud), and waits
for the Serial Monitor to open before starting. Set it to `false` for battery use.

## How it works

- Each cycle (2 min in TEST_MODE, 1 h normally) the board waits until the foot has been still for a few
  minutes (accelerometer), then reads all 4 thermistors. Walking warms the foot, so readings taken while
  moving would cause false alarms.
- Readings are queued in flash, so they survive power loss, then sent over BLE as JSON when the Mac connects.
- BLE uses indications (the Mac confirms each line); the board only clears its queue once the Mac confirms.

Each upload is: a header, the readings, then a done marker.

```
{"f":"L","b":1,"now":7620,"n":1}
{"f":"L","b":1,"t":7500,"T":[31.52,30.20,null,29.90],"a":0.012,"s":1}
{"done":1}
```

`f` foot, `b` boot counter, `t`/`now` seconds since boot, `T` temps in C (T0..T3, `null` = sensor
fault), `a` activity, `s` 1 if taken after real stillness.

## Receiving on the Mac

```bash
pip3 install bleak
python3 foot_receiver.py
```

Allow Terminal to use Bluetooth when macOS asks (System Settings -> Privacy & Security -> Bluetooth).
The script scans for both boards and appends readings to `hardware/foot_data.json`:

```json
{
  "foot": "L",
  "taken_at": "2026-10-24T19:42:10",
  "received_at": "2026-10-24T19:44:05",
  "boot": 1,
  "uptime_s": 7500,
  "temps_c": {"T0": 31.52, "T1": 30.2, "T2": null, "T3": 29.9},
  "activity": 0.012,
  "still": true
}
```

`taken_at` uses the Mac's clock and the header's uptime; it is `null` for readings left over from a
previous power-on.

Troubleshooting: if it keeps scanning, close other BLE apps (nRF Connect, LightBlue) and turn phone
Bluetooth off; the board accepts one connection at a time. If it reports a missing characteristic,
toggle the Mac's Bluetooth off and on.

**Note:** this 4-sensor, two-board version replaces the earlier 3-sensor firmware. `pipeline/live.py`
still expects the old receiver (`receive_once(on_live=...)` and 3 temps) and needs updating to match.
