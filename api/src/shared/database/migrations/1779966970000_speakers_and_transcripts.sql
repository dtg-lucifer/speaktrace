-- Up Migration

-- Speakers identified per job (with audio snippet reference for user labeling)
CREATE TABLE IF NOT EXISTS job_speakers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    speaker_tag TEXT NOT NULL,          -- e.g. 'SPEAKER_00', 'SPEAKER_01'
    snippet_url TEXT NOT NULL,          -- 1s-5s audio clip URL for playback in dashboard
    duration_seconds NUMERIC(6, 2) DEFAULT 3.0,
    assigned_name TEXT,                 -- User-labeled name (e.g. 'Piush', 'Host')
    confidence NUMERIC(4, 3) DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_speakers_job_id ON job_speakers(job_id);

-- Transcripts produced from audio jobs (stored in DB and Cloudinary)
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    format TEXT NOT NULL DEFAULT 'vtt', -- 'vtt', 'txt', 'custom'
    storage_url TEXT,
    content_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcripts_job_id ON transcripts(job_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_project_id ON transcripts(project_id);

-- Down Migration
DROP TABLE IF EXISTS transcripts;
DROP TABLE IF EXISTS job_speakers;
