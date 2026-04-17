import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/drivers
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       "external_id":  "ext-123",       // required: your internal driver ID
 *       "name":         "Иванов Иван И", // required: full name
 *       "phone":        "+79001234567",  // optional
 *       "park_code":    "ladoga",        // optional
 *       "status":       "active",        // optional: active | blocked | dismissed
 *       "license":      "77АА123456",    // optional: driver's license number
 *       "hired_at":     "2025-01-15"     // optional: YYYY-MM-DD
 *     }
 *   ]
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:drivers");
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

  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    const externalId = String(r.external_id ?? "").trim();
    const name = String(r.name ?? "").trim();

    if (!externalId || !name) {
      errors.push(`Пропущена запись: нужны external_id и name. Получено: ${JSON.stringify(r)}`);
      continue;
    }

    await query(
      `INSERT INTO drivers
         (taxicrm_id, full_name, phone, park_code, status, license_number, hired_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())
       ON CONFLICT (taxicrm_id) DO UPDATE
         SET full_name      = EXCLUDED.full_name,
             phone          = COALESCE(EXCLUDED.phone, drivers.phone),
             park_code      = COALESCE(EXCLUDED.park_code, drivers.park_code),
             status         = COALESCE(EXCLUDED.status, drivers.status),
             license_number = COALESCE(EXCLUDED.license_number, drivers.license_number),
             hired_at       = COALESCE(EXCLUDED.hired_at, drivers.hired_at),
             updated_at     = now()`,
      [
        externalId,
        name,
        r.phone ?? null,
        r.park_code ?? null,
        r.status ?? "active",
        r.license ?? null,
        r.hired_at ?? null,
      ]
    ).catch((e: Error) => {
      errors.push(`external_id=${externalId}: ${e.message}`);
    });

    upserted++;
  }

  await logIngest(auth.key.id, "drivers", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({
    ok: true,
    data: { received: records.length, upserted, errors: errors.length ? errors : undefined },
  });
}
