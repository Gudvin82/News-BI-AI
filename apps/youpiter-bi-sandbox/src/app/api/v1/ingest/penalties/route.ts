import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/penalties
 * Штрафы (taxicrm /penalty/list + /penalty/get)
 *
 * records[]: {
 *   external_id?      string   — ID штрафа в источнике
 *   car_id?           string   — ID авто в источнике
 *   car_plate?        string   — госномер авто
 *   penalty_date?     string   — дата/время штрафа (ISO 8601)
 *   penalty_source?   string   — источник (ГИБДД, внутренний и т.д.)
 *   uin?              string   — УИН постановления
 *   ruling?           string   — номер постановления
 *   amount            number   — сумма штрафа (руб.)
 *   amount_discount?  number   — сумма со скидкой (руб.)
 *   description?      string   — описание нарушения
 *   status?           string   — статус: actual_not_paid / paid / not_actual
 *   discount_till?    string   — дата окончания скидки YYYY-MM-DD
 *   source?           string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:penalties");
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

    const discountTill = r.discount_till && /^\d{4}-\d{2}-\d{2}$/.test(String(r.discount_till))
      ? String(r.discount_till) : null;

    await query(
      `INSERT INTO penalties
         (external_id, car_id, car_plate, penalty_date, penalty_source, uin, ruling, amount, amount_discount, description, status, discount_till, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (external_id, source) DO UPDATE
         SET status          = EXCLUDED.status,
             amount_discount = EXCLUDED.amount_discount,
             discount_till   = EXCLUDED.discount_till`,
      [externalId, r.car_id ?? null, r.car_plate ?? null,
       r.penalty_date ?? null, r.penalty_source ?? null,
       r.uin ?? null, r.ruling ?? null,
       r.amount != null ? Number(r.amount) : null,
       r.amount_discount != null ? Number(r.amount_discount) : null,
       r.description ?? null, r.status ?? null, discountTill, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`penalty=${externalId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "penalties", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
