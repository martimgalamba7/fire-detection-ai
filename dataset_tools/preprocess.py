"""Resize, de-duplicate and split images into train / val / test.

Inputs (one sub-folder per class: smoke/, fire/, normal/):
    --dfire data/dfire   D-Fire images  -> only train / val
    --own   data/own     own ESP32-CAM  -> train / val / test

The TEST set contains ONLY own images, never seen in training.

Steps:
    1. Every image is resized to 320x240 (the ESP32-CAM QVGA size): scale so the
       short side fits, then crop the centre. D-Fire images then look like
       camera frames.
    2. Near-duplicates are removed with a difference hash (dHash). Images whose
       hashes differ in <= --dup-threshold bits count as the same picture.
       This matters for own images taken in bursts: otherwise almost identical
       frames end up in both train and test.
    3. Random split with a fixed seed. A manifest.csv records every file.

Usage:
    python dataset_tools/preprocess.py --dfire data/dfire --own data/own --out data/processed
Output:
    data/processed/{train,val,test}/{smoke,fire,normal}/<origin>_<name>.jpg
    data/processed/manifest.csv
"""
import argparse
import csv
import random
from pathlib import Path

from PIL import Image, ImageOps

CLASSES = ("smoke", "fire", "normal")
IMAGE_EXT = {".jpg", ".jpeg", ".png"}
TARGET_SIZE = (320, 240)


def dhash(img: Image.Image, size: int = 8) -> int:
    """64-bit difference hash: compares neighbouring pixels of a tiny grey image."""
    small = img.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    px = list(small.tobytes())   # one byte (0-255) per pixel in "L" mode
    bits = 0
    for row in range(size):
        for col in range(size):
            left = px[row * (size + 1) + col]
            right = px[row * (size + 1) + col + 1]
            bits = (bits << 1) | (left > right)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def load_images(folder: Path | None, origin: str):
    """Yield (path, class, origin) for every image in folder/<class>/."""
    if folder is None:
        return
    for cls in CLASSES:
        d = folder / cls
        if not d.is_dir():
            print(f"warning: {d} not found, skipped")
            continue
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in IMAGE_EXT:
                yield p, cls, origin


def split_counts(n: int, fractions: tuple[float, ...]) -> list[int]:
    """Split n items by fractions; the rounding remainder goes to the first part."""
    counts = [int(n * f) for f in fractions]
    counts[0] += n - sum(counts)
    return counts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dfire", type=Path, help="D-Fire class folders (from convert_dfire.py)")
    ap.add_argument("--own", type=Path, help="own ESP32-CAM class folders")
    ap.add_argument("--out", type=Path, default=Path("data/processed"))
    ap.add_argument("--dfire-val", type=float, default=0.15, help="fraction of D-Fire for val")
    ap.add_argument("--dfire-test", type=float, default=0.0,
                    help="fraction of D-Fire for a TEMPORARY test set (only until own images exist)")
    ap.add_argument("--own-val", type=float, default=0.20, help="fraction of own images for val")
    ap.add_argument("--own-test", type=float, default=0.30, help="fraction of own images for test")
    ap.add_argument("--dup-threshold", type=int, default=4, help="max dHash bit difference for a duplicate")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    if not args.dfire and not args.own:
        ap.error("give --dfire and/or --own")
    if args.out.exists() and any(args.out.iterdir()):
        ap.error(f"{args.out} is not empty; remove it first so old files do not mix in")

    # 1 + 2: load, resize, de-duplicate (per class, across both origins)
    kept = {}        # (origin, cls) -> list of (name, Image)
    hashes = {cls: [] for cls in CLASSES}
    dropped = unreadable = 0
    for path, cls, origin in [*load_images(args.dfire, "dfire"), *load_images(args.own, "own")]:
        try:
            img = Image.open(path)
            img = ImageOps.exif_transpose(img).convert("RGB")
        except OSError:
            unreadable += 1
            continue
        img = ImageOps.fit(img, TARGET_SIZE, Image.Resampling.LANCZOS)
        h = dhash(img)
        if any(hamming(h, other) <= args.dup_threshold for other in hashes[cls]):
            dropped += 1
            continue
        hashes[cls].append(h)
        name = path.stem if path.stem.startswith(origin + "_") else f"{origin}_{path.stem}"
        kept.setdefault((origin, cls), []).append((name, img))

    # 3: split and save
    rng = random.Random(args.seed)
    rows = []
    for (origin, cls), items in sorted(kept.items()):
        rng.shuffle(items)
        if origin == "own":
            parts = ("train", "val", "test")
            counts = split_counts(len(items), (1 - args.own_val - args.own_test, args.own_val, args.own_test))
        elif args.dfire_test > 0:
            # Temporary test set while there are no own images yet.
            parts = ("train", "val", "test")
            counts = split_counts(len(items), (1 - args.dfire_val - args.dfire_test, args.dfire_val, args.dfire_test))
        else:
            parts = ("train", "val")
            counts = split_counts(len(items), (1 - args.dfire_val, args.dfire_val))
        start = 0
        for split, n in zip(parts, counts):
            for name, img in items[start:start + n]:
                dest = args.out / split / cls / f"{name}.jpg"
                dest.parent.mkdir(parents=True, exist_ok=True)
                img.save(dest, quality=90)
                rows.append({"file": dest.relative_to(args.out).as_posix(), "split": split,
                             "class": cls, "origin": origin})
            start += n

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "manifest.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "split", "class", "origin"])
        w.writeheader()
        w.writerows(rows)

    print(f"saved {len(rows)} images, removed {dropped} near-duplicates, {unreadable} unreadable")
    print(f"run: python dataset_tools/stats.py {args.out}")


if __name__ == "__main__":
    main()
