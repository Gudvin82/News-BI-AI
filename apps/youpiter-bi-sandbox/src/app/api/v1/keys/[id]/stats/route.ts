import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { query } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// GET /api/v1/keys/[id]/stats — usage statistics for a single API key
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Нет доступа." }, { status: 403 });
    }

    const { id } = await params;

    // Overall totals
    const [totals] = await query<{
      total_calls: string;
      total_records: string;
      total_errors: string;
      calls_24h: string;
      calls_7d: string;
      first_call: string | null;
      last_call: string | null;
    }>(
      `SELECT
         COUNT(*)::text                                                            AS total_calls,
         COALESCE(SUM(records_in), 0)::text                                       AS total_records,
         COUNT(*) FILTER (WHERE status = 'error')::text                           AS total_errors,
         COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::text   AS calls_24h,
         COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::text     AS calls_7d,
         MIN(created_at)::text                                                     AS first_call,
         MAX(created_at)::text                                                     AS last_call
       FROM ingest_log
       WHERE api_key_id = $1`,
      [id]
    );

    // Per-endpoint breakdown
    const endpoints = await query<{
      endpoint: string;
      calls: string;
      records: string;
      errors: string;
      last_call: string | null;
    }>(
      `SELECT
         endpoint,
         COUNT(*)::text                                         AS calls,
         COALESCE(SUM(records_in), 0)::text                    AS records,
         COUNT(*) FILTER (WHERE status = 'error')::text        AS errors,
         MAX(created_at)::text                                  AS last_call
       FROM ingest_log
       WHERE api_key_id = $1
       GROUP BY endpoint
       ORDER BY COUNT(*) DESC`,
      [id]
    );

    // Recent 30 log entries
    const recent = await query<{
      endpoint: string;
      records_in: number;
      status: string;
      error_msg: string | null;
      created_at: string;
    }>(
      `SELECT endpoint, records_in, status, error_msg, created_at::text
       FROM ingest_log
       WHERE api_key_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [id]
    );

    // Calls per day for last 14 days (sparkline data)
    const dailyTrend = await query<{ day: string; calls: string }>(
      `SELECT
         date_trunc('day', created_at)::date::text AS day,
         COUNT(*)::text                             AS calls
       FROM ingest_log
       WHERE api_key_id = $1
         AND created_at > now() - interval '14 days'
       GROUP BY 1
       ORDER BY 1`,
      [id]
    );

    return NextResponse.json({
      ok: true,
      data: {
        totals: {
          total_calls:   Number(totals?.total_calls ?? 0),
          total_records: Number(totals?.total_records ?? 0),
          total_errors:  Number(totals?.total_errors ?? 0),
          calls_24h:     Number(totals?.calls_24h ?? 0),
          calls_7d:      Number(totals?.calls_7d ?? 0),
          first_call:    totals?.first_call ?? null,
          last_call:     totals?.last_call ?? null,
        },
        endpoints: endpoints.map((e) => ({
          endpoint:  e.endpoint,
          calls:     Number(e.calls),
          records:   Number(e.records),
          errors:    Number(e.errors),
          last_call: e.last_call,
        })),
        recent,
        dailyTrend: dailyTrend.map((d) => ({ day: d.day, calls: Number(d.calls) })),
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
