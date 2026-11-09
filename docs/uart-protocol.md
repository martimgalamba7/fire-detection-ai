# UART protocol: MKR WAN 1300 <-> ESP32-CAM

Plain-text, line-based protocol. Every message is one ASCII line ending in `\n`
(a `\r` before it is ignored). Maximum line length: 48 characters.

## Physical layer

| Setting   | Value |
|-----------|-------|
| Baud rate | 115200, 8N1 |
| Levels    | 3.3 V on both sides (no level shifter needed) |
| Ground    | **Common GND is required** |

### Wiring (proposal - `TODO: confirm with Csaba`)

| ESP32-CAM          | Direction | MKR WAN 1300                          |
|--------------------|-----------|---------------------------------------|
| GPIO14 (UART2 TX)  | ->        | D3 (extra UART on SERCOM0, RX, PAD3)  |
| GPIO13 (UART2 RX)  | <-        | D2 (extra UART on SERCOM0, TX, PAD2)  |
| GND                | --        | GND                                   |

Why these pins:

* **ESP32-CAM**: U0R/U0T (UART0) stay free for uploading and the debug serial
  monitor. GPIO13 and GPIO14 belong to the microSD slot, which the inference
  sketch does not use, so they are free. They are not strapping pins
  (GPIO0, 2, 12 and 15 are, so we avoid those). GPIO4 drives the flash LED and is also avoided.
* **MKR**: `Serial1` (D13/D14) is taken by the MH-Z19, D0 by the flame sensor,
  D11/D12 by I2C (BME280). The SAMD21 can create an extra UART on a free SERCOM.
  SERCOM0 on D2 (PA10) / D3 (PA11) is not used by the MKR core.
  If SERCOM0 *were* already in use, compilation fails with a duplicate
  `SERCOM0_Handler` error, so a conflict cannot go unnoticed.

## Messages

| Direction  | Message | Meaning |
|------------|---------|---------|
| MKR -> CAM | `CAPTURE` | Take N frames, classify, vote, answer with `RESULT` or `ERROR`. |
| MKR -> CAM | `PING` | Link check. Camera answers `PONG`. |
| CAM -> MKR | `READY` | Sent once after boot when the camera is initialised. |
| CAM -> MKR | `PONG` | Answer to `PING`. |
| CAM -> MKR | `RESULT,<label>,<confidence>,<votes>` | Classification result. |
| CAM -> MKR | `ERROR,<reason>` | Something went wrong; no result. |

### `RESULT` fields

| Field        | Format | Example | Notes |
|--------------|--------|---------|-------|
| `label`      | `smoke` \| `fire` \| `normal` | `smoke` | After voting. |
| `confidence` | decimal, 2 places, 0.00-1.00 | `0.87` | See voting rules. |
| `votes`      | `<k>/<n>` | `2/3` | k = frames supporting the label, n = frames taken. |

Example: `RESULT,smoke,0.87,2/3`

### Voting rules (FR04, FR05)

Configurable in `firmware/esp32cam_inference/config.h`:
`NUM_FRAMES` (default 3), `MIN_VOTES` (default 2), `CONFIDENCE_THRESHOLD` (default 0.70).

1. For each frame the model returns softmax scores for `fire`, `smoke`, `normal`.
2. A frame is a **hazard vote** when `max(P(fire), P(smoke)) >= CONFIDENCE_THRESHOLD`.
3. If hazard votes `>= MIN_VOTES`:
   * label = `fire` or `smoke`, whichever has the higher summed score over the voting frames;
   * confidence = mean score of that label over the voting frames;
   * votes = number of hazard votes.
4. Otherwise:
   * label = `normal`;
   * confidence = mean `P(normal)` over all frames;
   * votes = number of frames whose top class is `normal`.

So the camera has already applied the threshold: the MKR only needs to check
whether the label is `smoke`/`fire`.

### `ERROR` reasons

| Reason | When |
|--------|------|
| `camera_init` | Camera could not be initialised (sent instead of `READY`, and on every `CAPTURE`). |
| `capture_failed` | `esp_camera_fb_get()` returned no frame. |
| `decode_failed` | JPEG -> RGB conversion failed. |
| `inference_failed` | Edge Impulse classifier returned an error. |
| `unknown_command` | Received a line that is not a known command. |
| `line_too_long` | Received more than 48 characters without `\n`. |

## Timing

* The camera answers `CAPTURE` within about 1-4 s, depending on the model and `NUM_FRAMES`.
* The MKR waits at most `CAMERA_TIMEOUT_MS` (default 15 s). After that it treats
  the result as `ERROR,timeout` (generated on the MKR side, never sent on the wire).
* The camera ignores bytes that arrive while it is busy. The MKR must not send a
  new `CAPTURE` before the previous answer or timeout.
* Lines from the camera that do not start with a known keyword (for example ESP32
  boot messages) are ignored by the MKR.

## Testing without the MKR

With `ACCEPT_DEBUG_COMMANDS 1` in `config.h`, the camera also accepts commands
on the USB serial monitor (UART0) and prints the answer there. Open the Arduino
serial monitor at 115200 baud with "Newline" line ending and type `CAPTURE`.
