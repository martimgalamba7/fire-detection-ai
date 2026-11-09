// test_fusion.cpp - laptop tests for the MKR fusion library (no hardware needed).
// Checks every row of the fusion table in docs/architecture.md, the UART parser
// and the LoRa payload encoding. A fake camera is simulated by injecting lines.
//
// Run:  ./run_tests.sh      (or see the command inside it)

#include "Arduino.h"
#include "FireFusion.h"

unsigned long g_fakeMillis = 0;
FakeSerial Serial;

static int failures = 0, checks = 0;
#define CHECK(cond)                                                        \
  do {                                                                     \
    checks++;                                                              \
    if (!(cond)) { failures++; printf("  FAIL line %d: %s\n", __LINE__, #cond); } \
  } while (0)

// One fresh setup per test: fake camera port, link, fusion, empty log.
struct Rig {
  FakeSerial cam;
  FakeSerial log;
  CameraLink link{cam, 15000};
  FireFusion fusion;
  explicit Rig(FusionConfig cfg = FusionConfig()) : fusion(link, &log, cfg) { g_fakeMillis = 1000; }

  int captures() const {   // number of CAPTURE commands sent so far
    int n = 0;
    for (size_t p = cam.out.find("CAPTURE\n"); p != std::string::npos; p = cam.out.find("CAPTURE\n", p + 1)) n++;
    return n;
  }
  void tick(bool gas, bool flame, unsigned long ms = 10) { advanceMillis(ms); fusion.update(gas, flame); }
  void camAnswers(const char *line, bool gas, bool flame) { cam.inject(std::string(line) + "\n"); tick(gas, flame); }
};

static void test_no_gas_no_capture() {
  puts("no gas anomaly -> camera never asked (FR01)");
  Rig r;
  for (int i = 0; i < 100; i++) r.tick(false, true);   // even with flame
  CHECK(r.captures() == 0);
  CHECK(r.fusion.state() == FS_IDLE);
}

static void test_gas_and_camera_smoke() {
  puts("gas + camera smoke -> ALARM (CAMERA)");
  Rig r;
  r.tick(true, false);
  CHECK(r.captures() == 1);
  r.camAnswers("RESULT,smoke,0.87,2/3", true, false);
  CHECK(r.fusion.state() == FS_ALARM);
  CHECK(r.fusion.reason() == AR_CAMERA);
  CHECK(r.fusion.lastCamera().votes == 2 && r.fusion.lastCamera().frames == 3);
  CHECK(r.fusion.stateChanged());
  CHECK(!r.fusion.stateChanged());   // reported only once
}

static void test_gas_normal_flame() {
  puts("gas + camera normal + flame -> ALARM (FLAME)");
  Rig r;
  r.tick(true, true);
  r.camAnswers("RESULT,normal,0.91,3/3", true, true);
  CHECK(r.fusion.state() == FS_ALARM);
  CHECK(r.fusion.reason() == AR_FLAME);
}

static void test_suspect_then_persist() {
  puts("gas + normal, no flame -> SUSPECT; gas persists 30 s -> ALARM (GAS_PERSIST)");
  Rig r;
  r.tick(true, false);
  r.camAnswers("RESULT,normal,0.91,3/3", true, false);
  CHECK(r.fusion.state() == FS_SUSPECT);
  r.tick(true, false, 29000);
  CHECK(r.captures() == 1);              // not yet re-checked
  r.tick(true, false, 1500);
  CHECK(r.captures() == 2);              // re-check after 30 s
  r.camAnswers("RESULT,normal,0.88,3/3", true, false);
  CHECK(r.fusion.state() == FS_ALARM);
  CHECK(r.fusion.reason() == AR_GAS_PERSIST);
}

static void test_suspect_recheck_sees_smoke() {
  puts("SUSPECT, re-check sees smoke -> ALARM (CAMERA)");
  Rig r;
  r.tick(true, false);
  r.camAnswers("RESULT,normal,0.91,3/3", true, false);
  r.tick(true, false, 31000);
  r.camAnswers("RESULT,smoke,0.80,3/3", true, false);
  CHECK(r.fusion.state() == FS_ALARM);
  CHECK(r.fusion.reason() == AR_CAMERA);
}

static void test_suspect_gas_gone() {
  puts("SUSPECT, gas gone after 30 s -> IDLE (false trigger filtered)");
  Rig r;
  r.tick(true, false);
  r.camAnswers("RESULT,normal,0.91,3/3", true, false);
  r.tick(false, false, 31000);
  CHECK(r.fusion.state() == FS_IDLE);
  CHECK(r.captures() == 1);
  CHECK(r.log.out.find(",CLEARED,") != std::string::npos);
}

static void test_no_escalation_option() {
  puts("escalateOnPersistentGas = false -> stays SUSPECT (strict two-evidence rule)");
  FusionConfig cfg;
  cfg.escalateOnPersistentGas = false;
  Rig r(cfg);
  r.tick(true, false);
  r.camAnswers("RESULT,normal,0.91,3/3", true, false);
  r.tick(true, false, 31000);
  r.camAnswers("RESULT,normal,0.91,3/3", true, false);
  CHECK(r.fusion.state() == FS_SUSPECT);
}

static void test_camera_timeout() {
  puts("camera does not answer -> timeout, treated like normal -> SUSPECT");
  Rig r;
  r.tick(true, false);
  r.tick(true, false, 16000);
  CHECK(r.fusion.state() == FS_SUSPECT);
  CHECK(!r.fusion.lastCamera().ok);
  CHECK(strcmp(r.fusion.lastCamera().error, "timeout") == 0);
}

static void test_camera_error_with_flame() {
  puts("camera ERROR + flame -> ALARM (FLAME)");
  Rig r;
  r.tick(true, true);
  r.camAnswers("ERROR,capture_failed", true, true);
  CHECK(r.fusion.state() == FS_ALARM);
  CHECK(r.fusion.reason() == AR_FLAME);
  CHECK(strcmp(r.fusion.lastCamera().error, "capture_failed") == 0);
}

static void test_alarm_clears() {
  puts("ALARM clears after 60 s without gas and flame");
  Rig r;
  r.tick(true, false);
  r.camAnswers("RESULT,fire,0.95,3/3", true, false);
  r.tick(false, false, 30000);
  CHECK(r.fusion.state() == FS_ALARM);   // not yet
  r.tick(true, false, 10);               // gas back: timer restarts
  r.tick(false, false, 59000);
  CHECK(r.fusion.state() == FS_ALARM);
  r.tick(false, false, 2000);
  CHECK(r.fusion.state() == FS_IDLE);
}

static void test_parser_robustness() {
  puts("parser ignores boot noise, handles READY and bad lines");
  FakeSerial cam;
  CameraLink link(cam, 15000);
  cam.inject("ets Jun  8 2016 00:22:57\r\nrst:0x1 (POWERON_RESET)\r\nREADY\r\n");
  link.poll();
  CHECK(link.cameraReady());
  CHECK(!link.hasResult());               // nothing was asked
  link.requestCapture();
  cam.inject("garbage line\nRESULT,banana,0.5,1/3\n");
  link.poll();
  CHECK(link.hasResult());
  CameraResult res = link.takeResult();
  CHECK(!res.ok && strcmp(res.error, "bad_label") == 0);
  link.requestCapture();
  cam.inject("RESULT,fire,0.99,3/3\r\n");
  link.poll();
  res = link.takeResult();
  CHECK(res.ok && res.label == CAM_FIRE && res.confidence > 0.98f && res.votes == 3);
  CHECK(link.requestCapture());            // idle again, new request allowed
}

static void test_payload() {
  puts("LoRa payload is 12 bytes with the documented layout (R15)");
  PayloadData p;
  p.state = FS_ALARM; p.reason = AR_CAMERA; p.camLabel = CAM_SMOKE;
  p.camConfidence = 0.87f; p.votes = 2; p.frames = 3;
  p.flame = false; p.gasAnomaly = true;
  p.mq7Raw = 0x0123; p.mq135Raw = 0x0456; p.co2Ppm = 812;
  p.temperatureC = -5; p.batteryMv = 3700;
  uint8_t b[PAYLOAD_SIZE];
  CHECK(encodePayload(p, b) == 12);
  CHECK(b[0] == (2 | 2 << 2 | 0 << 4 | 1 << 5 | 1 << 6));
  CHECK(b[1] == 87);
  CHECK(b[2] == 0x23);
  CHECK(b[3] == 0x01 && b[4] == 0x23);
  CHECK(b[5] == 0x04 && b[6] == 0x56);
  CHECK((b[7] << 8 | b[8]) == 812);
  CHECK((int8_t)b[9] == -5);
  CHECK((b[10] << 8 | b[11]) == 3700);
}

static void test_log_format() {
  puts("FUSION log lines match what evaluation/false_alarm_count.py expects");
  Rig r;
  r.tick(true, false);
  r.camAnswers("RESULT,smoke,0.87,2/3", true, false);
  CHECK(r.log.out.find("FUSION,") == 0);
  CHECK(r.log.out.find(",TRIGGER,IDLE,NONE,") != std::string::npos);
  CHECK(r.log.out.find(",ALARM,ALARM,CAMERA,smoke,0.87,2/3,1,0\n") != std::string::npos);
  printf("%s", r.log.out.c_str());
}

int main() {
  test_no_gas_no_capture();
  test_gas_and_camera_smoke();
  test_gas_normal_flame();
  test_suspect_then_persist();
  test_suspect_recheck_sees_smoke();
  test_suspect_gas_gone();
  test_no_escalation_option();
  test_camera_timeout();
  test_camera_error_with_flame();
  test_alarm_clears();
  test_parser_robustness();
  test_payload();
  test_log_format();
  printf("\n%d checks, %d failed\n", checks, failures);
  return failures ? 1 : 0;
}
