# Model card: fire / smoke / normal classifier

> Template. Fill in the `TODO` fields after training. Keep numbers honest:
> report test-set results on **own ESP32-CAM images only**.

## Overview

| Item | Value |
|------|-------|
| Task | Image classification, 3 classes |
| Classes | `smoke`, `fire`, `normal` |
| Platform | ESP32-CAM (AI-Thinker, OV2640), on-device |
| Tool | Edge Impulse, project: `TODO link` |
| Architecture | MobileNetV1 transfer learning, alpha `TODO 0.1 / 0.25`, input 96x96 `TODO RGB/grayscale` |
| Quantisation | int8 |
| Version / date | `TODO v1, YYYY-MM-DD` |

## Class definitions

* **smoke**: visible smoke plume or haze from burning material.
* **fire**: visible flames (smoke may also be present; fire wins).
* **normal**: everything else, *including the false triggers we must filter (FR03)*:
  fog, mist, steam/vapour, dust, shadows, sky, clouds, sun glare, night/dark frames.

## Data

| Source | smoke | fire | normal | Used for |
|--------|-------|------|--------|----------|
| D-Fire subset | TODO | TODO | TODO | train / val |
| Own ESP32-CAM images | TODO | TODO | TODO | train / val / **test** |

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
| Epochs | TODO |
| Learning rate | TODO |
| Data augmentation | TODO |
| Resize mode | TODO (squash / fit / crop) |

## Results (test set: own images only)

| Metric | Value |
|--------|-------|
| Accuracy | TODO |
| Smoke recall / precision | TODO |
| Fire recall / precision | TODO |
| Hazard recall (smoke+fire vs normal) | TODO |
| False-positive rate on `normal` | TODO |

Confusion matrix: `evaluation/out/confusion_matrix.png` (TODO attach).

## On-device performance

| Item | Value |
|------|-------|
| Inference time per frame | TODO ms |
| Total `CAPTURE` → `RESULT` (3 frames) | TODO ms |
| RAM / flash used | TODO |
| Current during inference | TODO mA (R19) |

## Decision settings

`CONFIDENCE_THRESHOLD = TODO (default 0.70)`, `NUM_FRAMES = TODO (3)`, `MIN_VOTES = TODO (2)`.
Explain why these values were chosen, e.g. from a threshold sweep with `confusion_matrix.py --sweep`.

## Limitations

* TODO e.g. at night the camera sees little; the flame sensor covers this.
* TODO small dataset; outdoor lighting conditions limited to the test weeks.
* TODO smoke far away may be too small at 96x96.
