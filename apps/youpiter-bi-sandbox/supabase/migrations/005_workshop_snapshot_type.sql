-- YouPiter BI — Add snapshot_type to workshop_daily_snapshots
-- Rollback: ALTER TABLE workshop_daily_snapshots DROP COLUMN snapshot_type;
--           ALTER TABLE workshop_daily_snapshots ADD CONSTRAINT workshop_daily_snapshots_date_unique UNIQUE (snapshot_date);

-- Drop old single-per-day unique constraint
ALTER TABLE workshop_daily_snapshots
  DROP CONSTRAINT IF EXISTS workshop_daily_snapshots_date_unique;

-- Add snapshot_type column: morning (00:30 MSK), evening (23:30 MSK), adhoc (manual/on-demand)
ALTER TABLE workshop_daily_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_type TEXT NOT NULL DEFAULT 'evening'
    CHECK (snapshot_type IN ('morning', 'evening', 'adhoc'));

-- New unique constraint: one row per (date, type)
ALTER TABLE workshop_daily_snapshots
  ADD CONSTRAINT workshop_daily_snapshots_date_type_unique
    UNIQUE (snapshot_date, snapshot_type);

-- Update index
DROP INDEX IF EXISTS idx_workshop_daily_snapshots_date;
CREATE INDEX IF NOT EXISTS idx_workshop_daily_snapshots_date_type
  ON workshop_daily_snapshots (snapshot_date DESC, snapshot_type);
