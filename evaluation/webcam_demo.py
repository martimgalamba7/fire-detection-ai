"""Live demo of the fire / smoke / normal model on the laptop webcam.

It behaves like the ESP32-CAM firmware (firmware/esp32cam_inference):
  * same model file (int8 TensorFlow Lite) and same pre-processing
    (centre crop to a square, resize to 96x96, RGB, pixels 0..1);
  * the live view shows the scores of every frame;
  * press SPACE to run a "CAPTURE": NUM_FRAMES frames, per-frame threshold,
    MIN_VOTES voting, and the same RESULT line the camera sends to the MKR.

Keys:  SPACE = CAPTURE    q / ESC = quit

Usage:
    python evaluation/webcam_demo.py
    python evaluation/webcam_demo.py --camera 1 --threshold 0.6
    python evaluation/webcam_demo.py --image some_photo.jpg   # one image, no camera

macOS asks for camera permission the first time (for Terminal / your IDE).
Note: a laptop webcam gives much better images than the ESP32-CAM, so results
here are an upper bound for the real board.
"""
import argparse
import time
from pathlib import Path

import cv2
import numpy as np

try:
    from ai_edge_litert.interpreter import Interpreter
except ImportError:
    from tflite_runtime.interpreter import Interpreter

REPO = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = REPO / "models" / "fire_v2b_int8.lite"
HAZARD = ("fire", "smoke")
COLOURS = {"fire": (0, 80, 255), "smoke": (160, 160, 160), "normal": (60, 180, 60)}  # BGR


class FireClassifier:
    """Loads the .lite model and classifies one BGR frame (OpenCV format)."""

    def __init__(self, model_path: Path, labels: list[str]):
        self.labels = labels
        self.interp = Interpreter(model_path=str(model_path))
        self.interp.allocate_tensors()
        self.inp = self.interp.get_input_details()[0]
        self.out = self.interp.get_output_details()[0]
        _, self.h, self.w, self.c = self.inp["shape"]

    def preprocess(self, frame_bgr: np.ndarray) -> np.ndarray:
        # Centre crop to a square ("Fit shortest axis"), like the firmware.
        fh, fw = frame_bgr.shape[:2]
        side = min(fh, fw)
        y0, x0 = (fh - side) // 2, (fw - side) // 2
        square = frame_bgr[y0:y0 + side, x0:x0 + side]
        img = cv2.resize(square, (self.w, self.h), interpolation=cv2.INTER_LINEAR)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB if self.c == 3 else cv2.COLOR_BGR2GRAY)
        x = img.astype(np.float32).reshape(1, self.h, self.w, self.c) / 255.0
        if self.inp["dtype"] != np.float32:                # quantise for the int8 model
            scale, zero = self.inp["quantization"]
            info = np.iinfo(self.inp["dtype"])
            x = np.clip(np.round(x / scale + zero), info.min, info.max).astype(self.inp["dtype"])
        return x

    def classify(self, frame_bgr: np.ndarray) -> dict[str, float]:
        self.interp.set_tensor(self.inp["index"], self.preprocess(frame_bgr))
        self.interp.invoke()
        y = self.interp.get_tensor(self.out["index"])[0].astype(np.float32)
        if self.out["dtype"] != np.float32:                # de-quantise the output
            scale, zero = self.out["quantization"]
            y = (y - zero) * scale
        return {label: float(y[i]) for i, label in enumerate(self.labels)}


def vote(frames: list[dict[str, float]], threshold: float, min_votes: int) -> str:
    """Same voting rule as the firmware (see docs/uart-protocol.md)."""
    voting = [s for s in frames if max(s["fire"], s["smoke"]) >= threshold]
    if len(voting) >= min_votes:
        sum_fire = sum(s["fire"] for s in voting)
        sum_smoke = sum(s["smoke"] for s in voting)
        label = "fire" if sum_fire >= sum_smoke else "smoke"     # tie -> fire
        conf = (sum_fire if label == "fire" else sum_smoke) / len(voting)
        votes = len(voting)
    else:
        label = "normal"
        conf = sum(s["normal"] for s in frames) / len(frames)
        votes = sum(s["normal"] >= max(s["fire"], s["smoke"]) for s in frames)
    return f"RESULT,{label},{conf:.2f},{votes}/{len(frames)}"


def draw_overlay(frame, scores, result_line, threshold):
    """Score bars at the top left, last RESULT at the bottom, crop square in the middle."""
    fh, fw = frame.shape[:2]
    side = min(fh, fw)
    x0, y0 = (fw - side) // 2, (fh - side) // 2
    cv2.rectangle(frame, (x0, y0), (x0 + side, y0 + side), (255, 255, 255), 1)   # what the model sees

    cv2.rectangle(frame, (10, 10), (330, 125), (0, 0, 0), -1)
    for i, label in enumerate(("fire", "smoke", "normal")):
        y = 35 + i * 32
        value = scores.get(label, 0.0)
        cv2.putText(frame, f"{label:6s} {value:.2f}", (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        cv2.rectangle(frame, (150, y - 14), (150 + int(value * 170), y + 2), COLOURS[label], -1)
    tx = 150 + int(threshold * 170)
    cv2.line(frame, (tx, 18), (tx, 115), (0, 255, 255), 1)                         # threshold marker

    cv2.rectangle(frame, (0, fh - 40), (fw, fh), (0, 0, 0), -1)
    text = result_line or "Press SPACE to CAPTURE, q to quit"
    colour = COLOURS.get(result_line.split(",")[1], (255, 255, 255)) if result_line else (255, 255, 255)
    cv2.putText(frame, text, (15, fh - 13), cv2.FONT_HERSHEY_SIMPLEX, 0.75, colour, 2)


def run_image(clf, path: Path):
    frame = cv2.imread(str(path))
    if frame is None:
        raise SystemExit(f"cannot read {path}")
    scores = clf.classify(frame)
    print(", ".join(f"{k}={v:.2f}" for k, v in scores.items()))


def run_camera(clf, args):
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("Cannot open the camera. On macOS, allow camera access for Terminal/your IDE in "
                         "System Settings > Privacy & Security > Camera, then try again.")
    result_line, window = "", "Fire detection demo (SPACE = CAPTURE, q = quit)"
    print("Camera open. SPACE = CAPTURE, q = quit.")
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        scores = clf.classify(frame)

        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break
        if key == ord(" "):
            t0 = time.time()
            frames = []
            for i in range(args.frames):
                ok, f = cap.read()
                if not ok:
                    break
                s = clf.classify(f)
                frames.append(s)
                print(f"[dbg] frame {i + 1}: " + " ".join(f"{k}={v:.2f}" for k, v in s.items()))
                time.sleep(args.interval_ms / 1000)
            result_line = vote(frames, args.threshold, args.min_votes)
            print(result_line)
            print(f"[dbg] capture took {(time.time() - t0) * 1000:.0f} ms (laptop)")

        draw_overlay(frame, scores, result_line, args.threshold)
        cv2.imshow(window, frame)
    cap.release()
    cv2.destroyAllWindows()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    ap.add_argument("--labels", default="fire,normal,smoke", help="model output order (Edge Impulse: alphabetical)")
    ap.add_argument("--camera", type=int, default=0, help="camera index (0 = built-in)")
    ap.add_argument("--threshold", type=float, default=0.70, help="CONFIDENCE_THRESHOLD in config.h")
    ap.add_argument("--frames", type=int, default=3, help="NUM_FRAMES in config.h")
    ap.add_argument("--min-votes", type=int, default=2, help="MIN_VOTES in config.h")
    ap.add_argument("--interval-ms", type=int, default=150, help="FRAME_INTERVAL_MS in config.h")
    ap.add_argument("--image", type=Path, help="classify one image file instead of using the camera")
    args = ap.parse_args()

    clf = FireClassifier(args.model, [l.strip() for l in args.labels.split(",")])
    print(f"model {args.model.name}: input {clf.w}x{clf.h}x{clf.c}, labels {clf.labels}")
    if args.image:
        run_image(clf, args.image)
    else:
        run_camera(clf, args)


if __name__ == "__main__":
    main()
