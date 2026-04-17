-- YouPiter BI — Workshop daily snapshots
-- Rollback: DROP TABLE workshop_daily_snapshots CASCADE;

CREATE TABLE IF NOT EXISTS workshop_daily_snapshots (
  id            SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  grand_total   INTEGER NOT NULL DEFAULT 0,
  groups        JSONB NOT NULL DEFAULT '[]',
  extras        JSONB NOT NULL DEFAULT '[]',
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workshop_daily_snapshots_date_unique UNIQUE (snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_workshop_daily_snapshots_date
  ON workshop_daily_snapshots (snapshot_date DESC);
