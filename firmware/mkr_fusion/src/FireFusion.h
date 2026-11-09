// FireFusion.h - combines gas anomaly, camera and flame sensor into one state (R11).
// Rules: docs/architecture.md "Fusion rule".
//
// Non-blocking: call fusion.update(gasAnomaly, flame) every loop().
// Csaba's code decides what "gasAnomaly" means (thresholds, R9/R10).
//
// Every state change is printed as a log line, for evaluation/false_alarm_count.py:
//   FUSION,<millis>,<event>,<state>,<reason>,<camLabel>,<conf>,<votes>/<frames>,<gas>,<flame>
#pragma once
#include <Arduino.h>
#include "CameraLink.h"
#include "CameraSerial.h"
#include "LoraPayload.h"

enum FusionState : uint8_t { FS_IDLE = 0, FS_SUSPECT = 1, FS_ALARM = 2 };
enum AlarmReason : uint8_t { AR_NONE = 0, AR_CAMERA = 1, AR_FLAME = 2, AR_GAS_PERSIST = 3 };

struct FusionConfig {
  unsigned long recheckAfterMs = 30000;   // SUSPECT -> re-check delay
  unsigned long clearAfterMs = 60000;     // ALARM ends after gas+flame clear this long
  bool escalateOnPersistentGas = true;    // SUSPECT + gas still there -> ALARM
};

class FireFusion {
public:
  FireFusion(CameraLink &camera, Print *log = &Serial, FusionConfig cfg = FusionConfig());

  // Call every loop(). Also polls the camera link.
  void update(bool gasAnomaly, bool flame);

  FusionState state() const { return _state; }
  AlarmReason reason() const { return _reason; }
  const CameraResult &lastCamera() const { return _cam; }

  // True once after the state changed. Use it to send a LoRa message only on changes.
  bool stateChanged();

  // Fill a LoRa payload with the fusion fields (sensor fields are filled by the caller).
  void fillPayload(PayloadData &p) const;

  static const char *stateName(FusionState s);
  static const char *reasonName(AlarmReason r);

private:
  enum Step : uint8_t { WAIT_TRIGGER, WAIT_CAMERA, WAIT_RECHECK, ALARM_HOLD };

  void startCapture();
  void evaluate(const CameraResult &r, bool flame);
  void setState(FusionState s, AlarmReason r, const char *event);
  void log(const char *event);

  CameraLink &_camera;
  Print *_log;
  FusionConfig _cfg;

  Step _step = WAIT_TRIGGER;
  FusionState _state = FS_IDLE;
  AlarmReason _reason = AR_NONE;
  bool _changed = false;
  bool _isRecheck = false;
  bool _gas = false, _flame = false;
  unsigned long _timer = 0;
  CameraResult _cam = {};
};
