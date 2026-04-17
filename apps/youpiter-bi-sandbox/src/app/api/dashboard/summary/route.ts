import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/summary
 *
 * Aggregates key metrics for the owner dashboard.
 * Phase 1: structured mock data — replace with real DB/API queries in Session 5-6.
 *
 * Shape is intentionally stable — UI depends on this contract.
 */
export async function GET() {
  // Moscow time
  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const todayStr = nowMsk.toISOString().slice(0, 10);

  const data = {
    date: todayStr,
    // ── Finance ──────────────────────────────────────────────────────────────
    // Phase 1: no live revenue source (taxicrm.ru) connected yet
    revenue: {
      today:     0,
      yesterday: 0,
      week:      Array(Math.min(nowMsk.getDay() || 7, 7)).fill(0) as number[],
    },
    // Phase 1: no live cash source (1С) connected yet
    cash: { balance: 0 },

    // ── Fleet ────────────────────────────────────────────────────────────────
    // Phase 1: no live fleet source connected yet
    fleet: { active: 0, total: 0, repair: 0, idle: 0 },

    // ── Parks ────────────────────────────────────────────────────────────────
    parks: [],

    // ── Hire ─────────────────────────────────────────────────────────────────
    hire: { leads: 0, sobes: 0, dFirst: 0, convRelevToSobes: 0, convSobesToFirst: 0 },

    // ── Alerts ───────────────────────────────────────────────────────────────
    alerts: [],

    // ── Data freshness ───────────────────────────────────────────────────────
    meta: {
      source:     "mock",       // "live" when real data connected
      updatedAt:  nowMsk.toISOString(),
      nextUpdate: null,
    },
  };

  return NextResponse.json({ ok: true, data });
}
