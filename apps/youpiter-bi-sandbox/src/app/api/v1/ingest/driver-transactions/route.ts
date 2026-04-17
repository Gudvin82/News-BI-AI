import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/driver-transactions
 * Транзакции водителей (taxicrm /user/transaction/list)
 *
 * records[]: {
 *   external_id        string   — ID транзакции в источнике (обязательно)
 *   driver_id          string   — ID водителя (обязательно)
 *   transaction_date   string   — дата YYYY-MM-DD (обязательно)
 *   direction?         number   — 1=приход, 2=расход
 *   amount             number   — сумма (руб.)
 *   transaction_type?  string   — тип транзакции
 *   description?       string   — описание
 *   account?           string   — счёт
 *   cabinet_id?        string   — кабинет агрегатора
 *   source?            string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:driver-transactions");
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
    const txDate = String(r.transaction_date ?? "");

    if (!externalId || !driverId || !/^\d{4}-\d{2}-\d{2}$/.test(txDate)) {
      errors.push(`Пропущена запись: требуются external_id, driver_id, transaction_date (YYYY-MM-DD).`);
      continue;
    }

    await query(
      `INSERT INTO driver_transactions
         (external_id, driver_id, transaction_date, direction, amount, transaction_type, description, account, cabinet_id, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (external_id, source) DO NOTHING`,
      [externalId, driverId, txDate,
       r.direction != null ? Number(r.direction) : null,
       r.amount != null ? Number(r.amount) : null,
       r.transaction_type ?? null, r.description ?? null,
       r.account ?? null, r.cabinet_id ?? null, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`tx=${externalId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "driver-transactions", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
