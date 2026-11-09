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


def label_for(label_file: Path, min_area: dict) -> str | None:
    """Return the classification label for one YOLO label file.

    Returns None if the label file is missing, or if the smoke/fire in the image
    covers less than min_area[class] of the picture. Whole-image classification
    at 96x96 cannot see a tiny smoke plume, so such images only confuse the model.
    """
    if not label_file.exists():
        return None
    area = {0: 0.0, 1: 0.0}            # summed box area per class (fraction of image)
    for line in label_file.read_text().splitlines():
        parts = line.split()
        if len(parts) >= 5:
            area[int(float(parts[0]))] = area.get(int(float(parts[0])), 0.0) + float(parts[3]) * float(parts[4])
    if area[1] > 0:
        return "fire" if area[1] >= min_area["fire"] else None
    if area[0] > 0:
        return "smoke" if area[0] >= min_area["smoke"] else None
    return "normal"


def find_pairs(src: Path, min_area: dict):
    """Yield (image_path, label) for every image that has a usable label file."""
    for images_dir in src.rglob("images"):
        labels_dir = images_dir.parent / "labels"
        if not images_dir.is_dir() or not labels_dir.is_dir():
            continue
        for img in images_dir.iterdir():
            if img.suffix.lower() in IMAGE_EXT:
                label = label_for(labels_dir / (img.stem + ".txt"), min_area)
                if label is not None:
                    yield img, label


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="D-Fire root folder")
    ap.add_argument("--out", type=Path, default=Path("data/dfire"))
    ap.add_argument("--per-class", type=int, default=800, help="max images per class (0 = all)")
    ap.add_argument("--seed", type=int, default=42, help="random seed (reproducible sample)")
    ap.add_argument("--min-smoke-area", type=float, default=0.05,
                    help="skip smoke images whose boxes cover less than this fraction (0 = keep all)")
    ap.add_argument("--min-fire-area", type=float, default=0.01,
                    help="skip fire images whose boxes cover less than this fraction (0 = keep all)")
    args = ap.parse_args()
    min_area = {"smoke": args.min_smoke_area, "fire": args.min_fire_area}

    by_class = defaultdict(list)
    for img, label in find_pairs(args.src, min_area):
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
