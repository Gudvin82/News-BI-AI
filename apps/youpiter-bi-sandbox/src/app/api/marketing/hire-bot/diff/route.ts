import { NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canViewSection } from "@/lib/auth/section-access";
import { readHireBotConfig, type HireBotScenarioStep } from "@/lib/server/hire-bot-config";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

type StepDiff = {
  index: number;
  title: string;
  fields: string[];
};

type DiffSummary = {
  oldCount: number;
  newCount: number;
  added: number;
  removed: number;
  changed: number;
  changedSteps: StepDiff[];
};

function normalizeStep(s: HireBotScenarioStep | undefined) {
  if (!s) return null;
  return {
    title: (s.title || "").trim(),
    type: s.type,
    text: (s.text || "").trim(),
    condition: (s.condition || "").trim(),
    next: (s.nextStepId || "").trim(),
    options: (s.options || []).map((x) => x.trim()).filter(Boolean),
  };
}

function diffSteps(oldSteps: HireBotScenarioStep[], newSteps: HireBotScenarioStep[]): DiffSummary {
  const oldSorted = [...oldSteps].sort((a, b) => a.order - b.order);
  const newSorted = [...newSteps].sort((a, b) => a.order - b.order);
  const maxLen = Math.max(oldSorted.length, newSorted.length);
  const changedSteps: StepDiff[] = [];
  let changed = 0;

  for (let i = 0; i < maxLen; i += 1) {
    const a = normalizeStep(oldSorted[i]);
    const b = normalizeStep(newSorted[i]);
    if (!a || !b) continue;
    const fields: string[] = [];
    if (a.title !== b.title) fields.push("title");
    if (a.type !== b.type) fields.push("type");
    if (a.text !== b.text) fields.push("text");
    if (a.condition !== b.condition) fields.push("condition");
    if (a.next !== b.next) fields.push("nextStep");
    if (a.options.join("|") !== b.options.join("|")) fields.push("options");
    if (fields.length > 0) {
      changed += 1;
      changedSteps.push({
        index: i + 1,
        title: b.title || a.title || `Шаг ${i + 1}`,
        fields,
      });
    }
  }

  return {
    oldCount: oldSorted.length,
    newCount: newSorted.length,
    added: Math.max(0, newSorted.length - oldSorted.length),
    removed: Math.max(0, oldSorted.length - newSorted.length),
    changed,
    changedSteps: changedSteps.slice(0, 20),
  };
}

export async function GET(req: Request) {
  try {
    const session = await getSessionContext();
    if (!canViewSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет доступа к разделу Маркетинг." }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const historyId = (searchParams.get("historyId") || "").trim();
    if (!historyId) {
      return NextResponse.json({ ok: false, error: "historyId обязателен." }, { status: 400 });
    }
    const cfg = readHireBotConfig();
    const item = (cfg.scenario.history || []).find((x) => x.id === historyId);
    if (!item?.snapshot) {
      return NextResponse.json({ ok: false, error: "Версия не найдена." }, { status: 404 });
    }

    const draftDiff = diffSteps(item.snapshot.draft || [], cfg.scenario.draft || []);
    const publishedDiff = diffSteps(item.snapshot.published || [], cfg.scenario.published || []);
    return NextResponse.json({
      ok: true,
      data: {
        historyId,
        historyAt: item.at,
        note: item.note,
        draftDiff,
        publishedDiff,
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
