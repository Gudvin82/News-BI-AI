-- YouPiter BI — API Keys for partner integrations
-- Rollback: DROP TABLE ingest_log, api_keys CASCADE;

CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,          -- first 8 chars of raw key, for display
  key_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 hex of full raw key
  permissions TEXT[] NOT NULL DEFAULT '{}',
  note        TEXT,                   -- optional description for partner
  created_at  TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash) WHERE NOT revoked;

-- Ingest log: one row per ingest call
CREATE TABLE IF NOT EXISTS ingest_log (
  id          BIGSERIAL PRIMARY KEY,
  api_key_id  UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  endpoint    TEXT NOT NULL,
  records_in  INT NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'error'
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingest_log_key_idx ON ingest_log(api_key_id, created_at DESC);
