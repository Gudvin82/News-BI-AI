import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/payout-settings
 * Настройки выплат водителей (taxicrm /user/payout/settings/get)
 *
 * records[]: {
 *   driver_id      string   — ID водителя (обязательно)
 *   method?        string   — способ выплаты (карта, СБП, наличные и т.д.)
 *   period?        string   — периодичность (день, неделя, месяц)
 *   period_value?  number   — значение периода (например: каждые 3 дня)
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
    const driverId = String(r.driver_id ?? "");

    if (!driverId) {
      errors.push(`Пропущена запись: требуется driver_id.`);
      continue;
    }

    await query(
      `INSERT INTO payout_settings (driver_id, method, period, period_value, source, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (driver_id, source) DO UPDATE
         SET method       = EXCLUDED.method,
             period       = EXCLUDED.period,
             period_value = EXCLUDED.period_value,
             updated_at   = now()`,
      [driverId, r.method ?? null, r.period ?? null,
       r.period_value != null ? Number(r.period_value) : null,
       r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`driver=${driverId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "payout-settings", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
