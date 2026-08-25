-- Up Migration

-- Tenants table (B2B multi-tenancy)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add tenant_id to users
ALTER TABLE users
    ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    ADD COLUMN display_name TEXT,
    ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

CREATE INDEX idx_users_tenant_id ON users(tenant_id);

-- Projects (group of jobs per tenant)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX idx_projects_owner_id ON projects(owner_id);

-- Media assets (uploaded files)
CREATE TABLE media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- File metadata
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    duration_seconds NUMERIC(10, 3),
    checksum TEXT,

    -- Storage references
    storage_provider TEXT NOT NULL DEFAULT 'cloudinary',
    storage_public_id TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    storage_resource_type TEXT NOT NULL DEFAULT 'video', -- 'video' or 'raw' for audio

    -- Processing state
    status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (status IN ('uploaded', 'validated', 'failed_validation')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_assets_tenant_id ON media_assets(tenant_id);
CREATE INDEX idx_media_assets_project_id ON media_assets(project_id);
CREATE INDEX idx_media_assets_uploaded_by ON media_assets(uploaded_by);
CREATE INDEX idx_media_assets_status ON media_assets(status);

-- Processing jobs (state machine per upload)
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- State machine
    status TEXT NOT NULL DEFAULT 'UPLOADED'
        CHECK (status IN (
            'UPLOADED',
            'MEDIA_VALIDATED',
            'AUDIO_EXTRACTED',
            'DIARIZATION_DONE',
            'AWAITING_SPEAKER_MAPPING',
            'TRANSCRIPTION_IN_PROGRESS',
            'ENRICHMENT_IN_PROGRESS',
            'POSTPROCESSING_IN_PROGRESS',
            'RAG_INDEXING_IN_PROGRESS',
            'COMPLETED',
            'FAILED'
        )),

    current_stage TEXT,
    progress_pct SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    error_message TEXT,
    error_stage TEXT,

    -- Job options (user-configured)
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- e.g. { "emotion_tagging": true, "punctuation": true, "language": "en" }

    -- Correlation for distributed tracing
    correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_jobs_tenant_id ON processing_jobs(tenant_id);
CREATE INDEX idx_processing_jobs_media_asset_id ON processing_jobs(media_asset_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_correlation_id ON processing_jobs(correlation_id);

-- Down Migration
DROP TABLE IF EXISTS processing_jobs;
DROP TABLE IF EXISTS media_assets;
DROP TABLE IF EXISTS projects;
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
ALTER TABLE users DROP COLUMN IF EXISTS role;
DROP TABLE IF EXISTS tenants;
