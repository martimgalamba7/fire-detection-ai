// classifier.h - one function, classifyFrame(), that hides whether we use the
// real Edge Impulse model or a mock. The main sketch does not care which.
#pragma once

#include <Arduino.h>
#include "esp_camera.h"
#include "config.h"

// Scores for one frame (softmax output, sums to ~1.0).
struct FrameScores {
  float fire;
  float smoke;
  float normal;
};

// Error codes for classifyFrame(). The names match the ERROR reasons in the protocol.
enum ClassifyStatus { CLASSIFY_OK, CLASSIFY_DECODE_FAILED, CLASSIFY_INFERENCE_FAILED };

#if USE_MOCK_MODEL
// ===========================================================================
// MOCK MODEL: fake but realistic-looking scores.
// It cycles through scenarios so that every CAPTURE gives a different outcome:
//   0: clear smoke      -> RESULT,smoke,...,3/3
//   1: fire             -> RESULT,fire,...
//   2: normal           -> RESULT,normal,...
//   3: borderline smoke -> some frames below threshold (tests voting)
// ===========================================================================
static uint32_t mockCaptureCount = 0;   // incremented by the sketch per CAPTURE

inline void mockNextCapture() { mockCaptureCount++; }

inline float mockNoise() { return (float)random(-5, 6) / 100.0f; }  // +-0.05

inline ClassifyStatus classifyFrame(camera_fb_t *fb, FrameScores &out) {
  (void)fb;  // image is not used by the mock
  float f, s;
  switch (mockCaptureCount % 4) {
    case 0:  f = 0.05f; s = 0.88f; break;
    case 1:  f = 0.82f; s = 0.12f; break;
    case 2:  f = 0.03f; s = 0.07f; break;
    default: f = 0.05f; s = 0.70f; break;  // around the threshold
  }
  f = constrain(f + mockNoise(), 0.0f, 1.0f);
  s = constrain(s + mockNoise(), 0.0f, 1.0f - f);
  out.fire = f;
  out.smoke = s;
  out.normal = 1.0f - f - s;
  return CLASSIFY_OK;
}

#else
// ===========================================================================
// REAL MODEL: Edge Impulse Arduino library.
// TODO: replace the include below with the header of the exported library
//       (Edge Impulse > Deployment > Arduino library, then
//        "Sketch > Include Library > Add .ZIP Library").
//       The header is named <project-name>_inferencing.h
// ===========================================================================
#include <Challenge3_PassionChallenge_FireDetectionSystem_inferencing.h>   // Edge Impulse export (model v2)
#include "edge-impulse-sdk/dsp/image/image.hpp"

// RGB888 buffer for the full camera frame (320x240x3 = 230 kB, lives in PSRAM).
static uint8_t *rgbBuf = nullptr;
// Buffer for the model input (e.g. 96x96x3).
static uint8_t *modelBuf = nullptr;

// Edge Impulse asks for the image as packed RGB floats (0xRRGGBB per pixel).
static int eiGetData(size_t offset, size_t length, float *outPtr) {
  size_t px = offset * 3;
  for (size_t i = 0; i < length; i++) {
    outPtr[i] = (modelBuf[px] << 16) + (modelBuf[px + 1] << 8) + modelBuf[px + 2];
    px += 3;
  }
  return 0;
}

// Find a class by name in the model output, so the label order in Edge Impulse
// does not matter.
static float scoreFor(const ei_impulse_result_t &r, const char *name) {
  for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (strcmp(r.classification[i].label, name) == 0) return r.classification[i].value;
  }
  return 0.0f;
}

inline ClassifyStatus classifyFrame(camera_fb_t *fb, FrameScores &out) {
  if (!rgbBuf)   rgbBuf   = (uint8_t *)ps_malloc(fb->width * fb->height * 3);
  if (!modelBuf) modelBuf = (uint8_t *)ps_malloc(EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT * 3);
  if (!rgbBuf || !modelBuf) return CLASSIFY_DECODE_FAILED;

  // 1. JPEG -> RGB888
  if (!fmt2rgb888(fb->buf, fb->len, fb->format, rgbBuf)) return CLASSIFY_DECODE_FAILED;

  // 2. Crop the centre and resize to the model input.
  //    Matches "Fit shortest axis" resize mode in Edge Impulse (set it there!).
  ei::image::processing::crop_and_interpolate_rgb888(
      rgbBuf, fb->width, fb->height,
      modelBuf, EI_CLASSIFIER_INPUT_WIDTH, EI_CLASSIFIER_INPUT_HEIGHT);

  // 3. Run the classifier.
  signal_t signal;
  signal.total_length = EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT;
  signal.get_data = &eiGetData;

  ei_impulse_result_t result = {0};
  if (run_classifier(&signal, &result, false) != EI_IMPULSE_OK) return CLASSIFY_INFERENCE_FAILED;

  out.fire   = scoreFor(result, "fire");
  out.smoke  = scoreFor(result, "smoke");
  out.normal = scoreFor(result, "normal");
  return CLASSIFY_OK;
}

inline void mockNextCapture() {}  // nothing to do for the real model

#endif
