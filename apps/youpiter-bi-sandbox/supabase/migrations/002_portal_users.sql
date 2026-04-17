-- YouPiter BI — Portal Users (employee access control)
-- Rollback: DROP TABLE IF EXISTS portal_users;

CREATE TABLE IF NOT EXISTS portal_users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name           TEXT        NOT NULL,
  pin_hash       TEXT        NOT NULL,   -- pbkdf2: "salt:hash"
  role           TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  allowed_sections TEXT[]    NOT NULL DEFAULT '{}',
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_users_workspace_idx ON portal_users(workspace_id);
CREATE INDEX IF NOT EXISTS portal_users_active_idx    ON portal_users(workspace_id, is_active);
