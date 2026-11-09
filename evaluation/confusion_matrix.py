"""Confusion matrix and metrics from a CSV of predictions.

CSV columns (header required):
    file,true,pred,confidence
    own_smoke_01.jpg,smoke,smoke,0.91
    own_fog_03.jpg,normal,smoke,0.74

* true / pred: smoke, fire or normal
* confidence: score of the predicted class (optional, needed for --threshold / --sweep)

With --threshold T, a smoke/fire prediction below T counts as "normal" (as on the device).
With --sweep, a table of hazard recall vs false-alarm rate for several thresholds is printed:
use it to choose CONFIDENCE_THRESHOLD.

Usage:
    python evaluation/confusion_matrix.py predictions.csv --threshold 0.7 --png evaluation/out/cm.png
"""
import argparse
import csv
from pathlib import Path

CLASSES = ["smoke", "fire", "normal"]
HAZARD = {"smoke", "fire"}


def load(path: Path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["true"] = r["true"].strip().lower()
        r["pred"] = r["pred"].strip().lower()
        r["confidence"] = float(r.get("confidence") or 1.0)
        for key in ("true", "pred"):
            if r[key] not in CLASSES:
                raise SystemExit(f"unknown class '{r[key]}' in row {r}")
    return rows


def apply_threshold(rows, t):
    """Device behaviour: a hazard prediction below the threshold becomes normal."""
    return [r["pred"] if r["pred"] not in HAZARD or r["confidence"] >= t else "normal" for r in rows]


def matrix(true, pred):
    m = [[0] * len(CLASSES) for _ in CLASSES]
    for t, p in zip(true, pred):
        m[CLASSES.index(t)][CLASSES.index(p)] += 1
    return m


def hazard_rates(true, pred):
    """Binary view (smoke+fire vs normal): recall on hazards, false-alarm rate on normal."""
    tp = sum(t in HAZARD and p in HAZARD for t, p in zip(true, pred))
    fn = sum(t in HAZARD and p not in HAZARD for t, p in zip(true, pred))
    fp = sum(t not in HAZARD and p in HAZARD for t, p in zip(true, pred))
    tn = sum(t not in HAZARD and p not in HAZARD for t, p in zip(true, pred))
    recall = tp / (tp + fn) if tp + fn else float("nan")
    far = fp / (fp + tn) if fp + tn else float("nan")
    return recall, far


def print_report(m, true, pred):
    print("rows = true class, columns = predicted\n")
    print(f"{'':>8s}" + "".join(f"{c:>8s}" for c in CLASSES))
    for i, c in enumerate(CLASSES):
        print(f"{c:>8s}" + "".join(f"{v:8d}" for v in m[i]))

    print(f"\n{'class':>8s}{'precision':>11s}{'recall':>8s}{'F1':>7s}{'n':>6s}")
    for i, c in enumerate(CLASSES):
        tp = m[i][i]
        col = sum(m[r][i] for r in range(len(CLASSES)))
        row = sum(m[i])
        prec = tp / col if col else 0.0
        rec = tp / row if row else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        print(f"{c:>8s}{prec:11.2f}{rec:8.2f}{f1:7.2f}{row:6d}")

    acc = sum(m[i][i] for i in range(len(CLASSES))) / max(1, len(true))
    recall, far = hazard_rates(true, pred)
    print(f"\naccuracy: {acc:.3f}")
    print(f"hazard recall (smoke+fire found): {recall:.3f}")
    print(f"false-alarm rate (normal predicted as smoke/fire): {far:.3f}")


def save_png(m, path: Path, title: str):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed: skipping PNG (pip install matplotlib)")
        return
    fig, ax = plt.subplots(figsize=(4.5, 4))
    ax.imshow(m, cmap="Blues")
    ax.set_xticks(range(len(CLASSES)), CLASSES)
    ax.set_yticks(range(len(CLASSES)), CLASSES)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title)
    top = max(max(r) for r in m) or 1
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            ax.text(j, i, m[i][j], ha="center", va="center",
                    color="white" if m[i][j] > top / 2 else "black")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150)
    print(f"saved {path}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv", type=Path)
    ap.add_argument("--threshold", type=float, default=None, help="apply device threshold first")
    ap.add_argument("--sweep", action="store_true", help="print recall / false-alarm per threshold")
    ap.add_argument("--png", type=Path, help="save the matrix as an image")
    args = ap.parse_args()

    rows = load(args.csv)
    true = [r["true"] for r in rows]
    pred = apply_threshold(rows, args.threshold) if args.threshold is not None else [r["pred"] for r in rows]

    m = matrix(true, pred)
    print_report(m, true, pred)

    if args.sweep:
        print(f"\n{'threshold':>10s}{'recall':>8s}{'false-alarm':>13s}")
        for t in [x / 20 for x in range(8, 20)]:   # 0.40 ... 0.95
            rec, far = hazard_rates(true, apply_threshold(rows, t))
            print(f"{t:10.2f}{rec:8.2f}{far:13.2f}")

    if args.png:
        title = "Confusion matrix" + (f" (threshold {args.threshold})" if args.threshold is not None else "")
        save_png(m, args.png, title)


if __name__ == "__main__":
    main()
