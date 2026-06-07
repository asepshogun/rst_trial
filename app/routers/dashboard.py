from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, cast, func, select, text, Float as SAFloat, Integer as SAInteger
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import (
    AnalysisGolonganTotal,
    AnalysisJob,
    FdResult,
    Site,
    User,
    VehicleEvent,
    VideoUpload,
)


class SiteUpdate(BaseModel):
    name: str
    location_description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    direction_normal_label: str = "Normal"
    direction_opposite_label: str = "Opposite"

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    total_videos = db.scalar(select(func.count()).select_from(VideoUpload)) or 0
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    total_sites = db.scalar(select(func.count()).select_from(Site)) or 0
    total_events = db.scalar(select(func.count()).select_from(VehicleEvent)) or 0

    status_rows = db.execute(
        select(VideoUpload.status, func.count().label("count"))
        .group_by(VideoUpload.status)
        .order_by(func.count().desc())
    ).all()
    videos_by_status = [{"status": r.status, "count": r.count} for r in status_rows]

    golongan_rows = db.execute(
        select(
            AnalysisGolonganTotal.golongan_code,
            AnalysisGolonganTotal.golongan_label,
            func.sum(AnalysisGolonganTotal.vehicle_count).label("total"),
        )
        .group_by(
            AnalysisGolonganTotal.golongan_code,
            AnalysisGolonganTotal.golongan_label,
        )
        .order_by(func.sum(AnalysisGolonganTotal.vehicle_count).desc())
        .limit(12)
    ).all()
    golongan_totals = [
        {
            "golongan_code": r.golongan_code,
            "golongan_label": r.golongan_label,
            "total": int(r.total or 0),
        }
        for r in golongan_rows
    ]

    top_videos_rows = db.execute(
        select(
            VideoUpload.id,
            VideoUpload.original_filename,
            VideoUpload.status,
            func.sum(AnalysisGolonganTotal.vehicle_count).label("total_vehicles"),
        )
        .join(AnalysisGolonganTotal, AnalysisGolonganTotal.video_upload_id == VideoUpload.id)
        .group_by(VideoUpload.id, VideoUpload.original_filename, VideoUpload.status)
        .order_by(func.sum(AnalysisGolonganTotal.vehicle_count).desc())
        .limit(10)
    ).all()
    top_videos = [
        {
            "video_id": str(r.id),
            "filename": r.original_filename,
            "status": r.status,
            "total_vehicles": int(r.total_vehicles or 0),
        }
        for r in top_videos_rows
    ]

    site_rows = list(db.scalars(select(Site).order_by(Site.name)))
    sites_with_stats = []
    for site in site_rows:
        video_count = (
            db.scalar(
                select(func.count())
                .select_from(VideoUpload)
                .where(VideoUpload.site_id == site.id)
            )
            or 0
        )
        total_vehicles = (
            db.scalar(
                select(func.sum(AnalysisGolonganTotal.vehicle_count))
                .join(VideoUpload, VideoUpload.id == AnalysisGolonganTotal.video_upload_id)
                .where(VideoUpload.site_id == site.id)
            )
            or 0
        )
        sites_with_stats.append(
            {
                "site_id": str(site.id),
                "name": site.name,
                "code": site.code,
                "location_description": site.location_description,
                "latitude": site.latitude,
                "longitude": site.longitude,
                "video_count": video_count,
                "total_vehicles": int(total_vehicles),
            }
        )

    recent_rows = db.execute(
        select(AnalysisJob, VideoUpload.original_filename)
        .join(VideoUpload, VideoUpload.id == AnalysisJob.video_upload_id)
        .order_by(AnalysisJob.updated_at.desc())
        .limit(10)
    ).all()
    recent_analyses = []
    for job, filename in recent_rows:
        total_vehicles = (
            db.scalar(
                select(func.sum(AnalysisGolonganTotal.vehicle_count)).where(
                    AnalysisGolonganTotal.analysis_job_id == job.id
                )
            )
            or 0
        )
        recent_analyses.append(
            {
                "job_id": str(job.id),
                "video_id": str(job.video_upload_id),
                "filename": filename,
                "status": job.status,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "finished_at": job.finished_at.isoformat() if job.finished_at else None,
                "total_vehicles": int(total_vehicles),
            }
        )

    return {
        "summary": {
            "total_videos": total_videos,
            "total_users": total_users,
            "total_sites": total_sites,
            "total_vehicle_events": total_events,
        },
        "videos_by_status": videos_by_status,
        "golongan_totals": golongan_totals,
        "top_videos": top_videos,
        "sites": sites_with_stats,
        "recent_analyses": recent_analyses,
    }


@router.get("/site/{site_id}")
def get_site_detail(
    site_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    # ── summary counts ────────────────────────────────────────────
    video_count = db.scalar(
        select(func.count()).select_from(VideoUpload).where(VideoUpload.site_id == site_id)
    ) or 0

    total_vehicles = db.scalar(
        select(func.sum(AnalysisGolonganTotal.vehicle_count))
        .join(VideoUpload, VideoUpload.id == AnalysisGolonganTotal.video_upload_id)
        .where(VideoUpload.site_id == site_id)
    ) or 0

    processed_count = db.scalar(
        select(func.count())
        .select_from(VideoUpload)
        .where(VideoUpload.site_id == site_id, VideoUpload.status == "processed")
    ) or 0

    avg_per_video = round(int(total_vehicles) / processed_count, 1) if processed_count else 0

    # ── golongan breakdown for this site ─────────────────────────
    golongan_rows = db.execute(
        select(
            AnalysisGolonganTotal.golongan_code,
            AnalysisGolonganTotal.golongan_label,
            func.sum(AnalysisGolonganTotal.vehicle_count).label("total"),
        )
        .join(VideoUpload, VideoUpload.id == AnalysisGolonganTotal.video_upload_id)
        .where(VideoUpload.site_id == site_id)
        .group_by(
            AnalysisGolonganTotal.golongan_code,
            AnalysisGolonganTotal.golongan_label,
        )
        .order_by(func.sum(AnalysisGolonganTotal.vehicle_count).desc())
    ).all()
    golongan_totals = [
        {
            "golongan_code": r.golongan_code,
            "golongan_label": r.golongan_label,
            "total": int(r.total or 0),
        }
        for r in golongan_rows
    ]

    # ── top 10 videos for this site ───────────────────────────────
    top_videos_rows = db.execute(
        select(
            VideoUpload.id,
            VideoUpload.original_filename,
            VideoUpload.status,
            VideoUpload.recorded_at,
            func.sum(AnalysisGolonganTotal.vehicle_count).label("total_vehicles"),
        )
        .join(AnalysisGolonganTotal, AnalysisGolonganTotal.video_upload_id == VideoUpload.id)
        .where(VideoUpload.site_id == site_id)
        .group_by(
            VideoUpload.id,
            VideoUpload.original_filename,
            VideoUpload.status,
            VideoUpload.recorded_at,
        )
        .order_by(func.sum(AnalysisGolonganTotal.vehicle_count).desc())
        .limit(10)
    ).all()
    top_videos = [
        {
            "video_id": str(r.id),
            "filename": r.original_filename,
            "status": r.status,
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
            "total_vehicles": int(r.total_vehicles or 0),
        }
        for r in top_videos_rows
    ]

    # ── recent analyses for this site ────────────────────────────
    recent_rows = db.execute(
        select(AnalysisJob, VideoUpload.original_filename, VideoUpload.id.label("vid_id"))
        .join(VideoUpload, VideoUpload.id == AnalysisJob.video_upload_id)
        .where(VideoUpload.site_id == site_id)
        .order_by(AnalysisJob.updated_at.desc())
        .limit(10)
    ).all()
    recent_analyses = []
    for job, filename, vid_id in recent_rows:
        tv = db.scalar(
            select(func.sum(AnalysisGolonganTotal.vehicle_count)).where(
                AnalysisGolonganTotal.analysis_job_id == job.id
            )
        ) or 0
        recent_analyses.append(
            {
                "job_id": str(job.id),
                "video_id": str(vid_id),
                "filename": filename,
                "status": job.status,
                "started_at": job.started_at.isoformat() if job.started_at else None,
                "finished_at": job.finished_at.isoformat() if job.finished_at else None,
                "total_vehicles": int(tv),
            }
        )

    # ── latest FD result for this site ───────────────────────────
    fd_row = db.execute(
        select(FdResult, VideoUpload.original_filename)
        .join(VideoUpload, VideoUpload.id == FdResult.video_upload_id)
        .where(VideoUpload.site_id == site_id)
        .order_by(FdResult.created_at.desc())
        .limit(1)
    ).first()
    fd_result = None
    if fd_row:
        fd, fname = fd_row
        fd_result = {
            "id": str(fd.id),
            "video_id": str(fd.video_upload_id),
            "filename": fname,
            "line_spacing_m": fd.line_spacing_m,
            "direction": fd.direction,
            "interval_s": fd.interval_s,
            "greenshields_vf": fd.greenshields_vf,
            "greenshields_kj": fd.greenshields_kj,
            "greenshields_q_cap": fd.greenshields_q_cap,
            "matched_pairs_count": fd.matched_pairs_count,
            "intervals_json": fd.intervals_json,
            "created_at": fd.created_at.isoformat(),
        }

    return {
        "site": {
            "site_id": str(site.id),
            "name": site.name,
            "code": site.code,
            "location_description": site.location_description,
            "latitude": site.latitude,
            "longitude": site.longitude,
            "direction_normal_label": site.direction_normal_label,
            "direction_opposite_label": site.direction_opposite_label,
        },
        "summary": {
            "video_count": video_count,
            "processed_count": processed_count,
            "total_vehicles": int(total_vehicles),
            "avg_vehicles_per_video": avg_per_video,
        },
        "golongan_totals": golongan_totals,
        "top_videos": top_videos,
        "recent_analyses": recent_analyses,
        "fd_result": fd_result,
    }


@router.get("/heatmap")
def get_dashboard_heatmap(
    month: Optional[int] = None,   # 1–12; None = all months
    week: Optional[int] = None,    # 1–4; requires month to be set
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    import calendar as _cal
    from datetime import date as _date

    DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
    MONTH_NAMES = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                   "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

    now_wib = __import__("datetime").datetime.now(__import__("datetime").timezone(__import__("datetime").timedelta(hours=7)))
    current_year = now_wib.year

    # Resolve label and WHERE clause
    label = "Semua Data"
    where = ""

    if month and 1 <= month <= 12:
        year = current_year
        month_name = MONTH_NAMES[month]

        if week and 1 <= week <= 4:
            # Week N of the given month — split month into 4 chunks of ~7 days
            # Week 1: day 1–7, Week 2: 8–14, Week 3: 15–21, Week 4: 22–end
            day_start = (week - 1) * 7 + 1
            if week < 4:
                day_end = week * 7
            else:
                day_end = _cal.monthrange(year, month)[1]  # last day of month
            date_start = _date(year, month, day_start)
            date_end   = _date(year, month, day_end)
            label = f"{month_name} {year} · Minggu ke-{week} ({day_start}–{day_end} {month_name[:3]})"
            where = f"""
                AND (COALESCE(
                    v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval,
                    ve.created_at
                ) AT TIME ZONE 'Asia/Jakarta')::date
                BETWEEN '{date_start}' AND '{date_end}'
            """
        else:
            # Whole month
            label = f"{month_name} {year}"
            where = f"""
                AND EXTRACT(year  FROM (COALESCE(
                    v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval,
                    ve.created_at
                ) AT TIME ZONE 'Asia/Jakarta')) = {year}
                AND EXTRACT(month FROM (COALESCE(
                    v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval,
                    ve.created_at
                ) AT TIME ZONE 'Asia/Jakarta')) = {month}
            """

    rows = db.execute(
        text(f"""
            SELECT
                EXTRACT(dow  FROM (COALESCE(
                    v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval,
                    ve.created_at
                ) AT TIME ZONE 'Asia/Jakarta'))::int AS dow,
                EXTRACT(hour FROM (COALESCE(
                    v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval,
                    ve.created_at
                ) AT TIME ZONE 'Asia/Jakarta'))::int AS hour,
                COUNT(*) AS cnt
            FROM vehicle_events ve
            JOIN video_uploads v ON v.id = ve.video_upload_id
            WHERE 1=1 {where}
            GROUP BY 1, 2
            ORDER BY 1, 2
        """)
    ).all()

    lookup: dict[int, dict[int, int]] = {d: {h: 0 for h in range(24)} for d in range(7)}
    for row in rows:
        lookup[row.dow][row.hour] = row.cnt

    # pg DOW: 0=Sunday … 6=Saturday; reorder to Senin(1)…Minggu(0)
    dow_order = [1, 2, 3, 4, 5, 6, 0]
    heatmap = []
    for dow in dow_order:
        heatmap.append({
            "name": DAY_NAMES[dow],
            "data": [
                {"x": f"{h:02d}:00", "y": lookup[dow][h]}
                for h in range(24)
            ],
        })

    return {"heatmap": heatmap, "label": label}


@router.put("/site/{site_id}/info")
def update_site_info(
    site_id: UUID,
    payload: SiteUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    site.name = payload.name.strip()
    site.location_description = (payload.location_description or "").strip() or None
    site.latitude = payload.latitude
    site.longitude = payload.longitude
    site.direction_normal_label = payload.direction_normal_label.strip() or "Normal"
    site.direction_opposite_label = payload.direction_opposite_label.strip() or "Opposite"
    db.commit()

    return {
        "site_id": str(site.id),
        "name": site.name,
        "code": site.code,
        "location_description": site.location_description,
        "latitude": site.latitude,
        "longitude": site.longitude,
        "direction_normal_label": site.direction_normal_label,
        "direction_opposite_label": site.direction_opposite_label,
    }
