/*
 * fusion_demo.ino - shows how to use the FireFusion library on the MKR WAN 1300.
 * Csaba: copy the marked parts into the main sensor sketch.
 *
 * Without real sensors you can test it from the serial monitor (115200, Newline):
 *   g  = toggle simulated gas anomaly
 *   f  = toggle simulated flame
 *   p  = ping the camera
 * Use the camera in USE_MOCK_MODEL mode to test before the model exists.
 */
#include <FireFusion.h>

// ---- [copy] objects ------------------------------------------------------
CameraLink camera(CameraSerial, 15000);   // 15 s timeout
FireFusion fusion(camera, &Serial);       // logs FUSION,... lines to Serial

const unsigned long HEARTBEAT_MS = 15UL * 60UL * 1000UL;  // R17: every 15 min (TODO agree)
unsigned long lastHeartbeat = 0;
// --------------------------------------------------------------------------

bool simGas = false, simFlame = false;

void sendLora(const uint8_t *buf, uint8_t len) {
  // TODO (Csaba): replace with the real LoRaWAN send, e.g.
  //   modem.beginPacket(); modem.write(buf, len); modem.endPacket(true);
  Serial.print("LORA,");
  for (uint8_t i = 0; i < len; i++) {
    if (buf[i] < 16) Serial.print('0');
    Serial.print(buf[i], HEX);
  }
  Serial.println();
}

void sendStatus(bool heartbeat) {
  PayloadData p;
  fusion.fillPayload(p);
  if (heartbeat) p.state = PAYLOAD_STATE_HEARTBEAT;
  // TODO (Csaba): fill real sensor values here
  p.mq7Raw = analogRead(A1);
  p.mq135Raw = analogRead(A3);
  p.co2Ppm = 0;
  p.temperatureC = 0;
  p.batteryMv = 0;
  uint8_t buf[PAYLOAD_SIZE];
  sendLora(buf, encodePayload(p, buf));
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {}
  cameraSerialBegin(115200);             // [copy] start the camera UART
  Serial.println("fusion_demo ready: g=gas, f=flame, p=ping");
}

void loop() {
  // Simulated inputs from the serial monitor
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'g') { simGas = !simGas;     Serial.println(simGas ? "gas ON" : "gas OFF"); }
    if (c == 'f') { simFlame = !simFlame; Serial.println(simFlame ? "flame ON" : "flame OFF"); }
    if (c == 'p') camera.sendPing();
  }

  // ---- [copy] in Csaba's loop(): gasAnomaly from his thresholds, flame from D0
  // bool gasAnomaly = coAboveThreshold || vocAboveThreshold;   // R9/R10
  // bool flame = digitalRead(0) == LOW;  // TODO: check the module's active level
  fusion.update(simGas, simFlame);

  if (fusion.stateChanged()) sendStatus(false);           // send on every change
  if (millis() - lastHeartbeat >= HEARTBEAT_MS) {         // R17
    lastHeartbeat = millis();
    sendStatus(true);
  }
  // --------------------------------------------------------------------------
}
