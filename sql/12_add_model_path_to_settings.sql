-- Add model_path column to detection_settings table
-- This allows users to select which YOLO model file to use for analysis.

ALTER TABLE detection_settings
ADD COLUMN IF NOT EXISTS model_path VARCHAR(255) DEFAULT 'yolov8s.pt';
