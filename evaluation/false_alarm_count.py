"""Count false alarms: gas only vs gas + camera (requirements R11 and R12).

The MKR prints one line per fusion event (see firmware/mkr_fusion):
    FUSION,<millis>,<event>,<state>,<reason>,<camLabel>,<conf>,<votes>,<gas>,<flame>
Events: TRIGGER (gas anomaly starts an episode), SUSPECT, ALARM, CLEARED.

Every TRIGGER is one "episode". In a gas-only system every episode is an alarm.
With fusion, only the episodes that reach ALARM are alarms.

Two steps:
  1. extract: read serial logs and write one row per episode, with an empty
     "truth" column:
        python evaluation/false_alarm_count.py extract logs/T-05.txt -o episodes.csv
  2. Fill in "truth" by hand (fire = there really was smoke/fire, none = there was not),
     using your test log (R25). Then:
        python evaluation/false_alarm_count.py report episodes.csv --hours 2.5
     --hours = total test duration, for false alarms per hour. If it is left out,
     the duration is taken from the first to the last log line, per log file.
"""
import argparse
import csv
from pathlib import Path

FIELDS = ["log", "episode", "start_ms", "end_ms", "fused_alarm", "reason",
          "cam_label", "cam_conf", "truth"]


def parse_log(path: Path):
    """Return (episodes, span_ms) for one serial log file."""
    episodes, current = [], None
    first = last = None
    for line in path.read_text(errors="replace").splitlines():
        line = line.strip()
        if not line.startswith("FUSION,"):
            continue
        p = line.split(",")
        if len(p) < 10:
            continue
        ms, event, reason, cam, conf = int(p[1]), p[2], p[4], p[5], p[6]
        first = ms if first is None else first
        last = ms
        if event == "TRIGGER":
            if current:                      # previous one never closed (log cut)
                episodes.append(current)
            current = {"log": path.name, "episode": len(episodes) + 1, "start_ms": ms,
                       "end_ms": "", "fused_alarm": 0, "reason": "", "cam_label": cam,
                       "cam_conf": conf, "truth": ""}
        elif current:
            current["cam_label"], current["cam_conf"] = cam, conf
            if event == "ALARM":
                current["fused_alarm"] = 1
                current["reason"] = reason
            elif event == "CLEARED":
                current["end_ms"] = ms
                episodes.append(current)
                current = None
    if current:
        episodes.append(current)
    span = (last - first) if first is not None else 0
    return episodes, span


def cmd_extract(args):
    rows, total_span = [], 0
    for log in args.logs:
        eps, span = parse_log(log)
        rows += eps
        total_span += span
    with open(args.output, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} episodes written to {args.output}")
    print(f"logged time: {total_span / 3_600_000:.2f} h (use --hours if the test was longer)")
    print("now fill the 'truth' column with 'fire' or 'none' and run 'report'")


def cmd_report(args):
    with open(args.episodes, newline="") as f:
        rows = list(csv.DictReader(f))
    unlabelled = [r for r in rows if r["truth"].strip().lower() not in ("fire", "none")]
    if unlabelled:
        raise SystemExit(f"{len(unlabelled)} episodes have no truth (fire/none), e.g. {unlabelled[0]}")

    real = [r for r in rows if r["truth"].strip().lower() == "fire"]
    fake = [r for r in rows if r["truth"].strip().lower() == "none"]
    fused_fa = [r for r in fake if r["fused_alarm"] == "1"]
    fused_hit = [r for r in real if r["fused_alarm"] == "1"]

    print(f"episodes (gas anomalies): {len(rows)}  real: {len(real)}  false triggers: {len(fake)}\n")
    print(f"{'':28s}{'gas only':>10s}{'gas+camera':>12s}")
    print(f"{'false alarms':28s}{len(fake):10d}{len(fused_fa):12d}")
    print(f"{'real events detected':28s}{len(real):10d}{len(fused_hit):12d}")
    if args.hours:
        print(f"{'false alarms per hour':28s}{len(fake) / args.hours:10.2f}{len(fused_fa) / args.hours:12.2f}")
    if fake:
        print(f"\nfusion removed {100 * (1 - len(fused_fa) / len(fake)):.0f}% of the false alarms")
    if real and len(fused_hit) < len(real):
        print(f"WARNING: fusion missed {len(real) - len(fused_hit)} real event(s)")

    reasons = {}
    for r in rows:
        if r["fused_alarm"] == "1":
            reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
    if reasons:
        print("alarm reasons: " + ", ".join(f"{k} {v}" for k, v in sorted(reasons.items())))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract", help="serial logs -> episodes.csv")
    e.add_argument("logs", type=Path, nargs="+")
    e.add_argument("-o", "--output", type=Path, default=Path("episodes.csv"))
    r = sub.add_parser("report", help="labelled episodes.csv -> counts")
    r.add_argument("episodes", type=Path)
    r.add_argument("--hours", type=float, help="total test duration in hours")
    args = ap.parse_args()
    cmd_extract(args) if args.cmd == "extract" else cmd_report(args)


if __name__ == "__main__":
    main()
