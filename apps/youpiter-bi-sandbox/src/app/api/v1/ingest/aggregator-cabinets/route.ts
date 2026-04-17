import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/aggregator-cabinets
 * Кабинеты агрегаторов (taxicrm /cabinets/list)
 *
 * records[]: {
 *   external_id   string   — ID кабинета в источнике (обязательно)
 *   aggregator    string   — агрегатор: yandex, uber, gett и т.д. (обязательно)
 *   name?         string   — название кабинета
 *   status?       number   — 0=неактивен, 1=активен, 5=обновляется, 6=заблокирован
 *   last_success? string   — дата последней успешной синхр. (ISO 8601)
 *   source?       string   — источник данных
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
    const aggregator = String(r.aggregator ?? "");

    if (!externalId || !aggregator) {
      errors.push(`Пропущена запись: требуются external_id и aggregator.`);
      continue;
    }

    await query(
      `INSERT INTO aggregator_cabinets
         (external_id, aggregator, name, status, last_success, source, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (external_id, source) DO UPDATE
         SET aggregator   = EXCLUDED.aggregator,
             name         = EXCLUDED.name,
             status       = EXCLUDED.status,
             last_success = EXCLUDED.last_success,
             updated_at   = now()`,
      [externalId, aggregator, r.name ?? null,
       r.status != null ? Number(r.status) : null,
       r.last_success ?? null, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`cabinet=${externalId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "aggregator-cabinets", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
