import { NextRequest, NextResponse } from "next/server";
import { fetchYDReport, fetchYDCampaigns, computeMarketingMetrics } from "@/lib/connectors/yandex-direct";
import { isYandexSectionEnabled } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isYandexSectionEnabled("marketing")) {
    return NextResponse.json(
      { ok: false, error: "Интеграция Яндекс Директ отключена для раздела Маркетинг." },
      { status: 503 }
    );
  }
  const token       = req.headers.get("x-yandex-token") ?? "";
  const clientLogin = req.headers.get("x-yandex-login") ?? "";

  if (!token || !clientLogin) {
    return NextResponse.json(
      { ok: false, error: "Яндекс Директ не настроен. Укажите токен и логин в Настройки → Интеграции." },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;
  const nowMsk = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to   = sp.get("to")   ?? nowMsk;

  try {
    const [daily, campaigns] = await Promise.all([
      fetchYDReport(token, clientLogin, from, to),
      fetchYDCampaigns(token, clientLogin).catch(() => []),
    ]);
    const metrics = computeMarketingMetrics(daily, from, to);
    return NextResponse.json({ ok: true, data: { metrics, campaigns } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
