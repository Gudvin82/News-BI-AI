import { NextRequest, NextResponse } from "next/server";
import { appendServerAudit } from "@/lib/server/audit-log";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canEditSection, canViewSection } from "@/lib/auth/section-access";
import {
  getBotRuntimeInfo,
  maskToken,
  readBotToken,
  readHireBotConfig,
  writeBotToken,
  writeHireBotConfig,
  type HireBotAdminConfig,
  type HireBotScenarioHistoryItem,
} from "@/lib/server/hire-bot-config";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

function cleanText(value: string, maxLen: number) {
  return value
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanMultiline(value: string, maxLen: number) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .slice(0, maxLen)
    .trim();
}

function normalizeWebhook(url: string) {
  return cleanText(url, 500).replace(/\/+$/, "");
}

function ensureSafeText(label: string, value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("<script") || lower.includes("javascript:")) {
    throw new Error(`Поле "${label}" содержит небезопасный HTML/JS.`);
  }
}

function sanitizeConfig(next: HireBotAdminConfig): HireBotAdminConfig {
  const scenarioDraft = (next.scenario.draft ?? []).slice(0, 200).map((step, idx) => {
    const title = cleanText(step.title ?? "", 120);
    const text = cleanMultiline(step.text ?? "", 3000);
    ensureSafeText("Шаг сценария", `${title}\n${text}`);
    return {
      ...step,
      id: cleanText(step.id || `step-${idx + 1}`, 64) || `step-${idx + 1}`,
      order: Number.isFinite(step.order) ? step.order : idx + 1,
      title,
      text,
      condition: cleanText(step.condition ?? "", 160),
      nextStepId: cleanText(step.nextStepId ?? "", 64) || undefined,
      options: (step.options ?? []).slice(0, 25).map((opt) => cleanText(opt ?? "", 120)).filter(Boolean),
    };
  });

  const scenarioPublished = (next.scenario.published ?? []).slice(0, 200).map((step, idx) => ({
    ...step,
    id: cleanText(step.id || `step-${idx + 1}`, 64) || `step-${idx + 1}`,
    order: Number.isFinite(step.order) ? step.order : idx + 1,
    title: cleanText(step.title ?? "", 120),
    text: cleanMultiline(step.text ?? "", 3000),
    condition: cleanText(step.condition ?? "", 160),
    nextStepId: cleanText(step.nextStepId ?? "", 64) || undefined,
    options: (step.options ?? []).slice(0, 25).map((opt) => cleanText(opt ?? "", 120)).filter(Boolean),
  }));

  const parks = (next.parks.items ?? []).slice(0, 200).map((p, idx) => ({
    ...p,
    id: cleanText(p.id || `park-${idx + 1}`, 64) || `park-${idx + 1}`,
    metro: cleanText(p.metro ?? "", 100),
    fullAddress: cleanText(p.fullAddress ?? "", 240),
    shortLabel: cleanText(p.shortLabel ?? "", 100),
    bitrixStringValue: cleanText(p.bitrixStringValue ?? "", 240),
    bitrixEnumId: cleanText(p.bitrixEnumId ?? "", 32) || undefined,
  }));

  const quickButtons = (next.bot.quickButtons ?? []).slice(0, 20).map((btn, idx) => {
    const label = cleanText(btn.label ?? "", 64);
    ensureSafeText("Быстрая кнопка", label);
    return {
      ...btn,
      id: cleanText(btn.id || `btn-${idx + 1}`, 64) || `btn-${idx + 1}`,
      label,
      action: cleanText(btn.action ?? "", 64) || "action",
      order: Number.isFinite(btn.order) ? btn.order : idx + 1,
    };
  });

  const greeting = cleanMultiline(next.bot.greeting ?? "", 4000);
  ensureSafeText("Приветствие", greeting);
  ensureSafeText("Полное описание", next.bot.fullDescription ?? "");
  ensureSafeText("Short description", next.bot.shortDescription ?? "");

  const webhookUrl = normalizeWebhook(next.bitrix.webhookUrl ?? "");
  if (!webhookUrl) throw new Error("Bitrix webhook URL обязателен.");
  if (!/^https:\/\/[^/]+\/rest\/\d+\/[^/]+$/i.test(webhookUrl)) {
    throw new Error("Bitrix webhook URL должен быть в формате https://<portal>.bitrix24.ru/rest/<user>/<code>.");
  }

  const assignedById = cleanText(next.bitrix.assignedById ?? "1", 12);
  if (!/^\d+$/.test(assignedById)) {
    throw new Error("Assigned by ID должен быть числом.");
  }

  return {
    ...next,
    bot: {
      ...next.bot,
      username: cleanText(next.bot.username ?? "", 80),
      slug: cleanText(next.bot.slug ?? "", 80).toLowerCase(),
      fullDescription: cleanMultiline(next.bot.fullDescription ?? "", 3000),
      shortDescription: cleanText(next.bot.shortDescription ?? "", 255),
      greeting,
      quickButtons,
    },
    scenario: {
      ...next.scenario,
      status: next.scenario.status === "published" ? "published" : "draft",
      draft: scenarioDraft,
      published: scenarioPublished,
    },
    parks: {
      ...next.parks,
      bitrixStringField: cleanText(next.parks.bitrixStringField ?? "", 100),
      bitrixEnumField: cleanText(next.parks.bitrixEnumField ?? "", 100),
      items: parks,
    },
    bitrix: {
      ...next.bitrix,
      mode: "webhook",
      webhookUrl,
      assignedById,
      leadStatusId: cleanText(next.bitrix.leadStatusId ?? "NEW", 64) || "NEW",
      duplicateMode: next.bitrix.duplicateMode === "update_duplicates" ? "update_duplicates" : "always_new",
    },
  };
}

export async function GET() {
  try {
    const session = await getSessionContext();
    if (!canViewSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет доступа к разделу Маркетинг." }, { status: 403 });
    }
    const cfg = readHireBotConfig();
    const token = readBotToken();
    return NextResponse.json({
      ok: true,
      data: {
        config: cfg,
        secrets: {
          tokenMasked: maskToken(token),
          tokenExists: Boolean(token),
        },
        runtime: getBotRuntimeInfo(),
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (!canEditSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет прав на изменение раздела Маркетинг." }, { status: 403 });
    }
    const body = await req.json() as {
      config: HireBotAdminConfig;
      token?: string;
      publish?: boolean;
      actor?: string;
    };
    const next = sanitizeConfig(body.config);
    if (!next?.bot || !next?.scenario || !next?.parks || !next?.bitrix) {
      return NextResponse.json({ ok: false, error: "Неполные данные конфигурации." }, { status: 400 });
    }

    const now = new Date().toISOString();
    next.scenario.updatedAt = now;
    const actor = body.actor || session.displayName || session.userId;

    if (body.publish) {
      next.scenario.published = [...next.scenario.draft];
      next.scenario.status = "published";
    }
    const historyItem: HireBotScenarioHistoryItem = {
      id: Math.random().toString(36).slice(2, 10),
      at: now,
      actor,
      note: body.publish ? "Published from admin" : "Saved draft from admin",
      snapshot: {
        status: next.scenario.status,
        draft: [...next.scenario.draft],
        published: [...next.scenario.published],
      },
    };
    next.scenario.history = [historyItem, ...(next.scenario.history ?? [])].slice(0, 100);

    writeHireBotConfig(next);
    if (body.token && !body.token.includes("•")) {
      const cleanToken = body.token.trim();
      if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(cleanToken)) {
        return NextResponse.json({ ok: false, error: "Некорректный формат Telegram Bot Token." }, { status: 400 });
      }
      writeBotToken(cleanToken);
    }

    appendServerAudit({
      category: "integration",
      action: "marketing.hire-bot.config.saved",
      detail: `status=${next.scenario.status}; steps=${next.scenario.draft.length}; parks=${next.parks.items.length}`,
      actorId: session.userId,
      actorRole: session.role,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
