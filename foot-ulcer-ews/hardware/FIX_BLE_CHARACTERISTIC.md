# Fix: Mac connects but "Characteristic 19B10001-… was not found"

For the Claude working on the FootMonitor sketch (`foot_monitor.ino`) on the machine the board is plugged into.

## Symptom

The Mac finds the board and connects every cycle, but `foot_receiver.py` fails each time with:

```
! connection error: Characteristic 19B10001-E8F2-537E-4F6C-D104768A1214 was not found!
```

A GATT dump from the Mac (bleak) shows the service with **no characteristics**:

```
found 2EC65305-C5E4-D222-CA57-F2FFAC5902A2 Arduino
 service 19b10000-e8f2-537e-4f6c-d104768a1214 Unknown
 mtu 242
```

## Root cause

`sendOverBLE()` calls `BLE.begin()` … `BLE.end()` every cycle and only adds the characteristic once:

```cpp
static bool charAdded = false;  // the service keeps its characteristic across BLE.end()
if (!charAdded) {
  footService.addCharacteristic(dataChar);
  charAdded = true;
}
BLE.addService(footService);
```

That comment is wrong. In ArduinoBLE, `BLE.end()` → `GATTClass::end()` → `clearAttributes()` calls `clear()` on every registered service, and `BLELocalService::clear()` does `_characteristics.clear()`. So after the first `BLE.end()`, `footService` has no characteristics, the guard stops them being re-added, and every later cycle advertises an empty service. (Sources: `src/utility/GATT.cpp` and `src/local/BLELocalService.cpp` in arduino-libraries/ArduinoBLE.)

## Fix

In `sendOverBLE()`, replace the block above with:

```cpp
  BLE.setLocalName("FootMonitor");
  BLE.setDeviceName("FootMonitor");  // GAP name; otherwise macOS lists the board as "Arduino"
  BLE.setAdvertisedService(footService);
  // BLE.end() empties every service's characteristic list (GATT clearAttributes ->
  // BLELocalService::clear), so the characteristic must be re-added every cycle.
  footService.addCharacteristic(dataChar);
  BLE.addService(footService);
```

The only changes are removing the `charAdded` guard and adding `setDeviceName`. Re-adding the characteristic each cycle is safe because `clear()` drops the pointers without releasing them, so nothing is freed and re-adding just re-registers the same global object.

## Second fix: the same reading is resent every cycle

After the first fix, the Mac received data, but got the same reading on every connection (`{"b":1,"t":0,…}` saved 5 times in 12 s). At the end of `sendOverBLE()` the queue is only cleared if `ok && central.connected()`. The Mac disconnects as soon as it has confirmed `{"done":N}`, so `central.connected()` is often already false, the board treats a completed transfer as interrupted, and it resends. The indication confirmation already proves delivery, so drop the connection check:

```cpp
      if (ok && central.connected()) {
        ok = dataChar.writeValue(String("{\"done\":") + String(logBuf.count) + "}");
      }
      // The Mac confirmed {"done"}, so everything arrived. Don't also require
      // central.connected(): the Mac may hang up right after confirming.
      if (ok) {
        logBuf.count = 0;
        sent = true;
      } else if (TEST_MODE) {
```

The Mac receiver has also been changed to stay connected for up to 3 s after `{"done"}` and to drop duplicate readings, so it works even before this fix is uploaded.

## Use the complete sketch, not the Google Doc

The Google Doc copy of the sketch is missing several lines (`THERM_PWR`/`THERM_PINS`, the `magic`/`count`/`bootCount` fields of `struct Log`, most of `tick()`, the start of `setup()`, part of `findStillReading`, the end of `storeReading`, and `BLE.end()`), so it doesn't compile. Use the complete local `foot_monitor.ino` and apply only the change above. Check that the board pins (`THERM_PWR = 2`, `THERM_PINS = {A0, A1, A2}`) match the wiring.

## Verify

1. Compile and upload. Keep the Serial Monitor open at 115200 baud, because with `TEST_MODE = true` the sketch waits in `setup()` until Serial is connected.
2. Close nRF Connect, LightBlue or any other BLE app, and turn off the PC's own connection to the board. The board accepts only one central at a time.
3. Within about 2 minutes, the Mac's receiver should print:
   ```
   Found it, connecting
     {"b":…,"t":…,"T":[…],"a":…,"s":1}
   Saved N readings (N total) to …/foot_data.json
   ```
   and the Serial Monitor should report `Unsent readings in flash: 0`.
4. If the Mac still reports the characteristic missing after the fixed upload, macOS may be holding a stale GATT cache. Turn Bluetooth off and on on the Mac and retry.

## Related, lower priority

- The characteristic's max size is 64 bytes. Normal lines are about 55 bytes, but extreme values (`t` past 9,999,999 minutes, temperatures like `-327.67`) can reach 71 bytes, which ArduinoBLE truncates into invalid JSON while still counting the line as sent. The negotiated MTU is 242, so raising the size in the `dataChar` declaration to 80 is safe.
- `logStore.write()` runs every cycle (every 2 min in TEST_MODE). SAMD21 flash endures about 10,000 writes, so don't leave TEST_MODE running for weeks.
