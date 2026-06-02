"""Model adapter layer for NiceCount vehicle detection.

Abstracts differences between COCO pretrained models (yolov8n/yolov8s) and
custom-trained models (best.pt from IF department) so the analysis pipeline
can work with either without major structural changes.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from app.constants import (
    VEHICLE_CLASS_BICYCLE,
    VEHICLE_CLASS_BUS,
    VEHICLE_CLASS_CAR,
    VEHICLE_CLASS_MOTORCYCLE,
    VEHICLE_CLASS_TRUCK,
)


class ModelType(str, Enum):
    """Enum representing supported model types."""
    COCO = "coco"
    CUSTOM_IF = "custom_if"


# ---------------------------------------------------------------------------
# COCO pretrained mapping (yolov8n.pt / yolov8s.pt — 80 classes)
# ---------------------------------------------------------------------------
COCO_TRACKABLE_CLASS_IDS = (1, 2, 3, 5, 7)

COCO_CLASS_TO_VEHICLE_CLASS = {
    1: VEHICLE_CLASS_BICYCLE,
    2: VEHICLE_CLASS_CAR,
    3: VEHICLE_CLASS_MOTORCYCLE,
    5: VEHICLE_CLASS_BUS,
    7: VEHICLE_CLASS_TRUCK,
}

COCO_MOTORCYCLE_CLASS_ID = 3

# ---------------------------------------------------------------------------
# Custom IF model mapping (best.pt — 7 classes)
# Class names from model: {
#   0: 'Kelas 1 Motor',
#   1: 'Kelas 2 Mobil',
#   2: 'Kelas 3 Angkot',
#   3: 'Kelas 4 Pickup',
#   4: 'Kelas 5 Bus',
#   5: 'Kelas 6 TrukKecil',
#   6: 'Kelas 7 TrukBesar',
# }
# ---------------------------------------------------------------------------
CUSTOM_IF_TRACKABLE_CLASS_IDS = (0, 1, 2, 3, 4, 5, 6)

CUSTOM_IF_CLASS_TO_VEHICLE_CLASS = {
    0: VEHICLE_CLASS_MOTORCYCLE,
    1: VEHICLE_CLASS_CAR,
    2: VEHICLE_CLASS_CAR,       # Angkot → mapped as car, source_label provides hint
    3: VEHICLE_CLASS_TRUCK,     # Pickup → mapped as truck, source_label provides hint
    4: VEHICLE_CLASS_BUS,
    5: VEHICLE_CLASS_TRUCK,     # TrukKecil
    6: VEHICLE_CLASS_TRUCK,     # TrukBesar
}

CUSTOM_IF_MOTORCYCLE_CLASS_ID = 0

# Known custom IF model class name signatures for auto-detection.
_CUSTOM_IF_SIGNATURES = {"kelas 1 motor", "kelas 2 mobil", "kelas 3 angkot"}


def detect_model_type(model) -> ModelType:
    """Auto-detect model type from the loaded YOLO model's class names.

    Checks the model.names dict for known custom IF signatures. Falls back
    to COCO if no match.
    """
    names = getattr(model, "names", None)
    if not names:
        return ModelType.COCO

    name_values = {str(v).strip().lower() for v in names.values()} if isinstance(names, dict) else set()
    if name_values & _CUSTOM_IF_SIGNATURES:
        return ModelType.CUSTOM_IF

    return ModelType.COCO


def get_trackable_class_ids(model_type: ModelType) -> tuple[int, ...]:
    """Return the YOLO class IDs that should be tracked for the given model."""
    if model_type == ModelType.CUSTOM_IF:
        return CUSTOM_IF_TRACKABLE_CLASS_IDS
    return COCO_TRACKABLE_CLASS_IDS


def map_class_to_vehicle(model_type: ModelType, class_id: int) -> Optional[str]:
    """Map a raw YOLO class ID to the internal vehicle class string.

    Returns None if the class_id is not a known vehicle.
    """
    if model_type == ModelType.CUSTOM_IF:
        return CUSTOM_IF_CLASS_TO_VEHICLE_CLASS.get(class_id)
    return COCO_CLASS_TO_VEHICLE_CLASS.get(class_id)


def get_motorcycle_class_id(model_type: ModelType) -> int:
    """Return the class ID used for motorcycle in the given model."""
    if model_type == ModelType.CUSTOM_IF:
        return CUSTOM_IF_MOTORCYCLE_CLASS_ID
    return COCO_MOTORCYCLE_CLASS_ID


def is_custom_model(model_type: ModelType) -> bool:
    """Convenience check for custom IF model."""
    return model_type == ModelType.CUSTOM_IF
