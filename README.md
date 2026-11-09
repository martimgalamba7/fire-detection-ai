# Fire Detection System: AI part

On-device smoke/fire classification for a solar-powered, tree-mounted IoT node.
The MKR WAN 1300 watches the gas sensors. When it sees an anomaly, it asks the
ESP32-CAM to classify a few frames. It then combines gas, camera and flame
sensor into one decision and sends a 12-byte LoRaWAN message.

```
gas anomaly ─► MKR "CAPTURE" ─► ESP32-CAM: 3 frames ─► MobileNetV1 int8 ─► vote
            ◄─ "RESULT,smoke,0.87,2/3" ◄────────────────────────────────────┘
MKR fusion (gas + camera + flame) ─► IDLE / SUSPECT / ALARM ─► LoRa (12 bytes)
```

Requirements covered: FR01-FR05, NFR01/NFR04, R11, R12, R15, R17 (payload), R24, R25.

## Repository layout

| Path | What |
|------|------|
| `docs/architecture.md` | Data flow, fusion rule, LoRa payload layout |
| `docs/uart-protocol.md` | MKR <-> camera protocol and wiring |
| `docs/model-card.md` | Model description (template to fill in) |
| `docs/test-log-template.md` | Test log (R25) |
| `firmware/esp32cam_inference/` | Final camera sketch: waits for `CAPTURE`, classifies, answers |
| `firmware/esp32cam_collector/` | Web page to take labelled dataset photos |
| `firmware/mkr_fusion/` | Arduino library for the MKR: `CameraLink`, `FireFusion`, `LoraPayload` |
| `dataset_tools/` | D-Fire conversion, preprocessing/split, statistics |
| `evaluation/` | Confusion matrix, false-alarm counting |

## Setup

### Python (3.10 - 3.12)

Python 3.15 alpha does **not** work: Pillow fails to load. Use 3.12:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Arduino

Install `arduino-cli` (or use the Arduino IDE 2) and the two board cores:

```bash
brew install arduino-cli
arduino-cli config init --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32 arduino:samd
```

## How to run each part

### 1. Collect images (`esp32cam_collector`)

```bash
cp firmware/esp32cam_collector/secrets.example.h firmware/esp32cam_collector/secrets.h   # then edit
arduino-cli compile --fqbn esp32:esp32:esp32cam firmware/esp32cam_collector
arduino-cli upload  --fqbn esp32:esp32:esp32cam -p /dev/cu.usbserial-XXXX firmware/esp32cam_collector
```

Upload: put IO0 on GND, plug in, upload, remove the jumper, replug. Open the IP
address from the serial monitor in a browser. Each button downloads a JPEG named
`<label>_<time>_<n>.jpg`. Move the files into `data/own/smoke|fire|normal/`.

### 2. Build the dataset

```bash
python dataset_tools/convert_dfire.py --src ~/Downloads/D-Fire --out data/dfire --per-class 800
python dataset_tools/preprocess.py --dfire data/dfire --own data/own --out data/processed
python dataset_tools/stats.py data/processed
```

`data/processed/train` and `val` go to Edge Impulse as training data; `test` (own images only) goes in as test data.

### 3. Camera inference (`esp32cam_inference`)

* With `USE_MOCK_MODEL 1` in `config.h` it runs without a model. Type `CAPTURE` in the
  serial monitor (115200, Newline) and you get a fake `RESULT,...` line.
* With the real model: add the Edge Impulse ZIP library, set the include in
  `classifier.h`, and set `USE_MOCK_MODEL 0`.

```bash
arduino-cli compile --fqbn esp32:esp32:esp32cam firmware/esp32cam_inference
```

### 4. MKR fusion (`mkr_fusion`)

Copy or symlink `firmware/mkr_fusion` into your Arduino `libraries/` folder, then
open the example `fusion_demo`. In the serial monitor, `g` toggles a fake gas
anomaly and `f` a fake flame. The `// [copy]` parts show what to integrate into the
main sensor sketch.

```bash
ln -s "$PWD/firmware/mkr_fusion" ~/Documents/Arduino/libraries/FireFusion
arduino-cli compile --fqbn arduino:samd:mkrwan1300 ~/Documents/Arduino/libraries/FireFusion/examples/fusion_demo
```

Test the fusion logic on the laptop, without any board (fake camera, fake clock):

```bash
firmware/mkr_fusion/extras/host_test/run_tests.sh
```

### 5. Evaluate

Run the Edge Impulse model (TensorFlow Lite int8 download) on the laptop:

```bash
python evaluation/predict_tflite.py --model model.lite --images data/processed/test
```

```bash
python evaluation/confusion_matrix.py evaluation/out/predictions.csv --threshold 0.7 --sweep --png evaluation/out/cm.png
python evaluation/false_alarm_count.py extract logs/*.txt -o episodes.csv
# fill in the "truth" column, then:
python evaluation/false_alarm_count.py report episodes.csv --hours 3
```

## Open points (`TODO: confirm with Csaba`)

* Camera UART on MKR D2 (TX) / D3 (RX) via SERCOM0, and on ESP32-CAM GPIO13 (RX) / GPIO14 (TX).
* LoRa payload layout (12 bytes) and heartbeat interval (R17).
* Active level of the flame sensor output on D0.

## Secrets (R24)

`secrets.h` files are in `.gitignore`. Only `secrets.example.h` is committed.
Before every push, check with `git status` that no `secrets.h` is staged.
