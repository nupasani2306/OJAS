#include <Wire.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
// ------------------------------- DEBUG ------------------------------------
// 1 = print status/events to Serial (recommended while testing).
// 0 = silent. Use 0 for battery-powered use with no USB attached.
// Only events are printed (never every 50 Hz sample) so Serial is not flooded.
#define DEBUG_MODE 1
#if DEBUG_MODE
  #define DBG(...) Serial.printf(__VA_ARGS__)
#else
  #define DBG(...) do {} while (0)
#endif
// ------------------------------- PINS (unchanged) -------------------------
#define PIN_SDA     8
#define PIN_SCL     9
#define PIN_SOS     3
#define PIN_MOTOR   10
#define PIN_BAT     4      // optional battery voltage divider (ADC)
// ------------------------------- BLE UUIDs (unchanged) --------------------
#define SERVICE_UUID  "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define VITALS_UUID   "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define ALERT_UUID    "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define COMMAND_UUID  "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
// ------------------------------- SETTINGS ---------------------------------
// ---- Fall detection ON / OFF ----
// false = the band never detects falls and never sends FALL_PENDING / FALL.
//         Heart rate, SpO2, steps and the SOS button keep working.
// true  = fall detection as before.
const bool     FALL_DETECTION_ENABLED = false;
// ---- Fall detection (values unchanged from V1) ----
const float    FREEFALL_G        = 0.5f;    // below this = free-fall
const float    IMPACT_G          = 2.5f;    // above this = impact
const float    HARD_IMPACT_G     = IMPACT_G + 1.0f;  // hard hit without a free-fall phase (same as V1)
const uint32_t FREEFALL_WINDOW   = 500;     // ms allowed between free-fall and impact
const uint32_t STILL_CHECK_MS    = 2000;    // stillness check after impact
const float    MOVE_DEVIATION_G  = 0.25f;   // deviation from 1 g that counts as movement
const int      MOVE_LIMIT        = 15;      // more moving samples than this = not a fall
const uint32_t CANCEL_WINDOW_MS  = 10000;   // time the wearer has to cancel a false alarm
// ---- Fall detection: NEW orientation support (see updateFallDetection) ----
const int      MOVE_LIMIT_AFTER_TURN = 30;  // looser movement limit if the body orientation changed
const float    ORIENT_CHANGE_DEG = 45.0f;   // gravity direction change that counts as "turned"
const float    GRAVITY_REF_ALPHA = 0.02f;   // how slowly the "before the fall" gravity reference adapts
const float    GRAVITY_REF_QUIET_G = 0.10f; // only learn the reference while |mag-1g| is below this
const uint32_t ORIENT_SETTLE_MS  = 500;     // ignore the first 0.5 s after impact for orientation
const float    ORIENT_QUIET_G    = 0.15f;   // post-impact samples used for orientation must be this calm
const int      ORIENT_MIN_SAMPLES = 10;     // need at least this many calm samples, otherwise "unknown"
const uint16_t MPU_FAIL_LIMIT    = 50;      // consecutive failed reads (~1 s) before the fall check is reset
// ---- SOS button ----
const uint32_t SOS_HOLD_MS       = 5000;    // hold this long for manual SOS
const uint32_t BUTTON_DEBOUNCE_MS = 30;     // NEW: contact bounce filter
// ---- MAX30102 (HR + SpO2) ----
// RENAMED from FINGER_IR_MIN. Value unchanged (50000). It was chosen for a
// finger; a WRIST reading is usually weaker, so calibrate it: with DEBUG_MODE 1
// the raw IR value is printed each second. Measure IR with the band OFF the
// skin and ON the wrist, then pick a value between them.
const uint32_t SENSOR_CONTACT_IR_MIN = 50000;
const uint8_t  CONTACT_ON_SAMPLES  = 8;     // NEW: ~0.3 s above threshold before contact is declared
const uint8_t  CONTACT_OFF_SAMPLES = 12;    // NEW: ~0.5 s below threshold before contact is lost
const uint32_t SENSOR_STALL_MS   = 2000;    // NEW: no MAX30102 samples for this long = treat as no contact
const uint32_t VITALS_STALE_MS   = 5000;    // NEW: a reading not refreshed for this long is reported invalid
const int      HR_MIN_BPM        = 30;      // plausibility range (unchanged from V1)
const int      HR_MAX_BPM        = 220;
const int      SPO2_MIN_PCT      = 70;      // V1 accepted > 70 and <= 100
// ---- Step counter (values unchanged; ESTIMATED steps, tune on real wrist data) ----
const float    STEP_HIGH_G       = 0.15f;
const float    STEP_LOW_G        = 0.05f;
const uint32_t STEP_MIN_MS       = 300;
const uint32_t STEP_MAX_MS       = 2000;
const int      STEP_CONFIRM      = 4;
const uint32_t STEP_VIB_SETTLE_MS = 500;    // NEW: ignore steps while the motor runs (+ this long after)
// ---- Battery (optional) ----
const bool     BATTERY_WIRED     = false;   // set true once the divider is installed
const int32_t  BATTERY_EMPTY_MV  = 3300;    // approximation, calibrate against a real discharge curve
const int32_t  BATTERY_FULL_MV   = 4200;
// ---- Alert delivery ----
const uint32_t ALERT_RETRY_MS    = 3000;    // resend interval while BLE is connected (unchanged)
const uint32_t ALERT_GIVEUP_MS   = 120000;  // stop resending for THIS connection after this long (unchanged value)
const uint32_t ALERT_EXPIRE_MS   = 1800000; // NEW: forget an undelivered alert after 30 min
const uint32_t ALERT_MIN_GAP_MS  = 300;     // NEW: minimum time between two alert notifications
const uint32_t ALERT_RECONNECT_DELAY_MS = 1500; // NEW: wait for the app to subscribe before resending
// ---- Loop timing ----
const uint32_t ACCEL_PERIOD_MS   = 20;      // 50 Hz motion sampling (unchanged)
const uint32_t VITALS_PERIOD_MS  = 1000;    // vitals to the app once a second (unchanged)
// ------------------------------- ALERT TYPES ------------------------------
// Plain constants are used (instead of an enum type) so Arduino's automatic
// function prototypes always compile.
const uint8_t ALERT_FALL_PENDING = 0;
const uint8_t ALERT_FALL         = 1;
const uint8_t ALERT_SOS          = 2;
const uint8_t ALERT_CANCELLED    = 3;
const char* const ALERT_NAMES[]  = { "FALL_PENDING", "FALL", "SOS", "CANCELLED" };
// Only FALL and SOS need an ACK, so only they have a "pending" slot.
const int     ALERT_SLOTS = 2;              // slot 0 = FALL, slot 1 = SOS
const uint8_t SLOT_TYPE[ALERT_SLOTS] = { ALERT_FALL, ALERT_SOS };
// ------------------------------- GLOBALS ----------------------------------
MAX30105 particleSensor;
bool     maxOk = false, mpuOk = false;
BLEServer*         pServer = nullptr;
BLECharacteristic* vitalsChar;
BLECharacteristic* alertChar;
BLECharacteristic* commandChar;
// BLE callbacks run on a different task than loop(). They ONLY set these
// flags; loop() does the real work. This avoids race conditions.
volatile bool bleConnected   = false;
volatile bool evtConnected   = false;
volatile bool evtDisconnected = false;
volatile bool cmdCancel      = false;
volatile bool cmdAck         = false;
volatile bool cmdBuzz        = false;
volatile bool cmdResetSteps  = false;
bool     advRestartPending = false;
uint32_t advRestartAtMs    = 0;
// MAX30102 sliding window.
// The sensor is configured for 100 samples/s with 4x hardware averaging, so
// the FIFO delivers 25 samples/s. The SparkFun/Maxim algorithm is built for
// exactly that (FS = 25, 100 samples = 4 s), so do not change setup() rates.
const int VITALS_WINDOW = 100;
const int VITALS_STEP   = 25;               // recompute about once per second
uint32_t irBuf[VITALS_WINDOW], redBuf[VITALS_WINDOW];
int      bufCount = 0;
int32_t  spo2 = 0, heartRate = 0;
int8_t   spo2Valid = 0, hrValid = 0;        // raw flags from the algorithm
bool     sensorContact = false;             // was "fingerOn" in V1
uint8_t  contactOnCount = 0, contactOffCount = 0;
uint32_t lastSampleMs = 0, lastIr = 0;
// Averages of recent valid readings + freshness tracking
const int AVG_N = 4;
int      hrHist[AVG_N] = {0}, spHist[AVG_N] = {0};
int      hrIdx = 0, spIdx = 0;
int      hrAvg = 0, spAvg = 0;
bool     hrFresh = false, spFresh = false;
uint32_t lastHrOkMs = 0, lastSpOkMs = 0;
// Fall detection state machine (states unchanged)
enum FallState { IDLE, FREEFALL, CHECK_STILL, COUNTDOWN };
FallState fallState = IDLE;
uint32_t  fallT0 = 0;
int       moveCount = 0;
float     gravRef[3] = {0, 0, 1};           // unit gravity direction learned BEFORE the event
bool      gravRefValid = false;
float     postSum[3] = {0, 0, 0};           // gravity direction accumulated AFTER the impact
int       postCount = 0;
uint16_t  mpuFailStreak = 0;
// Vibration (non-blocking)
uint32_t vibUntil = 0;
int      vibPattern = 0;                    // 0 = off, 1 = single pulse, 2 = repeating warning
uint32_t motorLastOnMs = 0;
// Button
bool     btnRawLast = false, btnStable = false;
uint32_t btnChangedMs = 0, btnPressMs = 0;
bool     btnLongDone = false;               // SOS already sent for this hold
bool     btnPressedInCountdown = false;     // this press started while a fall was pending
// Pending alerts (FALL / SOS are resent until the app sends ACK)
bool     pendActive[ALERT_SLOTS]       = {false, false};
uint32_t pendRaisedMs[ALERT_SLOTS]     = {0, 0};
uint32_t pendLastSentMs[ALERT_SLOTS]   = {0, 0};
uint32_t pendRetryStartMs[ALERT_SLOTS] = {0, 0};
int      lastSentSlot = -1;                 // which pending alert an ACK refers to
uint32_t lastAlertTxMs = 0;
// Step counter (ESTIMATED steps)
uint32_t steps = 0;
float    stepSmooth = 1.0f;
bool     stepAbove = false;
uint32_t lastStepMs = 0;
int      stepCandidates = 0;
uint32_t lastAccelMs = 0, lastVitalsMs = 0;
// ------------------------------- FORWARD DECLARATIONS ---------------------
void vibrate(int pattern, uint32_t ms = 0);
// ------------------------------- VIBRATION --------------------------------
void vibrate(int pattern, uint32_t ms) {
  vibPattern = pattern;
  vibUntil = millis() + ms;
}
bool isVibrating() { return vibPattern != 0; }
void updateVibration(uint32_t now) {
  bool on = false;
  if (vibPattern == 1) {                            // single pulse
    on = (now < vibUntil);
    if (!on) vibPattern = 0;
  } else if (vibPattern == 2) {                     // 200 ms on / 300 ms off warning
    on = (now % 500) < 200;
  }
  digitalWrite(PIN_MOTOR, on ? HIGH : LOW);
  if (on) motorLastOnMs = now;
}
// ------------------------------- ALERTS -----------------------------------
int slotForType(uint8_t type) {
  for (int i = 0; i < ALERT_SLOTS; i++) if (SLOT_TYPE[i] == type) return i;
  return -1;                                        // FALL_PENDING / CANCELLED need no ACK
}
void sendAlertNotification(uint8_t type) {
  char buf[48];
  snprintf(buf, sizeof(buf), "{\"type\":\"%s\"}", ALERT_NAMES[type]);
  // The value is always stored so the app can also READ the latest alert.
  alertChar->setValue((uint8_t*)buf, strlen(buf));
  if (bleConnected) {
    alertChar->notify();
    lastAlertTxMs = millis();
    int slot = slotForType(type);
    if (slot >= 0) lastSentSlot = slot;             // an ACK now refers to this alert
    DBG("[ALERT] -> %s (notified)\n", buf);
  } else {
    DBG("[ALERT] %s stored, BLE not connected\n", buf);
  }
}
void raiseAlert(uint8_t type) {
  uint32_t now = millis();
  sendAlertNotification(type);
  int slot = slotForType(type);
  if (slot >= 0) {                                  // remember it until the app ACKs
    pendActive[slot] = true;
    pendRaisedMs[slot] = pendLastSentMs[slot] = pendRetryStartMs[slot] = now;
  }
}
// ACK stops the retries of the alert that was most recently sent.
// A repeated ACK (nothing awaiting) is ignored.
void handleAck() {
  if (lastSentSlot < 0) { DBG("[ALERT] ACK ignored (nothing awaiting)\n"); return; }
  pendActive[lastSentSlot] = false;
  DBG("[ALERT] ACK received for %s\n", ALERT_NAMES[SLOT_TYPE[lastSentSlot]]);
  lastSentSlot = -1;
}
// Resend pending alerts. A BLE disconnect does NOT delete a pending alert:
// it stays stored and is resent after reconnecting, until ACK or ALERT_EXPIRE_MS.
void serviceAlerts(uint32_t now) {
  for (int i = 0; i < ALERT_SLOTS; i++) {
    if (!pendActive[i]) continue;
    if (now - pendRaisedMs[i] > ALERT_EXPIRE_MS) {
      pendActive[i] = false;
      if (lastSentSlot == i) lastSentSlot = -1;
      DBG("[ALERT] %s expired without ACK\n", ALERT_NAMES[SLOT_TYPE[i]]);
      continue;
    }
    if (!bleConnected) continue;                                   // keep it stored
    if (now - pendRetryStartMs[i] > ALERT_GIVEUP_MS) continue;     // do not spam this connection forever
    if (now - lastAlertTxMs < ALERT_MIN_GAP_MS) continue;
    if (now - pendLastSentMs[i] >= ALERT_RETRY_MS) {
      pendLastSentMs[i] = now;
      sendAlertNotification(SLOT_TYPE[i]);
    }
  }
}
// After a (re)connect: give every pending alert a fresh retry period and
// schedule the first resend shortly, once the app has had time to subscribe.
void rearmPendingAlerts(uint32_t now) {
  for (int i = 0; i < ALERT_SLOTS; i++) {
    if (!pendActive[i]) continue;
    pendRetryStartMs[i] = now;
    pendLastSentMs[i] = now - ALERT_RETRY_MS + ALERT_RECONNECT_DELAY_MS;
    DBG("[ALERT] %s will be resent after reconnect\n", ALERT_NAMES[SLOT_TYPE[i]]);
  }
}
// ------------------------------- BLE --------------------------------------
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    bleConnected = true;
    evtConnected = true;
  }
  void onDisconnect(BLEServer*) override {
    bleConnected = false;
    evtDisconnected = true;
  }
};
// Only sets flags; loop() executes the command (thread safety).
class CommandCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    String v = c->getValue().c_str();
    v.trim();                                       // tolerate spaces / newlines
    v.toUpperCase();
    if      (v == "CANCEL")     cmdCancel = true;
    else if (v == "ACK")        cmdAck = true;
    else if (v == "BUZZ")       cmdBuzz = true;
    else if (v == "RESETSTEPS") cmdResetSteps = true;
    else DBG("[CMD] unknown command ignored: %s\n", v.c_str());
  }
};
void setupBLE() {
  BLEDevice::init("OJAS-Band");
  BLEDevice::setMTU(247);   // default MTU only fits 20 bytes; our JSON is longer
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCB());
  BLEService* svc = pServer->createService(SERVICE_UUID);
  vitalsChar = svc->createCharacteristic(VITALS_UUID,
                 BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  vitalsChar->addDescriptor(new BLE2902());
  alertChar = svc->createCharacteristic(ALERT_UUID,
                BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  alertChar->addDescriptor(new BLE2902());
  commandChar = svc->createCharacteristic(COMMAND_UUID,
                  BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  commandChar->setCallbacks(new CommandCB());
  svc->start();
  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  DBG("[BLE] advertising as OJAS-Band\n");
}
// Runs in loop(): reacts to connect / disconnect events from the callbacks.
void handleBleEvents(uint32_t now) {
  if (evtConnected) {
    evtConnected = false;
    DBG("[BLE] connected\n");
    rearmPendingAlerts(now);
  }
  if (evtDisconnected) {
    evtDisconnected = false;
    lastSentSlot = -1;                              // an ACK can no longer refer to a delivered alert
    advRestartPending = true;
    advRestartAtMs = now + 300;                     // short pause, then let the phone reconnect
    DBG("[BLE] disconnected\n");
  }
  if (advRestartPending && (int32_t)(now - advRestartAtMs) >= 0) {
    advRestartPending = false;
    BLEDevice::startAdvertising();
    DBG("[BLE] advertising again\n");
  }
}
void cancelFall();
void resetStepState();
void processCommands() {
  if (cmdCancel) {
    cmdCancel = false;
    if (fallState == COUNTDOWN) cancelFall();
    else DBG("[CMD] CANCEL ignored (no fall pending)\n");
  }
  if (cmdAck) {
    cmdAck = false;
    handleAck();
  }
  if (cmdBuzz) {
    cmdBuzz = false;
    // Do not cut off the warning vibration of a pending fall.
    if (fallState != COUNTDOWN) vibrate(1, 400);
  }
  if (cmdResetSteps) {
    cmdResetSteps = false;
    steps = 0;
    resetStepState();
    DBG("[STEPS] reset to 0\n");
  }
}
// ------------------------------- MPU6050 ----------------------------------
#define MPU_ADDR 0x68
const float ACCEL_LSB_PER_G = 4096.0f;              // +/-8 g range
bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}
bool mpuInit() {
  if (!mpuWrite(0x6B, 0x00)) return false;          // wake up
  mpuWrite(0x1C, 0x10);                             // +/-8 g
  mpuWrite(0x1A, 0x03);                             // ~44 Hz low-pass filter
  return true;
}
// V1 returned 1.0 g on a failed read, which hid sensor errors. V2 reports the
// failure so a bad read is never mistaken for "person standing still".
bool readAccel(float& ax, float& ay, float& az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 6) != 6) return false;
  uint8_t b[6];
  for (int i = 0; i < 6; i++) b[i] = Wire.read();
  ax = (int16_t)((b[0] << 8) | b[1]) / ACCEL_LSB_PER_G;
  ay = (int16_t)((b[2] << 8) | b[3]) / ACCEL_LSB_PER_G;
  az = (int16_t)((b[4] << 8) | b[5]) / ACCEL_LSB_PER_G;
  return true;
}
// ------------------------------- FALL DETECTION ---------------------------
void cancelFall() {
  if (fallState != COUNTDOWN) return;
  fallState = IDLE;
  vibrate(0);
  raiseAlert(ALERT_CANCELLED);                      // FALL is never sent after this
  DBG("[FALL] cancelled by user\n");
}
// Learns which way gravity points while the wearer is calm. This is the
// "before the fall" orientation used as an extra validation signal.
void updateGravityReference(float ax, float ay, float az, float mag) {
  if (mag < 0.1f || fabsf(mag - 1.0f) > GRAVITY_REF_QUIET_G) return;
  float u[3] = { ax / mag, ay / mag, az / mag };
  if (!gravRefValid) {
    for (int i = 0; i < 3; i++) gravRef[i] = u[i];
    gravRefValid = true;
    return;
  }
  for (int i = 0; i < 3; i++) gravRef[i] += GRAVITY_REF_ALPHA * (u[i] - gravRef[i]);
}
void beginStillnessCheck(uint32_t now) {
  fallState = CHECK_STILL;
  fallT0 = now;
  moveCount = 0;
  postCount = 0;
  postSum[0] = postSum[1] = postSum[2] = 0;
}
// Did gravity point in a clearly different direction after the impact?
// Returns false (unknown) whenever there is not enough calm data.
bool orientationChangedAfterImpact() {
  if (!gravRefValid || postCount < ORIENT_MIN_SAMPLES) return false;
  float mx = postSum[0] / postCount, my = postSum[1] / postCount, mz = postSum[2] / postCount;
  float n1 = sqrtf(mx * mx + my * my + mz * mz);
  float n2 = sqrtf(gravRef[0] * gravRef[0] + gravRef[1] * gravRef[1] + gravRef[2] * gravRef[2]);
  if (n1 < 0.5f || n2 < 0.5f) return false;
  float c = (mx * gravRef[0] + my * gravRef[1] + mz * gravRef[2]) / (n1 * n2);
  c = constrain(c, -1.0f, 1.0f);
  float deg = acosf(c) * 180.0f / PI;
  DBG("[FALL] orientation change = %.0f deg\n", deg);
  return deg > ORIENT_CHANGE_DEG;
}
// Same 4 states as V1: IDLE -> FREEFALL -> CHECK_STILL -> COUNTDOWN.
//
// Orientation is only a SUPPORTING signal. It can make the movement limit
// looser (a person who turned/rolled and then moves a bit is still likely to
// have fallen) but it can never veto a fall that V1 would have accepted, so
// it cannot create new false negatives. If orientation is unknown, V1 rules
// apply unchanged.
void updateFallDetection(float ax, float ay, float az, float mag, uint32_t now) {
  switch (fallState) {
    case IDLE:
      updateGravityReference(ax, ay, az, mag);
      if (mag < FREEFALL_G) {
        fallState = FREEFALL;
        fallT0 = now;
        DBG("[FALL] free-fall %.2f g\n", mag);
      } else if (mag > HARD_IMPACT_G) {             // hard hit with no free-fall phase
        DBG("[FALL] hard impact %.2f g, validating\n", mag);
        beginStillnessCheck(now);
      }
      break;
    case FREEFALL:
      if (mag > IMPACT_G) {
        DBG("[FALL] impact %.2f g, validating\n", mag);
        beginStillnessCheck(now);
      } else if (now - fallT0 > FREEFALL_WINDOW) {
        fallState = IDLE;                           // no impact followed, ignore
      }
      break;
    case CHECK_STILL: {                             // is the wearer lying still afterwards?
      float dev = fabsf(mag - 1.0f);
      if (dev > MOVE_DEVIATION_G) moveCount++;
      if (now - fallT0 >= ORIENT_SETTLE_MS && dev < ORIENT_QUIET_G && mag > 0.1f) {
        postSum[0] += ax / mag; postSum[1] += ay / mag; postSum[2] += az / mag;
        postCount++;
      }
      if (now - fallT0 > STILL_CHECK_MS) {
        bool turned = orientationChangedAfterImpact();
        int limit = turned ? MOVE_LIMIT_AFTER_TURN : MOVE_LIMIT;
        DBG("[FALL] stillness check: moving samples=%d limit=%d turned=%d\n", moveCount, limit, turned ? 1 : 0);
        if (moveCount <= limit) {
          fallState = COUNTDOWN;
          fallT0 = now;
          vibrate(2);                               // warn the wearer
          raiseAlert(ALERT_FALL_PENDING);           // app shows the cancel screen
          resetStepState();
          DBG("[FALL] pending: SOS button short press or app CANCEL within %lu s\n", (unsigned long)(CANCEL_WINDOW_MS / 1000));
        } else {
          fallState = IDLE;
          DBG("[FALL] movement after impact, false alarm\n");
        }
      }
      break;
    }
    case COUNTDOWN:
      break;                                        // handled by serviceFallCountdown()
  }
}
// Runs every loop, independent of sensor reads, so the 10 s window always ends
// even if the MPU6050 stops answering.
void serviceFallCountdown(uint32_t now) {
  if (fallState == COUNTDOWN && now - fallT0 > CANCEL_WINDOW_MS) {
    fallState = IDLE;
    raiseAlert(ALERT_FALL);                         // automatic emergency alert (needs ACK)
    vibrate(1, 1000);
    DBG("[FALL] not cancelled -> FALL alert sent\n");
  }
}
// ------------------------------- SOS BUTTON -------------------------------
void triggerManualSos() {
  // SOS overrides any fall check in progress. No CANCELLED is sent here on
  // purpose: the app must not dismiss an emergency screen. The app should
  // treat SOS as superseding FALL_PENDING.
  fallState = IDLE;
  raiseAlert(ALERT_SOS);
  vibrate(1, 800);
  DBG("[SOS] manual SOS sent\n");
}
void updateButton(uint32_t now) {
  bool raw = (digitalRead(PIN_SOS) == LOW);
  if (raw != btnRawLast) { btnRawLast = raw; btnChangedMs = now; }
  // Accept a level only after it has been stable for BUTTON_DEBOUNCE_MS.
  if (raw != btnStable && now - btnChangedMs >= BUTTON_DEBOUNCE_MS) {
    btnStable = raw;
    if (btnStable) {                                // press
      btnPressMs = now;
      btnLongDone = false;
      btnPressedInCountdown = (fallState == COUNTDOWN);
    } else {                                        // release
      // Short press cancels ONLY if it also started during the pending fall.
      if (!btnLongDone && btnPressedInCountdown && fallState == COUNTDOWN) cancelFall();
    }
  }
  // Long hold -> exactly one SOS per hold.
  if (btnStable && !btnLongDone && now - btnPressMs >= SOS_HOLD_MS) {
    btnLongDone = true;
    triggerManualSos();
  }
}
// ------------------------------- STEP COUNTER -----------------------------
// ESTIMATED steps: simple threshold method on acceleration magnitude. It is
// not a guaranteed-accuracy pedometer. Tune the STEP_* constants on real wrist data.
void resetStepState() {
  stepAbove = false;
  stepCandidates = 0;
  stepSmooth = 1.0f;
}
void updateSteps(float mag, uint32_t now) {
  // Do not count during a fall event, while the motor is shaking the board,
  // or when the reading is not plausible.
  bool motorBusy = isVibrating() || (now - motorLastOnMs < STEP_VIB_SETTLE_MS);
  if (fallState != IDLE || motorBusy || mag <= 0.0f || mag > 7.5f) {
    resetStepState();
    return;
  }
  stepSmooth += 0.3f * (mag - stepSmooth);          // smooth out vibration noise
  float dev = stepSmooth - 1.0f;                    // movement above gravity
  if (!stepAbove && dev > STEP_HIGH_G) {
    stepAbove = true;
    uint32_t gap = now - lastStepMs;
    if (gap >= STEP_MIN_MS && gap <= STEP_MAX_MS) {
      stepCandidates++;
      if (stepCandidates == STEP_CONFIRM) {
        steps += STEP_CONFIRM;                      // walking confirmed, count the first ones
        DBG("[STEPS] walking detected\n");
      } else if (stepCandidates > STEP_CONFIRM) {
        steps++;
      }
    } else if (gap > STEP_MAX_MS) {
      stepCandidates = 1;                           // long pause, start over
    }
    if (gap >= STEP_MIN_MS) lastStepMs = now;
  } else if (stepAbove && dev < STEP_LOW_G) {
    stepAbove = false;
  }
}
// ------------------------------- BATTERY ----------------------------------
// The percentage is a linear APPROXIMATION between BATTERY_EMPTY_MV and
// BATTERY_FULL_MV. A Li-Po discharge curve is not linear and the value reads
// high while charging, so calibrate it against a real discharge test.
int readBatteryPercent() {
  if (!BATTERY_WIRED) return -1;
  int32_t mv = (int32_t)analogReadMilliVolts(PIN_BAT) * 2;   // x2: 100k/100k divider
  int32_t pct = (mv - BATTERY_EMPTY_MV) * 100 / (BATTERY_FULL_MV - BATTERY_EMPTY_MV);
  return (int)constrain(pct, (int32_t)0, (int32_t)100);      // signed math: no underflow below 3.3 V
}
// ------------------------------- MAX30102 ---------------------------------
int pushAndAverage(int* hist, int& idx, int value) {
  hist[idx] = value;
  idx = (idx + 1) % AVG_N;
  long sum = 0; int n = 0;
  for (int i = 0; i < AVG_N; i++) if (hist[i] > 0) { sum += hist[i]; n++; }
  return n ? (int)(sum / n) : 0;
}
void clearHr() {
  for (int i = 0; i < AVG_N; i++) hrHist[i] = 0;
  hrAvg = 0; hrFresh = false;
}
void clearSpo2() {
  for (int i = 0; i < AVG_N; i++) spHist[i] = 0;
  spAvg = 0; spFresh = false;
}
// Forget everything, so an old value is never shown as a fresh measurement.
void resetVitalsHistory() {
  clearHr();
  clearSpo2();
  hrValid = spo2Valid = 0;
  bufCount = 0;
}
void updateVitalsSensor(uint32_t now) {
  if (!maxOk) return;
  particleSensor.check();
  while (particleSensor.available()) {
    uint32_t red = particleSensor.getFIFORed();
    uint32_t ir  = particleSensor.getFIFOIR();
    particleSensor.nextSample();
    lastSampleMs = now;
    lastIr = ir;
    // Contact detection with hysteresis so one noisy sample cannot flip it.
    bool above = (ir > SENSOR_CONTACT_IR_MIN);
    if (above) {
      contactOffCount = 0;
      if (!sensorContact && ++contactOnCount >= CONTACT_ON_SAMPLES) {
        sensorContact = true;
        contactOnCount = 0;
        resetVitalsHistory();
        DBG("[MAX30102] contact detected (IR=%lu)\n", (unsigned long)ir);
      }
    } else {
      contactOnCount = 0;
      if (sensorContact && ++contactOffCount >= CONTACT_OFF_SAMPLES) {
        sensorContact = false;
        contactOffCount = 0;
        resetVitalsHistory();
        DBG("[MAX30102] contact lost (IR=%lu)\n", (unsigned long)ir);
      }
    }
    if (!sensorContact || !above) continue;         // never feed weak samples to the algorithm
    irBuf[bufCount]  = ir;
    redBuf[bufCount] = red;
    bufCount++;
    if (bufCount == VITALS_WINDOW) {
      maxim_heart_rate_and_oxygen_saturation(irBuf, VITALS_WINDOW, redBuf, &spo2, &spo2Valid, &heartRate, &hrValid);
      bool hrOk = hrValid && heartRate > HR_MIN_BPM && heartRate < HR_MAX_BPM;
      bool spOk = spo2Valid && spo2 > SPO2_MIN_PCT && spo2 <= 100;
      if (hrOk) { hrAvg = pushAndAverage(hrHist, hrIdx, heartRate); hrFresh = true; lastHrOkMs = now; }
      if (spOk) { spAvg = pushAndAverage(spHist, spIdx, spo2);      spFresh = true; lastSpOkMs = now; }
      if (!hrOk || !spOk) DBG("[MAX30102] noisy window: hrOk=%d spo2Ok=%d\n", hrOk ? 1 : 0, spOk ? 1 : 0);
      // sliding window: keep the newest 75 samples, collect 25 new ones
      memmove(irBuf,  irBuf  + VITALS_STEP, (VITALS_WINDOW - VITALS_STEP) * sizeof(uint32_t));
      memmove(redBuf, redBuf + VITALS_STEP, (VITALS_WINDOW - VITALS_STEP) * sizeof(uint32_t));
      bufCount = VITALS_WINDOW - VITALS_STEP;
    }
  }
  // Sensor stopped delivering samples (unplugged / I2C fault): no contact.
  if (sensorContact && now - lastSampleMs > SENSOR_STALL_MS) {
    sensorContact = false;
    resetVitalsHistory();
    DBG("[MAX30102] no samples for %lu ms, treating as no contact\n", (unsigned long)SENSOR_STALL_MS);
  }
  // Readings that were not refreshed recently are dropped, not reported.
  if (hrFresh && now - lastHrOkMs > VITALS_STALE_MS) { clearHr();    DBG("[MAX30102] HR stale, cleared\n"); }
  if (spFresh && now - lastSpOkMs > VITALS_STALE_MS) { clearSpo2();  DBG("[MAX30102] SpO2 stale, cleared\n"); }
}
void sendVitals() {
  bool hrOut = sensorContact && hrFresh && hrAvg > 0;
  bool spOut = sensorContact && spFresh && spAvg > 0;
  char buf[176];
  snprintf(buf, sizeof(buf),
           "{\"hr\":%d,\"spo2\":%d,\"hrValid\":%d,\"spo2Valid\":%d,\"contact\":%d,"
           "\"finger\":%d,\"steps\":%lu,\"bat\":%d}",
           hrOut ? hrAvg : 0, spOut ? spAvg : 0, hrOut ? 1 : 0, spOut ? 1 : 0,
           sensorContact ? 1 : 0, sensorContact ? 1 : 0,
           (unsigned long)steps, readBatteryPercent());
  vitalsChar->setValue((uint8_t*)buf, strlen(buf));
  if (bleConnected) vitalsChar->notify();
  DBG("[VITALS] %s  IR=%lu ble=%d\n", buf, (unsigned long)lastIr, bleConnected ? 1 : 0);
}
// ------------------------------- SETUP / LOOP -----------------------------
void setup() {
  Serial.begin(115200);
  pinMode(PIN_SOS, INPUT_PULLUP);
  pinMode(PIN_MOTOR, OUTPUT);
  digitalWrite(PIN_MOTOR, LOW);
  // If the button is already held at power-up, wait for release before it can act.
  btnRawLast = btnStable = (digitalRead(PIN_SOS) == LOW);
  btnLongDone = btnStable;
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  mpuOk = mpuInit();
  DBG(mpuOk ? "[INIT] MPU6050 OK\n" : "[INIT] MPU6050 NOT FOUND - fall detection and steps disabled\n");
  DBG(FALL_DETECTION_ENABLED ? "[INIT] fall detection ON\n" : "[INIT] fall detection OFF (FALL_DETECTION_ENABLED = false)\n");
  maxOk = particleSensor.begin(Wire, I2C_SPEED_FAST);
  if (maxOk) {
    // ledBrightness, sampleAverage, ledMode (2 = RED+IR), sampleRate, pulseWidth, adcRange
    // 100 samples/s averaged 4x = 25 samples/s into the FIFO, which is what the
    // SparkFun spo2_algorithm expects (FS = 25). Change these and HR will be wrong.
    particleSensor.setup(60, 4, 2, 100, 411, 4096);
    lastSampleMs = millis();
    DBG("[INIT] MAX30102 OK\n");
  } else {
    DBG("[INIT] MAX30102 NOT FOUND - heart rate / SpO2 disabled\n");
  }
  setupBLE();
  // Boot feedback: one pulse = all sensors OK, three pulses = a sensor is missing.
  // (Blocking delay is acceptable here: it runs once, before the main loop.)
  if (mpuOk && maxOk) {
    vibrate(1, 300);
  } else {
    for (int i = 0; i < 3; i++) { digitalWrite(PIN_MOTOR, HIGH); delay(150); digitalWrite(PIN_MOTOR, LOW); delay(150); }
  }
  DBG("[INIT] OJAS V2 ready\n");
}
void loop() {
  uint32_t now = millis();
  handleBleEvents(now);
  processCommands();
  updateVitalsSensor(now);                          // drain the MAX30102 FIFO often
  if (mpuOk && now - lastAccelMs >= ACCEL_PERIOD_MS) {   // 50 Hz motion sampling
    lastAccelMs = now;
    float ax, ay, az;
    if (readAccel(ax, ay, az)) {
      mpuFailStreak = 0;
      float mag = sqrtf(ax * ax + ay * ay + az * az);
      if (FALL_DETECTION_ENABLED) updateFallDetection(ax, ay, az, mag, now);   // skipped when fall detection is OFF
      updateSteps(mag, now);
    } else if (mpuFailStreak < 0xFFFF && ++mpuFailStreak == MPU_FAIL_LIMIT) {
      DBG("[MPU6050] repeated read failures, check wiring\n");
      if (fallState == FREEFALL || fallState == CHECK_STILL) fallState = IDLE;  // do not stay stuck mid-check
    }
  }
  serviceFallCountdown(now);
  if (now - lastVitalsMs >= VITALS_PERIOD_MS) {     // send vitals once a second
    lastVitalsMs = now;
    sendVitals();
  }
  updateButton(now);
  serviceAlerts(now);
  updateVibration(now);
}
