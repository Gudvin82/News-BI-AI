import { NextRequest, NextResponse } from "next/server";
import { fetchLeadsByDateRange, fetchFirstShiftByDateRange, fetchOformlenieByDateRange, computeHireMetrics, fetchContactNames } from "@/lib/connectors/bitrix";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { isBitrixSectionEnabled } from "@/lib/server/integration-settings";
import { AVTOPARK_IDS, STATUS, STATUS_DOSTAVKA, STATUS_LABELS, STATUS_RASKAT, TEAM_NAMES } from "@/lib/config/hire";

export const dynamic = "force-dynamic";

/**
 * GET /api/hire/summary
 * Params:
 *   from=YYYY-MM-DD   (required, or legacy: date=YYYY-MM-DD)
 *   to=YYYY-MM-DD     (optional, defaults to from)
 *   manager=ID        (optional manager filter)
 *   sources=a,b,c     (optional comma-separated source labels)
 *   parks=a,b         (optional comma-separated park names)
 */
export async function GET(req: NextRequest) {
  if (!getBitrixWebhook() || !isBitrixSectionEnabled("hire")) {
    return NextResponse.json(
      { ok: false, error: "BITRIX_WEBHOOK не настроен. Укажите в Настройки → Интеграции." },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;

  // Support legacy ?date= param
  const legacyDate = sp.get("date");
  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const from = sp.get("from") ?? legacyDate ?? nowMsk;
  const to   = sp.get("to")   ?? legacyDate ?? from;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(from) || !dateRe.test(to)) {
    return NextResponse.json({ ok: false, error: "Неверный формат даты. Ожидается YYYY-MM-DD." }, { status: 400 });
  }

  const manager  = sp.get("manager") ?? "";
  const sources  = sp.get("sources")  ? sp.get("sources")!.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const parks    = sp.get("parks")    ? sp.get("parks")!.split(",").map((s) => s.trim()).filter(Boolean)   : [];

  try {
    // Sequential to respect Bitrix24 rate limit (2 req/s per webhook)
    const leads      = await fetchLeadsByDateRange(from, to);
    const firstShift = await fetchFirstShiftByDateRange(from, to);
    const oformlenie = await fetchOformlenieByDateRange(from, to);
    const metrics    = computeHireMetrics(leads, firstShift, oformlenie, from, to, {
      manager: manager || undefined,
      sources: sources.length ? sources : undefined,
      parks:   parks.length   ? parks   : undefined,
    });

    const sourceSet = sources.length ? new Set(sources) : null;
    const parkSet = parks.length ? new Set(parks) : null;
    const bitrixBase = (getBitrixWebhook() ?? "").match(/^(https?:\/\/[^/]+)/)?.[1] ?? "";
    const leadUrl = (id: string) => bitrixBase ? `${bitrixBase}/crm/lead/details/${id}/` : "";
    const dealUrl = (id: string) => bitrixBase ? `${bitrixBase}/crm/deal/details/${id}/` : "";

    // Leads scope: filter by AVTOPARK_IDS + dostavka/raskat exclusion
    const inScope = (item: { ASSIGNED_BY_ID: string; STATUS_ID?: string; _sourceLabel?: string; _park?: string }) => {
      if (!AVTOPARK_IDS.has(String(item.ASSIGNED_BY_ID))) return false;
      if (item.STATUS_ID && (STATUS_DOSTAVKA.has(item.STATUS_ID) || STATUS_RASKAT.has(item.STATUS_ID))) return false;
      if (manager && String(item.ASSIGNED_BY_ID) !== manager) return false;
      if (sourceSet && !sourceSet.has(item._sourceLabel ?? "Не указан")) return false;
      if (parkSet && !parkSet.has(item._park ?? "Не указан")) return false;
      return true;
    };
    // First shift scope: no AVTOPARK_IDS filter — match etalon (all park-funnel deals count)
    const inScopeFirst = (item: { ASSIGNED_BY_ID: string; _sourceLabel?: string; _park?: string }) => {
      if (manager && String(item.ASSIGNED_BY_ID) !== manager) return false;
      if (sourceSet && !sourceSet.has(item._sourceLabel ?? "Не указан")) return false;
      if (parkSet && !parkSet.has(item._park ?? "Не указан")) return false;
      return true;
    };

    // Collect contact IDs from deals (first shift + oformlenie) and batch-fetch names
    const dealContactIds = [
      ...firstShift.filter(inScopeFirst).map((l) => l._contactId),
      ...oformlenie.filter(inScope).map((l) => l._contactId),
    ].filter((id): id is string => !!id);
    const contactNames = await fetchContactNames(dealContactIds);

    const leadRows = leads
      .filter(inScope)
      .sort((a, b) => String(b.DATE_CREATE).localeCompare(String(a.DATE_CREATE)))
      .map((l) => ({
        id: l.ID,
        date: l.DATE_CREATE,
        title: l.TITLE || `Лид #${l.ID}`,
        managerId: String(l.ASSIGNED_BY_ID),
        managerName: TEAM_NAMES[String(l.ASSIGNED_BY_ID)] ?? String(l.ASSIGNED_BY_ID),
        statusId: l.STATUS_ID,
        source: l._sourceLabel ?? "Не указан",
        park: l._park ?? "Не указан",
        status: STATUS_LABELS[l.STATUS_ID] ?? l.STATUS_ID,
        url: leadUrl(l.ID),
      }));

    const firstShiftRows = firstShift
      .filter(inScopeFirst)
      .sort((a, b) => String(b.DATE_MODIFY).localeCompare(String(a.DATE_MODIFY)))
      .map((l) => ({
        id: l._dealId ? `D${l._dealId}` : l.ID,
        date: l.DATE_MODIFY,
        title: l.TITLE || (l._dealId ? `Сделка #${l._dealId}` : `Лид #${l.ID}`),
        contactName: l._contactId ? (contactNames[l._contactId] ?? undefined) : undefined,
        managerId: String(l.ASSIGNED_BY_ID),
        managerName: TEAM_NAMES[String(l.ASSIGNED_BY_ID)] ?? String(l.ASSIGNED_BY_ID),
        statusId: l._dealStageId ?? STATUS.CONVERTED,
        source: l._sourceLabel ?? "Не указан",
        park: l._park ?? "Не указан",
        status: l._dealStageId?.endsWith(":WON") ? "Сделка успешна" : (STATUS_LABELS[STATUS.CONVERTED] ?? "Первая смена"),
        url: l._dealId ? dealUrl(l._dealId) : leadUrl(l.ID),
      }));

    const STAGE_DOC = new Set(["NEW", "C2:NEW", "C4:NEW", "C6:NEW", "C8:NEW", "C10:NEW", "C12:NEW", "C18:NEW", "C22:FINAL_INVOICE", "C16:PREPARATION"]);
    const STAGE_WAIT = new Set(["1", "C2:3", "C4:1", "C6:1", "C8:1", "C10:1", "C12:1", "C18:PREPARATION"]);
    const STAGE_REG = new Set(["EXECUTING", "C2:1", "C4:3", "C6:3", "C8:3", "C10:3", "C12:3", "C18:1"]);

    const oformRows = oformlenie
      .filter(inScope)
      .sort((a, b) => String(b.DATE_MODIFY).localeCompare(String(a.DATE_MODIFY)))
      .map((l) => ({
        id: l._dealId ? `OD${l._dealId}` : l.ID,
        date: l.DATE_MODIFY,
        title: l.TITLE || (l._dealId ? `Сделка #${l._dealId}` : `Лид #${l.ID}`),
        contactName: l._contactId ? (contactNames[l._contactId] ?? undefined) : undefined,
        managerId: String(l.ASSIGNED_BY_ID),
        managerName: TEAM_NAMES[String(l.ASSIGNED_BY_ID)] ?? String(l.ASSIGNED_BY_ID),
        statusId: l._dealStageId ?? "OFORMLENIE",
        source: l._sourceLabel ?? "Не указан",
        park: l._park ?? "Не указан",
        status: STAGE_DOC.has(String(l._dealStageId ?? "")) ? "Оформление документов"
          : STAGE_WAIT.has(String(l._dealStageId ?? "")) ? "Ожидание"
          : STAGE_REG.has(String(l._dealStageId ?? "")) ? "Водитель оформлен"
          : (l._dealStageId || "Оформление"),
        url: l._dealId ? dealUrl(l._dealId) : leadUrl(l.ID),
      }));

    return NextResponse.json({
      ok: true,
      data: {
        ...metrics,
        drilldown: {
          leads: leadRows,
          firstShift: firstShiftRows,
          oformlenie: oformRows,
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
