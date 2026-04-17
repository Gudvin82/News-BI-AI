import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/shifts
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       "date":        "2026-04-16",        // required: YYYY-MM-DD
 *       "driver_id":   "ext-123",           // required: external ID of driver
 *       "car_plate":   "А123БВ77",          // optional: license plate
 *       "park_code":   "ladoga",            // optional: park code
 *       "hours":       12,                  // optional: shift duration in hours
 *       "revenue":     15000,               // optional: revenue for this shift (RUB)
 *       "source":      "taxicrm"            // optional: data source label
 *     }
 *   ]
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:shifts");
  if (auth instanceof NextResponse) return auth;

  let body: { records?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Невалидный JSON." }, { status: 400 });
  }

  const records = Array.isArray(body?.records) ? body.records : [];
  if (!records.length) {
    return NextResponse.json({ ok: false, error: "records[] не может быть пустым." }, { status: 400 });
  }

  let inserted = 0;
  const errors: string[] = [];

  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    const date = String(r.date ?? "");
    const driverId = String(r.driver_id ?? "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !driverId) {
      errors.push(`Пропущена запись: требуются date (YYYY-MM-DD) и driver_id. Получено: ${JSON.stringify(r)}`);
      continue;
    }

    await query(
      `INSERT INTO shifts
         (date, external_driver_id, car_plate, park_code, hours, revenue, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (date, external_driver_id) DO UPDATE
         SET car_plate  = EXCLUDED.car_plate,
             park_code  = EXCLUDED.park_code,
             hours      = EXCLUDED.hours,
             revenue    = EXCLUDED.revenue,
             source     = EXCLUDED.source,
             updated_at = now()`,
      [
        date,
        driverId,
        r.car_plate ?? null,
        r.park_code ?? null,
        r.hours != null ? Number(r.hours) : null,
        r.revenue != null ? Number(r.revenue) : null,
        r.source ?? "api",
      ]
    ).catch((e: Error) => {
      errors.push(`date=${date} driver=${driverId}: ${e.message}`);
    });

    inserted++;
  }

  await logIngest(auth.key.id, "shifts", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({
    ok: true,
    data: { received: records.length, inserted, errors: errors.length ? errors : undefined },
  });
}
