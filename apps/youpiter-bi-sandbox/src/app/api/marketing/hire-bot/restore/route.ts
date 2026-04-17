import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canEditSection } from "@/lib/auth/section-access";
import { appendServerAudit } from "@/lib/server/audit-log";
import { readHireBotConfig, writeHireBotConfig } from "@/lib/server/hire-bot-config";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

const schema = z.object({
  historyId: z.string().min(1),
  target: z.enum(["draft", "published"]).default("draft"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (!canEditSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет прав на изменение раздела Маркетинг." }, { status: 403 });
    }

    const body = schema.parse(await req.json());
    const cfg = readHireBotConfig();
    const item = (cfg.scenario.history ?? []).find((x) => x.id === body.historyId);
    const snapshot = item?.snapshot;
    if (!item || !snapshot) {
      return NextResponse.json({ ok: false, error: "Версия не найдена или без снимка." }, { status: 404 });
    }

    if (body.target === "draft") {
      cfg.scenario.draft = [...snapshot.draft];
      cfg.scenario.status = "draft";
    } else {
      cfg.scenario.published = [...snapshot.published];
      cfg.scenario.status = "published";
    }
    cfg.scenario.updatedAt = new Date().toISOString();
    cfg.scenario.history = [
      {
        id: Math.random().toString(36).slice(2, 10),
        at: cfg.scenario.updatedAt,
        actor: session.displayName || session.userId,
        note: `Restore ${body.target} from ${item.at}`,
        snapshot: {
          status: cfg.scenario.status,
          draft: [...cfg.scenario.draft],
          published: [...cfg.scenario.published],
        },
      },
      ...cfg.scenario.history,
    ].slice(0, 100);

    writeHireBotConfig(cfg);
    appendServerAudit({
      category: "integration",
      action: "marketing.hire-bot.restore",
      detail: `target=${body.target}; history=${body.historyId}`,
      actorId: session.userId,
      actorRole: session.role,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.errors[0]?.message ?? "Некорректный запрос." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
