from __future__ import annotations

from collections import defaultdict
from uuid import UUID

import numpy as np
from sqlalchemy import and_, select
from sqlalchemy.orm import Session, aliased

from app.models import FdResult, VehicleEvent


def compute_fd(
    db: Session,
    video_upload_id: UUID,
    line_spacing_m: float,
    direction: str = "normal",
    interval_s: int = 60,
    max_match_dt_s: float = 5.0,
    min_speed_kmh: float = 1.0,
    max_speed_kmh: float = 120.0,
) -> FdResult:
    """
    Compute Greenshields fundamental diagram from VehicleEvent speed-trap data.

    Matches vehicles crossing count line 1 and line 2 within the same video by
    track_id, computes individual speeds, then aggregates per time interval into
    flow q (veh/h), space-mean speed v (km/h), and density k = q/v (veh/km).
    Fits the Greenshields linear v-k model: v = vf - (vf/kj)*k.
    """
    # ── 1. Self-join to find vehicles that crossed both lines ─────────
    e1 = aliased(VehicleEvent)
    e2 = aliased(VehicleEvent)

    join_cond = and_(
        e1.track_id == e2.track_id,
        e1.video_upload_id == e2.video_upload_id,
        e1.count_line_order == 1,
        e2.count_line_order == 2,
        e1.track_id.isnot(None),
    )

    stmt = (
        select(
            e1.track_id,
            e1.crossed_at_seconds.label("t1"),
            e2.crossed_at_seconds.label("t2"),
            e1.direction.label("dir"),
        )
        .join_from(e1, e2, join_cond)
        .where(e1.video_upload_id == video_upload_id)
    )

    if direction in ("normal", "opposite"):
        stmt = stmt.where(e1.direction == direction)

    raw_rows = db.execute(stmt).all()

    # ── 2. Speed filter and bin assignment ────────────────────────────
    bins: dict[int, list[float]] = defaultdict(list)
    for r in raw_rows:
        dt = abs(r.t1 - r.t2)
        if dt <= 0 or dt > max_match_dt_s:
            continue
        speed_kmh = (line_spacing_m / dt) * 3.6
        if not (min_speed_kmh <= speed_kmh <= max_speed_kmh):
            continue
        bin_idx = int(r.t1 // interval_s)
        bins[bin_idx].append(speed_kmh)

    matched_pairs_count = sum(len(v) for v in bins.values())

    # ── 3. Aggregate per bin: q, v (harmonic mean), k = q/v ──────────
    intervals = []
    for b in sorted(bins.keys()):
        speeds = bins[b]
        n = len(speeds)
        v = n / sum(1.0 / s for s in speeds)          # space-mean speed
        flow_q = n * (3600.0 / interval_s)
        density_k = flow_q / v if v > 0 else None
        if density_k is not None:
            intervals.append({
                "bin": b,
                "t_start_s": b * interval_s,
                "count": n,
                "flow_q": round(flow_q, 3),
                "speed_v": round(v, 3),
                "density_k": round(density_k, 3),
            })

    # ── 4. Greenshields linear fit  v = vf - (vf/kj)*k ───────────────
    vf: float | None = None
    kj: float | None = None
    q_cap: float | None = None

    if len(intervals) >= 2:
        try:
            ks = np.array([r["density_k"] for r in intervals], dtype=float)
            vs = np.array([r["speed_v"] for r in intervals], dtype=float)
            slope, intercept = np.polyfit(ks, vs, 1)
            vf = float(intercept)
            if slope < 0 and vf > 0:
                kj = float(-vf / slope)
                q_cap = float(vf * kj / 4)
        except Exception:
            pass

    # ── 5. Persist result ─────────────────────────────────────────────
    result = FdResult(
        video_upload_id=video_upload_id,
        line_spacing_m=line_spacing_m,
        direction=direction,
        interval_s=interval_s,
        matched_pairs_count=matched_pairs_count,
        intervals_json=intervals,
        greenshields_vf=vf,
        greenshields_kj=kj,
        greenshields_q_cap=q_cap,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result
