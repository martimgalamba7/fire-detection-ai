# Model card: fire / smoke / normal classifier

> Status: model v2 (`models/fire_v2b_int8.lite`, Edge Impulse version 1). Results below use an **interim test set of
> held-out D-Fire images**. The final test set must be own ESP32-CAM images only; fields still marked `TODO` need that
> data or the real board.

## Overview

| Item | Value |
|------|-------|
| Task | Image classification, 3 classes |
| Classes | `smoke`, `fire`, `normal` |
| Platform | ESP32-CAM (AI-Thinker, OV2640), on-device |
| Tool | Edge Impulse (private project "Challenge3_PassionChallenge_FireDetectionSystem", version 1) |
| Architecture | MobileNetV1 transfer learning, alpha 0.25, input 96x96 RGB, resize mode "Fit shortest axis" |
| Quantisation | int8 |
| Version / date | v2, 2026-11-09 (`models/fire_v2_int8.lite`) |

## Class definitions

* **smoke**: visible smoke plume or haze from burning material.
* **fire**: visible flames (smoke may also be present; fire wins).
* **normal**: everything else, *including the false triggers we must filter (FR03)*:
  fog, mist, steam/vapour, dust, shadows, sky, clouds, sun glare, night/dark frames.

## Data

| Source | smoke | fire | normal | Used for |
|--------|-------|------|--------|----------|
| D-Fire subset | 1411 | 1372 | 1060 | train 2693 / val 575 / interim test 575 |
| Own ESP32-CAM images | TODO | TODO | TODO | train / val / **test** (not collected yet) |

(`python dataset_tools/stats.py data/processed` produces this table.)

* D-Fire: Venâncio et al., <https://github.com/gaiasd/DFireDataset>. YOLO labels converted with
  `convert_dfire.py`. An image with any fire box is labelled `fire`, one with only smoke boxes `smoke`,
  and one with no boxes `normal`.
* Own images: taken with `esp32cam_collector` at 320x240 JPEG. Safe sources only (R23):
  `TODO describe: e.g. smoke from incense/smoke machine outdoors, candle/lighter flame, fog machine, kettle steam`.
* Near-duplicates are removed (dHash, `preprocess.py`).
* Test set: own images only, never seen in training.

## Training settings

| Setting | Value |
|---------|-------|
| Epochs | 50 |
| Learning rate | 0.0005 |
| Data augmentation | on (Edge Impulse default: flips, crops, brightness) |
| Resize mode | Fit shortest axis (centre crop), the same as the camera firmware |

## Results (interim test set: 575 held-out D-Fire images)

| Metric | Value |
|--------|-------|
| Accuracy (top class) | 0.73 |
| Smoke recall / precision | 0.73 / 0.68 |
| Fire recall / precision | 0.89 / 0.81 |
| Hazard recall (smoke+fire vs normal), threshold 0.70 | 0.69 |
| False-alarm rate on `normal`, threshold 0.70 | 0.14 |
| Same metrics on own ESP32-CAM test images | TODO |

Confusion matrix: [`evaluation/out/confusion_matrix_v2b.png`](../evaluation/out/confusion_matrix_v2b.png).

## On-device performance

| Item | Value |
|------|-------|
| Inference time per frame | TODO ms (measure on the board; printed by the sketch) |
| Total `CAPTURE` → `RESULT` (3 frames) | TODO ms (`capture took ... ms` on the serial monitor) |
| RAM / flash used | whole sketch: 1.29 MB flash (40%), 67 kB static RAM (20%); image buffers in PSRAM |
| Current during inference | TODO mA (R19, measure with a multimeter) |

## Decision settings

`CONFIDENCE_THRESHOLD = 0.70`, `NUM_FRAMES = 3`, `MIN_VOTES = 2`.

The threshold sweep (`confusion_matrix.py --sweep`) shows the trade-off per frame: 0.60 finds 77 % of hazards with
23 % false alarms, 0.70 finds 69 % with 13 %, 0.80 finds 56 % with 7 %. 0.70 was chosen because the camera is only
asked after a gas anomaly, and 2-of-3 voting plus the fusion rule lower false alarms further, while missing a real
fire costs more than an extra SUSPECT state. To re-check with own images.

## Limitations

* At night the camera sees little; the flame sensor covers this case in the fusion rule.
* Trained mostly on D-Fire images from better cameras; accuracy on ESP32-CAM images is still unknown (domain gap).
* Smoke that covers less than about 5 % of the picture (far away) is too small at 96x96 and was removed from training.
* Thick white clouds, fog and vapour are the hardest `normal` cases; most errors are smoke vs normal.

## Version history (interim test set: held-out D-Fire images, NOT own camera images yet)

| Version | Data | Accuracy (argmax) | Hazard recall @0.70 | False-alarm rate @0.70 |
|---------|------|-------------------|---------------------|------------------------|
| v1 | 1000/class D-Fire, all box sizes; impulse resize = Squash (mismatch with device crop) | 0.58 | 0.46 | 0.08 |
| v2 (chosen) | 1500/class D-Fire, smoke boxes >= 5 % / fire >= 1 % of image; Fit shortest axis; 50 epochs | 0.74 | 0.69 | 0.13 |

| v3 | same data as v2; MobileNetV2 96x96 0.35 | 0.66 (float32 in EI: 0.82 val) | 0.53 | 0.11 |

v3 lost a lot of accuracy in int8 quantisation (float32 0.82 -> int8 0.67 on validation), and it is slower on the ESP32 (EI estimate 1481 ms, 249 kB RAM, 522 kB flash per inference). v2 was kept.

Per-frame numbers. On the device, 2-of-3 frame voting and the gas+camera fusion reduce false alarms further.
