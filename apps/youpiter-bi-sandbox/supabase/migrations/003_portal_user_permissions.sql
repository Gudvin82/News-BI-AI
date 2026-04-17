-- YouPiter BI — Portal user permissions split into view/edit
-- Rollback:
-- ALTER TABLE portal_users DROP COLUMN IF EXISTS editable_sections;
-- ALTER TABLE portal_users DROP COLUMN IF EXISTS visible_sections;

ALTER TABLE portal_users
ADD COLUMN IF NOT EXISTS visible_sections TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS editable_sections TEXT[] NOT NULL DEFAULT '{}';

UPDATE portal_users
SET
  visible_sections = CASE
    WHEN COALESCE(array_length(visible_sections, 1), 0) = 0 THEN allowed_sections
    ELSE visible_sections
  END,
  editable_sections = CASE
    WHEN COALESCE(array_length(editable_sections, 1), 0) = 0 THEN COALESCE(visible_sections, allowed_sections)
    ELSE editable_sections
  END;
