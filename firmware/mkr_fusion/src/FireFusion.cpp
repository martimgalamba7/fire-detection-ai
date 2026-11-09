#include "FireFusion.h"

FireFusion::FireFusion(CameraLink &camera, Print *log, FusionConfig cfg)
    : _camera(camera), _log(log), _cfg(cfg) {}

void FireFusion::update(bool gasAnomaly, bool flame) {
  _gas = gasAnomaly;
  _flame = flame;
  _camera.poll();

  switch (_step) {
    case WAIT_TRIGGER:
      // FR01: the camera is only asked when the gas sensors see an anomaly.
      if (gasAnomaly) {
        _isRecheck = false;
        log("TRIGGER");          // one gas-anomaly episode starts here
        startCapture();
      }
      break;

    case WAIT_CAMERA:
      if (_camera.hasResult()) {
        _cam = _camera.takeResult();
        evaluate(_cam, flame);
      }
      break;

    case WAIT_RECHECK:
      if (millis() - _timer >= _cfg.recheckAfterMs) {
        if (gasAnomaly) {
          _isRecheck = true;
          startCapture();         // ask the camera again
        } else {
          setState(FS_IDLE, AR_NONE, "CLEARED");   // gas went away: false trigger
          _step = WAIT_TRIGGER;
        }
      }
      break;

    case ALARM_HOLD:
      // Stay in ALARM until gas and flame have been clear for clearAfterMs.
      if (gasAnomaly || flame) {
        _timer = millis();
      } else if (millis() - _timer >= _cfg.clearAfterMs) {
        setState(FS_IDLE, AR_NONE, "CLEARED");
        _step = WAIT_TRIGGER;
      }
      break;
  }
}

void FireFusion::startCapture() {
  _camera.requestCapture();
  _step = WAIT_CAMERA;
}

// Applies the fusion table from docs/architecture.md.
void FireFusion::evaluate(const CameraResult &r, bool flame) {
  bool cameraHazard = r.ok && (r.label == CAM_SMOKE || r.label == CAM_FIRE);

  if (cameraHazard) {
    setState(FS_ALARM, AR_CAMERA, "ALARM");
  } else if (flame) {
    setState(FS_ALARM, AR_FLAME, "ALARM");             // e.g. at night
  } else if (_isRecheck && _gas && _cfg.escalateOnPersistentGas) {
    setState(FS_ALARM, AR_GAS_PERSIST, "ALARM");       // gas persisted for 30 s
  } else if (_isRecheck && !_gas) {
    setState(FS_IDLE, AR_NONE, "CLEARED");
    _step = WAIT_TRIGGER;
    return;
  } else {
    setState(FS_SUSPECT, AR_NONE, "SUSPECT");
    _step = WAIT_RECHECK;
    _timer = millis();
    return;
  }
  _step = ALARM_HOLD;
  _timer = millis();
}

void FireFusion::setState(FusionState s, AlarmReason r, const char *event) {
  if (s != _state || r != _reason) _changed = true;
  _state = s;
  _reason = r;
  log(event);
}

bool FireFusion::stateChanged() {
  bool c = _changed;
  _changed = false;
  return c;
}

void FireFusion::fillPayload(PayloadData &p) const {
  p.state = (uint8_t)_state;
  p.reason = (uint8_t)_reason;
  p.camLabel = (uint8_t)_cam.label;
  p.camConfidence = _cam.ok ? _cam.confidence : 0.0f;
  p.votes = _cam.votes;
  p.frames = _cam.frames;
  p.gasAnomaly = _gas;
  p.flame = _flame;
}

const char *FireFusion::stateName(FusionState s) {
  switch (s) {
    case FS_SUSPECT: return "SUSPECT";
    case FS_ALARM:   return "ALARM";
    default:         return "IDLE";
  }
}

const char *FireFusion::reasonName(AlarmReason r) {
  switch (r) {
    case AR_CAMERA:      return "CAMERA";
    case AR_FLAME:       return "FLAME";
    case AR_GAS_PERSIST: return "GAS_PERSIST";
    default:             return "NONE";
  }
}

// FUSION,<millis>,<event>,<state>,<reason>,<camLabel>,<conf>,<votes>/<frames>,<gas>,<flame>
void FireFusion::log(const char *event) {
  if (!_log) return;
  _log->print("FUSION,");
  _log->print(millis());              _log->print(',');
  _log->print(event);                 _log->print(',');
  _log->print(stateName(_state));     _log->print(',');
  _log->print(reasonName(_reason));   _log->print(',');
  _log->print(_cam.ok ? CameraLink::labelName(_cam.label) : (_cam.error[0] ? _cam.error : "none"));
  _log->print(',');
  _log->print(_cam.confidence, 2);    _log->print(',');
  _log->print(_cam.votes);            _log->print('/');
  _log->print(_cam.frames);           _log->print(',');
  _log->print(_gas ? 1 : 0);          _log->print(',');
  _log->println(_flame ? 1 : 0);
}
