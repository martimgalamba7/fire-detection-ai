"""Convert the D-Fire dataset (YOLO format) into classification folders.

D-Fire labels: one .txt per image, one line per box: "<class> <x> <y> <w> <h>".
    class 0 = smoke, class 1 = fire, empty file = neither.

Rule per image:
    any fire box  -> fire   (fire images usually also contain smoke)
    only smoke    -> smoke
    no boxes      -> normal

Usage:
    python dataset_tools/convert_dfire.py --src ~/Downloads/D-Fire --out data/dfire --per-class 800

The script searches --src recursively for "images" folders and expects a
sibling "labels" folder (D-Fire layout: train/images, train/labels, test/...).
Files are copied as data/dfire/<class>/dfire_<original name>.
"""
import argparse
import random
import shutil
from collections import defaultdict
from pathlib import Path

IMAGE_EXT = {".jpg", ".jpeg", ".png"}
CLASSES = ("smoke", "fire", "normal")


def label_for(label_file: Path) -> str | None:
    """Return the classification label for one YOLO label file (None if missing)."""
    if not label_file.exists():
        return None
    ids = set()
    for line in label_file.read_text().splitlines():
        parts = line.split()
        if parts:
            ids.add(int(float(parts[0])))
    if 1 in ids:
        return "fire"
    if 0 in ids:
        return "smoke"
    return "normal"


def find_pairs(src: Path):
    """Yield (image_path, label) for every image that has a label file."""
    for images_dir in src.rglob("images"):
        labels_dir = images_dir.parent / "labels"
        if not images_dir.is_dir() or not labels_dir.is_dir():
            continue
        for img in images_dir.iterdir():
            if img.suffix.lower() in IMAGE_EXT:
                label = label_for(labels_dir / (img.stem + ".txt"))
                if label is not None:
                    yield img, label


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="D-Fire root folder")
    ap.add_argument("--out", type=Path, default=Path("data/dfire"))
    ap.add_argument("--per-class", type=int, default=800, help="max images per class (0 = all)")
    ap.add_argument("--seed", type=int, default=42, help="random seed (reproducible sample)")
    args = ap.parse_args()

    by_class = defaultdict(list)
    for img, label in find_pairs(args.src):
        by_class[label].append(img)
    if not by_class:
        raise SystemExit(f"No images/labels pairs found under {args.src}")

    rng = random.Random(args.seed)
    for cls in CLASSES:
        files = sorted(by_class[cls])          # sort first so the seed is reproducible
        rng.shuffle(files)
        if args.per_class:
            files = files[: args.per_class]
        dest = args.out / cls
        dest.mkdir(parents=True, exist_ok=True)
        for f in files:
            shutil.copy2(f, dest / f"dfire_{f.name}")
        print(f"{cls:7s}: {len(files):5d} copied (of {len(by_class[cls])} available)")


if __name__ == "__main__":
    main()
