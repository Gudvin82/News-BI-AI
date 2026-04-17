import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/trips
 * Поездки (taxicrm /trip/list)
 *
 * records[]: {
 *   external_id   string   — уникальный ID поездки в источнике
 *   driver_id     string   — ID водителя
 *   car_plate?    string   — госномер авто
 *   park_code?    string   — код парка
 *   trip_date     string   — дата YYYY-MM-DD
 *   aggregator?   string   — яндекс/убер/gett и т.д.
 *   cabinet_id?   string   — ID кабинета агрегатора
 *   trips_count?  number   — количество поездок в записи
 *   revenue?      number   — выручка (руб.)
 *   source?       string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:trips");
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
    const tripDate = String(r.trip_date ?? "");
    const externalId = String(r.external_id ?? "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tripDate)) {
      errors.push(`Пропущена запись: требуется trip_date (YYYY-MM-DD). Получено: ${JSON.stringify(r)}`);
      continue;
    }

    await query(
      `INSERT INTO trips
         (external_id, driver_id, car_plate, park_code, trip_date, aggregator, cabinet_id, trips_count, revenue, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (external_id, source) DO UPDATE
         SET driver_id   = EXCLUDED.driver_id,
             car_plate   = EXCLUDED.car_plate,
             park_code   = EXCLUDED.park_code,
             aggregator  = EXCLUDED.aggregator,
             trips_count = EXCLUDED.trips_count,
             revenue     = EXCLUDED.revenue`,
      [
        externalId || null,
        r.driver_id ?? null,
        r.car_plate ?? null,
        r.park_code ?? null,
        tripDate,
        r.aggregator ?? null,
        r.cabinet_id ?? null,
        r.trips_count != null ? Number(r.trips_count) : 1,
        r.revenue != null ? Number(r.revenue) : null,
        r.source ?? "taxicrm",
      ]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`trip_date=${tripDate}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "trips", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
