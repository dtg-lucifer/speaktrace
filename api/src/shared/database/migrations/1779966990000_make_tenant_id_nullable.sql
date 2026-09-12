-- Up Migration
ALTER TABLE projects ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE media_assets ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE processing_jobs ALTER COLUMN tenant_id DROP NOT NULL;

-- Down Migration
ALTER TABLE processing_jobs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE media_assets ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE projects ALTER COLUMN tenant_id SET NOT NULL;
