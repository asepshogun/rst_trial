-- Migration 13: Fundamental Diagram results table
-- Stores per-video speed-trap computation results (q, v, k per time interval)
-- and Greenshields model fit parameters.

CREATE TABLE IF NOT EXISTS fd_results (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    video_upload_id     UUID             NOT NULL REFERENCES video_uploads(id) ON DELETE CASCADE,
    line_spacing_m      DOUBLE PRECISION NOT NULL,
    direction           VARCHAR(20)      NOT NULL DEFAULT 'normal',
    interval_s          INTEGER          NOT NULL DEFAULT 60,
    greenshields_vf     DOUBLE PRECISION,          -- free-flow speed (km/h)
    greenshields_kj     DOUBLE PRECISION,          -- jam density (veh/km)
    greenshields_q_cap  DOUBLE PRECISION,          -- capacity (veh/h)
    matched_pairs_count INTEGER,
    intervals_json      JSONB            NOT NULL DEFAULT '[]',
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fd_results_video_id ON fd_results (video_upload_id);
CREATE INDEX IF NOT EXISTS idx_fd_results_created_at ON fd_results (created_at DESC);
