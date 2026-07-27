from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Site, User, VideoUpload
from app.schemas import SiteCreate, SiteRead, SiteUpdate


router = APIRouter(prefix="/api/sites", tags=["sites"])


@router.get("", response_model=list[SiteRead])
def list_sites(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[SiteRead]:
    """List all sites ordered by name."""
    rows = list(db.scalars(select(Site).order_by(Site.name.asc())))
    return [SiteRead.model_validate(row) for row in rows]


@router.post("", response_model=SiteRead, status_code=201)
def create_site(
    payload: SiteCreate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SiteRead:
    """Create a new site location."""
    code = payload.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Site code is required")

    existing = db.scalar(select(Site).where(Site.code == code))
    if existing:
        raise HTTPException(status_code=409, detail=f"Site code '{code}' already exists")

    site = Site(
        code=code,
        name=payload.name.strip(),
        location_description=(payload.location_description or "").strip() or None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        direction_normal_label=payload.direction_normal_label.strip() or "Normal",
        direction_opposite_label=payload.direction_opposite_label.strip() or "Opposite",
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return SiteRead.model_validate(site)


@router.get("/{site_id}", response_model=SiteRead)
def get_site(
    site_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SiteRead:
    """Get a single site by ID."""
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    return SiteRead.model_validate(site)


@router.put("/{site_id}", response_model=SiteRead)
def update_site(
    site_id: UUID,
    payload: SiteUpdate,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> SiteRead:
    """Update an existing site."""
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
    db.refresh(site)
    return SiteRead.model_validate(site)


@router.delete("/{site_id}", status_code=204)
def delete_site(
    site_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    """Delete a site. Blocked if any videos reference it."""
    site = db.get(Site, site_id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    video_count = db.scalar(
        select(func.count()).select_from(VideoUpload).where(VideoUpload.site_id == site_id)
    ) or 0
    if video_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete site '{site.name}' — it still has {video_count} video(s) attached. "
            f"Remove or reassign the videos first.",
        )

    db.delete(site)
    db.commit()
