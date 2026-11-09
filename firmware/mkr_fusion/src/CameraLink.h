// CameraLink.h - non-blocking client for the ESP32-CAM UART protocol.
// Protocol: docs/uart-protocol.md
//
// Usage:
//   link.requestCapture();          // sends "CAPTURE\n"
//   ... call link.poll() in loop() ...
//   if (link.hasResult()) { CameraResult r = link.takeResult(); ... }
#pragma once
#include <Arduino.h>

enum CameraLabel : uint8_t { CAM_NONE = 0, CAM_NORMAL = 1, CAM_SMOKE = 2, CAM_FIRE = 3 };

struct CameraResult {
  bool ok;              // true = RESULT line received, false = ERROR or timeout
  CameraLabel label;    // CAM_NONE when !ok
  float confidence;     // 0.0 - 1.0
  uint8_t votes;        // k in "k/n"
  uint8_t frames;       // n in "k/n"
  char error[24];       // reason when !ok, e.g. "timeout", "capture_failed"
};

class CameraLink {
public:
  explicit CameraLink(Stream &port, unsigned long timeoutMs = 15000);

  bool requestCapture();       // false if a request is already running
  void sendPing();
  void poll();                 // call often from loop()

  bool busy() const { return _waiting; }
  bool hasResult() const { return _hasResult; }
  CameraResult takeResult();   // clears hasResult()
  bool cameraReady() const { return _ready; }   // READY or PONG seen

  static const char *labelName(CameraLabel l);

private:
  void handleLine(char *line);
  void finish(const CameraResult &r);

  Stream &_port;
  unsigned long _timeoutMs;
  unsigned long _sentAt = 0;
  bool _waiting = false;
  bool _hasResult = false;
  bool _ready = false;
  CameraResult _result;
  char _buf[49];
  uint8_t _len = 0;
};
