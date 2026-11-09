// CameraSerial.h - extra hardware UART on the MKR WAN 1300 for the ESP32-CAM.
//
// Serial1 (D13/D14) is used by the MH-Z19, so we create a second UART on SERCOM0:
//   D2 (PA10, SERCOM0 PAD2) = TX  -> ESP32-CAM GPIO13
//   D3 (PA11, SERCOM0 PAD3) = RX  <- ESP32-CAM GPIO14
//
// TODO: confirm with Csaba that D2 and D3 are free on the prototype.
// If SERCOM0 is already used by something else, the build fails with a
// "multiple definition of SERCOM0_Handler" error.
#pragma once
#include <Arduino.h>

#define CAMERA_TX_PIN 2
#define CAMERA_RX_PIN 3

extern Uart CameraSerial;

// Call once in setup(). Sets the pin functions and starts the UART.
void cameraSerialBegin(unsigned long baud = 115200);
