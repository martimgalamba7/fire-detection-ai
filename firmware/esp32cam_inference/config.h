// config.h - settings for the ESP32-CAM inference sketch.
// Change values here, not in the .ino file.
#pragma once

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
// 1 = no Edge Impulse library needed; returns fake results so the UART
//     protocol and the MKR fusion logic can be tested before the model exists.
// 0 = use the real Edge Impulse library (see INCLUDE in classifier.h).
#define USE_MOCK_MODEL 0

// ---------------------------------------------------------------------------
// Voting (FR04 / FR05) - see docs/uart-protocol.md "Voting rules"
// ---------------------------------------------------------------------------
#define NUM_FRAMES            3      // frames per CAPTURE (max 9)
#define MIN_VOTES             2      // hazard frames needed for smoke/fire
#define CONFIDENCE_THRESHOLD  0.70f  // per-frame softmax threshold
#define FRAME_INTERVAL_MS     150    // pause between frames (scene can change a bit)

// ---------------------------------------------------------------------------
// UART link to the MKR WAN 1300 (UART2 on the free microSD pins)
// TODO: confirm with Csaba - wiring in docs/uart-protocol.md
// ---------------------------------------------------------------------------
#define LINK_BAUD    115200
#define LINK_RX_PIN  13   // <- MKR D2 (TX)
#define LINK_TX_PIN  14   // -> MKR D3 (RX)

// 1 = also accept commands typed in the USB serial monitor (UART0) and
//     answer there too. Handy for testing without the MKR.
#define ACCEPT_DEBUG_COMMANDS 1

// 1 = print per-frame scores and timing on the USB serial monitor.
#define DEBUG_PRINT 1

// Camera settings: must match the images used for training
// (esp32cam_collector also uses QVGA JPEG).
#define CAM_FRAME_SIZE    FRAMESIZE_QVGA   // 320x240
#define CAM_JPEG_QUALITY  12               // 0-63, lower = better quality
