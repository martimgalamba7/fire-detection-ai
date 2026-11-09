#include "LoraPayload.h"

static void putU16(uint8_t *p, uint16_t v) {   // big-endian
  p[0] = v >> 8;
  p[1] = v & 0xFF;
}

uint8_t encodePayload(const PayloadData &d, uint8_t out[PAYLOAD_SIZE]) {
  out[0] = (d.state & 0x03)
         | (d.camLabel & 0x03) << 2
         | (d.flame ? 1 : 0) << 4
         | (d.gasAnomaly ? 1 : 0) << 5
         | (d.reason & 0x03) << 6;
  out[1] = (uint8_t)constrain((int)(d.camConfidence * 100 + 0.5f), 0, 100);
  out[2] = (min(d.votes, (uint8_t)15) << 4) | min(d.frames, (uint8_t)15);
  putU16(&out[3], d.mq7Raw);
  putU16(&out[5], d.mq135Raw);
  putU16(&out[7], d.co2Ppm);
  out[9] = (uint8_t)d.temperatureC;
  putU16(&out[10], d.batteryMv);
  return PAYLOAD_SIZE;
}
