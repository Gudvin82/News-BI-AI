import { NextRequest, NextResponse } from "next/server";
import { fetchDailyStats, computeOpsMetrics } from "@/lib/connectors/taxicrm";
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
      { ok: false, error: "taxicrm.ru не настроен. Укажите токен в Настройки → Интеграции." },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;
  const nowMsk = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? nowMsk;
  const to   = sp.get("to")   ?? from;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ ok: false, error: "Неверный формат даты." }, { status: 400 });
  }

  try {
    const daily   = await fetchDailyStats(token, from, to);
    const metrics = computeOpsMetrics(daily, from, to);
    return NextResponse.json({ ok: true, data: metrics });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
