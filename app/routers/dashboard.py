from __future__ import annotations

import csv
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import case, cast, func, select, text, Float as SAFloat, Integer as SAInteger
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.config import get_settings
from app.database import get_db
from app.models import (
    AnalysisGolonganTotal,
    AnalysisJob,
    CsvReport,
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


@router.get("/sites")
def list_sites(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    sites = db.scalars(select(Site).order_by(Site.name)).all()
    return [{"id": str(s.id), "name": s.name} for s in sites]


@router.get("/stats")
def get_dashboard_stats(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    
    total_videos = db.scalar(select(func.count()).select_from(VideoUpload)) or 0
    total_users = db.scalar(select(func.count()).select_from(User)) or 0
    total_sites = db.scalar(select(func.count()).select_from(Site)) or 0
    
    status_rows = db.execute(
        select(VideoUpload.status, func.count().label("count"))
        .group_by(VideoUpload.status)
        .order_by(func.count().desc())
    ).all()
    videos_by_status = [{"status": r.status, "count": r.count} for r in status_rows]

    site_rows = list(db.scalars(select(Site).order_by(Site.name)))
    site_lookup = {
        str(s.id): {
            "site_id": str(s.id),
            "name": s.name,
            "code": s.code,
            "location_description": s.location_description,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "video_count": 0,
            "total_vehicles": 0,
        }
        for s in site_rows
    }

    total_events = 0
    golongan_map = {}
    video_map = {}
    job_map = {}

    csv_reports = db.scalars(
        select(CsvReport)
        .where(CsvReport.status.in_(["completed", "processing"]))
    ).all()

    has_partial_data = any(r.status == "processing" for r in csv_reports)

    for report in csv_reports:
        if not report.csv_relative_path:
            continue
            
        csv_path = settings.storage_root / report.csv_relative_path
        if not csv_path.exists():
            continue
            
        if str(report.site_id) in site_lookup:
            site_lookup[str(report.site_id)]["video_count"] += 1
            
        job_id_str = str(report.analysis_job_id)
        video_id_str = str(report.video_upload_id)
        
        job = db.get(AnalysisJob, report.analysis_job_id)
        job_started = job.started_at.isoformat() if job and job.started_at else None
        job_finished = job.finished_at.isoformat() if job and job.finished_at else None
        job_status = job.status if job else "completed"
            
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_events += 1
                g_code = row.get("golongan_code", "")
                g_label = row.get("golongan_label", "")
                vid_id = row.get("video_id", video_id_str)
                fname = row.get("video_filename", "")
                s_id = row.get("site_id", "")
                
                if g_code:
                    if g_code not in golongan_map:
                        golongan_map[g_code] = {"label": g_label, "count": 0}
                    golongan_map[g_code]["count"] += 1
                    
                if vid_id not in video_map:
                    video_map[vid_id] = {"filename": fname, "total": 0}
                video_map[vid_id]["total"] += 1
                
                if s_id in site_lookup:
                    site_lookup[s_id]["total_vehicles"] += 1
                    
                if job_id_str not in job_map:
                    job_map[job_id_str] = {
                        "job_id": job_id_str,
                        "video_id": vid_id,
                        "filename": fname,
                        "status": job_status,
                        "started_at": job_started,
                        "finished_at": job_finished,
                        "total_vehicles": 0,
                    }
                job_map[job_id_str]["total_vehicles"] += 1

    golongan_totals = [
        {"golongan_code": k, "golongan_label": v["label"], "total": v["count"]}
        for k, v in sorted(golongan_map.items(), key=lambda x: x[1]["count"], reverse=True)[:12]
    ]

    top_videos_list = sorted(video_map.items(), key=lambda x: x[1]["total"], reverse=True)[:10]
    top_videos = []
    for vid, data in top_videos_list:
        v_db = db.get(VideoUpload, UUID(vid))
        status = v_db.status if v_db else "processed"
        top_videos.append({
            "video_id": vid,
            "filename": data["filename"],
            "status": status,
            "total_vehicles": data["total"]
        })

    sites_with_stats = list(site_lookup.values())
    
    recent_analyses = sorted(
        job_map.values(), 
        key=lambda x: x["finished_at"] or x["started_at"] or "", 
        reverse=True
    )[:10]

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
        "is_partial": has_partial_data,
    }


@router.get("/site/{site_id}")
def get_site_detail(
    site_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    settings = get_settings()
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    video_count = db.scalar(
        select(func.count()).select_from(VideoUpload).where(VideoUpload.site_id == site_id)
    ) or 0
    processed_count = db.scalar(
        select(func.count())
        .select_from(VideoUpload)
        .where(VideoUpload.site_id == site_id, VideoUpload.status == "processed")
    ) or 0

    total_vehicles = 0
    golongan_map = {}
    video_map = {}
    job_map = {}

    csv_reports = db.scalars(
        select(CsvReport)
        .where(CsvReport.site_id == site_id, CsvReport.status.in_(["completed", "processing"]))
    ).all()

    has_partial_data = any(r.status == "processing" for r in csv_reports)

    for report in csv_reports:
        if not report.csv_relative_path:
            continue
        csv_path = settings.storage_root / report.csv_relative_path
        if not csv_path.exists():
            continue
            
        job = db.get(AnalysisJob, report.analysis_job_id)
        job_started = job.started_at.isoformat() if job and job.started_at else None
        job_finished = job.finished_at.isoformat() if job and job.finished_at else None
        job_status = job.status if job else "completed"
        
        job_id_str = str(report.analysis_job_id)
        vid_id_str = str(report.video_upload_id)

        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_vehicles += 1
                g_code = row.get("golongan_code", "")
                g_label = row.get("golongan_label", "")
                fname = row.get("video_filename", "")
                recorded_at = row.get("recorded_at", "")
                
                if g_code:
                    if g_code not in golongan_map:
                        golongan_map[g_code] = {"label": g_label, "count": 0}
                    golongan_map[g_code]["count"] += 1
                    
                if vid_id_str not in video_map:
                    video_map[vid_id_str] = {"filename": fname, "recorded_at": recorded_at, "total": 0}
                video_map[vid_id_str]["total"] += 1
                
                if job_id_str not in job_map:
                    job_map[job_id_str] = {
                        "job_id": job_id_str,
                        "video_id": vid_id_str,
                        "filename": fname,
                        "status": job_status,
                        "started_at": job_started,
                        "finished_at": job_finished,
                        "total_vehicles": 0,
                    }
                job_map[job_id_str]["total_vehicles"] += 1

    avg_per_video = round(total_vehicles / processed_count, 1) if processed_count else 0

    golongan_totals = [
        {"golongan_code": k, "golongan_label": v["label"], "total": v["count"]}
        for k, v in sorted(golongan_map.items(), key=lambda x: x[1]["count"], reverse=True)
    ]

    top_videos_list = sorted(video_map.items(), key=lambda x: x[1]["total"], reverse=True)[:10]
    top_videos = []
    for vid, data in top_videos_list:
        v_db = db.get(VideoUpload, UUID(vid))
        status = v_db.status if v_db else "processed"
        top_videos.append({
            "video_id": vid,
            "filename": data["filename"],
            "status": status,
            "recorded_at": data["recorded_at"] or None,
            "total_vehicles": data["total"]
        })

    recent_analyses = sorted(
        job_map.values(), 
        key=lambda x: x["finished_at"] or x["started_at"] or "", 
        reverse=True
    )[:10]

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
        "is_partial": has_partial_data,
    }


@router.get("/heatmap")
def get_dashboard_heatmap(
    month: Optional[int] = None,
    week: Optional[int] = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    import calendar as _cal
    from datetime import date as _date, datetime as _dt, timedelta as _td, timezone as _tz
    
    settings = get_settings()

    DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]
    MONTH_NAMES = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                   "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

    wib_tz = _tz(_td(hours=7))
    now_wib = _dt.now(wib_tz)
    current_year = now_wib.year

    label = "Semua Data"
    date_start = None
    date_end = None

    if month and 1 <= month <= 12:
        year = current_year
        month_name = MONTH_NAMES[month]

        if week and 1 <= week <= 4:
            day_start = (week - 1) * 7 + 1
            if week < 4:
                day_end = week * 7
            else:
                day_end = _cal.monthrange(year, month)[1]
            date_start = _date(year, month, day_start)
            date_end   = _date(year, month, day_end)
            label = f"{month_name} {year} · Minggu ke-{week} ({day_start}–{day_end} {month_name[:3]})"
        else:
            date_start = _date(year, month, 1)
            date_end   = _date(year, month, _cal.monthrange(year, month)[1])
            label = f"{month_name} {year}"

    lookup: dict[int, dict[int, int]] = {d: {h: 0 for h in range(24)} for d in range(7)}

    csv_reports = db.scalars(
        select(CsvReport).where(CsvReport.status.in_(["completed", "processing"]))
    ).all()

    for report in csv_reports:
        if not report.csv_relative_path:
            continue
        csv_path = settings.storage_root / report.csv_relative_path
        if not csv_path.exists():
            continue
            
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rec_at_str = row.get("recorded_at")
                cross_sec = float(row.get("crossed_at_seconds") or 0.0)
                
                try:
                    if rec_at_str:
                        base_dt = _dt.fromisoformat(rec_at_str)
                    else:
                        job = db.get(AnalysisJob, report.analysis_job_id)
                        base_dt = job.created_at if job else _dt.now(wib_tz)
                        
                    event_dt = base_dt + _td(seconds=cross_sec)
                    event_wib = event_dt.astimezone(wib_tz)
                    
                    if date_start and date_end:
                        if not (date_start <= event_wib.date() <= date_end):
                            continue
                            
                    dow = event_wib.isoweekday() % 7
                    hour = event_wib.hour
                    
                    lookup[dow][hour] += 1
                except Exception:
                    pass

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

@router.get("/csv-reports")
def get_csv_reports(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    reports = db.scalars(
        select(CsvReport)
        .order_by(CsvReport.created_at.desc())
        .limit(100)
    ).all()
    
    return {
        "reports": [
            {
                "id": str(r.id),
                "job_id": str(r.analysis_job_id),
                "site_id": str(r.site_id),
                "status": r.status,
                "segments_completed": r.segments_completed,
                "segment_count": r.segment_count,
                "total_rows": r.total_rows,
                "error": r.error_message,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ]
    }

@router.get("/csv-download/{report_id}")
def download_csv_report(
    report_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    report = db.get(CsvReport, report_id)
    if not report or not report.csv_relative_path:
        raise HTTPException(status_code=404, detail="CSV Report not found or not finished")
        
    csv_path = settings.storage_root / report.csv_relative_path
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file missing on disk")
        
    return FileResponse(
        path=csv_path,
        media_type="text/csv",
        filename=csv_path.name
    )
