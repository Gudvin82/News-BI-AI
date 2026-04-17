import { NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canViewSection } from "@/lib/auth/section-access";
import { readServerAudit } from "@/lib/server/audit-log";
import { readHireBotConfig } from "@/lib/server/hire-bot-config";
import { fetchBitrixLeadTimeline, readHireBotLeads, readHireBotLogTail } from "@/lib/server/hire-bot-runtime";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

export async function GET(req: Request) {
  try {
    const session = await getSessionContext();
    if (!canViewSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет доступа к разделу Маркетинг." }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";
    const status = searchParams.get("status") ?? "all";
    const q = searchParams.get("q") ?? "";
    const leadId = Number(searchParams.get("leadId") ?? "0");
    const limit = Number(searchParams.get("limit") ?? "200");

    const leads = readHireBotLeads({ dateFrom, dateTo, status, q, limit });
    const adminAudit = readServerAudit()
      .filter((x) => x.action.includes("hire-bot") || x.action.includes("marketing."))
      .slice(0, 120);
    const tail = readHireBotLogTail(120);

    let timeline: Awaited<ReturnType<typeof fetchBitrixLeadTimeline>> = [];
    if (Number.isFinite(leadId) && leadId > 0) {
      const cfg = readHireBotConfig();
      timeline = await fetchBitrixLeadTimeline(cfg.bitrix.webhookUrl, leadId, 50);
    }

    return NextResponse.json({
      ok: true,
      data: {
        leads,
        adminAudit,
        tail,
        timeline,
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
