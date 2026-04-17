import { NextRequest, NextResponse } from "next/server";
import { fetchDailyStats } from "@/lib/connectors/taxicrm";
import { isTaxiSectionEnabled } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isTaxiSectionEnabled("operations")) {
    return NextResponse.json(
      { ok: false, error: "Интеграция taxicrm.ru отключена для раздела Операции." },
      { status: 503 }
    );
  }
  const token = req.headers.get("x-taxi-token") ?? "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "taxicrm.ru не настроен." },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;
  const nowMsk = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to   = sp.get("to")   ?? nowMsk;

  try {
    const daily = await fetchDailyStats(token, from, to);
    // Group by park
    const byPark: Record<string, number> = {};
    for (const d of daily) {
      const park = d.park_name ?? d.park_id ?? "Не указан";
      byPark[park] = (byPark[park] ?? 0) + (d.revenue ?? 0);
    }
    return NextResponse.json({ ok: true, data: { daily, byPark } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
