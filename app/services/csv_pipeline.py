"""Background CSV pipeline — splits video analysis events into time-segmented CSVs, then merges."""
from __future__ import annotations

import csv
import logging
import math
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.constants import CSV_STATUS_COMPLETED, CSV_STATUS_FAILED, CSV_STATUS_PROCESSING
from app.database import SessionLocal
from app.models import AnalysisJob, CsvReport, Site, VehicleEvent, VideoUpload

logger = logging.getLogger(__name__)

_ACTIVE_PIPELINES: set[UUID] = set()
_ACTIVE_PIPELINES_LOCK = threading.Lock()

CSV_COLUMNS = [
    "sequence_no",
    "track_id",
    "vehicle_class",
    "detected_label",
    "vehicle_type_code",
    "vehicle_type_label",
    "golongan_code",
    "golongan_label",
    "source_label",
    "count_line_order",
    "count_line_name",
    "direction",
    "crossed_at_seconds",
    "crossed_at_frame",
    "confidence",
    "video_id",
    "site_id",
    "site_code",
    "site_name",
    "location_description",
    "latitude",
    "longitude",
    "analysis_job_id",
    "video_filename",
    "recorded_at",
]


def launch_csv_pipeline_worker(video_id: UUID, job_id: UUID) -> bool:
    """Launch the CSV pipeline in a background thread. Returns False if already running."""
    with _ACTIVE_PIPELINES_LOCK:
        if job_id in _ACTIVE_PIPELINES:
            return False
        _ACTIVE_PIPELINES.add(job_id)

    worker = threading.Thread(
        target=_run_csv_pipeline_safe,
        args=(video_id, job_id),
        daemon=True,
        name=f"csv-pipeline-{job_id}",
    )
    worker.start()
    return True


def _run_csv_pipeline_safe(video_id: UUID, job_id: UUID) -> None:
    """Wrapper that guarantees cleanup of the active-set entry."""
    try:
        run_csv_pipeline(video_id, job_id)
    except Exception:
        logger.exception("CSV pipeline failed for job %s", job_id)
    finally:
        with _ACTIVE_PIPELINES_LOCK:
            _ACTIVE_PIPELINES.discard(job_id)


def run_csv_pipeline(video_id: UUID, job_id: UUID) -> None:
    """Main CSV pipeline: query events → split into segments → merge → persist path."""
    settings = get_settings()
    db: Session = SessionLocal()

    try:
        video = db.scalar(
            select(VideoUpload)
            .options(joinedload(VideoUpload.site))
            .where(VideoUpload.id == video_id)
        )
        if not video:
            logger.warning("CSV pipeline: video %s not found", video_id)
            return

        job = db.get(AnalysisJob, job_id)
        if not job:
            logger.warning("CSV pipeline: job %s not found", job_id)
            return

        site: Optional[Site] = video.site
        site_name = site.name if site else "Unknown"
        site_id_str = str(site.id) if site else ""
        video_filename = video.original_filename or video.stored_filename
        recorded_at_str = video.recorded_at.isoformat() if video.recorded_at else ""

        csv_report = db.scalar(
            select(CsvReport).where(CsvReport.analysis_job_id == job_id)
        )
        if csv_report:
            csv_report.status = CSV_STATUS_PROCESSING
            csv_report.error_message = None
            csv_report.segments_completed = 0
            csv_report.total_rows = 0
            csv_report.csv_relative_path = None
            csv_report.started_at = _utc_now()
            csv_report.finished_at = None
        else:
            csv_report = CsvReport(
                video_upload_id=video_id,
                analysis_job_id=job_id,
                site_id=video.site_id,
                status=CSV_STATUS_PROCESSING,
                segment_duration_seconds=settings.csv_segment_duration_seconds,
                started_at=_utc_now(),
            )
            db.add(csv_report)
        db.commit()

        logger.info(
            "CSV pipeline started for job %s (video=%s, segment=%ds)",
            job_id,
            video_id,
            settings.csv_segment_duration_seconds,
        )

        events = db.scalars(
            select(VehicleEvent)
            .where(VehicleEvent.analysis_job_id == job_id)
            .order_by(VehicleEvent.crossed_at_seconds, VehicleEvent.sequence_no)
        ).all()

        if not events:
            csv_report.status = CSV_STATUS_COMPLETED
            csv_report.segment_count = 0
            csv_report.segments_completed = 0
            csv_report.total_rows = 0
            final_filename = f"{job_id}.csv"
            final_path = settings.csv_dir / final_filename
            _write_csv([], final_path, write_header=True)
            csv_report.csv_relative_path = final_path.relative_to(settings.storage_root).as_posix()
            csv_report.finished_at = _utc_now()
            db.commit()
            logger.info("CSV pipeline completed (0 events) for job %s", job_id)
            return

        segment_duration = float(settings.csv_segment_duration_seconds)
        max_seconds = max(e.crossed_at_seconds for e in events)
        segment_count = max(int(math.ceil(max_seconds / segment_duration)), 1)

        csv_report.segment_count = segment_count
        db.commit()

        event_rows = []
        for ev in events:
            event_rows.append({
                "sequence_no": ev.sequence_no,
                "track_id": ev.track_id or "",
                "vehicle_class": ev.vehicle_class,
                "detected_label": ev.detected_label or "",
                "vehicle_type_code": ev.vehicle_type_code or "",
                "vehicle_type_label": ev.vehicle_type_label or "",
                "golongan_code": ev.golongan_code,
                "golongan_label": ev.golongan_label,
                "source_label": ev.source_label or "",
                "count_line_order": ev.count_line_order if ev.count_line_order is not None else "",
                "count_line_name": ev.count_line_name or "",
                "direction": ev.direction,
                "crossed_at_seconds": round(ev.crossed_at_seconds, 4),
                "crossed_at_frame": ev.crossed_at_frame,
                "confidence": round(ev.confidence, 4) if ev.confidence is not None else "",
                "video_id": str(video_id),
                "site_id": site_id_str,
                "site_code": ev.site_code or "",
                "site_name": ev.site_name or site_name,
                "location_description": ev.location_description or "",
                "latitude": ev.latitude if ev.latitude is not None else "",
                "longitude": ev.longitude if ev.longitude is not None else "",
                "analysis_job_id": str(job_id),
                "video_filename": ev.video_filename or video_filename,
                "recorded_at": ev.recorded_at.isoformat() if ev.recorded_at else recorded_at_str,
            })

        segment_paths: list[Path] = []
        total_rows = 0

        for seg_idx in range(segment_count):
            seg_start = seg_idx * segment_duration
            seg_end = (seg_idx + 1) * segment_duration

            segment_rows = [
                row for row in event_rows
                if seg_start <= float(row["crossed_at_seconds"]) < seg_end
            ]

            if seg_idx == segment_count - 1:
                segment_rows = [
                    row for row in event_rows
                    if float(row["crossed_at_seconds"]) >= seg_start
                ]

            seg_filename = f"{job_id}_seg_{seg_idx}.csv"
            seg_path = settings.csv_dir / seg_filename
            _write_csv(segment_rows, seg_path, write_header=True)
            segment_paths.append(seg_path)
            total_rows += len(segment_rows)

            csv_report.segments_completed = seg_idx + 1
            db.commit()

            logger.debug(
                "CSV segment %d/%d written (%d rows) for job %s",
                seg_idx + 1,
                segment_count,
                len(segment_rows),
                job_id,
            )

        final_filename = f"{job_id}.csv"
        final_path = settings.csv_dir / final_filename
        _merge_csv_files(segment_paths, final_path)

        csv_report.csv_relative_path = final_path.relative_to(settings.storage_root).as_posix()
        csv_report.total_rows = total_rows
        csv_report.status = CSV_STATUS_COMPLETED
        csv_report.finished_at = _utc_now()
        db.commit()

        for seg_path in segment_paths:
            try:
                if seg_path.exists():
                    seg_path.unlink()
            except OSError:
                pass

        logger.info(
            "CSV pipeline completed for job %s → %s (%d rows, %d segments)",
            job_id,
            final_path.name,
            total_rows,
            segment_count,
        )

    except Exception as exc:
        db.rollback()
        try:
            csv_report_err = db.scalar(
                select(CsvReport).where(CsvReport.analysis_job_id == job_id)
            )
            if csv_report_err:
                csv_report_err.status = CSV_STATUS_FAILED
                csv_report_err.error_message = str(exc)[:2000]
                csv_report_err.finished_at = _utc_now()
                db.commit()
        except Exception:
            logger.exception("Failed to update CsvReport error state for job %s", job_id)
        raise
    finally:
        db.close()

def _write_csv(rows: list[dict], path: Path, *, write_header: bool = True) -> None:
    """Write a list of row dicts to a CSV file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def _merge_csv_files(segment_paths: list[Path], output_path: Path) -> None:
    """Merge multiple segment CSV files into one. Header is taken from the first file only."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as out:
        header_written = False
        for seg_path in segment_paths:
            if not seg_path.exists():
                continue
            with seg_path.open("r", encoding="utf-8") as seg:
                for line_no, line in enumerate(seg):
                    if line_no == 0:
                        if not header_written:
                            out.write(line)
                            header_written = True
                        continue
                    out.write(line)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Inline segment helpers — called from the analysis loop to produce
# incremental CSV output while the analysis is still running.
# ---------------------------------------------------------------------------


def write_inline_segment_csv(
    db: Session,
    *,
    job_id: UUID,
    video_id: UUID,
    site_name: str,
    site_id_str: str,
    video_filename: str,
    recorded_at_str: str,
    segment_index: int,
    time_start: float,
    time_end: Optional[float] = None,
) -> tuple[Path, int]:
    """Write a single segment CSV from VehicleEvent records in [time_start, time_end).

    If *time_end* is ``None`` the segment captures every event at or after
    *time_start* (i.e. the final open-ended segment).

    Returns ``(segment_path, row_count)``.
    """
    settings = get_settings()

    query = (
        select(VehicleEvent)
        .where(
            VehicleEvent.analysis_job_id == job_id,
            VehicleEvent.crossed_at_seconds >= time_start,
        )
        .order_by(VehicleEvent.crossed_at_seconds, VehicleEvent.sequence_no)
    )
    if time_end is not None:
        query = query.where(VehicleEvent.crossed_at_seconds < time_end)

    events = db.scalars(query).all()

    rows: list[dict] = []
    for ev in events:
        rows.append({
            "sequence_no": ev.sequence_no,
            "track_id": ev.track_id or "",
            "vehicle_class": ev.vehicle_class,
            "detected_label": ev.detected_label or "",
            "vehicle_type_code": ev.vehicle_type_code or "",
            "vehicle_type_label": ev.vehicle_type_label or "",
            "golongan_code": ev.golongan_code,
            "golongan_label": ev.golongan_label,
            "source_label": ev.source_label or "",
            "count_line_order": ev.count_line_order if ev.count_line_order is not None else "",
            "count_line_name": ev.count_line_name or "",
            "direction": ev.direction,
            "crossed_at_seconds": round(ev.crossed_at_seconds, 4),
            "crossed_at_frame": ev.crossed_at_frame,
            "confidence": round(ev.confidence, 4) if ev.confidence is not None else "",
            "video_id": str(video_id),
            "site_id": site_id_str,
            "site_code": ev.site_code or "",
            "site_name": ev.site_name or site_name,
            "location_description": ev.location_description or "",
            "latitude": ev.latitude if ev.latitude is not None else "",
            "longitude": ev.longitude if ev.longitude is not None else "",
            "analysis_job_id": str(job_id),
            "video_filename": ev.video_filename or video_filename,
            "recorded_at": ev.recorded_at.isoformat() if ev.recorded_at else recorded_at_str,
        })

    seg_filename = f"{job_id}_seg_{segment_index}.csv"
    seg_path = settings.csv_dir / seg_filename
    _write_csv(rows, seg_path, write_header=True)

    logger.debug(
        "Inline CSV segment %d written (%d rows) for job %s",
        segment_index,
        len(rows),
        job_id,
    )
    return seg_path, len(rows)


def merge_inline_segments(job_id: UUID, segment_count: int) -> Path:
    """Merge all inline segment CSVs written so far into a single running CSV.

    Returns the path of the merged CSV file.
    """
    settings = get_settings()
    segment_paths = [
        settings.csv_dir / f"{job_id}_seg_{i}.csv"
        for i in range(segment_count)
    ]
    final_path = settings.csv_dir / f"{job_id}.csv"
    _merge_csv_files(segment_paths, final_path)

    logger.debug(
        "Inline CSV merge completed (%d segments) for job %s → %s",
        segment_count,
        job_id,
        final_path.name,
    )
    return final_path


def cleanup_inline_segment_files(job_id: UUID, segment_count: int) -> None:
    """Remove individual segment CSV files after they have been merged."""
    settings = get_settings()
    for i in range(segment_count):
        seg_file = settings.csv_dir / f"{job_id}_seg_{i}.csv"
        try:
            if seg_file.exists():
                seg_file.unlink()
        except OSError:
            pass

