import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/payouts
 * Выплаты водителям (taxicrm /user/payout/list)
 *
 * records[]: {
 *   external_id   string   — ID выплаты в источнике (обязательно)
 *   driver_id     string   — ID водителя (обязательно)
 *   payout_date   string   — дата YYYY-MM-DD (обязательно)
 *   amount        number   — сумма выплаты (руб.)
 *   method?       string   — способ выплаты (карта, наличные, СБП и т.д.)
 *   status?       string   — статус выплаты
 *   source?       string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:payouts");
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
    const driverId = String(r.driver_id ?? "");
    const payoutDate = String(r.payout_date ?? "");

    if (!externalId || !driverId || !/^\d{4}-\d{2}-\d{2}$/.test(payoutDate)) {
      errors.push(`Пропущена запись: требуются external_id, driver_id, payout_date (YYYY-MM-DD).`);
      continue;
    }

    await query(
      `INSERT INTO driver_payouts
         (external_id, driver_id, payout_date, amount, method, status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (external_id, source) DO UPDATE
         SET status = EXCLUDED.status`,
      [externalId, driverId, payoutDate,
       r.amount != null ? Number(r.amount) : null,
       r.method ?? null, r.status ?? null, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`payout=${externalId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "payouts", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
