import { NextRequest, NextResponse } from "next/server";
import { DTP_ENTITY_TYPE, DTP_STAGE_MAP, DTP_STAGES } from "@/lib/config/dtp";
import { fetchAllDtpItems, filterDtpItemsByCreatedRange } from "@/lib/connectors/dtp";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { isBitrixSectionEnabled } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!getBitrixWebhook() || !isBitrixSectionEnabled("dtp")) {
    return NextResponse.json(
      { ok: false, error: "BITRIX_WEBHOOK не настроен. Укажите в Настройки → Интеграции." },
      { status: 503 }
    );
  }

  const sp  = new URL(req.url).searchParams;
  const from = sp.get("from") ?? undefined;
  const to   = sp.get("to")   ?? undefined;

  // Validate dates
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if ((from && !dateRe.test(from)) || (to && !dateRe.test(to))) {
    return NextResponse.json({ ok: false, error: "Неверный формат даты." }, { status: 400 });
  }

  try {
    const allItems = await fetchAllDtpItems();
    const items = filterDtpItemsByCreatedRange(allItems, from, to);

    // Stage counts
    const byStage: Record<string, number> = {};
    const byStageAmount: Record<string, number> = {};
    for (const s of DTP_STAGES) {
      byStage[s.id] = 0;
      byStageAmount[s.id] = 0;
    }
    for (const item of items) {
      byStage[item.stageId] = (byStage[item.stageId] ?? 0) + 1;
      byStageAmount[item.stageId] = (byStageAmount[item.stageId] ?? 0) + (Number(item.opportunity) || 0);
    }

    const open  = items.filter((i) => DTP_STAGE_MAP[i.stageId]?.group === "open").length;
    const won   = items.filter((i) => DTP_STAGE_MAP[i.stageId]?.group === "win").length;
    const lost  = items.filter((i) => DTP_STAGE_MAP[i.stageId]?.group === "fail").length;
    const totalDamage = items.reduce((s, i) => s + (Number(i.opportunity) || 0), 0);

    // Current month count (for "all time" view — show this month's intake)
    const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const monthPrefix = nowMsk.toISOString().slice(0, 7);
    const thisMonth = !from
      ? allItems.filter((i) => (i.createdTime ?? "").startsWith(monthPrefix)).length
      : items.length;

    // Recent 15
    const recent = items.slice(0, 15).map((i) => ({
      id:          i.id,
      title:       i.title,
      stageId:     i.stageId,
      stageName:   DTP_STAGE_MAP[i.stageId]?.name   ?? i.stageId,
      stageColor:  DTP_STAGE_MAP[i.stageId]?.color  ?? "#888",
      stageGroup:  DTP_STAGE_MAP[i.stageId]?.group  ?? "open",
      createdTime: i.createdTime,
      opportunity: Number(i.opportunity) || 0,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        total: items.length,
        open,
        won,
        lost,
        thisMonth,
        totalDamage,
        byStage,
        byStageAmount,
        recent,
        meta: {
          source:    "bitrix24",
          updatedAt: new Date().toISOString(),
          from:      from ?? null,
          to:        to   ?? null,
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
