import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/cars
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       "plate":       "А123БВ77",    // required: license plate (unique key)
 *       "model":       "Toyota Camry",// optional
 *       "year":        2022,          // optional
 *       "park_code":   "ladoga",      // optional
 *       "status":      "active",      // optional: active | repair | idle | sold
 *       "external_id": "tc-456"       // optional: your system's car ID
 *     }
 *   ]
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:cars");
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

  let upserted = 0;
  const errors: string[] = [];

  const validStatuses = new Set(["active", "repair", "idle", "sold"]);

  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    const plate = String(r.plate ?? "").trim().toUpperCase();

    if (!plate) {
      errors.push(`Пропущена запись: нужен plate. Получено: ${JSON.stringify(r)}`);
      continue;
    }

    const status = validStatuses.has(String(r.status)) ? String(r.status) : "active";

    await query(
      `INSERT INTO cars
         (plate, model, year, park_code, status, taxicrm_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now(),now())
       ON CONFLICT (plate) DO UPDATE
         SET model      = COALESCE(EXCLUDED.model, cars.model),
             year       = COALESCE(EXCLUDED.year, cars.year),
             park_code  = COALESCE(EXCLUDED.park_code, cars.park_code),
             status     = EXCLUDED.status,
             taxicrm_id = COALESCE(EXCLUDED.taxicrm_id, cars.taxicrm_id),
             updated_at = now()`,
      [plate, r.model ?? null, r.year ? Number(r.year) : null,
       r.park_code ?? null, status, r.external_id ?? null]
    ).catch((e: Error) => {
      errors.push(`plate=${plate}: ${e.message}`);
    });

    upserted++;
  }

  await logIngest(auth.key.id, "cars", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({
    ok: true,
    data: { received: records.length, upserted, errors: errors.length ? errors : undefined },
  });
}
