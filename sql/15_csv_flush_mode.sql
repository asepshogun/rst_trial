ALTER TABLE detection_settings
    ADD COLUMN IF NOT EXISTS csv_flush_mode VARCHAR(20) NOT NULL DEFAULT 'concurrent';
