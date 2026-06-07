#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Traffic Fundamental Diagram (speed - flow - density) from two detection lines.
================================================================================

Input
-----
Two "detected vehicles" exports from a video vehicle-detection system. Despite
the .xls extension they are HTML tables. Each row is one vehicle crossing a
virtual counting line, with columns:
    No | Time | ID | Detected Type | Class Code | Class Label | Direction | Confidence

The two files are two parallel counting lines a known distance apart at the same
road cross-section. A vehicle keeps the SAME tracking ID on both lines, so the
two files together act as a "speed trap":

        speed_i = D / | t_line1(i) - t_line2(i) |

Method
------
For each time interval (default 60 s), at the reference line:
    q (flow)    = vehicles crossing per interval, scaled to veh/h
    v (speed)   = SPACE-mean speed = harmonic mean of the matched vehicles' speeds
    k (density) = q / v                       (the fundamental relation q = k*v)

Then it plots the three fundamental diagrams (q-k, v-k, v-q) and fits the
Greenshields linear speed-density model to estimate free-flow speed, jam
density and capacity. Aggregated data is written to CSV.

IMPORTANT - YOU MUST SET TWO THINGS BELOW
-----------------------------------------
1. LINE_SPACING_M : the real distance between Line 1 and Line 2 in metres.
   This is NOT in the data. It linearly scales every speed and (inversely)
   every density. Measure it from the video calibration / road markings.
2. FILE_LINE1 / FILE_LINE2 : the input file paths.

Usage:  python3 fundamental_diagram.py
Requires: pandas, numpy, matplotlib, lxml   (pip install pandas numpy matplotlib lxml)
"""

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")            # no display needed; saves PNG files
import matplotlib.pyplot as plt

# =============================================================================
# 1. CONFIGURATION  -- edit these
# =============================================================================
FILE_LINE1 = "250520260456_b30c_detected_vehicles_line_1_2026-06-01-21-45-43.xls"
FILE_LINE2 = "250520260456_b30c_detected_vehicles_line_2_2026-06-01-21-48-46.xls"

LINE_SPACING_M = 5.0     # <<< REQUIRED: real distance between the two lines (metres)

DIRECTION   = "normal"   # which traffic direction to analyse: "normal", "opposite" or "all"
INTERVAL_S  = 60         # aggregation interval in seconds (60 = 1 min)

# Plausible same-vehicle match window for the speed trap (seconds).
# Pairs outside this are tracker ID reuse over the long video, not real crossings.
MAX_MATCH_DT_S = 5.0

# Discard physically impossible speeds (km/h) before averaging.
MIN_SPEED_KMH, MAX_SPEED_KMH = 1.0, 120.0

# Convert counts to Passenger Car Units?  Traffic here is ~80% motorcycles, so
# PCU gives more meaningful flow/density for engineering. Set True to enable.
# Factors below follow Indonesian PKJI/MKJI urban-road practice (edit as needed).
USE_PCU = False
PCU_FACTORS = {
    "Motorcycle / 3-wheel vehicle":    0.25,
    "Sedan / jeep / station wagon":    1.00,
    "Pickup / micro truck / delivery": 1.00,
    "Medium passenger vehicle":        1.00,
    "Small bus":                       1.30,
    "Large bus":                       1.50,
    "Light 2-axle truck":              1.30,
    "Medium 2-axle truck":             1.50,
    "3-axle truck":                    2.00,
    "Articulated truck":               2.50,
    "Semi-trailer truck":              2.50,
    "Non-motorized vehicle":           0.50,
}
PCU_DEFAULT = 1.0

OUT_CSV  = "fundamental_diagram_data.csv"
OUT_PLOT = "fundamental_diagram.png"


# =============================================================================
# 2. LOAD & CLEAN
# =============================================================================
def parse_time_to_seconds(value):
    """Time field mixes '12.25 s' and '1.02 min'. Return seconds as float."""
    s = str(value).strip().lower()
    if s.endswith("min"):
        return float(s.replace("min", "").strip()) * 60.0
    if s.endswith("s"):
        return float(s.replace("s", "").strip())
    try:
        return float(s)
    except ValueError:
        return np.nan


def load_line(path):
    """Read one HTML-as-xls export; return the detection table as a DataFrame."""
    tables = pd.read_html(path)            # last table is the detection log
    df = tables[-1].copy()
    df["t"] = df["Time"].map(parse_time_to_seconds)
    df["Confidence"] = (df["Confidence"].astype(str)
                        .str.replace("%", "", regex=False).astype(float))
    df = df.dropna(subset=["t"])
    return df


print("Loading detection lines ...")
d1 = load_line(FILE_LINE1)
d2 = load_line(FILE_LINE2)
print(f"  Line 1: {len(d1):,} detections   Line 2: {len(d2):,} detections")


# =============================================================================
# 3. SPEED TRAP  -- match vehicles by ID across both lines
# =============================================================================
m = d1[["ID", "t", "Direction", "Class Label"]].merge(
        d2[["ID", "t"]], on="ID", suffixes=("_L1", "_L2"))

m["dt"] = (m["t_L1"] - m["t_L2"]).abs()                       # travel time (s)
m = m[(m["dt"] > 0) & (m["dt"] <= MAX_MATCH_DT_S)].copy()     # keep real crossings

m["speed_kmh"] = (LINE_SPACING_M / m["dt"]) * 3.6             # v = D/dt
m = m[(m["speed_kmh"] >= MIN_SPEED_KMH) &
      (m["speed_kmh"] <= MAX_SPEED_KMH)].copy()

# bin each vehicle by its Line-1 crossing time
m["bin"] = (m["t_L1"] // INTERVAL_S).astype(int)
# PCU weight per vehicle
m["pcu"] = (m["Class Label"].map(PCU_FACTORS).fillna(PCU_DEFAULT)
            if USE_PCU else 1.0)

if DIRECTION in ("normal", "opposite"):
    m = m[m["Direction"] == DIRECTION].copy()

print(f"  Usable speed-trap pairs ({DIRECTION}): {len(m):,}")
if len(m) == 0:
    raise SystemExit("No usable matched pairs - check DIRECTION / MAX_MATCH_DT_S.")


# =============================================================================
# 4. AGGREGATE PER INTERVAL  ->  q, v, k
# =============================================================================
def harmonic_mean(speeds, weights):
    """Space-mean speed = weighted harmonic mean of individual speeds."""
    w = np.asarray(weights, float)
    return w.sum() / np.sum(w / np.asarray(speeds, float))

rows = []
for b, g in m.groupby("bin"):
    n_pcu = g["pcu"].sum()                       # (PCU-)count in the interval
    q = n_pcu * (3600.0 / INTERVAL_S)            # flow, veh(or PCU)/h
    v = harmonic_mean(g["speed_kmh"], g["pcu"])  # space-mean speed, km/h
    k = q / v if v > 0 else np.nan               # density, veh(or PCU)/km
    rows.append({"bin": b, "t_start_s": b * INTERVAL_S,
                 "count": len(g), "flow_q": q, "speed_v": v, "density_k": k})

fd = pd.DataFrame(rows).dropna().sort_values("t_start_s").reset_index(drop=True)
unit = "PCU" if USE_PCU else "veh"
print(f"  Aggregated into {len(fd):,} intervals of {INTERVAL_S}s")
print(fd[["flow_q", "speed_v", "density_k"]].describe().round(1).to_string())


# =============================================================================
# 5. GREENSHIELDS MODEL FIT  (linear speed-density:  v = vf - (vf/kj) * k)
# =============================================================================
slope, intercept = np.polyfit(fd["density_k"], fd["speed_v"], 1)
vf = intercept                       # free-flow speed (km/h)
kj = -vf / slope if slope < 0 else np.nan   # jam density (veh/km)
q_cap = vf * kj / 4 if np.isfinite(kj) else np.nan   # capacity (veh/h)
print("\nGreenshields fit:")
print(f"  free-flow speed vf = {vf:5.1f} km/h")
print(f"  jam density    kj = {kj:5.1f} {unit}/km")
print(f"  capacity     q_max = {q_cap:5.0f} {unit}/h  (at k=kj/2, v=vf/2)")


# =============================================================================
# 6. PLOT THE THREE FUNDAMENTAL DIAGRAMS
# =============================================================================
fig, ax = plt.subplots(1, 3, figsize=(16, 5))
fig.suptitle(f"Traffic Fundamental Diagram - {DIRECTION} direction "
             f"(D={LINE_SPACING_M:.1f} m, {INTERVAL_S}s bins, units={unit})",
             fontsize=13, fontweight="bold")

# (a) Flow vs Density  q-k
ax[0].scatter(fd["density_k"], fd["flow_q"], s=12, alpha=0.45, color="#2563eb")
ax[0].set(xlabel=f"Density k  ({unit}/km)", ylabel=f"Flow q  ({unit}/h)",
          title="Flow - Density")
if np.isfinite(kj):
    kk = np.linspace(0, kj, 100)
    ax[0].plot(kk, vf * kk - (vf / kj) * kk**2, "r-", lw=2,
               label="Greenshields")
    ax[0].legend()

# (b) Speed vs Density  v-k  (+ linear fit)
ax[1].scatter(fd["density_k"], fd["speed_v"], s=12, alpha=0.45, color="#059669")
kk = np.linspace(0, fd["density_k"].max(), 100)
ax[1].plot(kk, intercept + slope * kk, "r-", lw=2,
           label=f"v = {vf:.1f} - {abs(slope):.3f}k")
ax[1].set(xlabel=f"Density k  ({unit}/km)", ylabel="Speed v  (km/h)",
          title="Speed - Density")
ax[1].legend()

# (c) Speed vs Flow  v-q
ax[2].scatter(fd["flow_q"], fd["speed_v"], s=12, alpha=0.45, color="#d97706")
ax[2].set(xlabel=f"Flow q  ({unit}/h)", ylabel="Speed v  (km/h)",
          title="Speed - Flow")

for a in ax:
    a.grid(True, alpha=0.3)
plt.tight_layout(rect=[0, 0, 1, 0.95])
plt.savefig(OUT_PLOT, dpi=130)
print(f"\nSaved plot  -> {OUT_PLOT}")

fd.to_csv(OUT_CSV, index=False)
print(f"Saved data  -> {OUT_CSV}")
