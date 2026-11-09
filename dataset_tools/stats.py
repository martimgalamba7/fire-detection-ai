"""Count images per split, class and origin (D-Fire vs own).

Works on the output of preprocess.py (reads manifest.csv), or on any folder of
the form <root>/[split/]<class>/<file>, using the file-name prefix "dfire_"
to tell the origin.

Usage:
    python dataset_tools/stats.py data/processed
    python dataset_tools/stats.py data/own --markdown     # table for the model card
"""
import argparse
import csv
from collections import Counter
from pathlib import Path

CLASSES = ("smoke", "fire", "normal")
IMAGE_EXT = {".jpg", ".jpeg", ".png"}


def rows_from_manifest(root: Path):
    with open(root / "manifest.csv", newline="") as f:
        for r in csv.DictReader(f):
            yield r["split"], r["class"], r["origin"]


def rows_from_folders(root: Path):
    for p in root.rglob("*"):
        if p.suffix.lower() not in IMAGE_EXT or p.parent.name not in CLASSES:
            continue
        rel = p.relative_to(root).parts
        split = rel[0] if len(rel) == 3 else "-"
        origin = "dfire" if p.name.startswith("dfire_") else "own"
        yield split, p.parent.name, origin


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", type=Path)
    ap.add_argument("--markdown", action="store_true", help="print a Markdown table")
    args = ap.parse_args()

    source = rows_from_manifest if (args.root / "manifest.csv").exists() else rows_from_folders
    counts = Counter(source(args.root))
    if not counts:
        raise SystemExit(f"no images found in {args.root}")

    splits = sorted({s for s, _, _ in counts}, key=lambda s: ["train", "val", "test", "-"].index(s)
                    if s in ("train", "val", "test", "-") else 9)
    sep = " | " if args.markdown else "  "
    header = ["split", "origin", *CLASSES, "total"]
    if args.markdown:
        print("| " + " | ".join(header) + " |")
        print("|" + "---|" * len(header))
    else:
        print(sep.join(f"{h:>7s}" for h in header))

    for split in splits:
        for origin in ("dfire", "own"):
            n = [counts[(split, c, origin)] for c in CLASSES]
            if sum(n) == 0:
                continue
            cells = [split, origin, *map(str, n), str(sum(n))]
            print(("| " + sep.join(cells) + " |") if args.markdown else sep.join(f"{c:>7s}" for c in cells))

    total = sum(counts.values())
    per_class = {c: sum(v for (_, cls, _), v in counts.items() if cls == c) for c in CLASSES}
    print(f"\ntotal {total} images; " + ", ".join(f"{c} {per_class[c]}" for c in CLASSES))
    if any(s == "test" and o == "dfire" for s, _, o in counts):
        print("WARNING: the test split contains D-Fire images - it should be own images only!")
    small = min(per_class.values())
    if small and max(per_class.values()) > 2 * small:
        print("note: classes are unbalanced (largest > 2x smallest)")


if __name__ == "__main__":
    main()
