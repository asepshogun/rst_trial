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
--csv       : optional path to write per-vehicle rows to CSV for your own analysis.
--excel     : optional path to write per-vehicle rows to Excel for your own analysis.

Notes
-----
- A vehicle needs a crossing on BOTH lines (same track_id) to get a speed.
- If the two lines are close, the time gap is small and each speed is noisy; the script
  prints the median time gap and an uncertainty estimate so you know how much to trust it.
- Synthesized crossings (events flagged "synthesized": true) are skipped, since their
  time is estimated, not measured.
"""
from __future__ import annotations
import argparse, json, statistics, csv, sys, html
from collections import defaultdict
from datetime import datetime


def pct(sorted_vals, p):
    if not sorted_vals:
        return float("nan")
    return sorted_vals[min(len(sorted_vals) - 1, max(0, int(p / 100.0 * len(sorted_vals))))]


def main() -> int:
    print("123123132123132131231321312312")
    print("123123132123132131231321312312")
    print("123123132123132131231321312312")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("report", help="path to an analysis report JSON")
    ap.add_argument("--distance", type=float, required=True, help="distance between the two lines, in meters")
    ap.add_argument("--min-kph", type=float, default=1.0)
    ap.add_argument("--max-kph", type=float, default=200.0)
    ap.add_argument("--fps", type=float, default=None, help="source fps, for the uncertainty note (auto-read if omitted)")
    ap.add_argument("--csv", default=None, help="optional output CSV of per-vehicle speeds")
    ap.add_argument("--excel", default=None, help="optional output Excel of per-vehicle speeds")
    ap.add_argument("--video-name", default=None, help="video filename for the Excel meta header")
    ap.add_argument("--manual-export", action="store_true", default=False,
                     help="if set, 'Exported At' shows the current timestamp; otherwise it is left blank (auto-generated)")
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
                
        if not earliest_per_line:
            continue
            
        t1_val = earliest_per_line.get(1, (None, None))[0]
        t2_val = earliest_per_line.get(2, (None, None))[0]
        
        ordered = sorted(earliest_per_line.values(), key=lambda x: x[0])
        _, e_main = ordered[0]
        
        dt = None
        speed = None
        
        first_t, _ = ordered[0]
        last_t, _ = ordered[-1]
        dt_calc = last_t - first_t
        if dt_calc > 0:
            speed_calc = args.distance / dt_calc * 3.6
            if args.min_kph <= speed_calc <= args.max_kph:
                dt = dt_calc
                speed = speed_calc
            else:
                dropped += 1
                
        detected_type = e_main.get("vehicle_type_label") or e_main.get("detected_label") or e_main.get("source_label") or e_main.get("vehicle_class") or "-"
        class_code = str(e_main.get("golongan_code") or "-")
        class_label = e_main.get("golongan_label") or "-"
        direction = e_main.get("direction") or "-"
        
        conf = e_main.get("confidence")
        confidence_str = f"{float(conf)*100:.1f}%" if conf is not None else "-"
        
        rows.append((
            tid, detected_type, class_code, class_label, direction, confidence_str,
            round(t1_val, 3) if t1_val is not None else None, 
            round(t2_val, 3) if t2_val is not None else None, 
            round(dt, 3) if dt is not None else None, 
            round(speed, 1) if speed is not None else None
        ))

    if not rows:
        print("No vehicles crossed any lines. Check the report data.")
        return 1

    speeds = sorted(r[9] for r in rows if r[9] is not None)
    dts = sorted(r[8] for r in rows if r[8] is not None)
    
    if speeds and dts:
        median_dt = statistics.median(dts)
        frame_dt = 1.0 / max(fps, 1.0)
        uncertainty_pct = 100.0 * frame_dt / max(median_dt, 1e-6)
    
        print("=" * 60)
        print(f"SPEED SUMMARY  (distance between lines = {args.distance} m, fps = {fps:.2f})")
        print("=" * 60)
        print(f"total vehicles            : {len(rows)}")
        print(f"vehicles with a speed     : {len(speeds)}")
        print(f"dropped as implausible    : {dropped}  (outside {args.min_kph}-{args.max_kph} km/h)")
        print(f"\nspeed km/h: median={statistics.median(speeds):.1f}  mean={statistics.mean(speeds):.1f}")
        print(f"           p10={pct(speeds,10):.0f}  p25={pct(speeds,25):.0f}  p75={pct(speeds,75):.0f}  p90={pct(speeds,90):.0f}")
        print(f"           min={speeds[0]:.0f}  max={speeds[-1]:.0f}")
        print(f"\ntime gap Δt between lines : median={median_dt:.2f}s  (1 frame = {frame_dt*1000:.0f} ms)")
        print(f"per-vehicle uncertainty   : ~+/-{uncertainty_pct:.0f}% from frame timing at the median gap")
        if uncertainty_pct > 12:
            print("   ^ lines are close: single-vehicle speeds are noisy. Aggregate (median) is more reliable.")
            print("     For tighter speeds, space the lines further apart and/or convert video to CFR.")
    
        print("\nby vehicle class (median km/h):")
        by_class = defaultdict(list)
        for r in rows:
            if r[9] is not None:
                by_class[r[1] or "?"].append(r[9])
        for cls, sp in sorted(by_class.items(), key=lambda kv: -len(kv[1])):
            s = sorted(sp)
            if s:
                print(f"   {str(cls):12s} n={len(sp):5d}  median={statistics.median(s):5.1f}  p10={pct(s,10):3.0f}  p90={pct(s,90):3.0f}")
    
        print("\nhistogram (km/h):")
        buckets = list(range(0, int(max(speeds)) + 10, 10))
        counts = [0] * len(buckets)
        for s in speeds:
            counts[min(len(buckets) - 1, int(s // 10))] += 1
        peak = max(counts) or 1
        for b, c in zip(buckets, counts):
            if c:
                print(f"   {b:3d}-{b+9:3d} | {'#' * max(1, int(40*c/peak))} {c}")
    else:
        print("No vehicles crossed both lines to compute speeds, but exporting available events.")

    def sort_key(r):
        times = [t for t in (r[6], r[7]) if t is not None]
        return min(times) if times else 0

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["track_id", "Detected Type", "Class Code", "Class Label", "Direction", "Confidence", "line1_time_s", "line2_time_s", "dt_s", "speed_kph"])
            w.writerows(sorted(rows, key=sort_key))
        print(f"\nwrote {len(rows)} rows to {args.csv}")

    if args.excel:
        def safe_cell(value):
            """Escape HTML special chars, matching safeExcelCell in the frontend."""
            text = str(value) if value is not None else ""
            return html.escape(text).replace("\n", "<br/>")

        video_name = safe_cell(args.video_name or "-")
        exported_at = ""
        if args.manual_export:
            exported_at = safe_cell(datetime.now().strftime("%d/%m/%Y, %H:%M:%S"))
        total_rows = len(rows)

        sorted_rows = sorted(rows, key=sort_key)
        data_rows = []
        for idx, r in enumerate(sorted_rows, 1):
            cells = "".join(
                f"        <td>{safe_cell(val)}</td>\n"
                for val in (idx, *r)
            )
            data_rows.append(f"      <tr>\n{cells}      </tr>")
        data_rows_html = "\n".join(data_rows)

        excel_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {{ font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #d1d5db; padding: 8px 10px; vertical-align: top; }}
    th {{ background: #eef6ff; font-weight: 700; text-align: left; }}
    .meta {{ margin-bottom: 16px; }}
    .meta td {{ border: none; padding: 4px 0; }}
    .title {{ font-size: 18px; font-weight: 700; padding-bottom: 8px; }}
  </style>
</head>
<body>
  <table class="meta">
    <tr><td class="title" colspan="2">Detected Vehicles Speed Export</td></tr>
    <tr><td><strong>Video</strong></td><td>{video_name}</td></tr>
    <tr><td><strong>Exported At</strong></td><td>{exported_at}</td></tr>
    <tr><td><strong>Total Rows</strong></td><td>{total_rows}</td></tr>
  </table>

  <table>
    <thead>
      <tr>
        <th>No</th>
        <th>ID</th>
        <th>Detected Type</th>
        <th>Class Code</th>
        <th>Class Label</th>
        <th>Direction</th>
        <th>Confidence</th>
        <th>line1_time_s</th>
        <th>line2_time_s</th>
        <th>dt_s</th>
        <th>Speed (km/h)</th>
      </tr>
    </thead>
    <tbody>
      {data_rows_html}
    </tbody>
  </table>
</body>
</html>"""

        with open(args.excel, "w", encoding="utf-8") as f:
            f.write("\ufeff")
            f.write(excel_html)
        print(f"\nwrote {len(rows)} rows to {args.excel}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
