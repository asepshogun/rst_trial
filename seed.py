# -*- coding: utf-8 -*-
"""
seed.py - NiceCount demo seeder
================================
Mengisi database dengan:
  - 9 titik CCTV Bandung (Sites + CountLines)
  - Video per site mencakup 12 bulan penuh (Jan–Des tahun berjalan)
    Setiap bulan: 4 minggu x 2 slot/hari (pagi + sore) = 56 video/site
  - VehicleEvents dengan distribusi jam realistis (WIB)
  - AnalysisGolonganTotals per video
  - FdResult (Fundamental Diagram Greenshields) per site

Struktur waktu:
  - 12 bulan x 4 minggu x 7 hari = 336 hari coverage
  - Tiap hari: 2 rekaman (pagi jam 06 + sore jam 15), durasi 2 jam
  - Setiap rekaman span 2 jam -> crossed_at_seconds mencakup 2 jam berbeda
  - Heatmap bisa difilter per bulan (1-12) dan minggu (1-4)

Jalankan:
    python seed.py           -- tambah data yang belum ada
    python seed.py --reset   -- hapus semua data seed lalu isi ulang
"""

from __future__ import annotations

import calendar
import io
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# ---------------------------------------------------------------------------
# Bootstrap app
# ---------------------------------------------------------------------------
from sqlalchemy import select

from app.database import SessionLocal
from app.models import (
    AnalysisGolonganTotal,
    AnalysisJob,
    CountLine,
    FdResult,
    MasterClass,
    Site,
    VehicleEvent,
    VideoUpload,
)
from app.services.master_classes import get_or_create_master_classes

# ---------------------------------------------------------------------------
# 9 Titik CCTV Bandung — FIXED, jangan diubah
# ---------------------------------------------------------------------------
SITES = [
    {
        "code": "BTN-01", "name": "Batununggal",
        "location_description": "Jl. Soekarno-Hatta — simpang Batununggal",
        "latitude": -6.9441, "longitude": 107.6455,
        "direction_normal_label": "Arah Timur / Cileunyi",
        "direction_opposite_label": "Arah Barat / Kopo",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.58, "end_x": 0.85, "end_y": 0.58},
    },
    {
        "code": "BBT-01", "name": "Buah Batu",
        "location_description": "Jl. Buah Batu — depan Kodam III Siliwangi",
        "latitude": -6.9476, "longitude": 107.6392,
        "direction_normal_label": "Arah Utara / Kota",
        "direction_opposite_label": "Arah Selatan / Dayeuh Kolot",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.55, "end_x": 0.85, "end_y": 0.55},
    },
    {
        "code": "CLY-01", "name": "Cileunyi",
        "location_description": "Simpang Cileunyi — Jl. Raya Cileunyi",
        "latitude": -6.9204, "longitude": 107.7285,
        "direction_normal_label": "Arah Barat / Bandung Kota",
        "direction_opposite_label": "Arah Timur / Sumedang",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.60, "end_x": 0.85, "end_y": 0.60},
    },
    {
        "code": "GDB-01", "name": "Gedebage",
        "location_description": "Jl. Soekarno-Hatta — kawasan Gedebage",
        "latitude": -6.9388, "longitude": 107.6894,
        "direction_normal_label": "Arah Timur / Cileunyi",
        "direction_opposite_label": "Arah Barat / Kota",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.58, "end_x": 0.85, "end_y": 0.58},
    },
    {
        "code": "KPO-01", "name": "Kopo",
        "location_description": "Jl. Kopo — simpang Caringin",
        "latitude": -6.9572, "longitude": 107.5814,
        "direction_normal_label": "Arah Utara / Kota",
        "direction_opposite_label": "Arah Selatan / Soreang",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.55, "end_x": 0.85, "end_y": 0.55},
    },
    {
        "code": "MTH-01", "name": "Moh. Toha",
        "location_description": "Jl. Mohammad Toha — depan Pasar Caringin",
        "latitude": -6.9495, "longitude": 107.6018,
        "direction_normal_label": "Arah Utara / Kota",
        "direction_opposite_label": "Arah Selatan / Dayeuh Kolot",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.57, "end_x": 0.85, "end_y": 0.57},
    },
    {
        "code": "PKJ-01", "name": "Pasir Koja",
        "location_description": "Jl. Pasir Koja — simpang Nanjung",
        "latitude": -6.9348, "longitude": 107.5671,
        "direction_normal_label": "Arah Timur / Kota",
        "direction_opposite_label": "Arah Barat / Cimahi",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.58, "end_x": 0.85, "end_y": 0.58},
    },
    {
        "code": "PST-01", "name": "Pasteur",
        "location_description": "Jl. Dr. Djunjunan — simpang Pasteur / exit Tol",
        "latitude": -6.8923, "longitude": 107.5892,
        "direction_normal_label": "Arah Selatan / Kota",
        "direction_opposite_label": "Arah Utara / Cimahi",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.55, "end_x": 0.85, "end_y": 0.55},
    },
    {
        "code": "STB-01", "name": "Setiabudi",
        "location_description": "Jl. Setiabudi — depan Universitas Pendidikan Indonesia",
        "latitude": -6.8619, "longitude": 107.5940,
        "direction_normal_label": "Arah Selatan / Kota",
        "direction_opposite_label": "Arah Utara / Lembang",
        "count_line": {"name": "Garis Utama", "start_x": 0.15, "start_y": 0.55, "end_x": 0.85, "end_y": 0.55},
    },
]

# ---------------------------------------------------------------------------
# Durasi video = 2 jam (7200 detik) agar crossed_at_seconds
# mencakup 2 jam berbeda -> heatmap kaya data
# ---------------------------------------------------------------------------
VIDEO_DURATION = 7200  # detik

# Slot rekaman per hari: (jam_wib, tipe)
# Pagi jam 06:00-08:00, Sore jam 15:00-17:00
DAILY_SLOTS = [
    (6,  "pagi"),
    (15, "sore"),
]

# ---------------------------------------------------------------------------
# Distribusi kendaraan per golongan per tipe slot
# ---------------------------------------------------------------------------
GOLONGAN_DIST = {
    "pagi": {
        "1": (1800, 2600), "2": (550, 800),  "3": (220, 380), "4": (170, 280),
        "5a": (60, 110),   "5b": (20, 45),   "6a": (40, 80),  "6b": (15, 32),
        "7a": (10, 22),    "7b": (4, 12),    "7c": (2, 7),    "8": (20, 50),
    },
    "sore": {
        "1": (1600, 2400), "2": (480, 720),  "3": (200, 350), "4": (150, 260),
        "5a": (55, 100),   "5b": (18, 40),   "6a": (35, 72),  "6b": (12, 28),
        "7a": (8, 18),     "7b": (3, 10),    "7c": (1, 5),    "8": (15, 45),
    },
    "siang": {
        "1": (900, 1400),  "2": (280, 450),  "3": (120, 200), "4": (90, 160),
        "5a": (30, 65),    "5b": (10, 25),   "6a": (20, 50),  "6b": (8, 18),
        "7a": (4, 12),     "7b": (2, 6),     "7c": (0, 3),    "8": (8, 28),
    },
}

GOLONGAN_VEHICLE_CLASS = {
    "1": "motorcycle", "2": "car",    "3": "car",   "4": "car",
    "5a": "bus",       "5b": "bus",   "6a": "truck", "6b": "truck",
    "7a": "truck",     "7b": "truck", "7c": "truck", "8": "bicycle",
}

# Bobot kepadatan per jam (0–23) WIB
HOUR_WEIGHT = [
    0.20, 0.12, 0.08, 0.06, 0.10, 0.55,   # 00-05
    1.00, 0.95, 0.80, 0.65, 0.58, 0.62,   # 06-11
    0.72, 0.63, 0.57, 0.68, 0.96, 1.00,   # 12-17
    0.88, 0.72, 0.58, 0.46, 0.36, 0.28,   # 18-23
]

# ---------------------------------------------------------------------------
# Fundamental Diagram per site (Greenshields)
# ---------------------------------------------------------------------------
FD_PARAMS = {
    "BTN-01": {"vf": 58.5, "kj": 142.0, "line_spacing_m": 5.0},
    "BBT-01": {"vf": 52.3, "kj": 128.0, "line_spacing_m": 5.0},
    "CLY-01": {"vf": 71.2, "kj": 165.0, "line_spacing_m": 6.0},
    "GDB-01": {"vf": 65.8, "kj": 158.0, "line_spacing_m": 5.5},
    "KPO-01": {"vf": 49.1, "kj": 122.0, "line_spacing_m": 4.5},
    "MTH-01": {"vf": 44.7, "kj": 115.0, "line_spacing_m": 4.0},
    "PKJ-01": {"vf": 53.6, "kj": 131.0, "line_spacing_m": 5.0},
    "PST-01": {"vf": 68.4, "kj": 152.0, "line_spacing_m": 6.0},
    "STB-01": {"vf": 61.0, "kj": 138.0, "line_spacing_m": 5.0},
}


# ---------------------------------------------------------------------------
# Helper: generate recording dates for full-year coverage
# ---------------------------------------------------------------------------
def build_recording_dates(year: int) -> list[date]:
    """
    Return satu tanggal perwakilan per minggu per bulan (Senin pertama tiap minggu).
    Coverage: 12 bulan x 4 minggu = 48 tanggal per site.
    Minggu 1: hari 1-7, Minggu 2: 8-14, Minggu 3: 15-21, Minggu 4: 22-akhir.
    Perwakilan = hari pertama tiap rentang minggu (atau hari berikutnya jika sudah lewat hari ini).
    """
    today = date.today()
    dates = []
    for month in range(1, 13):
        last_day = calendar.monthrange(year, month)[1]
        week_starts = [1, 8, 15, 22]
        for ws in week_starts:
            # Ambil hari Senin-Jumat dalam rentang minggu ini secara bergantian
            # untuk variasi hari (bukan selalu Senin)
            week_num = week_starts.index(ws) + 1
            # Spread: Minggu1=Senin, Minggu2=Rabu, Minggu3=Jumat, Minggu4=Selasa
            day_offset = [0, 2, 4, 1][week_num - 1]
            candidate_day = ws + day_offset
            if candidate_day > last_day:
                candidate_day = last_day
            d = date(year, month, candidate_day)
            # Jangan seed hari yang belum terjadi (masa depan)
            if d > today:
                continue
            dates.append(d)
    return dates


# ---------------------------------------------------------------------------
# Helper: weighted timestamp sampling
# ---------------------------------------------------------------------------
def _weighted_seconds(duration: float, start_hour_wib: int, n: int) -> list[float]:
    total_secs = int(duration)
    weights = []
    for s in range(total_secs):
        hour = (start_hour_wib + s // 3600) % 24
        weights.append(HOUR_WEIGHT[hour])

    total_w = sum(weights) or 1.0
    cum = []
    acc = 0.0
    for w in weights:
        acc += w / total_w
        cum.append(acc)

    result = []
    for _ in range(n):
        r = random.random()
        lo, hi = 0, len(cum) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if cum[mid] < r:
                lo = mid + 1
            else:
                hi = mid
        result.append(float(lo) + random.random())
    result.sort()
    return result


# ---------------------------------------------------------------------------
# Helper: FD intervals
# ---------------------------------------------------------------------------
def _build_fd_intervals(vf: float, kj: float, n_intervals: int = 80) -> list[dict]:
    intervals = []
    for i in range(n_intervals):
        k = kj * (0.05 + 0.90 * i / (n_intervals - 1))
        v_theory = max(0.0, vf - (vf / kj) * k)
        v = max(0.0, v_theory * (1 + random.uniform(-0.12, 0.12)))
        q = max(0.0, k * v)
        intervals.append({
            "density_k": round(k, 2),
            "speed_v":   round(v, 2),
            "flow_q":    round(q, 1),
        })
    return intervals


# ---------------------------------------------------------------------------
# RESET helper
# ---------------------------------------------------------------------------
def reset_seed_data(db) -> None:
    print("[RESET] Menghapus semua data seed (bukan users/settings/master_classes)...")
    from sqlalchemy import text as _text
    db.execute(_text(
        "DELETE FROM video_uploads WHERE site_id IN (SELECT id FROM sites WHERE code LIKE '%-01')"
    ))
    db.execute(_text("DELETE FROM sites WHERE code LIKE '%-01'"))
    db.commit()
    print("[RESET] Selesai.\n")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def seed() -> None:
    db = SessionLocal()
    try:
        if "--reset" in sys.argv:
            reset_seed_data(db)

        print("[*] Memastikan master_classes ...")
        get_or_create_master_classes(db)
        valid_codes = {
            row.code: row.label
            for row in db.scalars(select(MasterClass)).all()
        }
        print(f"    {len(valid_codes)} golongan: {', '.join(sorted(valid_codes))}\n")

        now_utc = datetime.now(timezone.utc)
        current_year = now_utc.year

        # Build daftar tanggal recording — 12 bulan x 4 minggu
        recording_dates = build_recording_dates(current_year)
        print(f"[*] Coverage: {len(recording_dates)} tanggal "
              f"({recording_dates[0]} s/d {recording_dates[-1]})\n")

        total_new_videos = 0
        total_new_events = 0

        for site_def in SITES:
            code = site_def["code"]

            # ── Site ────────────────────────────────────────────────
            site = db.scalar(select(Site).where(Site.code == code))
            if site:
                print(f"[SKIP site] {site_def['name']} ({code}) sudah ada")
            else:
                site = Site(
                    code=code,
                    name=site_def["name"],
                    location_description=site_def["location_description"],
                    latitude=site_def["latitude"],
                    longitude=site_def["longitude"],
                    direction_normal_label=site_def["direction_normal_label"],
                    direction_opposite_label=site_def["direction_opposite_label"],
                )
                db.add(site)
                db.flush()
                cl = site_def["count_line"]
                db.add(CountLine(
                    site_id=site.id, name=cl["name"], line_order=1,
                    start_x=cl["start_x"], start_y=cl["start_y"],
                    end_x=cl["end_x"],     end_y=cl["end_y"], is_active=True,
                ))
                db.commit()
                print(f"[NEW  site] {site_def['name']} ({code})")

            # ── Videos: tiap tanggal x 2 slot (pagi + sore) ─────────
            site_new_videos = 0
            site_new_events = 0

            for rec_date in recording_dates:
                for hour_wib, slot_type in DAILY_SLOTS:
                    # recorded_at = tanggal + jam dalam UTC (WIB-7)
                    hour_utc = (hour_wib - 7) % 24
                    # Jika jam UTC < jam WIB artinya malam hari UTC, tetap tanggal sama
                    rec_dt_utc = datetime(
                        rec_date.year, rec_date.month, rec_date.day,
                        hour_utc, 0, 0, tzinfo=timezone.utc
                    )

                    filename = (
                        f"{code}_{rec_date.strftime('%Y%m%d')}"
                        f"_{slot_type}_{hour_wib:02d}h.mp4"
                    )

                    # Idempotent: skip jika sudah ada
                    if db.scalar(select(VideoUpload).where(
                        VideoUpload.site_id == site.id,
                        VideoUpload.original_filename == filename,
                    )):
                        continue

                    # VideoUpload
                    stored = f"seed_{uuid.uuid4().hex}_{filename}"
                    video = VideoUpload(
                        site_id=site.id,
                        original_filename=filename,
                        stored_filename=stored,
                        relative_path=f"uploads/{stored}",
                        description=f"Rekaman CCTV {site_def['name']} — {slot_type}",
                        mime_type="video/mp4",
                        file_size_bytes=random.randint(200_000_000, 800_000_000),
                        recorded_at=rec_dt_utc,
                        uploaded_by="admin",
                        status="processed",
                        video_fps=30.0,
                        frame_width=1920, frame_height=1080,
                        frame_count=int(VIDEO_DURATION * 30),
                        duration_seconds=float(VIDEO_DURATION),
                    )
                    db.add(video)
                    db.flush()

                    # AnalysisJob
                    started_at  = rec_dt_utc + timedelta(minutes=3)
                    finished_at = started_at  + timedelta(minutes=30)
                    job = AnalysisJob(
                        video_upload_id=video.id,
                        status="completed",
                        model_name="yolov8s.pt",
                        config_json={"confidence": 0.25, "iou": 0.45},
                        summary_json={},
                        started_at=started_at,
                        finished_at=finished_at,
                        total_frames=int(VIDEO_DURATION * 30),
                        processed_frames=int(VIDEO_DURATION * 30),
                    )
                    db.add(job)
                    db.flush()

                    # Golongan counts
                    dist = GOLONGAN_DIST[slot_type]
                    golongan_counts: dict[str, int] = {
                        g: random.randint(lo, hi)
                        for g, (lo, hi) in dist.items()
                        if g in valid_codes
                    }
                    total_v = sum(golongan_counts.values())

                    # VehicleEvents
                    all_vehicles: list[tuple[str, str]] = []
                    for gcode, count in golongan_counts.items():
                        all_vehicles.extend([(gcode, valid_codes[gcode])] * count)
                    random.shuffle(all_vehicles)

                    timestamps = _weighted_seconds(VIDEO_DURATION, hour_wib, total_v)

                    events = []
                    for seq, ((gcode, glabel), crossed_s) in enumerate(
                        zip(all_vehicles, timestamps), start=1
                    ):
                        vclass = GOLONGAN_VEHICLE_CLASS.get(gcode, "car")
                        direction = random.choices(
                            ["normal", "opposite"], weights=[0.62, 0.38]
                        )[0]
                        events.append(VehicleEvent(
                            video_upload_id=video.id,
                            analysis_job_id=job.id,
                            site_id=site.id,
                            sequence_no=seq,
                            track_id=seq,
                            vehicle_class=vclass,
                            detected_label=vclass,
                            vehicle_type_code=gcode,
                            vehicle_type_label=glabel,
                            golongan_code=gcode,
                            golongan_label=glabel,
                            source_label=vclass,
                            count_line_order=1,
                            count_line_name="Garis Utama",
                            direction=direction,
                            crossed_at_seconds=round(crossed_s, 3),
                            crossed_at_frame=int(crossed_s * 30),
                            confidence=round(random.uniform(0.45, 0.98), 3),
                            speed_kph=round(random.uniform(10.0, 80.0), 1)
                                if vclass != "bicycle" else None,
                        ))
                    db.bulk_save_objects(events)

                    # AnalysisGolonganTotals
                    for gcode, count in golongan_counts.items():
                        db.add(AnalysisGolonganTotal(
                            video_upload_id=video.id,
                            analysis_job_id=job.id,
                            golongan_code=gcode,
                            golongan_label=valid_codes[gcode],
                            vehicle_count=count,
                        ))

                    db.commit()
                    site_new_videos += 1
                    site_new_events += total_v

            print(f"  {code}: +{site_new_videos} video, +{site_new_events:,} events")
            total_new_videos += site_new_videos
            total_new_events += site_new_events

            # ── Fundamental Diagram ──────────────────────────────────
            fd_exists = db.scalar(
                select(FdResult)
                .join(VideoUpload, VideoUpload.id == FdResult.video_upload_id)
                .where(VideoUpload.site_id == site.id)
            )
            if fd_exists:
                print(f"  {code}: [SKIP FD] sudah ada")
            else:
                anchor = db.scalar(
                    select(VideoUpload)
                    .where(VideoUpload.site_id == site.id, VideoUpload.status == "processed")
                    .order_by(VideoUpload.recorded_at.asc())
                )
                if anchor:
                    fp = FD_PARAMS[code]
                    vf, kj = fp["vf"], fp["kj"]
                    q_cap = (vf * kj) / 4.0
                    intervals = _build_fd_intervals(vf, kj, n_intervals=80)
                    db.add(FdResult(
                        video_upload_id=anchor.id,
                        line_spacing_m=fp["line_spacing_m"],
                        direction="normal",
                        interval_s=60,
                        greenshields_vf=round(vf, 2),
                        greenshields_kj=round(kj, 2),
                        greenshields_q_cap=round(q_cap, 2),
                        matched_pairs_count=len(intervals),
                        intervals_json=intervals,
                    ))
                    db.commit()
                    print(f"  {code}: [FD] vf={vf} kj={kj} q_cap={q_cap:.0f}")
            print()

        # ── Ringkasan akhir ──────────────────────────────────────────
        from sqlalchemy import func, text
        n_sites  = db.scalar(select(func.count()).select_from(Site))
        n_videos = db.scalar(select(func.count()).select_from(VideoUpload))
        n_events = db.scalar(select(func.count()).select_from(VehicleEvent))
        n_fd     = db.scalar(select(func.count()).select_from(FdResult))

        # Heatmap coverage: jumlah kombinasi (bulan, minggu, dow, hour) yang terisi
        hm_coverage = db.execute(text("""
            SELECT COUNT(DISTINCT (
                EXTRACT(month FROM (v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval)
                    AT TIME ZONE 'Asia/Jakarta'),
                EXTRACT(dow   FROM (v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval)
                    AT TIME ZONE 'Asia/Jakarta'),
                EXTRACT(hour  FROM (v.recorded_at + (ve.crossed_at_seconds || ' seconds')::interval)
                    AT TIME ZONE 'Asia/Jakarta')
            ))
            FROM vehicle_events ve
            JOIN video_uploads v ON v.id = ve.video_upload_id
        """)).scalar()

        print("=" * 58)
        print(f"  Sites            : {n_sites}")
        print(f"  Videos total     : {n_videos}  (+{total_new_videos} baru)")
        print(f"  VehicleEvents    : {n_events:,}  (+{total_new_events:,} baru)")
        print(f"  FdResults        : {n_fd}")
        print(f"  Heatmap coverage : {hm_coverage} kombinasi (bulan x hari x jam)")
        print("=" * 58)
        print("[DONE] Seeding selesai.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
