from __future__ import annotations

from collections import OrderedDict


VIDEO_STATUS_UPLOADED = "uploaded"
VIDEO_STATUS_CONVERTING = "converting"
VIDEO_STATUS_PROCESSING = "processing"
VIDEO_STATUS_PROCESSED = "processed"
VIDEO_STATUS_FAILED = "failed"

JOB_STATUS_PENDING = "pending"
JOB_STATUS_QUEUED = "queued"
JOB_STATUS_PROCESSING = "processing"
JOB_STATUS_COMPLETED = "completed"
JOB_STATUS_STOPPED = "stopped"
JOB_STATUS_FAILED = "failed"

CSV_STATUS_PENDING = "pending"
CSV_STATUS_PROCESSING = "processing"
CSV_STATUS_COMPLETED = "completed"
CSV_STATUS_FAILED = "failed"

DIRECTION_NORMAL = "normal"
DIRECTION_OPPOSITE = "opposite"

VEHICLE_CLASS_MOTOR = "1motor"
VEHICLE_CLASS_MOBIL = "2mobil"
VEHICLE_CLASS_ANGKOT = "3ang_umum"
VEHICLE_CLASS_PICKUP = "4PickupMicro"
VEHICLE_CLASS_BUS = "5Bus"
VEHICLE_CLASS_TR_2S = "6TR_2sumbu"
VEHICLE_CLASS_TR_3S = "7TR-3sumbu"

TRACKABLE_CLASS_IDS = (0, 1, 2, 3, 4, 5, 6)

COCO_CLASS_TO_VEHICLE_CLASS = {
    0: VEHICLE_CLASS_MOTOR,
    1: VEHICLE_CLASS_MOBIL,
    2: VEHICLE_CLASS_ANGKOT,
    3: VEHICLE_CLASS_PICKUP,
    4: VEHICLE_CLASS_BUS,
    5: VEHICLE_CLASS_TR_2S,
    6: VEHICLE_CLASS_TR_3S,
}

RAW_DETECTION_LABELS = OrderedDict(
    [
        (VEHICLE_CLASS_MOTOR, "1motor"),
        (VEHICLE_CLASS_MOBIL, "2mobil"),
        (VEHICLE_CLASS_ANGKOT, "3ang_umum"),
        (VEHICLE_CLASS_PICKUP, "4PickupMicro"),
        (VEHICLE_CLASS_BUS, "5Bus"),
        (VEHICLE_CLASS_TR_2S, "6TR_2sumbu"),
        (VEHICLE_CLASS_TR_3S, "7TR-3sumbu"),
    ]
)

VEHICLE_CLASS_LABELS = OrderedDict(
    [
        (VEHICLE_CLASS_MOTOR, "Motorcycle"),
        (VEHICLE_CLASS_MOBIL, "Car / Sedan"),
        (VEHICLE_CLASS_ANGKOT, "Public Transportation (Angkot)"),
        (VEHICLE_CLASS_PICKUP, "Pickup / Micro Truck"),
        (VEHICLE_CLASS_BUS, "Bus"),
        (VEHICLE_CLASS_TR_2S, "2-Axle Truck (Jumbo)"),
        (VEHICLE_CLASS_TR_3S, "3-Axle Truck (Jumbo)"),
    ]
)

GOLONGAN_1 = "1"
GOLONGAN_2 = "2"
GOLONGAN_3 = "3"
GOLONGAN_4 = "4"
GOLONGAN_5 = "5"
GOLONGAN_6 = "6"
GOLONGAN_7 = "7"

GOLONGAN_LABELS = OrderedDict(
    [
        (GOLONGAN_1, "Motorcycle"),
        (GOLONGAN_2, "Car / Sedan / SUV"),
        (GOLONGAN_3, "Angkutan Umum (Angkot)"),
        (GOLONGAN_4, "Pickup / Micro Truck"),
        (GOLONGAN_5, "Bus"),
        (GOLONGAN_6, "2-Axle Truck"),
        (GOLONGAN_7, "3-Axle Truck"),
    ]
)

DEFAULT_MASTER_CLASSES = OrderedDict(
    [
        (GOLONGAN_1, {"label": "Motorcycle", "description": "Motorcycles and two-wheeled vehicles.", "sort_order": 1}),
        (GOLONGAN_2, {"label": "Car / Sedan / SUV", "description": "Private cars, sedans, jeeps, and station wagons.", "sort_order": 2}),
        (GOLONGAN_3, {"label": "Angkutan Umum", "description": "Public transport passenger vehicles (Angkot).", "sort_order": 3}),
        (GOLONGAN_4, {"label": "Pickup / Micro Truck", "description": "Pickups and micro delivery trucks.", "sort_order": 4}),
        (GOLONGAN_5, {"label": "Bus", "description": "Buses and medium-to-large passenger buses.", "sort_order": 5}),
        (GOLONGAN_6, {"label": "2-Axle Truck", "description": "Medium 2-axle cargo trucks.", "sort_order": 6}),
        (GOLONGAN_7, {"label": "3-Axle Truck", "description": "Heavy 3-axle and large jumbo trucks.", "sort_order": 7}),
    ]
)

MASTER_CLASS_CODES = tuple(DEFAULT_MASTER_CLASSES.keys())
GOLONGAN_DESCRIPTIONS = {code: item["description"] for code, item in DEFAULT_MASTER_CLASSES.items()}

DEFAULT_GLOBAL_CONFIDENCE = 0.25
DEFAULT_MOTORCYCLE_MIN_CONFIDENCE = 0.25
DEFAULT_CAR_MIN_CONFIDENCE = 0.25
DEFAULT_BUS_MIN_CONFIDENCE = 0.25
DEFAULT_TRUCK_MIN_CONFIDENCE = 0.25
DEFAULT_VEHICLE_MIN_CONFIDENCE = DEFAULT_GLOBAL_CONFIDENCE
DEFAULT_IOU_THRESHOLD = 0.45
DEFAULT_FRAME_STRIDE = 1
DEFAULT_TARGET_ANALYSIS_FPS = 8.0
DEFAULT_PREVIEW_FPS = 6.0
DEFAULT_WORKING_MAX_WIDTH = 1600
DEFAULT_PREVIEW_MAX_WIDTH = 960
DEFAULT_PREVIEW_JPEG_QUALITY = 70
DEFAULT_INFERENCE_IMGSZ = 960
