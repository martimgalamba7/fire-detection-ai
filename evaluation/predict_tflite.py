"""Run the trained model on the laptop and write predictions.csv (no board needed).

Download the model from Edge Impulse:
    Dashboard > Download block output > "Transfer learning model - TensorFlow Lite (int8 quantized)"

Then run it on a folder laid out as <folder>/<class>/<image>, for example the test split:
    python evaluation/predict_tflite.py --model model.lite --images data/processed/test
    python evaluation/confusion_matrix.py evaluation/out/predictions.csv --threshold 0.7 --sweep

Pre-processing matches the device and Edge Impulse "Fit shortest axis":
crop the centre square, resize to the model input, scale pixels to 0..1.

Note: Edge Impulse orders labels alphabetically (fire, normal, smoke). Check the
order on the Edge Impulse "Impulse design" page and pass --labels if it differs.
"""
import argparse
import csv
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

try:
    from ai_edge_litert.interpreter import Interpreter
except ImportError:  # older name of the same runtime
    from tflite_runtime.interpreter import Interpreter

IMAGE_EXT = {".jpg", ".jpeg", ".png"}


def prepare(path: Path, width: int, height: int, channels: int) -> np.ndarray:
    img = ImageOps.exif_transpose(Image.open(path)).convert("L" if channels == 1 else "RGB")
    img = ImageOps.fit(img, (width, height), Image.Resampling.BILINEAR)   # centre crop + resize
    x = np.asarray(img, dtype=np.float32) / 255.0
    return x.reshape(1, height, width, channels)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, required=True, help=".lite / .tflite file from Edge Impulse")
    ap.add_argument("--images", type=Path, required=True, help="folder with smoke/ fire/ normal/ sub-folders")
    ap.add_argument("--labels", default="fire,normal,smoke", help="model output order")
    ap.add_argument("--out", type=Path, default=Path("evaluation/out/predictions.csv"))
    args = ap.parse_args()

    labels = [l.strip() for l in args.labels.split(",")]
    interp = Interpreter(model_path=str(args.model))
    interp.allocate_tensors()
    inp = interp.get_input_details()[0]
    out = interp.get_output_details()[0]
    _, h, w, c = inp["shape"]
    if out["shape"][-1] != len(labels):
        raise SystemExit(f"model has {out['shape'][-1]} outputs but {len(labels)} labels were given")
    print(f"model input {w}x{h}x{c} {inp['dtype'].__name__}, labels {labels}")

    rows = []
    for cls_dir in sorted(p for p in args.images.iterdir() if p.is_dir()):
        for img in sorted(cls_dir.iterdir()):
            if img.suffix.lower() not in IMAGE_EXT:
                continue
            x = prepare(img, w, h, c)
            if inp["dtype"] != np.float32:                 # int8 model: quantise the input
                scale, zero = inp["quantization"]
                x = np.clip(np.round(x / scale + zero), -128 if inp["dtype"] == np.int8 else 0,
                            127 if inp["dtype"] == np.int8 else 255).astype(inp["dtype"])
            interp.set_tensor(inp["index"], x)
            interp.invoke()
            y = interp.get_tensor(out["index"])[0].astype(np.float32)
            if out["dtype"] != np.float32:                 # de-quantise the output
                scale, zero = out["quantization"]
                y = (y - zero) * scale
            best = int(np.argmax(y))
            rows.append({"file": f"{cls_dir.name}/{img.name}", "true": cls_dir.name,
                         "pred": labels[best], "confidence": f"{y[best]:.3f}",
                         **{f"p_{l}": f"{y[i]:.3f}" for i, l in enumerate(labels)}})

    if not rows:
        raise SystemExit(f"no images found in {args.images}/<class>/")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    print(f"{len(rows)} predictions written to {args.out}")


if __name__ == "__main__":
    main()
