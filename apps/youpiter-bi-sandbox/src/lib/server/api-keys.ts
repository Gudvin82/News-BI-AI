import { createHash, randomBytes } from "node:crypto";
import { query } from "@/lib/db/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  note: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export const ALL_PERMISSIONS = [
  // Базовые
  "ingest:shifts",
  "ingest:revenue",
  "ingest:cars",
  "ingest:drivers",
  "ingest:events",
  // Расширенные — TaxiCRM
  "ingest:trips",
  "ingest:driver-balance",
  "ingest:driver-transactions",
  "ingest:car-transactions",
  "ingest:payouts",
  "ingest:penalties",
  "ingest:rentals",
  "ingest:shift-details",
  "ingest:hire-funnel",
  "ingest:references",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// ── Crypto helpers ────────────────────────────────────────────────────────────

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function generateRawKey(): string {
  // Format: yk_live_<32 hex chars>
  return `yk_live_${randomBytes(16).toString("hex")}`;
}

// ── DB operations ─────────────────────────────────────────────────────────────

/** Returns the raw key (shown ONCE to user) + stored record */
export async function createApiKey(
  name: string,
  permissions: string[],
  note?: string
): Promise<{ rawKey: string; record: ApiKey }> {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // "yk_live_xxxx"

  const rows = await query<ApiKey>(
    `INSERT INTO api_keys (name, key_prefix, key_hash, permissions, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, key_prefix, permissions, note,
               created_at::text, last_used_at::text, revoked`,
    [name, keyPrefix, keyHash, permissions, note ?? null]
  );

  return { rawKey, record: rows[0] };
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return query<ApiKey>(
    `SELECT id, name, key_prefix, permissions, note,
            created_at::text, last_used_at::text, revoked
     FROM api_keys
     ORDER BY created_at DESC`
  );
}

export async function revokeApiKey(id: string): Promise<void> {
  await query(`UPDATE api_keys SET revoked = true WHERE id = $1`, [id]);
}

export async function deleteApiKey(id: string): Promise<void> {
  await query(`DELETE FROM api_keys WHERE id = $1`, [id]);
}

/** Verify a raw key from request header. Returns the key record or null. */
export async function verifyApiKey(rawKey: string): Promise<ApiKey | null> {
  if (!rawKey?.startsWith("yk_live_")) return null;
  const keyHash = hashKey(rawKey);
  const rows = await query<ApiKey>(
    `UPDATE api_keys
     SET last_used_at = now()
     WHERE key_hash = $1 AND NOT revoked
     RETURNING id, name, key_prefix, permissions, note,
               created_at::text, last_used_at::text, revoked`,
    [keyHash]
  );
  return rows[0] ?? null;
}

/** Log an ingest call */
export async function logIngest(
  apiKeyId: string,
  endpoint: string,
  recordsIn: number,
  status: "ok" | "error",
  errorMsg?: string
): Promise<void> {
  await query(
    `INSERT INTO ingest_log (api_key_id, endpoint, records_in, status, error_msg)
     VALUES ($1, $2, $3, $4, $5)`,
    [apiKeyId, endpoint, recordsIn, status, errorMsg ?? null]
  );
}
