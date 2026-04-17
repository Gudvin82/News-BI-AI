import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendServerAudit } from "@/lib/server/audit-log";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canEditSection } from "@/lib/auth/section-access";
import { readHireBotSyncStatus, rollbackRuntimeConfig, setSyncError } from "@/lib/server/hire-bot-sync";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

const schema = z.object({
  backupId: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (!canEditSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет прав на изменение раздела Маркетинг." }, { status: 403 });
    }
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Только владелец может делать откат прод-бота." }, { status: 403 });
    }
    const body = schema.parse(await req.json().catch(() => ({})));
    const status = readHireBotSyncStatus();
    const targetBackup = body.backupId || status.backupId || status.backups[0];
    if (!targetBackup) {
      return NextResponse.json({ ok: false, error: "Нет доступного бэкапа для отката." }, { status: 400 });
    }

    const actor = session.displayName || session.userId;
    const result = rollbackRuntimeConfig(targetBackup, actor);
    appendServerAudit({
      category: "integration",
      action: "marketing.hire-bot.rollback",
      detail: `backup=${result.rollbackId}; service=${result.serviceStatus}`,
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
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.errors[0]?.message ?? "Некорректный запрос." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
