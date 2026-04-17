import { NextResponse } from "next/server";
import { appendServerAudit } from "@/lib/server/audit-log";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canEditSection } from "@/lib/auth/section-access";
import { readBotToken, readHireBotConfig } from "@/lib/server/hire-bot-config";
import { applyConfigToRuntime, readHireBotSyncStatus, setSyncError } from "@/lib/server/hire-bot-sync";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

export async function POST() {
  try {
    const session = await getSessionContext();
    if (!canEditSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет прав на изменение раздела Маркетинг." }, { status: 403 });
    }
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Только владелец может применять конфиг в прод-бота." }, { status: 403 });
    }

    const cfg = readHireBotConfig();
    const token = readBotToken();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Не задан TELEGRAM_BOT_TOKEN. Сохраните токен в Настройках бота." }, { status: 400 });
    }
    if (!cfg.bitrix.webhookUrl.trim()) {
      return NextResponse.json({ ok: false, error: "Не задан Bitrix webhook URL." }, { status: 400 });
    }

    const actor = session.displayName || session.userId;
    const result = applyConfigToRuntime(cfg, token, actor);
    appendServerAudit({
      category: "integration",
      action: "marketing.hire-bot.apply",
      detail: `backup=${result.backupId}; service=${result.serviceStatus}; scenario=${result.scenarioSlug}`,
      actorId: session.userId,
      actorRole: session.role,
    });
    return NextResponse.json({ ok: true, data: { ...result, status: readHireBotSyncStatus() } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setSyncError(message);
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
