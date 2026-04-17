import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/shift-details
 * Детали смены — наличные (taxicrm /shifts/stat/get)
 *
 * records[]: {
 *   external_shift_id  string   — ID смены в источнике (обязательно)
 *   driver_id?         string   — ID водителя
 *   shift_date?        string   — дата смены YYYY-MM-DD
 *   cash_handed?       number   — сдано наличных (руб.)
 *   cash_not_handed?   number   — не сдано наличных (руб.)
 *   source?            string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:shift-details");
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
    const shiftId = String(r.external_shift_id ?? "");

    if (!shiftId) {
      errors.push(`Пропущена запись: требуется external_shift_id.`);
      continue;
    }

    const shiftDate = r.shift_date && /^\d{4}-\d{2}-\d{2}$/.test(String(r.shift_date))
      ? String(r.shift_date) : null;

    await query(
      `INSERT INTO shift_details
         (external_shift_id, driver_id, shift_date, cash_handed, cash_not_handed, source)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (external_shift_id, source) DO UPDATE
         SET cash_handed     = EXCLUDED.cash_handed,
             cash_not_handed = EXCLUDED.cash_not_handed`,
      [shiftId, r.driver_id ?? null, shiftDate,
       r.cash_handed != null ? Number(r.cash_handed) : null,
       r.cash_not_handed != null ? Number(r.cash_not_handed) : null,
       r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`shift=${shiftId}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "shift-details", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
