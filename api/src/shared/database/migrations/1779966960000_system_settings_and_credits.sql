-- Up Migration

-- System settings table (dynamic SaaS configuration & rates)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add credit balance and subscription plan columns to users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS credits NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Credit transactions (ledger for credit history and audit)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);

-- Down Migration
DROP TABLE IF EXISTS credit_transactions;
ALTER TABLE users DROP COLUMN IF EXISTS credits;
ALTER TABLE users DROP COLUMN IF EXISTS plan;
DROP TABLE IF EXISTS system_settings;
