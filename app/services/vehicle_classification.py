from __future__ import annotations

from dataclasses import dataclass

from app.constants import (
    GOLONGAN_1,
    GOLONGAN_2,
    GOLONGAN_3,
    GOLONGAN_4,
    GOLONGAN_5,
    GOLONGAN_6,
    GOLONGAN_7,
    GOLONGAN_LABELS,
    RAW_DETECTION_LABELS,
    VEHICLE_CLASS_LABELS,
    VEHICLE_CLASS_MOTOR,
    VEHICLE_CLASS_MOBIL,
    VEHICLE_CLASS_ANGKOT,
    VEHICLE_CLASS_PICKUP,
    VEHICLE_CLASS_BUS,
    VEHICLE_CLASS_TR_2S,
    VEHICLE_CLASS_TR_3S,
)

VEHICLE_CLASS_TO_GOLONGAN = {
    VEHICLE_CLASS_MOTOR: GOLONGAN_1,
    VEHICLE_CLASS_MOBIL: GOLONGAN_2,
    VEHICLE_CLASS_ANGKOT: GOLONGAN_3,
    VEHICLE_CLASS_PICKUP: GOLONGAN_4,
    VEHICLE_CLASS_BUS: GOLONGAN_5,
    VEHICLE_CLASS_TR_2S: GOLONGAN_6,
    VEHICLE_CLASS_TR_3S: GOLONGAN_7,
}


@dataclass(frozen=True)
class VehicleClassificationResult:
    raw_detected_label: str
    vehicle_type_code: str
    vehicle_type_label: str
    golongan_code: str
    golongan_label: str


def normalize_raw_detected_label(vehicle_class: str, source_label: str | None = None) -> str:
    normalized_source = str(source_label or "").strip().lower()
    if normalized_source:
        return normalized_source
    return RAW_DETECTION_LABELS.get(str(vehicle_class or "").strip(), str(vehicle_class or "").strip() or "-")


def classify_vehicle(
    *,
    vehicle_class: str,
    source_label: str | None,
    bbox: tuple[float, float, float, float],
    frame_width: int,
    frame_height: int,
    master_class_lookup: dict[str, dict],
) -> VehicleClassificationResult:
    """Signature dipertahankan sama persis dengan versi lama supaya
    analysis.py tidak perlu diubah di titik pemanggilannya.
    bbox/frame_width/frame_height sudah tidak dipakai untuk heuristik
    karena model sudah langsung memberi golongan final."""
    raw_detected_label = normalize_raw_detected_label(vehicle_class, source_label)
    golongan_code = VEHICLE_CLASS_TO_GOLONGAN.get(vehicle_class, GOLONGAN_2)
    golongan_entry = master_class_lookup.get(golongan_code) or {}
    golongan_label = golongan_entry.get("label") or GOLONGAN_LABELS.get(golongan_code, golongan_code)
    vehicle_type_label = VEHICLE_CLASS_LABELS.get(vehicle_class, raw_detected_label)
    return VehicleClassificationResult(
        raw_detected_label=raw_detected_label,
        vehicle_type_code=str(vehicle_class),
        vehicle_type_label=vehicle_type_label,
        golongan_code=golongan_code,
        golongan_label=golongan_label,
    )
