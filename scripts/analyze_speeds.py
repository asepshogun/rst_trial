#!/usr/bin/env python3
"""
Compute per-vehicle speed from a NiceCount analysis report, using the two count lines.

speed = distance_between_lines / |t2 - t1|

where t1, t2 are the times a vehicle's track crossed line 1 and line 2. This works on
ANY existing report JSON (storage/reports/<job_id>.json) WITHOUT changing the app, so
you can test the idea and calibrate the distance before baking speed into the pipeline.

Usage
-----
  python scripts/analyze_speeds.py storage/reports/<job_id>.json --distance 5
  python scripts/analyze_speeds.py report.json --distance 5 --csv speeds.csv

--distance  : real-world distance between the two count lines, in METERS (required).
--min-kph / --max-kph : plausibility filter; speeds outside are dropped as artifacts.
--csv       : optional path to write per-vehicle rows for your own analysis.

Notes
-----
- A vehicle needs a crossing on BOTH lines (same track_id) to get a speed.
- If the two lines are close, the time gap is small and each speed is noisy; the script
  prints the median time gap and an uncertainty estimate so you know how much to trust it.
- Synthesized crossings (events flagged "synthesized": true) are skipped, since their
  time is estimated, not measured.
"""
from __future__ import annotations
import argparse, json, statistics, csv, sys
from collections import defaultdict


def pct(sorted_vals, p):
    if not sorted_vals:
        return float("nan")
    return sorted_vals[min(len(sorted_vals) - 1, max(0, int(p / 100.0 * len(sorted_vals))))]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("report", help="path to an analysis report JSON")
    ap.add_argument("--distance", type=float, required=True, help="distance between the two lines, in meters")
    ap.add_argument("--min-kph", type=float, default=1.0)
    ap.add_argument("--max-kph", type=float, default=200.0)
    ap.add_argument("--fps", type=float, default=None, help="source fps, for the uncertainty note (auto-read if omitted)")
    ap.add_argument("--csv", default=None, help="optional output CSV of per-vehicle speeds")
    args = ap.parse_args()

    if args.distance <= 0:
        print("ERROR: --distance must be positive (meters between the two lines).")
        return 1

    data = json.load(open(args.report, encoding="utf-8"))
    events = data.get("events", [])
    if not events:
        print("No events found in this report.")
        return 1

    # try to read source fps for the uncertainty estimate
    fps = args.fps
    if fps is None:
        def find_fps(d):
            if isinstance(d, dict):
                if "source_fps" in d:
                    return d["source_fps"]
                if "fps" in d and isinstance(d.get("fps"), (int, float)):
                    return d["fps"]
                for v in d.values():
                    r = find_fps(v)
                    if r:
                        return r
            return None
        fps = find_fps(data) or 25.0

    by_track = defaultdict(list)
    for e in events:
        tid = e.get("track_id")
        if tid is None or e.get("synthesized"):
            continue
        by_track[int(tid)].append(e)

    rows = []          # (track_id, vehicle_class, golongan, t1, t2, dt, speed_kph)
    dropped = 0
    for tid, evs in by_track.items():
        earliest_per_line = {}
        for e in evs:
            o = e.get("count_line_order")
            if o is None:
                continue
            o = int(o)
            t = float(e.get("crossed_at_seconds") or 0.0)
            if o not in earliest_per_line or t < earliest_per_line[o][0]:
                earliest_per_line[o] = (t, e)
        if len(earliest_per_line) < 2:
            continue
        ordered = sorted(earliest_per_line.values(), key=lambda x: x[0])
        t1, e1 = ordered[0]
        t2, e2 = ordered[-1]
        dt = t2 - t1
        if dt <= 0:
            continue
        speed = args.distance / dt * 3.6
        if speed < args.min_kph or speed > args.max_kph:
            dropped += 1
            continue
        rows.append((tid, e1.get("vehicle_class"), e1.get("golongan_code"), round(t1, 3), round(t2, 3), round(dt, 3), round(speed, 1)))

    if not rows:
        print("No vehicles crossed both lines with a valid time gap. Check that this report has two lines.")
        return 1

    speeds = sorted(r[6] for r in rows)
    dts = sorted(r[5] for r in rows)
    median_dt = statistics.median(dts)
    frame_dt = 1.0 / max(fps, 1.0)
    uncertainty_pct = 100.0 * frame_dt / max(median_dt, 1e-6)

    print("=" * 60)
    print(f"SPEED SUMMARY  (distance between lines = {args.distance} m, fps = {fps:.2f})")
    print("=" * 60)
    print(f"vehicles with a speed     : {len(rows)}")
    print(f"dropped as implausible    : {dropped}  (outside {args.min_kph}-{args.max_kph} km/h)")
    print(f"\nspeed km/h: median={statistics.median(speeds):.1f}  mean={statistics.mean(speeds):.1f}")
    print(f"           p10={pct(speeds,10):.0f}  p25={pct(speeds,25):.0f}  p75={pct(speeds,75):.0f}  p90={pct(speeds,90):.0f}")
    print(f"           min={speeds[0]:.0f}  max={speeds[-1]:.0f}")
    print(f"\ntime gap Δt between lines : median={median_dt:.2f}s  (1 frame = {frame_dt*1000:.0f} ms)")
    print(f"per-vehicle uncertainty   : ~+/-{uncertainty_pct:.0f}% from frame timing at the median gap")
    if uncertainty_pct > 12:
        print("   ^ lines are close: single-vehicle speeds are noisy. Aggregate (median) is more reliable.")
        print("     For tighter speeds, space the lines further apart and/or convert video to CFR.")

    # per-class breakdown
    print("\nby vehicle class (median km/h):")
    by_class = defaultdict(list)
    for r in rows:
        by_class[r[1] or "?"].append(r[6])
    for cls, sp in sorted(by_class.items(), key=lambda kv: -len(kv[1])):
        s = sorted(sp)
        print(f"   {str(cls):12s} n={len(sp):5d}  median={statistics.median(s):5.1f}  p10={pct(s,10):3.0f}  p90={pct(s,90):3.0f}")

    # simple text histogram
    print("\nhistogram (km/h):")
    buckets = list(range(0, int(max(speeds)) + 10, 10))
    counts = [0] * len(buckets)
    for s in speeds:
        counts[min(len(buckets) - 1, int(s // 10))] += 1
    peak = max(counts) or 1
    for b, c in zip(buckets, counts):
        if c:
            print(f"   {b:3d}-{b+9:3d} | {'#' * max(1, int(40*c/peak))} {c}")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["track_id", "vehicle_class", "golongan_code", "line1_time_s", "line2_time_s", "dt_s", "speed_kph"])
            w.writerows(sorted(rows, key=lambda r: r[3]))
        print(f"\nwrote {len(rows)} rows to {args.csv}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
