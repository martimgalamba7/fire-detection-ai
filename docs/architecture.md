# Architecture: AI part of the Fire Detection System

## Data flow

```
 ┌──────────────────────── MKR WAN 1300 (Csaba's sketch) ───────────────────────┐
 │ MQ-7 (A1), MQ-9 (A2), MQ-135 (A3), MH-Z19 (Serial1), BME280 (I2C), flame (D0) │
 │        │                                                                      │
 │        ▼  threshold check (R9/R10, Csaba)                                      │
 │   gasAnomaly, flame ──► FireFusion (this repo) ──► state + reason             │
 │                            │          ▲                 │                     │
 │              CameraLink    │          │                 ▼                     │
 │              "CAPTURE\n"   ▼          │ "RESULT,..."   LoraPayload (12 bytes)  │
 └────────────────────────────┼──────────┼─────────────────┼─────────────────────┘
                   UART 115200│          │                 │ LoRaWAN (R14/R15)
 ┌────────────────────────────▼──────────┴──────┐          ▼
 │ ESP32-CAM (esp32cam_inference)               │   Network server ─► dashboard
 │ standby ─► capture N frames (QVGA JPEG)      │                     + phone/e-mail (R16)
 │        ─► decode + resize to 96x96           │
 │        ─► Edge Impulse MobileNetV1 int8      │
 │        ─► vote ─► RESULT / ERROR             │
 └──────────────────────────────────────────────┘
```

Only a label, a confidence and a vote count leave the camera, never the image (NFR04).

## Responsibilities

| Part | Owner | Where |
|------|-------|-------|
| Sensor reading, thresholds, `gasAnomaly` flag | Csaba | MKR sketch |
| UART client, fusion state machine, LoRa payload layout | AI part (Martim) | `firmware/mkr_fusion/` |
| Image classification + voting | AI part (Martim) | `firmware/esp32cam_inference/` |
| LoRaWAN join/send, back end, dashboard | others | n/a |

## Fusion rule (R11)

| Gas anomaly | Camera | Flame | Result |
|-------------|--------|-------|--------|
| no  | (not asked) | any | `IDLE`: nothing happens |
| yes | smoke / fire | any | `ALARM` (reason `CAMERA`) |
| yes | normal or error | yes | `ALARM` (reason `FLAME`, covers night) |
| yes | normal or error | no | `SUSPECT`: re-check after 30 s |
| still yes after 30 s | smoke / fire | any | `ALARM` (reason `CAMERA`) |
| still yes after 30 s | normal | yes | `ALARM` (reason `FLAME`) |
| still yes after 30 s | normal | no | `ALARM` (reason `GAS_PERSIST`) |
| gone after 30 s | n/a | no | back to `IDLE` |

An `ALARM` is latched until gas and flame have been clear for `clearAfterMs`
(default 60 s). Then the state goes back to `IDLE`.

The `reason` is logged and sent in the LoRa payload. This lets
`evaluation/false_alarm_count.py` compare "gas only" with "gas + camera" (R11/R12).
Every gas-anomaly episode would be an alarm in a gas-only system. Only some of them
become an alarm with fusion.

The `GAS_PERSIST` escalation can be switched off (`FusionConfig::escalateOnPersistentGas`).
With it off, the system strictly requires two kinds of evidence, at the cost of
missing fires the camera cannot see.

## Power (NFR01)

The ESP32-CAM is powered from the external 5 V supply (R18) and stays on.
Between triggers it runs at 80 MHz with Wi-Fi and Bluetooth off, and it does not
stream. A further saving, left for later and measured in R19: let the MKR
switch the camera's 5 V with a MOSFET and boot it on demand (about 1-2 s extra latency).
The protocol already supports this, because the camera sends `READY` after boot.

## LoRa payload (R15: at most 12 bytes)

Proposal, `TODO: confirm with Csaba / back-end owner`. Implemented in `firmware/mkr_fusion/src/LoraPayload.*`.

| Byte | Field | Encoding |
|------|-------|----------|
| 0 | flags | bits 0-1 state (0 idle, 1 suspect, 2 alarm, 3 heartbeat), bits 2-3 camera label (0 none, 1 normal, 2 smoke, 3 fire), bit 4 flame, bit 5 gas anomaly, bits 6-7 reason (0 none, 1 camera, 2 flame, 3 gas_persist) |
| 1 | camera confidence | `round(conf * 100)`, 0-100 |
| 2 | votes | high nibble = k, low nibble = n |
| 3-4 | MQ-7 raw ADC | uint16, big-endian |
| 5-6 | MQ-135 raw ADC | uint16, big-endian |
| 7-8 | CO2 ppm | uint16, big-endian |
| 9 | temperature | int8, °C |
| 10-11 | battery | uint16 mV, big-endian |

The same layout with state = heartbeat is used for the periodic "alive" message (R17).
