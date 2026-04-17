import { query } from "@/lib/db/client";

let ensured = false;

export async function ensurePortalUsersAccessColumns() {
  if (ensured) return;
  await query(`
    ALTER TABLE portal_users
    ADD COLUMN IF NOT EXISTS visible_sections TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS editable_sections TEXT[] NOT NULL DEFAULT '{}'
  `);
  ensured = true;
}
