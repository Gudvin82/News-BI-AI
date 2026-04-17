import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/transaction-types
 * Справочник типов транзакций (taxicrm /user/transaction/types/list)
 *
 * records[]: {
 *   external_id    string   — ID типа в источнике (обязательно)
 *   name           string   — название типа (обязательно)
 *   entity_type?   string   — к чему относится: user / car
 *   source?        string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:references");
  if (auth instanceof NextResponse) return auth;

  let body: { records?: unknown[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Невалидный JSON." }, { status: 400 });
  }

  const records = Array.isArray(body?.records) ? body.records : [];
  if (!records.length)
    return NextResponse.json({ ok: false, error: "records[] не может быть пустым." }, { status: 400 });

  let inserted = 0;
  const errors: string[] = [];

  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    const externalId = String(r.external_id ?? "");
    const name = String(r.name ?? "");

    if (!externalId || !name) {
      errors.push(`Пропущена запись: требуются external_id и name.`);
      continue;
    }

    await query(
      `INSERT INTO transaction_types (external_id, name, entity_type, source)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (external_id, source) DO UPDATE
         SET name        = EXCLUDED.name,
             entity_type = EXCLUDED.entity_type`,
      [externalId, name, r.entity_type ?? null, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`type=${externalId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "transaction-types", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
