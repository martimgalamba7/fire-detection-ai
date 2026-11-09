# Hardware setup and bring-up guide

This guide explains how to run the AI part of the Fire Detection System on the real hardware.
It is split into phases. Each phase verifies one part of the system before the next part is added,
so a failure can be traced to a single component.

| Phase | Goal | Hardware needed |
|-------|------|-----------------|
| [0](#phase-0-preparation) | Toolchain and programming setup | ESP32-CAM, USB-serial adapter |
| [1](#phase-1-on-device-inference) | Run the classifier on the ESP32-CAM | ESP32-CAM, USB-serial adapter |
| [2](#phase-2-dataset-collection) | Collect own training and test images | ESP32-CAM, phone hotspot, laptop |
| [3](#phase-3-camera-to-mkr-link) | Connect the camera to the MKR and test the fusion logic | ESP32-CAM, MKR WAN 1300, 5 V supply |
| [4](#phase-4-integration-with-the-sensor-firmware) | Integrate with the sensor firmware | Full prototype |
| [5](#phase-5-field-tests) | Field tests and false-alarm measurement | Full prototype |

Related documents: [UART protocol](uart-protocol.md) · [Architecture](architecture.md) · [Model card](model-card.md) · [Test log template](test-log-template.md)

---

## Phase 0: Preparation

### Software

Install the toolchain once (see the [README](../README.md#getting-started) for details):

```bash
arduino-cli core install esp32:esp32 arduino:samd
arduino-cli config set library.enable_unsafe_install true
arduino-cli lib install --zip-path models/ei_arduino_library_v2.zip
```

### Programming connection (ESP32-CAM)

The AI-Thinker ESP32-CAM has no USB port. It is programmed through a USB-serial adapter (CP2104):

| CP2104 | ESP32-CAM |
|--------|-----------|
| 5V     | 5V        |
| GND    | GND       |
| TXD    | U0R       |
| RXD    | U0T       |

Find the serial port:

```bash
arduino-cli board list
```

The port is usually named `/dev/cu.usbserial-XXXX` or `/dev/cu.SLAB_USBtoUART` on macOS. It is referred to as
`<cam-port>` below.

### Upload procedure

The adapter's RTS/DTR lines are not connected, so the board must be put into download mode by hand:

1. Connect **IO0 to GND** with a jumper wire.
2. Power-cycle the board (unplug and replug the USB cable).
3. Run the `upload` command.
4. Remove the jumper and power-cycle the board again. The new firmware now starts.

---

## Phase 1: On-device inference

**Goal:** confirm that the camera initialises, the model runs, and the board answers the `CAPTURE` command.

1. Build and upload the inference firmware (board in download mode):

   ```bash
   arduino-cli compile --fqbn esp32:esp32:esp32cam firmware/esp32cam_inference
   arduino-cli upload  --fqbn esp32:esp32:esp32cam -p <cam-port> firmware/esp32cam_inference
   ```

2. Remove the IO0 jumper, power-cycle, and open the serial monitor:

   ```bash
   arduino-cli monitor -p <cam-port> -c baudrate=115200
   ```

3. **Expected boot output:**

   ```
   [dbg] model: Edge Impulse
   READY
   ```

   `ERROR,camera_init` means the camera did not start; see [Troubleshooting](#troubleshooting).

4. Type `CAPTURE` and press Enter. **Expected output:**

   ```
   [dbg] frame 1: fire=0.02 smoke=0.10 normal=0.88
   [dbg] frame 2: fire=0.03 smoke=0.08 normal=0.89
   [dbg] frame 3: fire=0.02 smoke=0.11 normal=0.87
   RESULT,normal,0.88,3/3
   [dbg] capture took 1234 ms
   ```

5. Sanity-check the classes:

   | Point the camera at | Expected label |
   |---------------------|----------------|
   | A wall, trees or the sky | `normal` |
   | A wildfire video on a laptop screen | `fire` |
   | Incense smoke, outdoors | `smoke` |

6. Record the `capture took` time in the [model card](model-card.md#on-device-performance) (requirement NFR02).

> To test the UART protocol without the model, set `USE_MOCK_MODEL 1` in
> `firmware/esp32cam_inference/config.h`. The firmware then returns synthetic results.

---

## Phase 2: Dataset collection

**Goal:** collect labelled images with the ESP32-CAM itself, to reduce the domain gap between the D-Fire
training data and the field camera. The final test set must contain only these images.

### Setup

1. **Wi-Fi:** the ESP32 supports **2.4 GHz only**. On an iPhone hotspot, enable
   *Settings → Personal Hotspot → Maximise Compatibility*.
2. Copy the template and enter the hotspot credentials:

   ```bash
   cp firmware/esp32cam_collector/secrets.example.h firmware/esp32cam_collector/secrets.h
   ```

   `secrets.h` is excluded from version control (requirement R24).
3. Upload the collector firmware (board in download mode):

   ```bash
   arduino-cli upload --fqbn esp32:esp32:esp32cam -p <cam-port> firmware/esp32cam_collector
   ```

4. Remove the jumper, power-cycle and open the serial monitor. The board prints its address, for example
   `Open in your browser: http://172.20.10.5`.
5. Connect the laptop to the same hotspot and open that address. The page shows a live preview and three
   buttons: **smoke**, **fire** and **normal**. Each click downloads the current frame as
   `<label>_<timestamp>_<n>.jpg`.

### What to capture

Aim for **100–150 images per class**. Vary the angle, distance, time of day and location between shots.

| Class | Sources |
|-------|---------|
| `normal` | Trees, grass, forest floor; clear and cloudy sky (grey clouds especially); fog and mist; steam (kettle, breath in cold air); vape and shisha clouds; dust; sun glare, sunsets, shadows; orange and red objects such as autumn leaves |
| `smoke` | Incense; a freshly extinguished candle; a cigarette; a barbecue or outdoor fire pit; wildfire smoke videos on a screen |
| `fire` | Candle, lighter or match flame; barbecue or outdoor fire pit; wildfire videos on a screen (at most about 30 % of this class) |

**Safety (R23):** use small, controlled sources only, always outdoors or next to an open window, with water
nearby. Never start a fire indoors.

Vape and shisha clouds are vapour (aerosol), not combustion smoke. Label them `normal`; they are valuable
examples of false triggers (FR03).

### Processing

Move the images to `data/own/smoke`, `data/own/fire` and `data/own/normal`, then:

```bash
python dataset_tools/preprocess.py --dfire data/dfire --own data/own --out data/processed
python dataset_tools/stats.py data/processed
python dataset_tools/upload_edge_impulse.py data/processed
```

Retrain in Edge Impulse, export a new Arduino library, install it, and repeat Phase 1.

---

## Phase 3: Camera-to-MKR link

**Goal:** verify the UART link and the fusion state machine with simulated sensor inputs.

### Wiring

Disconnect all power before wiring.

| ESP32-CAM | Direction | MKR WAN 1300 |
|-----------|:---------:|--------------|
| GPIO14 (UART2 TX) | → | D3 (SERCOM0 RX) |
| GPIO13 (UART2 RX) | ← | D2 (SERCOM0 TX) |
| GND | — | GND |

* A **common ground is mandatory**.
* Both boards use 3.3 V logic; no level shifter is required.
* D2/D3 are a proposal; confirm with the sensor-firmware owner that they are free.

### Power

The ESP32-CAM needs a stable 5 V supply with peaks of about 300 mA during capture and Wi-Fi use.
Power it from the external 5 V supply (requirement R18), not from the MKR's 5 V pin.

### Test with the `fusion_demo` example

1. Make the library available to the Arduino toolchain (once):

   ```bash
   ln -sfn "$PWD/firmware/mkr_fusion" ~/Documents/Arduino/libraries/FireFusion
   ```

2. Connect the MKR over USB and upload. The MKR has native USB and needs no jumper:

   ```bash
   arduino-cli upload --fqbn arduino:samd:mkrwan1300 -p <mkr-port> firmware/mkr_fusion/examples/fusion_demo
   ```

   If the upload fails, double-tap the MKR reset button to enter the bootloader and retry.

3. Open the MKR serial monitor at 115200 baud and send the following keys:

   | Key | Action | Expected result |
   |-----|--------|-----------------|
   | `p` | Ping the camera | Camera answers `PONG` (link works) |
   | `g` | Toggle simulated gas anomaly | `FUSION,...,TRIGGER,...`, then `SUSPECT` or `ALARM`, plus a `LORA,<hex>` payload line |
   | `f` | Toggle simulated flame | Used together with `g` to test the night case |

4. Verify the fusion rule:

   | Scenario | Expected state |
   |----------|----------------|
   | Gas on, camera sees smoke or fire | `ALARM`, reason `CAMERA` |
   | Gas on, camera sees a wall, flame on | `ALARM`, reason `FLAME` |
   | Gas on, camera sees a wall, flame off | `SUSPECT` |
   | Gas still on 30 s later | `ALARM`, reason `GAS_PERSIST` |
   | Gas off within 30 s | `IDLE` (`CLEARED`) |

---

## Phase 4: Integration with the sensor firmware

The sensor firmware owner copies the parts marked `// [copy]` from
[`fusion_demo.ino`](../firmware/mkr_fusion/examples/fusion_demo/fusion_demo.ino) into the main MKR sketch:

1. `#include <FireFusion.h>` and the `camera` and `fusion` objects.
2. `cameraSerialBegin(115200);` in `setup()`.
3. `fusion.update(gasAnomaly, flame);` in `loop()`, using the real threshold logic (R9/R10) and the flame
   sensor input on D0.
4. In `sendStatus()`: the real sensor values and the LoRaWAN transmission
   (`modem.beginPacket()` / `modem.write()` / `modem.endPacket()`).

Items to confirm before integration (marked `TODO: confirm with Csaba` in the code):

* D2/D3 are free for the camera UART.
* The 12-byte payload layout ([architecture](architecture.md#lora-payload-r15-at-most-12-bytes)) suits the back end.
* The active level of the flame sensor output (LOW or HIGH when a flame is detected).

---

## Phase 5: Field tests

1. Log the MKR serial output of every test to a file:

   ```bash
   mkdir -p logs
   arduino-cli monitor -p <mkr-port> -c baudrate=115200 | tee logs/T-01.txt
   ```

2. Record each test in the [test log](test-log-template.md) (requirement R25): date, setup, stimulus, result.
3. Count false alarms for gas-only versus gas + camera (requirements R11/R12):

   ```bash
   python evaluation/false_alarm_count.py extract logs/*.txt -o episodes.csv
   # fill in the "truth" column (fire / none) using the test log
   python evaluation/false_alarm_count.py report episodes.csv --hours <test duration>
   ```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Failed to connect to ESP32` during upload | Board not in download mode | Fit the IO0–GND jumper and power-cycle **before** uploading |
| No serial output after upload | IO0 jumper still fitted | Remove the jumper and power-cycle |
| `Brownout detector was triggered` | Insufficient supply current | Use a better USB cable or the external 5 V supply |
| `ERROR,camera_init` | Camera ribbon cable loose | Power off, reseat the ribbon cable and close the latch |
| Collector stuck at `Connecting to Wi-Fi....` | 5 GHz hotspot or wrong credentials | Enable 2.4 GHz compatibility; check `secrets.h` |
| No `PONG` after `p` on the MKR | TX/RX swapped or no common ground | Check GPIO14 → D3, D2 → GPIO13 and GND |
| MKR upload fails | Port changed after reset | Double-tap reset and run `arduino-cli board list` again |
| Results differ from laptop evaluation | Lighting or domain gap | Collect own images (Phase 2) and retrain |
