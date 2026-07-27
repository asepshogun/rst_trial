CREATE TABLE IF NOT EXISTS csv_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_upload_id UUID NOT NULL REFERENCES video_uploads(id) ON DELETE CASCADE,
    analysis_job_id UUID NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
    csv_relative_path TEXT,
    segment_count INTEGER NOT NULL DEFAULT 0,
    segments_completed INTEGER NOT NULL DEFAULT 0,
    segment_duration_seconds INTEGER NOT NULL DEFAULT 60,
    total_rows INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csv_reports_site ON csv_reports(site_id);
CREATE INDEX IF NOT EXISTS idx_csv_reports_video ON csv_reports(video_upload_id);
CREATE INDEX IF NOT EXISTS idx_csv_reports_status ON csv_reports(status);
