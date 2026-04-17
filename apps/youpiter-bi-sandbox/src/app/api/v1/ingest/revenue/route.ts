import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/revenue
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       "date":       "2026-04-16",   // required: YYYY-MM-DD
 *       "park_code":  "ladoga",       // required: park code
 *       "amount":     580000,         // required: total revenue for that park+date (RUB)
 *       "rides":      312,            // optional: number of rides
 *       "source":     "taxicrm"       // optional
 *     }
 *   ]
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:revenue");
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
    const parkCode = String(r.park_code ?? "");
    const amount = Number(r.amount ?? NaN);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parkCode || !Number.isFinite(amount)) {
      errors.push(`Пропущена запись: нужны date, park_code, amount. Получено: ${JSON.stringify(r)}`);
      continue;
    }

    await query(
      `INSERT INTO daily_park_stats
         (date, park_code, revenue, rides, source, created_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (date, park_code) DO UPDATE
         SET revenue    = EXCLUDED.revenue,
             rides      = COALESCE(EXCLUDED.rides, daily_park_stats.rides),
             source     = EXCLUDED.source,
             updated_at = now()`,
      [date, parkCode, amount, r.rides != null ? Number(r.rides) : null, r.source ?? "api"]
    ).catch((e: Error) => {
      errors.push(`date=${date} park=${parkCode}: ${e.message}`);
    });

    inserted++;
  }

  await logIngest(auth.key.id, "revenue", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({
    ok: true,
    data: { received: records.length, inserted, errors: errors.length ? errors : undefined },
  });
}
