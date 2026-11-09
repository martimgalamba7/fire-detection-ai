"""Upload the processed dataset to Edge Impulse (Ingestion API).

    train/ + val/  -> Edge Impulse "Training" (Edge Impulse makes its own validation split)
    test/          -> Edge Impulse "Test"
The label is taken from the folder name (smoke / fire / normal).

API key: Edge Impulse > Dashboard > Keys > Add new API key, role "Ingestion".
Put it in a file named .env in the repository root (it is in .gitignore):
    EI_API_KEY=ei_xxxxxxxx

Usage:
    python dataset_tools/upload_edge_impulse.py data/processed
    python dataset_tools/upload_edge_impulse.py data/processed --dry-run
Files that already exist in the project (same name) are skipped by Edge Impulse
when "x-disallow-duplicates" is set, so the script can be re-run safely.
"""
import argparse
import os
import sys
import time
import urllib.request
import uuid
from pathlib import Path

INGESTION_URL = "https://ingestion.edgeimpulse.com/api/{category}/files"
CLASSES = ("smoke", "fire", "normal")
SPLIT_TO_CATEGORY = {"train": "training", "val": "training", "test": "testing"}


def load_api_key(repo_root: Path) -> str:
    key = os.environ.get("EI_API_KEY")
    env_file = repo_root / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.strip().startswith("EI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    if not key:
        sys.exit("No API key: put EI_API_KEY=... in .env (see the docstring)")
    return key


def upload(path: Path, label: str, category: str, key: str) -> int:
    """Send one image as multipart/form-data. Returns the HTTP status."""
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"data\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: image/jpeg\r\n\r\n").encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(INGESTION_URL.format(category=category), data=body, method="POST", headers={
        "x-api-key": key,
        "x-label": label,
        "x-disallow-duplicates": "1",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if e.code < 500:
                print(f"  {path.name}: HTTP {e.code} {e.read()[:200]!r}")
                return e.code
        except urllib.error.URLError:
            pass
        time.sleep(2 * (attempt + 1))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", type=Path, help="output of preprocess.py")
    ap.add_argument("--dry-run", action="store_true", help="only count what would be uploaded")
    args = ap.parse_args()

    jobs = [(img, cls, SPLIT_TO_CATEGORY[split])
            for split in SPLIT_TO_CATEGORY for cls in CLASSES
            for img in sorted((args.root / split / cls).glob("*.jpg"))]
    print(f"{len(jobs)} images: "
          f"{sum(c == 'training' for *_, c in jobs)} training, {sum(c == 'testing' for *_, c in jobs)} testing")
    if args.dry_run or not jobs:
        return

    key = load_api_key(Path(__file__).resolve().parent.parent)
    ok = failed = 0
    for i, (img, label, category) in enumerate(jobs, 1):
        if upload(img, label, category, key) == 200:
            ok += 1
        else:
            failed += 1
        if i % 100 == 0 or i == len(jobs):
            print(f"  {i}/{len(jobs)} done ({failed} failed)")
    print(f"uploaded {ok}, failed {failed}")


if __name__ == "__main__":
    main()
