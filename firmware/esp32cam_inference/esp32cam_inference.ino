/*
 * esp32cam_inference.ino
 * Fire Detection System - camera node (AI part)
 *
 * What it does (FR01-FR05):
 *   1. Waits in standby (Wi-Fi/Bluetooth off, 80 MHz) for "CAPTURE\n" from the MKR.
 *   2. Takes NUM_FRAMES pictures and classifies each one (fire / smoke / normal).
 *   3. Votes over the frames and answers "RESULT,<label>,<conf>,<k>/<n>\n".
 *      Only text leaves the camera, never the image.
 *
 * Protocol: docs/uart-protocol.md     Settings: config.h
 *
 * Board: "AI Thinker ESP32-CAM" (esp32 core by Espressif), PSRAM enabled.
 * Upload: IO0 to GND, reset/replug, upload, remove the jumper, replug.
 *         The MKR wires can stay connected: the link uses GPIO13/14, not U0R/U0T.
 */

#include <Arduino.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "config.h"
#include "camera_pins.h"
#include "classifier.h"

HardwareSerial &Link = Serial2;   // UART to the MKR
static bool cameraOk = false;

// Labels as they appear on the wire.
static const char *LABEL_FIRE = "fire";
static const char *LABEL_SMOKE = "smoke";
static const char *LABEL_NORMAL = "normal";

// ---------------------------------------------------------------------------
// Output helpers: protocol lines go to the MKR (and to USB when debugging).
// ---------------------------------------------------------------------------
void sendLine(const String &line) {
  Link.print(line);
  Link.print('\n');
#if ACCEPT_DEBUG_COMMANDS
  Serial.println(line);
#endif
}

void debug(const String &msg) {
#if DEBUG_PRINT
  Serial.println("[dbg] " + msg);
#endif
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM;  c.pin_d1 = Y3_GPIO_NUM;  c.pin_d2 = Y4_GPIO_NUM;  c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM;  c.pin_d5 = Y7_GPIO_NUM;  c.pin_d6 = Y8_GPIO_NUM;  c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM;  c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM;  c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = CAM_FRAME_SIZE;
  c.jpeg_quality = CAM_JPEG_QUALITY;
  c.fb_count = 1;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;   // always the newest frame, never a stale one

  if (esp_camera_init(&c) != ESP_OK) return false;

  // Throw away a few frames so auto-exposure / white balance can settle.
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  return true;
}

// ---------------------------------------------------------------------------
// CAPTURE: take frames, classify, vote, answer.
// ---------------------------------------------------------------------------
void handleCapture() {
  if (!cameraOk) { sendLine("ERROR,camera_init"); return; }

  unsigned long t0 = millis();
  FrameScores s[NUM_FRAMES];
  mockNextCapture();

  for (int i = 0; i < NUM_FRAMES; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) { sendLine("ERROR,capture_failed"); return; }

    ClassifyStatus st = classifyFrame(fb, s[i]);
    esp_camera_fb_return(fb);   // always give the buffer back

    if (st == CLASSIFY_DECODE_FAILED)    { sendLine("ERROR,decode_failed"); return; }
    if (st == CLASSIFY_INFERENCE_FAILED) { sendLine("ERROR,inference_failed"); return; }

    debug("frame " + String(i + 1) + ": fire=" + String(s[i].fire, 2) +
          " smoke=" + String(s[i].smoke, 2) + " normal=" + String(s[i].normal, 2));
    if (i < NUM_FRAMES - 1) delay(FRAME_INTERVAL_MS);
  }

  // --- Voting (see docs/uart-protocol.md) ---
  int hazardVotes = 0, normalTop = 0;
  float sumFire = 0, sumSmoke = 0, sumNormal = 0;
  for (int i = 0; i < NUM_FRAMES; i++) {
    float hazard = max(s[i].fire, s[i].smoke);
    if (hazard >= CONFIDENCE_THRESHOLD) {
      hazardVotes++;
      sumFire += s[i].fire;
      sumSmoke += s[i].smoke;
    }
    if (s[i].normal >= s[i].fire && s[i].normal >= s[i].smoke) normalTop++;
    sumNormal += s[i].normal;
  }

  const char *label;
  float conf;
  int votes;
  if (hazardVotes >= MIN_VOTES) {
    bool isFire = sumFire >= sumSmoke;          // tie -> fire (the worse case)
    label = isFire ? LABEL_FIRE : LABEL_SMOKE;
    conf = (isFire ? sumFire : sumSmoke) / hazardVotes;
    votes = hazardVotes;
  } else {
    label = LABEL_NORMAL;
    conf = sumNormal / NUM_FRAMES;
    votes = normalTop;
  }

  sendLine(String("RESULT,") + label + "," + String(conf, 2) + "," +
           String(votes) + "/" + String(NUM_FRAMES));
  debug("capture took " + String(millis() - t0) + " ms");
}

// ---------------------------------------------------------------------------
// Line reader: collects characters until '\n'. One instance per serial port.
// ---------------------------------------------------------------------------
struct LineReader {
  static const int MAX_LEN = 48;
  char buf[MAX_LEN + 1];
  int len = 0;
  bool overflow = false;

  // Returns true when a complete line is in buf.
  bool poll(Stream &in) {
    while (in.available()) {
      char ch = in.read();
      if (ch == '\r') continue;
      if (ch == '\n') {
        buf[len] = '\0';
        bool wasOverflow = overflow;
        len = 0;
        overflow = false;
        if (wasOverflow) { sendLine("ERROR,line_too_long"); continue; }
        return true;
      }
      if (len < MAX_LEN) buf[len++] = ch; else overflow = true;
    }
    return false;
  }
};

LineReader linkReader, usbReader;

void handleCommand(const char *cmd) {
  if (strcmp(cmd, "CAPTURE") == 0)      handleCapture();
  else if (strcmp(cmd, "PING") == 0)    sendLine("PONG");
  else if (strlen(cmd) == 0)            return;   // empty line: ignore
  else                                  sendLine("ERROR,unknown_command");
}

// Discard bytes that arrived while we were busy (protocol: MKR waits for an answer).
void flushInput(Stream &in) { while (in.available()) in.read(); }

// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);                                        // USB debug
  Link.begin(LINK_BAUD, SERIAL_8N1, LINK_RX_PIN, LINK_TX_PIN); // MKR link

  // Standby power saving (NFR01): no radio, lower CPU clock.
  WiFi.mode(WIFI_OFF);
  btStop();
  setCpuFrequencyMhz(80);

  cameraOk = initCamera();
  debug(String("model: ") + (USE_MOCK_MODEL ? "MOCK" : "Edge Impulse"));
  sendLine(cameraOk ? "READY" : "ERROR,camera_init");
}

void loop() {
  if (linkReader.poll(Link)) {
    setCpuFrequencyMhz(240);          // full speed for inference
    handleCommand(linkReader.buf);
    setCpuFrequencyMhz(80);
    flushInput(Link);
  }
#if ACCEPT_DEBUG_COMMANDS
  if (usbReader.poll(Serial)) {
    setCpuFrequencyMhz(240);
    handleCommand(usbReader.buf);
    setCpuFrequencyMhz(80);
    flushInput(Serial);
  }
#endif
  delay(5);   // idle: let the CPU rest
}
