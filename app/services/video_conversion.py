

from __future__ import annotations



import subprocess

import threading

from pathlib import Path

from typing import Optional

from uuid import UUID



from sqlalchemy import select

from sqlalchemy.orm import joinedload



from app.config import get_settings

from app.constants import (

    JOB_STATUS_PROCESSING,

    JOB_STATUS_QUEUED,

    VIDEO_STATUS_CONVERTING,

    VIDEO_STATUS_FAILED,

    VIDEO_STATUS_PROCESSING,

    VIDEO_STATUS_UPLOADED,

)

from app.database import SessionLocal

from app.models import AnalysisJob, VideoUpload

from app.services.storage import ensure_browser_playback, playback_relative_path_for



_ACTIVE_CONVERSIONS: set[UUID] = set()

_ACTIVE_CONVERSIONS_LOCK = threading.Lock()



# Codec names ffprobe reports that Chrome/Edge/Firefox can decode natively.

# Anything else (hevc/h265, mpeg4/xvid, mjpeg, etc — common in CCTV/DVR

# exports) needs to be transcoded to H.264 before it can be played in <video>.

_BROWSER_SAFE_VIDEO_CODECS = {"h264", "vp8", "vp9", "av1"}



# Pixel formats browsers reliably decode. Many CCTV/pro-camera exports use

# 10-bit or 4:2:2/4:4:4 chroma (e.g. yuv420p10le, yuv422p), which browsers

# generally cannot decode even though the codec itself (h264) is supported.

_BROWSER_SAFE_PIXEL_FORMATS = {"yuv420p", "yuvj420p"}





def _probe_video_stream_info(path: Path) -> dict:

    """Return {'codec_name': ..., 'pix_fmt': ...} via ffprobe, or an empty

    dict if it can't be determined (missing ffprobe, corrupt file, etc).

    Failing safe here means we fall back to the old extension-only check

    rather than crash."""

    if not path.exists():

        return {}

    try:

        result = subprocess.run(

            [

                "ffprobe",

                "-v", "error",

                "-select_streams", "v:0",

                "-show_entries", "stream=codec_name,pix_fmt",

                "-of", "default=noprint_wrappers=1",

                str(path),

            ],

            capture_output=True,

            text=True,

            timeout=15,

        )

        info: dict[str, str] = {}

        for line in result.stdout.strip().splitlines():

            if "=" in line:

                key, _, value = line.partition("=")

                info[key.strip().lower()] = value.strip().lower()

        return info

    except Exception:

        return {}





def _probe_video_codec(path: Path) -> Optional[str]:

    """Backwards-compatible wrapper returning just the codec name."""

    return _probe_video_stream_info(path).get("codec_name") or None





def _has_faststart(path: Path) -> Optional[bool]:

    """Check whether the moov atom appears before mdat in the file (i.e.

    the file is already browser/streaming friendly). Returns None if this

    can't be determined. This is a fast, read-only check (reads only the

    top-level box headers, not the whole file)."""

    try:

        with open(path, "rb") as handle:

            file_size = path.stat().st_size

            offset = 0

            while offset < file_size:

                handle.seek(offset)

                header = handle.read(8)

                if len(header) < 8:

                    break

                box_size = int.from_bytes(header[0:4], "big")

                box_type = header[4:8].decode("ascii", errors="ignore")

                if box_type == "moov":

                    return True

                if box_type == "mdat":

                    return False

                if box_size in (0, 1):

                    # size==0 means "rest of file"; size==1 means a 64-bit

                    # size follows, which we don't bother parsing here.

                    break

                offset += box_size

        return None

    except Exception:

        return None





def requires_video_conversion(

    stored_filename: str,

    mime_type: Optional[str] = None,

    absolute_path: Optional[Path] = None,

) -> bool:

    suffix = Path(stored_filename or "").suffix.lower()



    normalized_mime = (mime_type or "").split(";", 1)[0].strip().lower()

    if suffix != ".mp4":

        return True

    if normalized_mime and normalized_mime not in {"video/mp4", "application/mp4"}:

        return True



    # Extension/mime say "mp4", but CCTV/DVR exports frequently wrap an

    # incompatible codec (H.265/HEVC, MJPEG, etc), an unsupported pixel

    # format (10-bit, 4:2:2/4:4:4 chroma), or a moov atom placed at the end

    # of the file (not "faststart") inside an otherwise normal .mp4

    # container. Any of these make the file fail to play in <video> even

    # though it "looks like" a normal mp4. Probe for all three.

    if absolute_path is not None:

        info = _probe_video_stream_info(absolute_path)

        codec = info.get("codec_name")

        pix_fmt = info.get("pix_fmt")

        if codec is not None and codec not in _BROWSER_SAFE_VIDEO_CODECS:

            return True

        if pix_fmt is not None and pix_fmt not in _BROWSER_SAFE_PIXEL_FORMATS:

            return True

        if _has_faststart(absolute_path) is not True:

            return True



    return False





def playback_absolute_path_for(video: VideoUpload) -> Path:

    settings = get_settings()

    return settings.storage_root / playback_relative_path_for(video.stored_filename)





def is_video_conversion_ready(video: VideoUpload) -> bool:

    settings = get_settings()

    absolute_path = settings.storage_root / video.relative_path

    if not requires_video_conversion(video.stored_filename, video.mime_type, absolute_path):

        return True

    playback_path = playback_absolute_path_for(video)

    return playback_path.exists() and playback_path.stat().st_size > 0





def resolve_analysis_video_path(video: VideoUpload) -> Path:

    settings = get_settings()

    absolute_path = settings.storage_root / video.relative_path

    if requires_video_conversion(video.stored_filename, video.mime_type, absolute_path):

        playback_path = playback_absolute_path_for(video)

        if playback_path.exists() and playback_path.stat().st_size > 0:

            return playback_path

    return settings.storage_root / video.relative_path





def launch_video_conversion_worker(video_id: UUID, auto_process: bool = False) -> bool:

    with _ACTIVE_CONVERSIONS_LOCK:

        if video_id in _ACTIVE_CONVERSIONS:

            return False

        _ACTIVE_CONVERSIONS.add(video_id)



    worker = threading.Thread(

        target=run_video_conversion,

        args=(video_id, auto_process),

        daemon=True,

        name=f"conversion-{video_id}",

    )

    worker.start()

    return True





def run_video_conversion(video_id: UUID, auto_process: bool = False) -> None:

    db = SessionLocal()

    try:

        video = db.scalar(

            select(VideoUpload)

            .options(joinedload(VideoUpload.analysis_job))

            .where(VideoUpload.id == video_id)

        )

        if not video:

            return



        source_path = get_settings().storage_root / video.relative_path

        if not requires_video_conversion(video.stored_filename, video.mime_type, source_path):

            if video.status == VIDEO_STATUS_CONVERTING:

                video.status = VIDEO_STATUS_UPLOADED

                video.processing_error = None

                db.commit()

            return



        if not source_path.exists():

            video.status = VIDEO_STATUS_FAILED

            video.processing_error = "The original uploaded video file is missing."

            db.commit()

            return



        playback_relative_path = ensure_browser_playback(source_path, video.stored_filename)

        if not playback_relative_path:

            video.status = VIDEO_STATUS_FAILED

            video.processing_error = "Failed to convert the uploaded video to MP4 playback format."

            db.commit()

            return



        video.status = VIDEO_STATUS_UPLOADED

        video.processing_error = None

        db.commit()



        if auto_process and video.analysis_job:

            job = video.analysis_job

            if job.status not in {JOB_STATUS_PROCESSING, JOB_STATUS_QUEUED}:

                from app.services.analysis import launch_analysis_worker

                from app.services.live_preview import start_preview



                job.status = JOB_STATUS_QUEUED

                job.error_message = None

                job.summary_json = None

                job.annotated_relative_path = None

                job.report_relative_path = None

                job.started_at = None

                job.finished_at = None

                job.processed_frames = None

                job.total_frames = None

                video.status = VIDEO_STATUS_PROCESSING

                video.processing_error = None

                db.commit()



                start_preview(job.id)

                launch_analysis_worker(video.id, job.id, None)

    except Exception as exc:

        video = db.get(VideoUpload, video_id)

        if video:

            video.status = VIDEO_STATUS_FAILED

            video.processing_error = str(exc)

            db.commit()

    finally:

        with _ACTIVE_CONVERSIONS_LOCK:

            _ACTIVE_CONVERSIONS.discard(video_id)

        db.close()










