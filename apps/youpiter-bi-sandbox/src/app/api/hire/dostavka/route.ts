import { NextRequest, NextResponse } from "next/server";
import { fetchLeadsByDateRange, computeDostavkaMetrics } from "@/lib/connectors/bitrix";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { isBitrixSectionEnabled } from "@/lib/server/integration-settings";
import { STATUS_DOSTAVKA, TEAM_NAMES } from "@/lib/config/hire";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!getBitrixWebhook() || !isBitrixSectionEnabled("hire")) {
    return NextResponse.json(
      { ok: false, error: "BITRIX_WEBHOOK не настроен." },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;
  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? nowMsk;
  const to   = sp.get("to")   ?? from;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return NextResponse.json({ ok: false, error: "Неверный формат даты." }, { status: 400 });
  }

  try {
    const leads   = await fetchLeadsByDateRange(from, to);
    const metrics = computeDostavkaMetrics(leads);
    const bitrixBase = (getBitrixWebhook() ?? "").match(/^(https?:\/\/[^/]+)/)?.[1] ?? "";
    const leadUrl = (id: string) => bitrixBase ? `${bitrixBase}/crm/lead/details/${id}/` : "";
    const drilldown = leads
      .filter((l) => STATUS_DOSTAVKA.has(l.STATUS_ID))
      .sort((a, b) => String(b.DATE_CREATE).localeCompare(String(a.DATE_CREATE)))
      .map((l) => ({
        id: l.ID,
        date: l.DATE_CREATE,
        title: l.TITLE || `Лид #${l.ID}`,
        managerId: String(l.ASSIGNED_BY_ID),
        managerName: TEAM_NAMES[String(l.ASSIGNED_BY_ID)] ?? String(l.ASSIGNED_BY_ID),
        source: l._sourceLabel ?? "Не указан",
        park: l._park ?? "Не указан",
        statusId: l.STATUS_ID,
        status: "Доставка",
        url: leadUrl(l.ID),
      }));
    return NextResponse.json({ ok: true, data: { ...metrics, dateFrom: from, dateTo: to, drilldown } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
