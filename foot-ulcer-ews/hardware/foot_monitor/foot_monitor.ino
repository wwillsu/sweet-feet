#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <ArduinoBLE.h>
#include <ArduinoLowPower.h>
#include <FlashStorage.h>

// ---------------- Which foot ----------------
// Upload once with 'L' to the left board and once with 'R' to the right board.
const char FOOT = 'L';

// ---------------- Settings ----------------
// TEST_MODE: short timings, no sleep, prints live activity to Serial Monitor.
// Set to false for real use on battery.
const bool TEST_MODE = true;

const unsigned long INTERVAL_MS   = TEST_MODE ? 2UL * 60 * 1000 : 60UL * 60 * 1000; // one reading per interval
const unsigned long BLOCK_MS      = TEST_MODE ? 5UL * 1000      : 30UL * 1000;      // activity is measured per block
const int           STILL_BLOCKS  = TEST_MODE ? 4               : 10;               // blocks in a row = still (5 min real)
const unsigned long MAX_SEARCH_MS = TEST_MODE ? 60UL * 1000     : 30UL * 60 * 1000; // give up waiting after this
const unsigned long BLE_WINDOW_MS = TEST_MODE ? 15UL * 1000     : 20UL * 1000;      // how long to wait for the Mac
const unsigned long SUB_WAIT_MS   = 5000;  // how long to wait for the Mac to subscribe
const unsigned long SAMPLE_MS     = 100;   // MPU read rate while searching (10 Hz)
const float         ACT_THRESH    = 0.05;  // block std-dev below this counts as still (RE-TUNE in TEST_MODE)

// Thermistors: top of each divider is powered from THERM_PWR only while reading.
// Four thermistors, T0..T3 on A0..A3.
const int   THERM_PWR    = 2;            // D2
const int   THERM_PINS[] = {A0, A1, A2, A3};
const int   NUM_THERMS   = 4;
const float ADC_MAX   = 1023.0;
const float R_FIXED   = 10000.0;
const float R0        = 10000.0;
const float BETA      = 3950.0;
const float T0        = 298.15;

// ---------------- Storage (kept in flash until sent) ----------------
struct Reading {
  uint32_t tSec;        // seconds since this boot
  int16_t  temp[4];     // degrees C x100, T0..T3
  uint16_t act;         // activity x1000
  uint8_t  still;       // 1 = taken after real stillness, 0 = fallback
  uint8_t  boot;        // boot counter (low byte) so readings from different power-ons can be told apart
};

const int MAX_READINGS = 200;  // ~8 days at one per hour
struct Log {
  uint32_t magic;
  uint16_t count;
  uint16_t bootCount;
  Reading  r[MAX_READINGS];
};
const uint32_t LOG_MAGIC = 0xF007F00C;  // changed: 4 temps + seconds

FlashStorage(logStore, Log);
Log logBuf;

// ---------------- BLE ----------------
BLEService footService("19B10000-E8F2-537E-4F6C-D104768A1214");
// Indications are acknowledged by the Mac, so we know each JSON line arrived
BLEStringCharacteristic dataChar("19B10001-E8F2-537E-4F6C-D104768A1214", BLERead | BLEIndicate, 128);

Adafruit_MPU6050 mpu;

// Time tracking: millis() stops during sleep and wraps at ~49.7 days,
// so keep our own minute counter that never wraps in practice.
unsigned long lastMillis = 0;
unsigned long msAccum    = 0;   // leftover ms not yet rolled into minutes
uint32_t      minutesUp  = 0;

void tick(unsigned long extraSleptMs = 0) {
  unsigned long m = millis();
  msAccum += (m - lastMillis) + extraSleptMs;  // unsigned subtraction handles millis() wrap
  lastMillis = m;
  minutesUp += msAccum / 60000UL;
  msAccum   %= 60000UL;
}

uint64_t nowMs() {
  tick();
  return (uint64_t)minutesUp * 60000ULL + msAccum;
}

uint32_t nowSec() {
  tick();
  return minutesUp * 60UL + msAccum / 1000UL;
}

void nap(unsigned long ms) {
  if (TEST_MODE) {
    delay(ms);
    tick();
  } else {
    LowPower.sleep((uint32_t)ms);
    tick(ms);
  }
}

void setup() {
  Serial.begin(115200);
  if (TEST_MODE) while (!Serial);

  pinMode(THERM_PWR, OUTPUT);
  digitalWrite(THERM_PWR, LOW);

  if (!mpu.begin()) {
    Serial.println("MPU6050 not found, check wiring");
    while (1);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  logBuf = logStore.read();
  if (logBuf.magic != LOG_MAGIC) {
    logBuf.magic = LOG_MAGIC;
    logBuf.count = 0;
    logBuf.bootCount = 0;
  }
  logBuf.bootCount++;
  logStore.write(logBuf);  // remember the new boot number

  lastMillis = millis();
}

// Raw motion sample: total acceleration magnitude and rotation magnitude
void readMotion(float &accMag, float &gyroMag) {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  accMag  = sqrt(a.acceleration.x * a.acceleration.x +
                 a.acceleration.y * a.acceleration.y +
                 a.acceleration.z * a.acceleration.z);
  gyroMag = sqrt(g.gyro.x * g.gyro.x + g.gyro.y * g.gyro.y + g.gyro.z * g.gyro.z);
}

// Returns temperature in C for the given pin (divider must already be powered).
// Ratiometric: uses the ADC ratio directly so battery voltage doesn't matter.
float readThermistorC(int pin) {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogRead(pin);
  float adc = sum / 16.0;
  if (adc <= 0.5 || adc >= ADC_MAX - 0.5) return NAN;  // open or shorted thermistor

  // Thermistor on top, R_FIXED on bottom: Rt = R_FIXED * (ADC_MAX - adc) / adc
  float rt = R_FIXED * (ADC_MAX - adc) / adc;
  return 1.0 / (1.0 / T0 + log(rt / R0) / BETA) - 273.15;
}

void readAllTemps(float temps[]) {
  digitalWrite(THERM_PWR, HIGH);
  delay(10);  // let the dividers settle
  for (int i = 0; i < NUM_THERMS; i++) temps[i] = readThermistorC(THERM_PINS[i]);
  digitalWrite(THERM_PWR, LOW);
}

void fillReading(Reading &out, float temps[], float act, bool still) {
  out.tSec = nowSec();
  for (int i = 0; i < NUM_THERMS; i++) out.temp[i] = isnan(temps[i]) ? -32768 : (int16_t)(temps[i] * 100);
  float scaled = act * 1000.0f;
  out.act = (uint16_t)(scaled > 65535.0f ? 65535.0f : scaled);
  out.still = still ? 1 : 0;
  out.boot = (uint8_t)(logBuf.bootCount & 0xFF);
}

// Waits for STILL_BLOCKS quiet blocks in a row. If that never happens,
// uses the temps taken during the quietest block seen (still = 0).
// Block activity = std-dev of accel magnitude + std-dev of gyro magnitude,
// which ignores constant sensor offsets/bias.
void findStillReading(Reading &out) {
  mpu.enableSleep(false);
  delay(50);

  uint64_t start = nowMs();
  float bestAct = 1e9;
  float bestTemps[NUM_THERMS] = {NAN, NAN, NAN, NAN};
  int stillRun = 0;

  while (nowMs() - start < MAX_SEARCH_MS) {
    float aSum = 0, aSq = 0, gSum = 0, gSq = 0;
    int n = 0;
    uint64_t blockStart = nowMs();
    while (nowMs() - blockStart < BLOCK_MS) {
      float am, gm;
      readMotion(am, gm);
      aSum += am; aSq += am * am;
      gSum += gm; gSq += gm * gm;
      n++;
      nap(SAMPLE_MS);
    }
    float aMean = aSum / n, gMean = gSum / n;
    float aVar = aSq / n - aMean * aMean;
    float gVar = gSq / n - gMean * gMean;
    float blockAct = sqrtf(aVar > 0 ? aVar : 0) + sqrtf(gVar > 0 ? gVar : 0);

    if (TEST_MODE) {
      Serial.print("Activity:"); Serial.print(blockAct, 4);
      Serial.print(",Threshold:"); Serial.println(ACT_THRESH, 4);
    }

    if (blockAct < ACT_THRESH) stillRun++;
    else stillRun = 0;

    if (stillRun >= STILL_BLOCKS) {
      float temps[NUM_THERMS];
      readAllTemps(temps);
      fillReading(out, temps, blockAct, true);
      mpu.enableSleep(true);
      return;
    }

    // keep a candidate from the quietest block in case we never get still
    if (blockAct < bestAct) {
      bestAct = blockAct;
      readAllTemps(bestTemps);
    }
  }

  fillReading(out, bestTemps, bestAct, false);
  mpu.enableSleep(true);
}

// One reading as compact JSON (short keys to stay under 128 bytes):
// {"f":"L","b":3,"t":7500,"T":[31.52,30.20,null,29.90],"a":0.012,"s":1}
String formatReading(const Reading &r) {
  String s = "{\"f\":\"";
  s += FOOT;
  s += "\",\"b\":"; s += String(r.boot);
  s += ",\"t\":"; s += String(r.tSec);
  s += ",\"T\":[";
  for (int i = 0; i < NUM_THERMS; i++) {
    if (i) s += ",";
    s += (r.temp[i] == -32768) ? String("null") : String(r.temp[i] / 100.0, 2);
  }
  s += "],\"a\":"; s += String(r.act / 1000.0, 3);
  s += ",\"s\":"; s += String(r.still);
  s += "}";
  return s;
}

// Sent before the readings so the Mac can turn "seconds since boot" into real clock times:
// {"f":"L","b":3,"now":7620,"n":4}
String formatHeader() {
  String s = "{\"f\":\"";
  s += FOOT;
  s += "\",\"b\":"; s += String(logBuf.bootCount & 0xFF);
  s += ",\"now\":"; s += String(nowSec());
  s += ",\"n\":"; s += String(logBuf.count);
  s += "}";
  return s;
}

void storeReading(const Reading &r) {
  if (logBuf.count >= MAX_READINGS) {
    // full: drop the oldest
    for (int i = 1; i < MAX_READINGS; i++) logBuf.r[i - 1] = logBuf.r[i];
    logBuf.count--;
  }
  logBuf.r[logBuf.count++] = r;
}

// Advertise for a while; if the Mac connects AND subscribes, send a header,
// everything queued as JSON lines, then {"done":N}. Returns true if every line was acknowledged.
bool sendOverBLE() {
  if (!BLE.begin()) {
    Serial.println("BLE failed to start");
    return false;
  }
  String name = String("FootMonitor-") + FOOT;
  BLE.setLocalName(name.c_str());
  BLE.setDeviceName(name.c_str());  // name macOS shows after connecting
  BLE.setAdvertisedService(footService);
  // BLE.end() empties the service's characteristic list, so re-add it every cycle
  footService.addCharacteristic(dataChar);
  BLE.addService(footService);
  BLE.advertise();

  unsigned long start = millis();
  bool sent = false;
  while (millis() - start < BLE_WINDOW_MS && !sent) {
    BLEDevice central = BLE.central();
    if (central && central.connected()) {
      // wait for the Mac to subscribe; don't send into the void
      unsigned long subStart = millis();
      while (central.connected() && !dataChar.subscribed() && millis() - subStart < SUB_WAIT_MS) BLE.poll();

      if (!central.connected() || !dataChar.subscribed()) {
        if (TEST_MODE) Serial.println("Central connected but never subscribed; keeping data");
        central.disconnect();
        continue;
      }

      bool ok = dataChar.writeValue(formatHeader());
      for (int i = 0; ok && i < logBuf.count; i++) {
        if (!central.connected() || !dataChar.subscribed()) { ok = false; break; }
        ok = dataChar.writeValue(formatReading(logBuf.r[i]));  // indication: waits for Mac's confirm
        BLE.poll();
      }
      if (ok && central.connected()) {
        ok = dataChar.writeValue(String("{\"done\":") + String(logBuf.count) + "}");
      }
      // The Mac disconnects as soon as it gets "done", so don't require a live
      // connection here; the indication above already waited for its confirm.
      if (ok) {
        logBuf.count = 0;
        sent = true;
      } else if (TEST_MODE) {
        Serial.println("Transfer interrupted; keeping data for next time");
      }
    }
    BLE.poll();
  }
  BLE.end();
  tick();
  return sent;
}

void loop() {
  uint64_t cycleStart = nowMs();

  Reading r;
  findStillReading(r);
  storeReading(r);

  if (TEST_MODE) {
    Serial.print("Reading: ");
    Serial.println(formatReading(r));
  }

  sendOverBLE();
  logStore.write(logBuf);  // whatever wasn't sent stays in flash

  if (TEST_MODE) {
    Serial.print("Unsent readings in flash: ");
    Serial.println(logBuf.count);
  }

  uint64_t elapsed = nowMs() - cycleStart;
  if (elapsed < INTERVAL_MS) nap((unsigned long)(INTERVAL_MS - elapsed));
}
