import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/driver-balance
 * Балансы водителей (taxicrm /user/balance/get)
 *
 * records[]: {
 *   driver_id     string   — ID водителя (обязательно)
 *   balance_date  string   — дата YYYY-MM-DD (обязательно)
 *   aggregator?   string   — агрегатор (яндекс, убер и т.д.)
 *   cabinet_id?   string   — ID кабинета агрегатора
 *   balance       number   — баланс (руб.)
 *   source?       string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:driver-balance");
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
    const balanceDate = String(r.balance_date ?? "");

    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(balanceDate)) {
      errors.push(`Пропущена запись: требуются driver_id и balance_date (YYYY-MM-DD).`);
      continue;
    }

    await query(
      `INSERT INTO driver_balances
         (driver_id, balance_date, aggregator, cabinet_id, balance, source)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (driver_id, balance_date, aggregator, source) DO UPDATE
         SET balance    = EXCLUDED.balance,
             cabinet_id = EXCLUDED.cabinet_id`,
      [driverId, balanceDate, r.aggregator ?? null, r.cabinet_id ?? null,
       r.balance != null ? Number(r.balance) : null, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`driver=${driverId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "driver-balance", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
