import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/events
 * Generic event endpoint — for any data that doesn't fit other endpoints.
 *
 * Body:
 * {
 *   "records": [
 *     {
 *       "type":       "workshop",      // required: event category
 *       "date":       "2026-04-16",    // required: YYYY-MM-DD
 *       "entity_id":  "car-777",       // optional: related entity ID
 *       "title":      "ТО пройдено",   // optional: short description
 *       "amount":     5000,            // optional: monetary value (RUB)
 *       "meta":       { "km": 95000 } // optional: any extra JSON data
 *     }
 *   ]
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:events");
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
    const type = String(r.type ?? "").trim();
    const date = String(r.date ?? "");

    if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Пропущена запись: нужны type и date (YYYY-MM-DD). Получено: ${JSON.stringify(r)}`);
      continue;
    }

    await query(
      `INSERT INTO workshop_events
         (event_type, event_date, entity_id, title, amount, meta, source, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
      [
        type,
        date,
        r.entity_id ?? null,
        r.title ?? null,
        r.amount != null ? Number(r.amount) : null,
        r.meta ? JSON.stringify(r.meta) : null,
        "api",
      ]
    ).catch((e: Error) => {
      errors.push(`type=${type} date=${date}: ${e.message}`);
    });

    inserted++;
  }

  await logIngest(auth.key.id, "events", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({
    ok: true,
    data: { received: records.length, inserted, errors: errors.length ? errors : undefined },
  });
}
