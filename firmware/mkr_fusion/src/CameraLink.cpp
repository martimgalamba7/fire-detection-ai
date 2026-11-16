#include "CameraLink.h"

CameraLink::CameraLink(Stream &port, unsigned long timeoutMs)
    : _port(port), _timeoutMs(timeoutMs) {}

// Checksum (security requirement SEC8): XOR of all message characters,
// sent as "*XX" after the message, e.g. "CAPTURE*44". See docs/uart-protocol.md.
uint8_t CameraLink::checksum(const char *s, size_t len) {
  uint8_t c = 0;
  for (size_t i = 0; i < len; i++) c ^= (uint8_t)s[i];
  return c;
}

void CameraLink::sendCommand(const char *cmd) {
  char cs[4];
  snprintf(cs, sizeof(cs), "*%02X", checksum(cmd, strlen(cmd)));
  _port.print(cmd);
  _port.print(cs);
  _port.print('\n');
}

// Returns 1 = valid checksum (stripped), 0 = no checksum, -1 = wrong checksum.
int CameraLink::verifyAndStrip(char *line) {
  char *star = strrchr(line, '*');
  if (!star) return 0;
  if (strlen(star + 1) != 2) return -1;
  unsigned int expected = (unsigned int)strtoul(star + 1, nullptr, 16);
  size_t len = star - line;
  *star = '\0';
  return checksum(line, len) == expected ? 1 : -1;
}

bool CameraLink::requestCapture() {
  if (_waiting) return false;
  while (_port.available()) _port.read();   // drop old bytes
  _len = 0;
  sendCommand("CAPTURE");
  _sentAt = millis();
  _waiting = true;
  _hasResult = false;
  return true;
}

void CameraLink::sendPing() { sendCommand("PING"); }

void CameraLink::poll() {
  while (_port.available()) {
    char c = _port.read();
    if (c == '\r') continue;
    if (c == '\n') {
      _buf[_len] = '\0';
      handleLine(_buf);
      _len = 0;
    } else if (_len < sizeof(_buf) - 1) {
      _buf[_len++] = c;
    }
    // characters beyond the buffer are dropped; the line will not parse
  }

  // millis() subtraction is overflow-safe for unsigned values.
  if (_waiting && millis() - _sentAt > _timeoutMs) {
    CameraResult r = {};
    r.ok = false;
    strncpy(r.error, "timeout", sizeof(r.error) - 1);
    finish(r);
  }
}

CameraResult CameraLink::takeResult() {
  _hasResult = false;
  return _result;
}

const char *CameraLink::labelName(CameraLabel l) {
  switch (l) {
    case CAM_NORMAL: return "normal";
    case CAM_SMOKE:  return "smoke";
    case CAM_FIRE:   return "fire";
    default:         return "none";
  }
}

void CameraLink::finish(const CameraResult &r) {
  _result = r;
  _hasResult = true;
  _waiting = false;
}

// Parses one line from the camera. Lines without a checksum (e.g. ESP32 boot
// text) are ignored. A line with a wrong checksum ends a running request with
// the error "bad_checksum", so the fusion logic never trusts corrupted data.
void CameraLink::handleLine(char *line) {
  int cs = verifyAndStrip(line);
  if (cs == 0) return;
  if (cs < 0) {
    if (_waiting) {
      CameraResult r = {};
      strncpy(r.error, "bad_checksum", sizeof(r.error) - 1);
      finish(r);
    }
    return;
  }
  if (strcmp(line, "READY") == 0 || strcmp(line, "PONG") == 0) {
    _ready = true;
    return;
  }

  if (strncmp(line, "ERROR,", 6) == 0) {
    if (strcmp(line + 6, "camera_init") == 0) _ready = false;
    if (!_waiting) return;               // unsolicited error: nothing to finish
    CameraResult r = {};
    r.ok = false;
    strncpy(r.error, line + 6, sizeof(r.error) - 1);
    finish(r);
    return;
  }

  if (strncmp(line, "RESULT,", 7) == 0 && _waiting) {
    // Expected: RESULT,<label>,<conf>,<k>/<n>
    char *label = strtok(line + 7, ",");
    char *conf  = strtok(nullptr, ",");
    char *votes = strtok(nullptr, ",");
    CameraResult r = {};
    if (!label || !conf || !votes) {
      strncpy(r.error, "bad_result", sizeof(r.error) - 1);
      finish(r);
      return;
    }
    if (strcmp(label, "fire") == 0)        r.label = CAM_FIRE;
    else if (strcmp(label, "smoke") == 0)  r.label = CAM_SMOKE;
    else if (strcmp(label, "normal") == 0) r.label = CAM_NORMAL;
    else { strncpy(r.error, "bad_label", sizeof(r.error) - 1); finish(r); return; }

    r.confidence = atof(conf);
    char *slash = strchr(votes, '/');
    r.votes = atoi(votes);
    r.frames = slash ? atoi(slash + 1) : 0;
    r.ok = true;
    _ready = true;
    finish(r);
  }
}
