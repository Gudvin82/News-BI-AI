import { NextRequest, NextResponse } from "next/server";
import { DTP_STAGE_MAP } from "@/lib/config/dtp";
import { BitrixDtpItem, fetchAllDtpItems, filterDtpItemsByCreatedRange } from "@/lib/connectors/dtp";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { isBitrixSectionEnabled } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!getBitrixWebhook() || !isBitrixSectionEnabled("dtp")) {
    return NextResponse.json({ ok: false, error: "BITRIX_WEBHOOK не настроен." }, { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const pageParam   = Math.max(0, parseInt(sp.get("page") ?? "0", 10));
  const stageFilter = sp.get("stage") ?? "";
  const from        = sp.get("from")  ?? "";
  const to          = sp.get("to")    ?? "";
  const perPage     = 50;
  const start       = pageParam * perPage;

  try {
    const allItems = await fetchAllDtpItems();
    let filtered = filterDtpItemsByCreatedRange(allItems, from || undefined, to || undefined);
    if (stageFilter) {
      filtered = filtered.filter((item) => item.stageId === stageFilter);
    }
    const total = filtered.length;
    const raw = filtered.slice(start, start + perPage);

    const items = raw.map((i: BitrixDtpItem) => ({
      id:           i.id,
      title:        i.title,
      stageId:      i.stageId,
      stageName:    DTP_STAGE_MAP[i.stageId as string]?.name   ?? String(i.stageId),
      stageColor:   DTP_STAGE_MAP[i.stageId as string]?.color  ?? "#888",
      stageGroup:   DTP_STAGE_MAP[i.stageId as string]?.group  ?? "open",
      createdTime:  i.createdTime,
      movedTime:    i.movedTime,
      opportunity:  Number(i.opportunity) || 0,
      assignedById: i.assignedById,
    }));

    return NextResponse.json({ ok: true, data: { items, total, page: pageParam } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
