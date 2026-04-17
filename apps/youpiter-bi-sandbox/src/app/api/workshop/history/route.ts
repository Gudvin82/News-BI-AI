import { NextResponse } from "next/server";
import { query } from "@/lib/db/client";
import type { WorkshopSummaryData } from "@/app/api/workshop/summary/route";

export const dynamic = "force-dynamic";

export interface WorkshopHistoryPoint {
  date: string;          // YYYY-MM-DD
  grandTotal: number;
  groups: WorkshopSummaryData["groups"];
  extras: WorkshopSummaryData["extras"];
  capturedAt: string;
}

// GET /api/workshop/history?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns array of snapshots ordered by date ascending
export async function GET(req: Request) {
  try {
    const url  = new URL(req.url);
    const from = url.searchParams.get("from");
    const to   = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ ok: false, error: "Параметры from и to обязательны" }, { status: 400 });
    }

    const rows = await query<{
      snapshot_date: string;
      grand_total: number;
      groups: WorkshopSummaryData["groups"];
      extras: WorkshopSummaryData["extras"];
      captured_at: string;
    }>(
      `SELECT snapshot_date::text, grand_total, groups, extras, captured_at
       FROM workshop_daily_snapshots
       WHERE snapshot_date BETWEEN $1 AND $2
       ORDER BY snapshot_date ASC`,
      [from, to]
    );

    const data: WorkshopHistoryPoint[] = rows.map(r => ({
      date:       r.snapshot_date,
      grandTotal: r.grand_total,
      groups:     r.groups,
      extras:     r.extras,
      capturedAt: r.captured_at,
    }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка загрузки истории" },
      { status: 500 }
    );
  }
}
