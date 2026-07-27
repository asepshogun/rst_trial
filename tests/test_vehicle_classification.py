from __future__ import annotations

import unittest

from app.constants import (
    DEFAULT_MASTER_CLASSES,
    GOLONGAN_1,
    GOLONGAN_2,
    GOLONGAN_3,
    GOLONGAN_4,
    GOLONGAN_5,
    GOLONGAN_6,
    GOLONGAN_7,
    MASTER_CLASS_CODES,
    VEHICLE_CLASS_ANGKOT,
    VEHICLE_CLASS_BUS,
    VEHICLE_CLASS_MOBIL,
    VEHICLE_CLASS_MOTOR,
    VEHICLE_CLASS_PICKUP,
    VEHICLE_CLASS_TR_2S,
    VEHICLE_CLASS_TR_3S,
)
from app.services.analysis import (
    AnalysisRoi,
    ProcessConfig,
    build_process_config,
    _assign_supplemental_motorcycle_track_id,
    _build_motorcycle_focus_rois,
    _build_report_events_from_overlay_frames,
    _is_detection_candidate,
    _is_duplicate_supplemental_motorcycle_detection,
    _resolve_analysis_roi,
    _resolve_effective_frame_stride,
    _stabilize_track_detection,
)
from app.services.vehicle_classification import classify_vehicle


class VehicleClassificationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.master_lookup = {code: payload for code, payload in DEFAULT_MASTER_CLASSES.items()}
        self.frame_width = 1920
        self.frame_height = 1080

    def classify(self, vehicle_class: str, bbox: tuple[int, int, int, int] = (900, 640, 1160, 880)):
        return classify_vehicle(
            vehicle_class=vehicle_class,
            source_label=vehicle_class,
            bbox=bbox,
            frame_width=self.frame_width,
            frame_height=self.frame_height,
            master_class_lookup=self.master_lookup,
        )

    def test_master_class_codes_follow_7_golongan_standard(self) -> None:
        self.assertEqual(MASTER_CLASS_CODES, ("1", "2", "3", "4", "5", "6", "7"))
        self.assertEqual(DEFAULT_MASTER_CLASSES["1"]["label"], "Motorcycle")
        self.assertEqual(DEFAULT_MASTER_CLASSES["5"]["label"], "Bus")
        self.assertEqual(DEFAULT_MASTER_CLASSES["7"]["label"], "3-Axle Truck")

    def test_motor_maps_to_golongan_1(self) -> None:
        result = self.classify(VEHICLE_CLASS_MOTOR)
        self.assertEqual(result.vehicle_type_code, VEHICLE_CLASS_MOTOR)
        self.assertEqual(result.golongan_code, GOLONGAN_1)

    def test_mobil_maps_to_golongan_2(self) -> None:
        result = self.classify(VEHICLE_CLASS_MOBIL)
        self.assertEqual(result.golongan_code, GOLONGAN_2)

    def test_angkot_maps_to_golongan_3(self) -> None:
        result = self.classify(VEHICLE_CLASS_ANGKOT)
        self.assertEqual(result.golongan_code, GOLONGAN_3)

    def test_pickup_maps_to_golongan_4(self) -> None:
        result = self.classify(VEHICLE_CLASS_PICKUP)
        self.assertEqual(result.golongan_code, GOLONGAN_4)

    def test_bus_maps_to_golongan_5(self) -> None:
        result = self.classify(VEHICLE_CLASS_BUS)
        self.assertEqual(result.golongan_code, GOLONGAN_5)

    def test_truck_2_axle_maps_to_golongan_6(self) -> None:
        result = self.classify(VEHICLE_CLASS_TR_2S)
        self.assertEqual(result.golongan_code, GOLONGAN_6)

    def test_truck_3_axle_maps_to_golongan_7(self) -> None:
        result = self.classify(VEHICLE_CLASS_TR_3S)
        self.assertEqual(result.golongan_code, GOLONGAN_7)

    def test_unknown_class_falls_back_to_golongan_2(self) -> None:
        # Kalau id kelas dari model tidak dikenal (mis. model diganti lagi
        # tanpa constants.py disesuaikan), classify_vehicle tidak boleh crash.
        result = self.classify("kelas_asing_tidak_dikenal")
        self.assertEqual(result.golongan_code, GOLONGAN_2)

    def test_track_reference_class_stays_stable_when_later_frames_flip_class(self) -> None:
        # Simulasikan sebuah track yang di frame awal terdeteksi sebagai bus,
        # lalu beberapa frame berikutnya salah terdeteksi sebagai truk 2-sumbu.
        # Stabilizer di analysis.py (bukan classify_vehicle) yang menjaga
        # supaya golongan akhir tidak lompat-lompat.
        track_states = {}
        first = _stabilize_track_detection(
            track_states=track_states,
            track_id=2992,
            frame_number=900,
            vehicle_class=VEHICLE_CLASS_BUS,
            source_label=VEHICLE_CLASS_BUS,
            confidence=0.64,
            bbox=(40, 288, 322, 655),
            frame_width=self.frame_width,
            frame_height=self.frame_height,
        )
        second = _stabilize_track_detection(
            track_states=track_states,
            track_id=2992,
            frame_number=910,
            vehicle_class=VEHICLE_CLASS_TR_2S,
            source_label=VEHICLE_CLASS_TR_2S,
            confidence=0.82,
            bbox=(410, 163, 566, 267),
            frame_width=self.frame_width,
            frame_height=self.frame_height,
        )

        self.assertEqual(first["reference_vehicle_class"], VEHICLE_CLASS_BUS)
        self.assertEqual(second["reference_vehicle_class"], VEHICLE_CLASS_BUS)

        result = classify_vehicle(
            vehicle_class=second["reference_vehicle_class"],
            source_label=second["reference_source_label"],
            bbox=second["reference_bbox"],
            frame_width=self.frame_width,
            frame_height=self.frame_height,
            master_class_lookup=self.master_lookup,
        )
        self.assertEqual(result.golongan_code, GOLONGAN_5)

    def test_overlay_event_builder_keeps_stable_golongan_on_single_frame_misdetection(self) -> None:
        # Satu frame yang salah deteksi (truk) di tengah rangkaian deteksi
        # bus TIDAK boleh langsung mengubah golongan track, supaya hasil
        # akhir tidak "kedip-kedip" akibat noise sesaat. (Kalau salah deteksi
        # itu bertahan 2+ frame berturut-turut, barulah class boleh berpindah
        # -- itu skenario lain, lihat test stabilizer di atas.)
        class Line:
            def __init__(self, line_order: int, name: str, start_y: float, end_y: float) -> None:
                self.line_order = line_order
                self.name = name
                self.start_x = 0.1
                self.start_y = start_y
                self.end_x = 0.9
                self.end_y = end_y

        lines = [
            Line(1, "Line 1", 0.60, 0.60),
            Line(2, "Line 2", 0.45, 0.45),
        ]
        overlay_frames = [
            {
                "source_frame": 10,
                "time_seconds": 1.0,
                "detections": [
                    {
                        "track_id": 2992,
                        "vehicle_class": VEHICLE_CLASS_BUS,
                        "source_label": VEHICLE_CLASS_BUS,
                        "detected_label": VEHICLE_CLASS_BUS,
                        "confidence": 0.64,
                        "x1": 0.20,
                        "y1": 0.25,
                        "x2": 0.42,
                        "y2": 0.72,
                    }
                ],
            },
            {
                "source_frame": 11,
                "time_seconds": 1.2,
                "detections": [
                    {
                        "track_id": 2992,
                        "vehicle_class": VEHICLE_CLASS_TR_2S,
                        "source_label": VEHICLE_CLASS_TR_2S,
                        "detected_label": VEHICLE_CLASS_TR_2S,
                        "confidence": 0.81,
                        "x1": 0.24,
                        "y1": 0.31,
                        "x2": 0.39,
                        "y2": 0.55,
                    }
                ],
            },
            {
                "source_frame": 12,
                "time_seconds": 1.4,
                "detections": [
                    {
                        "track_id": 2992,
                        "vehicle_class": VEHICLE_CLASS_BUS,
                        "source_label": VEHICLE_CLASS_BUS,
                        "detected_label": VEHICLE_CLASS_BUS,
                        "confidence": 0.70,
                        "x1": 0.28,
                        "y1": 0.34,
                        "x2": 0.40,
                        "y2": 0.40,
                    }
                ],
            },
        ]

        events = _build_report_events_from_overlay_frames(
            overlay_frames,
            lines=lines,
            source_width=self.frame_width,
            source_height=self.frame_height,
            master_class_lookup=self.master_lookup,
        )

        self.assertEqual(len(events), 2)
        self.assertEqual([event["count_line_order"] for event in events], [1, 2])
        self.assertTrue(all(event["vehicle_class"].lower() == VEHICLE_CLASS_BUS.lower() for event in events))
        self.assertTrue(all(event["golongan_code"] == GOLONGAN_5 for event in events))

    def test_overlay_event_builder_switches_class_after_sustained_flip(self) -> None:
        # Kebalikan dari test di atas: kalau kelas baru bertahan 2+ frame
        # berturut-turut dengan confidence lebih tinggi, track BOLEH
        # (dan seharusnya) berpindah golongan.
        class Line:
            def __init__(self, line_order: int, name: str, start_y: float, end_y: float) -> None:
                self.line_order = line_order
                self.name = name
                self.start_x = 0.1
                self.start_y = start_y
                self.end_x = 0.9
                self.end_y = end_y

        lines = [Line(1, "Line 1", 0.45, 0.45)]
        overlay_frames = [
            {
                "source_frame": 10,
                "time_seconds": 1.0,
                "detections": [
                    {
                        "track_id": 3001,
                        "vehicle_class": VEHICLE_CLASS_BUS,
                        "source_label": VEHICLE_CLASS_BUS,
                        "detected_label": VEHICLE_CLASS_BUS,
                        "confidence": 0.64,
                        "x1": 0.20,
                        "y1": 0.25,
                        "x2": 0.42,
                        "y2": 0.72,
                    }
                ],
            },
            {
                "source_frame": 11,
                "time_seconds": 1.2,
                "detections": [
                    {
                        "track_id": 3001,
                        "vehicle_class": VEHICLE_CLASS_TR_2S,
                        "source_label": VEHICLE_CLASS_TR_2S,
                        "detected_label": VEHICLE_CLASS_TR_2S,
                        "confidence": 0.81,
                        "x1": 0.24,
                        "y1": 0.31,
                        "x2": 0.39,
                        "y2": 0.55,
                    }
                ],
            },
            {
                "source_frame": 12,
                "time_seconds": 1.4,
                "detections": [
                    {
                        "track_id": 3001,
                        "vehicle_class": VEHICLE_CLASS_TR_2S,
                        "source_label": VEHICLE_CLASS_TR_2S,
                        "detected_label": VEHICLE_CLASS_TR_2S,
                        "confidence": 0.78,
                        "x1": 0.28,
                        "y1": 0.34,
                        "x2": 0.40,
                        "y2": 0.40,
                    }
                ],
            },
        ]

        events = _build_report_events_from_overlay_frames(
            overlay_frames,
            lines=lines,
            source_width=self.frame_width,
            source_height=self.frame_height,
            master_class_lookup=self.master_lookup,
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["vehicle_class"].lower(), VEHICLE_CLASS_TR_2S.lower())
        self.assertEqual(events[0]["golongan_code"], GOLONGAN_6)

    def test_analysis_roi_uses_full_width_and_line_context(self) -> None:
        class Line:
            def __init__(self, start_y: float, end_y: float) -> None:
                self.start_y = start_y
                self.end_y = end_y
                self.is_active = True

        roi = _resolve_analysis_roi([Line(0.56, 0.52)], self.frame_width, self.frame_height)
        self.assertEqual(roi.x1, 0)
        self.assertEqual(roi.x2, self.frame_width)
        self.assertLess(roi.y1, int(self.frame_height * 0.40))
        self.assertEqual(roi.y2, self.frame_height)

    def test_effective_frame_stride_respects_minimum_target_fps(self) -> None:
        self.assertEqual(_resolve_effective_frame_stride(25.0, 1, 15.0), 1)
        self.assertEqual(_resolve_effective_frame_stride(30.0, 5, 15.0), 2)
        self.assertEqual(_resolve_effective_frame_stride(60.0, 10, 20.0), 3)

    def test_motorcycle_focus_rois_split_large_road_roi(self) -> None:
        roi = AnalysisRoi(0, 80, 1600, 900)
        focus_rois = _build_motorcycle_focus_rois(roi, 1600, 900)

        self.assertEqual(len(focus_rois), 2)
        self.assertTrue(all(focus_roi.x1 >= 0 and focus_roi.y1 >= 0 for focus_roi in focus_rois))
        self.assertTrue(all(focus_roi.x2 <= 1600 and focus_roi.y2 <= 900 for focus_roi in focus_rois))
        self.assertTrue(all(focus_roi.width < roi.width or focus_roi.height < roi.height for focus_roi in focus_rois))

    def test_supplemental_motorcycle_duplicate_filter_keeps_adjacent_motorcycle(self) -> None:
        main_detections = [
            {
                "vehicle_class": VEHICLE_CLASS_MOBIL,
                "bbox": (700.0, 500.0, 1040.0, 760.0),
            }
        ]
        adjacent_motorcycle = (1045.0, 540.0, 1110.0, 760.0)
        same_motorcycle = (710.0, 510.0, 1030.0, 750.0)

        self.assertFalse(_is_duplicate_supplemental_motorcycle_detection(adjacent_motorcycle, main_detections))
        self.assertTrue(_is_duplicate_supplemental_motorcycle_detection(same_motorcycle, main_detections))

    def test_supplemental_motorcycle_tracker_keeps_fast_small_track(self) -> None:
        tracks = {}
        first_id, next_id, first_status = _assign_supplemental_motorcycle_track_id(
            tracks=tracks,
            bbox=(500.0, 500.0, 560.0, 700.0),
            frame_number=10,
            frame_width=self.frame_width,
            frame_height=self.frame_height,
            next_track_id=800000,
        )
        second_id, next_id, second_status = _assign_supplemental_motorcycle_track_id(
            tracks=tracks,
            bbox=(540.0, 535.0, 600.0, 735.0),
            frame_number=11,
            frame_width=self.frame_width,
            frame_height=self.frame_height,
            next_track_id=next_id,
        )

        self.assertEqual(first_status, "created")
        self.assertEqual(second_status, "matched")
        self.assertEqual(first_id, second_id)

    def test_class_specific_thresholds_keep_motorcycle_more_permissive_than_truck(self) -> None:
        config = ProcessConfig(
            model_path="best.pt",
            tracker_config="bytetrack.yaml",
            frame_stride=1,
            target_analysis_fps=15.0,
            preview_fps=6.0,
            working_max_width=1600,
            preview_max_width=960,
            preview_jpeg_quality=70,
            inference_imgsz=960,
            inference_device="cpu",
            confidence_threshold=0.12,
            motorcycle_min_confidence=0.12,
            car_min_confidence=0.30,
            bus_min_confidence=0.34,
            truck_min_confidence=0.38,
            iou_threshold=0.45,
            save_annotated_video=False,
        )
        motorcycle_bbox = (850, 630, 905, 910)
        tiny_truck_bbox = (850, 630, 905, 910)
        self.assertTrue(
            _is_detection_candidate(
                VEHICLE_CLASS_MOTOR,
                0.18,
                motorcycle_bbox,
                self.frame_width,
                self.frame_height,
                config,
            )
        )
        self.assertFalse(
            _is_detection_candidate(
                VEHICLE_CLASS_TR_2S,
                0.18,
                tiny_truck_bbox,
                self.frame_width,
                self.frame_height,
                config,
            )
        )

    def test_runtime_settings_override_analysis_config(self) -> None:
        config = build_process_config(
            {
                "confidence_threshold": 0.21,
                "iou_threshold": 0.52,
                "frame_stride": 2,
                "target_analysis_fps": 20.0,
                "preview_fps": 8.0,
                "working_max_width": 1280,
                "preview_max_width": 720,
                "preview_jpeg_quality": 82,
            }
        )

        self.assertEqual(config.confidence_threshold, 0.21)
        self.assertEqual(config.iou_threshold, 0.52)
        self.assertEqual(config.frame_stride, 2)
        self.assertEqual(config.target_analysis_fps, 20.0)
        self.assertEqual(config.preview_fps, 8.0)
        self.assertEqual(config.working_max_width, 1280)
        self.assertEqual(config.preview_max_width, 720)
        self.assertEqual(config.preview_jpeg_quality, 82)


if __name__ == "__main__":
    unittest.main()