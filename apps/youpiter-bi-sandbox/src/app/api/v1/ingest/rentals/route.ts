import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/rentals
 * Договоры аренды авто (taxicrm /cars/rents/list)
 *
 * records[]: {
 *   external_id    string   — ID договора в источнике (обязательно)
 *   car_id?        string   — ID авто
 *   driver_id?     string   — ID водителя
 *   date_start?    string   — дата начала YYYY-MM-DD
 *   date_end?      string   — дата окончания YYYY-MM-DD
 *   expected_end?  string   — плановая дата окончания YYYY-MM-DD
 *   amount?        number   — сумма аренды (руб.)
 *   period?        string   — период: час / день / неделя
 *   rent_type?     string   — тип: usual / agency
 *   payment_type?  string   — тип оплаты: pre / post
 *   deposit?       number   — залог (руб.)
 *   status?        number   — 0=закрыт, 1=активен, 2=на паузе
 *   source?        string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:rentals");
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

    if (!externalId) {
      errors.push(`Пропущена запись: требуется external_id.`);
      continue;
    }

    const toDate = (v: unknown) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);

    await query(
      `INSERT INTO car_rentals
         (external_id, car_id, driver_id, date_start, date_end, expected_end, amount, period, rent_type, payment_type, deposit, status, source, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
       ON CONFLICT (external_id, source) DO UPDATE
         SET status       = EXCLUDED.status,
             date_end     = EXCLUDED.date_end,
             expected_end = EXCLUDED.expected_end,
             updated_at   = now()`,
      [externalId, r.car_id ?? null, r.driver_id ?? null,
       toDate(r.date_start), toDate(r.date_end), toDate(r.expected_end),
       r.amount != null ? Number(r.amount) : null,
       r.period ?? null, r.rent_type ?? null, r.payment_type ?? null,
       r.deposit != null ? Number(r.deposit) : null,
       r.status != null ? Number(r.status) : null,
       r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`rental=${externalId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "rentals", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
