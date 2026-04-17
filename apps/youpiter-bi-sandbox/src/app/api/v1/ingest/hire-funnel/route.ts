import { NextResponse } from "next/server";
import { requireApiKey, logIngest } from "@/lib/server/ingest-auth";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ingest/hire-funnel
 * Воронка найма CRM (taxicrm /crm/funnels/list)
 *
 * records[]: {
 *   funnel_id     string   — ID воронки в источнике (обязательно)
 *   funnel_name?  string   — название воронки
 *   stage_name    string   — название этапа (обязательно)
 *   deals_count   number   — количество сделок на этапе
 *   stat_date     string   — дата статистики YYYY-MM-DD (обязательно)
 *   source?       string   — источник данных
 * }
 */
export async function POST(req: Request) {
  const auth = await requireApiKey(req, "ingest:hire-funnel");
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
    const funnelId = String(r.funnel_id ?? "");
    const stageName = String(r.stage_name ?? "");
    const statDate = String(r.stat_date ?? "");

    if (!funnelId || !stageName || !/^\d{4}-\d{2}-\d{2}$/.test(statDate)) {
      errors.push(`Пропущена запись: требуются funnel_id, stage_name, stat_date (YYYY-MM-DD).`);
      continue;
    }

    await query(
      `INSERT INTO hire_funnel_stats
         (funnel_id, funnel_name, stage_name, deals_count, stat_date, source)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (funnel_id, stage_name, stat_date, source) DO UPDATE
         SET deals_count = EXCLUDED.deals_count,
             funnel_name = EXCLUDED.funnel_name`,
      [funnelId, r.funnel_name ?? null, stageName,
       r.deals_count != null ? Number(r.deals_count) : 0,
       statDate, r.source ?? "taxicrm"]
    ).then(() => inserted++).catch((e: Error) => {
      errors.push(`funnel=${funnelId} stage=${stageName}: ${e.message}`);
    });
  }

  await logIngest(auth.key.id, "hire-funnel", records.length, errors.length ? "error" : "ok",
    errors.length ? errors.slice(0, 3).join("; ") : undefined);

  return NextResponse.json({ ok: true, data: { received: records.length, inserted, errors: errors.length ? errors : undefined } });
}
