// LoraPayload.h - packs the alarm / heartbeat message into 12 bytes (R15).
// Layout: docs/architecture.md "LoRa payload".
// TODO: confirm the layout with Csaba and the back-end/dashboard owner.
#pragma once
#include <Arduino.h>

const uint8_t PAYLOAD_SIZE = 12;
const uint8_t PAYLOAD_STATE_HEARTBEAT = 3;   // state value for the "alive" message (R17)

struct PayloadData {
  // Filled by FireFusion::fillPayload()
  uint8_t state = 0;          // 0 idle, 1 suspect, 2 alarm, 3 heartbeat
  uint8_t reason = 0;         // 0 none, 1 camera, 2 flame, 3 gas_persist
  uint8_t camLabel = 0;       // 0 none, 1 normal, 2 smoke, 3 fire
  float camConfidence = 0;    // 0.0 - 1.0
  uint8_t votes = 0, frames = 0;
  bool gasAnomaly = false, flame = false;
  // Filled by the sensor code (Csaba)
  uint16_t mq7Raw = 0;        // ADC value
  uint16_t mq135Raw = 0;      // ADC value
  uint16_t co2Ppm = 0;
  int8_t temperatureC = 0;
  uint16_t batteryMv = 0;
};

// Writes exactly PAYLOAD_SIZE bytes into out. Returns PAYLOAD_SIZE.
uint8_t encodePayload(const PayloadData &d, uint8_t out[PAYLOAD_SIZE]);
