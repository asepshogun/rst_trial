from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import FdResult, User, VehicleEvent, VideoUpload
from app.schemas import FdComputeRequest, FdResultRead
from app.services.fundamental_diagram_service import compute_fd

router = APIRouter(prefix="/api/fd", tags=["fundamental-diagram"])


@router.get("/eligible-videos")
def list_eligible_videos(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:
    """Videos that have vehicle events on both count line 1 and count line 2."""
    line1_ids = select(VehicleEvent.video_upload_id).where(
        VehicleEvent.count_line_order == 1
    ).distinct().subquery()
    line2_ids = select(VehicleEvent.video_upload_id).where(
        VehicleEvent.count_line_order == 2
    ).distinct().subquery()

    rows = db.execute(
        select(VideoUpload.id, VideoUpload.original_filename, VideoUpload.status)
        .where(VideoUpload.id.in_(select(line1_ids.c.video_upload_id)))
        .where(VideoUpload.id.in_(select(line2_ids.c.video_upload_id)))
        .order_by(VideoUpload.created_at.desc())
    ).all()

    return [
        {"video_id": str(r.id), "filename": r.original_filename, "status": r.status}
        for r in rows
    ]


@router.post("/compute/{video_id}", response_model=FdResultRead)
def compute_fundamental_diagram(
    video_id: UUID,
    payload: FdComputeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FdResult:
    video = db.get(VideoUpload, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    result = compute_fd(
        db=db,
        video_upload_id=video_id,
        line_spacing_m=payload.line_spacing_m,
        direction=payload.direction,
        interval_s=payload.interval_s,
        max_match_dt_s=payload.max_match_dt_s,
        min_speed_kmh=payload.min_speed_kmh,
        max_speed_kmh=payload.max_speed_kmh,
    )

    if not result.matched_pairs_count:
        db.delete(result)
        db.commit()
        raise HTTPException(
            status_code=422,
            detail=(
                "Tidak ada pasang kendaraan yang cocok. "
                "Periksa setting arah lalu lintas atau perbesar nilai Max Match Δt."
            ),
        )

    return result


@router.get("/video/{video_id}/latest", response_model=Optional[FdResultRead])
def get_latest_fd_for_video(
    video_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Optional[FdResult]:
    return db.scalar(
        select(FdResult)
        .where(FdResult.video_upload_id == video_id)
        .order_by(FdResult.created_at.desc())
    )


@router.get("", response_model=list[dict])
def list_fd_results(
    limit: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[dict]:
    rows = db.execute(
        select(FdResult, VideoUpload.original_filename)
        .join(VideoUpload, VideoUpload.id == FdResult.video_upload_id)
        .order_by(FdResult.created_at.desc())
        .limit(limit)
    ).all()

    return [
        {
            "id": str(r.FdResult.id),
            "video_id": str(r.FdResult.video_upload_id),
            "filename": r.original_filename,
            "line_spacing_m": r.FdResult.line_spacing_m,
            "direction": r.FdResult.direction,
            "interval_s": r.FdResult.interval_s,
            "greenshields_vf": r.FdResult.greenshields_vf,
            "greenshields_kj": r.FdResult.greenshields_kj,
            "greenshields_q_cap": r.FdResult.greenshields_q_cap,
            "matched_pairs_count": r.FdResult.matched_pairs_count,
            "intervals_json": r.FdResult.intervals_json,
            "created_at": r.FdResult.created_at.isoformat(),
        }
        for r in rows
    ]


@router.delete("/{result_id}", status_code=204)
def delete_fd_result(
    result_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    result = db.get(FdResult, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="FD result not found")
    db.delete(result)
    db.commit()
