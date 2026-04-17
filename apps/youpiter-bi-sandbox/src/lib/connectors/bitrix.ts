/**
 * Bitrix24 REST API connector.
 * TypeScript port of bitrix-jupiter/report_cron.py logic.
 * Rate limit: Bitrix24 allows ~2 req/s per webhook — 600ms between pages.
 */

import {
  AVTOPARK_IDS, TEAM_NAMES,
  DEAL_CAT_TO_PARK, STATUS, parseSource, detectParkFromText,
  RASKAT_IDS, STATUS_RASKAT, RASKAT_RELEVANT, RASKAT_IRRELEVANT,
  RASKAT_STATUS_NAMES, STATUS_DOSTAVKA,
} from "@/lib/config/hire";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";

export interface BitrixLead {
  ID: string;
  STATUS_ID: string;
  ASSIGNED_BY_ID: string;
  SOURCE_ID: string;
  UTM_SOURCE?: string;
  DATE_CREATE: string;
  DATE_MODIFY: string;
  TITLE?: string;
  COMMENTS?: string;
  // Enriched fields
  _dealPark?: string | null;
  _sourceLabel?: string;
  _park?: string;
  _dealId?: string;
  _dealStageId?: string;
  _contactId?: string;
}

interface BitrixDeal {
  ID: string;
  LEAD_ID?: string;
  ASSIGNED_BY_ID?: string;
  SOURCE_ID?: string;
  UTM_SOURCE?: string;
  DATE_MODIFY?: string;
  STAGE_ID?: string;
  TITLE?: string;
  CATEGORY_ID: string;
  CONTACT_ID?: string;
}

function apiUrl(method: string, qs = "") {
  const webhook = getBitrixWebhook();
  if (!webhook) throw new Error("BITRIX_WEBHOOK не настроен.");
  return `${webhook}${method}.json${qs ? "?" + qs : ""}`;
}

async function apiGet<T>(method: string, qs = ""): Promise<{ result: T[]; next?: number; total?: number }> {
  const url = apiUrl(method, qs);
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { headers: { "User-Agent": "YoupiterBI/1.0" }, cache: "no-store" });
    if (res.ok) return res.json();
    if (res.status === 503 && attempt < 3) {
      attempt++;
      await sleep(1000 * attempt);
      continue;
    }
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`Bitrix24 API error ${res.status}: ${method} — ${body.slice(0, 200)}`);
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** Fetch all leads where DATE_CREATE falls in [from, to] */
export async function fetchLeadsByDateRange(from: string, to: string): Promise<BitrixLead[]> {
  const df = encodeURIComponent(`${from}T00:00:00`);
  const dt = encodeURIComponent(`${to}T23:59:59`);
  const all: BitrixLead[] = [];
  let start = 0;

  while (true) {
    const qs = [
      `filter%5B%3E%3DDATE_CREATE%5D=${df}`,
      `filter%5B%3C%3DDATE_CREATE%5D=${dt}`,
      `select%5B%5D=ID`,
      `select%5B%5D=STATUS_ID`,
      `select%5B%5D=ASSIGNED_BY_ID`,
      `select%5B%5D=SOURCE_ID`,
      `select%5B%5D=UTM_SOURCE`,
      `select%5B%5D=DATE_CREATE`,
      `select%5B%5D=DATE_MODIFY`,
      `select%5B%5D=TITLE`,
      `select%5B%5D=COMMENTS`,
      `start=${start}`,
    ].join("&");
    const data = await apiGet<BitrixLead>("crm.lead.list", qs);
    const batch = data.result ?? [];
    all.push(...batch);
    if (!data.next || batch.length === 0) break;
    start = data.next;
    await sleep(600);
  }

  // Enrich with source label
  for (const l of all) {
    l._sourceLabel = parseSource(l.SOURCE_ID, l.UTM_SOURCE);
    // Try park from comments/title (deals-based enrichment happens in fetchFirstShift)
    l._park = detectParkFromText(l.COMMENTS, l.TITLE) ?? "Не указан";
  }

  return all;
}

/**
 * Fetch first-shift deals via crm.stagehistory.list — uses exact stage transition timestamp.
 * Mirrors etalon (bitrix-jupiter) logic: counts deals by WHEN they moved to first-shift stage,
 * not by deal creation date. This is more accurate for daily/weekly/monthly reporting.
 */
export async function fetchFirstShiftByDateRange(from: string, to: string): Promise<BitrixLead[]> {
  const webhook = getBitrixWebhook();
  if (!webhook) throw new Error("BITRIX_WEBHOOK не настроен.");

  const df = encodeURIComponent(`${from}T00:00:00`);
  const dt = encodeURIComponent(`${to}T23:59:59`);

  // Stages that count as "first shift": C{cat}:2 for park funnels + FINAL_INVOICE/WON for cat=0
  const histStages: Array<{ stage: string; cat: string | null }> = [
    { stage: "C2:2",           cat: null },
    { stage: "C4:2",           cat: null },
    { stage: "C6:2",           cat: null },
    { stage: "C8:2",           cat: null },
    { stage: "C10:2",          cat: null },
    { stage: "C12:2",          cat: null },
    { stage: "FINAL_INVOICE",  cat: "0"  },
    { stage: "WON",            cat: "0"  },
  ];

  // Collect unique deal IDs from stagehistory
  const ownerIds = new Set<string>();

  for (const { stage, cat } of histStages) {
    let start = 0;
    while (true) {
      const url =
        `${webhook}crm.stagehistory.list.json?entityTypeId=2` +
        `&filter%5BSTAGE_ID%5D=${encodeURIComponent(stage)}` +
        `&filter%5B%3E%3DCREATED_TIME%5D=${df}` +
        `&filter%5B%3C%3DCREATED_TIME%5D=${dt}` +
        `&select%5B%5D=OWNER_ID&select%5B%5D=CATEGORY_ID` +
        `&start=${start}`;
      let attempt = 0;
      let raw: { result?: { items?: Array<{ OWNER_ID: string; CATEGORY_ID?: string }>; next?: number } };
      while (true) {
        const res = await fetch(url, { headers: { "User-Agent": "YoupiterBI/1.0" }, cache: "no-store" });
        if (res.ok) { raw = await res.json(); break; }
        if (res.status === 503 && attempt < 3) { attempt++; await sleep(1000 * attempt); continue; }
        throw new Error(`Bitrix24 stagehistory error ${res.status}: ${stage}`);
      }
      const items = raw.result?.items ?? [];
      for (const it of items) {
        if (cat && String(it.CATEGORY_ID ?? "") !== cat) continue;
        if (it.OWNER_ID) ownerIds.add(String(it.OWNER_ID));
      }
      const nx = raw.result?.next;
      if (!nx || items.length === 0) break;
      start = nx;
      await sleep(600);
    }
    await sleep(200);
  }

  if (!ownerIds.size) return [];

  // Batch-fetch deal details for found deal IDs (50 per request)
  const dealIds = [...ownerIds];
  const dealDetails = new Map<string, BitrixDeal>();

  for (let i = 0; i < dealIds.length; i += 50) {
    const batch = dealIds.slice(i, i + 50);
    const qs = [
      `select%5B%5D=ID`,
      `select%5B%5D=LEAD_ID`,
      `select%5B%5D=ASSIGNED_BY_ID`,
      `select%5B%5D=SOURCE_ID`,
      `select%5B%5D=UTM_SOURCE`,
      `select%5B%5D=DATE_CREATE`,
      `select%5B%5D=DATE_MODIFY`,
      `select%5B%5D=STAGE_ID`,
      `select%5B%5D=TITLE`,
      `select%5B%5D=CATEGORY_ID`,
      `select%5B%5D=CONTACT_ID`,
      ...batch.map((id, j) => `filter%5BID%5D%5B${j}%5D=${id}`),
    ].join("&");
    const data = await apiGet<BitrixDeal>("crm.deal.list", qs);
    for (const d of data.result ?? []) dealDetails.set(String(d.ID), d);
    await sleep(300);
  }

  const firstShift: BitrixLead[] = [];
  for (const dealId of ownerIds) {
    const d = dealDetails.get(dealId);
    const cat = d?.CATEGORY_ID ?? "";
    const park = DEAL_CAT_TO_PARK[String(cat)] ?? "Не указан";
    const leadId = d?.LEAD_ID && String(d.LEAD_ID) !== "0" ? String(d.LEAD_ID) : `D${dealId}`;
    firstShift.push({
      ID: leadId,
      STATUS_ID: "CONVERTED",
      ASSIGNED_BY_ID: String(d?.ASSIGNED_BY_ID ?? ""),
      SOURCE_ID: String(d?.SOURCE_ID ?? ""),
      UTM_SOURCE: d?.UTM_SOURCE,
      DATE_CREATE: (d as unknown as { DATE_CREATE?: string })?.DATE_CREATE ?? d?.DATE_MODIFY ?? "",
      DATE_MODIFY: d?.DATE_MODIFY ?? "",
      TITLE: d?.TITLE ?? `Сделка #${dealId}`,
      _dealPark: park,
      _sourceLabel: parseSource(d?.SOURCE_ID, d?.UTM_SOURCE),
      _park: park,
      _dealId: dealId,
      _dealStageId: d?.STAGE_ID ?? "",
      _contactId: d?.CONTACT_ID && String(d.CONTACT_ID) !== "0" ? String(d.CONTACT_ID) : undefined,
    });
  }

  return firstShift;
}

/** Fetch oformlenie deals (stages NEW + 1 in park funnels) by DATE_MODIFY */
export async function fetchOformlenieByDateRange(from: string, to: string): Promise<BitrixLead[]> {
  const df = encodeURIComponent(`${from}T00:00:00`);
  const dt = encodeURIComponent(`${to}T23:59:59`);
  const deals: BitrixDeal[] = [];
  // Must match legacy bitrix-jupiter logic: DOC + WAIT + REG stages.
  const stages = [
    "NEW", "C2:NEW", "C4:NEW", "C6:NEW", "C8:NEW", "C10:NEW", "C12:NEW", "C18:NEW", "C22:FINAL_INVOICE", "C16:PREPARATION",
    "1", "C2:3", "C4:1", "C6:1", "C8:1", "C10:1", "C12:1", "C18:PREPARATION",
    "EXECUTING", "C2:1", "C4:3", "C6:3", "C8:3", "C10:3", "C12:3", "C18:1",
  ];
  let start = 0;
  while (true) {
    const stageFilter = stages.map((s, i) => `filter%5BSTAGE_ID%5D%5B${i}%5D=${encodeURIComponent(s)}`).join("&");
    const qs = [
      stageFilter,
      `filter%5B%3E%3DDATE_MODIFY%5D=${df}`,
      `filter%5B%3C%3DDATE_MODIFY%5D=${dt}`,
      `select%5B%5D=ID`,
      `select%5B%5D=LEAD_ID`,
      `select%5B%5D=ASSIGNED_BY_ID`,
      `select%5B%5D=SOURCE_ID`,
      `select%5B%5D=UTM_SOURCE`,
      `select%5B%5D=DATE_CREATE`,
      `select%5B%5D=DATE_MODIFY`,
      `select%5B%5D=STAGE_ID`,
      `select%5B%5D=TITLE`,
      `select%5B%5D=CATEGORY_ID`,
      `select%5B%5D=CONTACT_ID`,
      `start=${start}`,
    ].join("&");
    const data = await apiGet<BitrixDeal>("crm.deal.list", qs);
    const batch = data.result ?? [];
    deals.push(...batch);
    if (!data.next || batch.length === 0) break;
    start = data.next;
    await sleep(600);
  }

  const uniqDeals = new Map<string, BitrixDeal>();
  for (const d of deals) if (d.ID) uniqDeals.set(String(d.ID), d);

  const out: BitrixLead[] = [];
  for (const d of uniqDeals.values()) {
    const park = DEAL_CAT_TO_PARK[String(d.CATEGORY_ID)] ?? "Не указан";
    const leadId = d.LEAD_ID && String(d.LEAD_ID) !== "0" ? String(d.LEAD_ID) : `D${d.ID}`;
    out.push({
      ID: leadId,
      STATUS_ID: "OFORMLENIE",
      ASSIGNED_BY_ID: String(d.ASSIGNED_BY_ID ?? ""),
      SOURCE_ID: String(d.SOURCE_ID ?? ""),
      UTM_SOURCE: d.UTM_SOURCE,
      DATE_CREATE: (d as unknown as { DATE_CREATE?: string }).DATE_CREATE ?? d.DATE_MODIFY ?? "",
      DATE_MODIFY: d.DATE_MODIFY ?? "",
      TITLE: d.TITLE ?? `Сделка #${d.ID}`,
      _dealPark: park,
      _sourceLabel: parseSource(d.SOURCE_ID, d.UTM_SOURCE),
      _park: park,
      _dealId: String(d.ID),
      _dealStageId: d.STAGE_ID ?? "",
      _contactId: d.CONTACT_ID && String(d.CONTACT_ID) !== "0" ? String(d.CONTACT_ID) : undefined,
    });
  }
  return out;
}

/** Batch-fetch contact names by IDs. Returns map contactId → "Имя Фамилия" */
export async function fetchContactNames(contactIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const uniq = [...new Set(contactIds.filter(Boolean))];
  if (!uniq.length) return map;
  const batches: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) batches.push(uniq.slice(i, i + 50));
  for (const batch of batches) {
    const qs = [
      "select%5B%5D=ID",
      "select%5B%5D=NAME",
      "select%5B%5D=LAST_NAME",
      ...batch.map((id, i) => `filter%5BID%5D%5B${i}%5D=${id}`),
    ].join("&");
    const data = await apiGet<{ ID: string; NAME?: string; LAST_NAME?: string }>("crm.contact.list", qs);
    for (const c of (data.result ?? [])) {
      const name = [c.NAME, c.LAST_NAME].filter(Boolean).join(" ").trim();
      if (name) map[String(c.ID)] = name;
    }
    await sleep(300);
  }
  return map;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface SourceStat {
  total: number;
  relevant: number;
  sobes: number;
  dFirst: number;
}

export interface ManagerStat {
  id: string;
  name: string;
  total: number;
  relevant: number;
  sobes: number;
  dFirst: number;
  dumaet: number;
  noAns: number;
  irrelevant: number;
}

export interface ParkStat {
  park: string;
  total: number;
  relevant: number;
  sobes: number;
  dumaet: number;
  dFirst: number;
  noAns: number;
  irrelevant: number;
}

export interface HireDrillRow {
  id: string;
  date: string;
  title: string;
  contactName?: string;
  managerId: string;
  managerName: string;
  statusId?: string;
  source: string;
  park: string;
  status: string;
  url: string;
}

export interface HireMetrics {
  dateFrom: string;
  dateTo: string;
  total: number;
  relYes: number;
  relNo: number;
  noSpamDup: number;
  qualLead: number;
  oformlenie: number;
  relevant: number;
  irrelevant: number;
  sobes: number;
  dumaet: number;
  noAns: number;
  dFirst: number;
  convRelevToSobes: number;   // %
  convSobesToFirst: number;   // %
  rejectBreakdown: Record<string, number>;
  parkBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, SourceStat>;
  managerStats: ManagerStat[];
  managerSourceMatrix: Record<string, Record<string, number>>; // id → source → count
  parkStats: ParkStat[];
  parkSourceMatrix: Record<string, Record<string, number>>;    // park → source → count
  hourBreakdown: Record<number, number>;                       // hour (0-23) → count
  drilldown?: {
    leads: HireDrillRow[];
    firstShift: HireDrillRow[];
    oformlenie: HireDrillRow[];
  };
}

export interface HireFilters {
  manager?: string;   // manager ID, empty = all
  sources?: string[]; // source labels, empty = all
  parks?: string[];   // park names, empty = all
}

// ── Compute ────────────────────────────────────────────────────────────────

export function computeHireMetrics(
  rawLeads: BitrixLead[],
  rawFirstShift: BitrixLead[],
  rawOformlenie: BitrixLead[],
  from: string,
  to: string,
  filters: HireFilters = {}
): HireMetrics {
  // Filter to known avtopark team only (first shift: same AVTOPARK_IDS scope, not all team)
  let leads = rawLeads.filter((l) => {
    if (!AVTOPARK_IDS.has(String(l.ASSIGNED_BY_ID))) return false;
    if (STATUS_DOSTAVKA.has(l.STATUS_ID)) return false;
    if (STATUS_RASKAT.has(l.STATUS_ID)) return false;
    return true;
  });
  // First shift: no AVTOPARK_IDS filter — match etalon (counts all park-funnel deals)
  let first = [...rawFirstShift];
  let oform = rawOformlenie.filter((l) => AVTOPARK_IDS.has(String(l.ASSIGNED_BY_ID)));

  // Apply manager filter
  if (filters.manager) {
    leads = leads.filter((l) => String(l.ASSIGNED_BY_ID) === filters.manager);
    first = first.filter((l) => String(l.ASSIGNED_BY_ID) === filters.manager);
    oform = oform.filter((l) => String(l.ASSIGNED_BY_ID) === filters.manager);
  }

  // Apply park filter — both leads and first shift
  if (filters.parks?.length) {
    const parkSet = new Set(filters.parks);
    leads = leads.filter((l) => parkSet.has(l._park ?? ""));
    first = first.filter((l) => parkSet.has(l._park ?? ""));
    oform = oform.filter((l) => parkSet.has(l._park ?? ""));
  }

  // Apply source filter — both leads and first shift
  if (filters.sources?.length) {
    const srcSet = new Set(filters.sources);
    leads = leads.filter((l) => srcSet.has(l._sourceLabel ?? "Не указан"));
    first = first.filter((l) => srcSet.has(l._sourceLabel ?? "Не указан"));
    oform = oform.filter((l) => srcSet.has(l._sourceLabel ?? "Не указан"));
  }

  const total      = leads.length;
  const relYes     = leads.filter((l) => STATUS.REL_YES.has(l.STATUS_ID)).length;
  const relNo      = leads.filter((l) => STATUS.REL_NO.has(l.STATUS_ID)).length;
  const noSpamDup  = leads.filter((l) => l.STATUS_ID !== "10" && l.STATUS_ID !== "12").length;
  const qualLead   = leads.filter((l) => l.STATUS_ID === STATUS.CONVERTED).length;
  const oformlenie = oform.length;
  const relevant   = relYes;
  const irrelevant = leads.filter((l) => STATUS.IRRELEVANT.has(l.STATUS_ID)).length;
  const sobes      = leads.filter((l) => l.STATUS_ID === STATUS.SOBES).length;
  const dumaet     = leads.filter((l) => l.STATUS_ID === STATUS.DUMAET).length;
  const noAns      = leads.filter((l) => STATUS.NO_ANS.has(l.STATUS_ID)).length;
  const dFirst     = first.length;

  // Reject breakdown
  const rejectBreakdown: Record<string, number> = {};
  for (const l of leads) {
    if (STATUS.IRRELEVANT.has(l.STATUS_ID)) {
      rejectBreakdown[l.STATUS_ID] = (rejectBreakdown[l.STATUS_ID] ?? 0) + 1;
    }
  }

  // Park breakdown (from first shift)
  const parkBreakdown: Record<string, number> = {};
  for (const l of first) {
    const park = l._park ?? "Не указан";
    parkBreakdown[park] = (parkBreakdown[park] ?? 0) + 1;
  }

  // Source breakdown
  const sourceMap: Record<string, SourceStat> = {};
  for (const l of leads) {
    const src = l._sourceLabel ?? "Не указан";
    if (!sourceMap[src]) sourceMap[src] = { total: 0, relevant: 0, sobes: 0, dFirst: 0 };
    sourceMap[src].total++;
    if (STATUS.REL_YES.has(l.STATUS_ID))   sourceMap[src].relevant++;
    if (l.STATUS_ID === STATUS.SOBES)      sourceMap[src].sobes++;
  }
  for (const l of first) {
    const src = l._sourceLabel ?? "Не указан";
    if (!sourceMap[src]) sourceMap[src] = { total: 0, relevant: 0, sobes: 0, dFirst: 0 };
    sourceMap[src].dFirst++;
  }

  // Manager × Source matrix
  const managerSourceMatrix: Record<string, Record<string, number>> = {};
  for (const l of leads) {
    const mid = String(l.ASSIGNED_BY_ID);
    const src = l._sourceLabel ?? "Не указан";
    if (!managerSourceMatrix[mid]) managerSourceMatrix[mid] = {};
    managerSourceMatrix[mid][src] = (managerSourceMatrix[mid][src] ?? 0) + 1;
  }

  // Per-manager stats
  const managerStats: ManagerStat[] = Array.from(AVTOPARK_IDS).map((mid) => {
    const mLeads = leads.filter((l) => String(l.ASSIGNED_BY_ID) === mid);
    const mFirst = first.filter((l) => String(l.ASSIGNED_BY_ID) === mid);
    return {
      id:        mid,
      name:      TEAM_NAMES[mid] ?? mid,
      total:     mLeads.length,
      relevant:  mLeads.filter((l) => STATUS.REL_YES.has(l.STATUS_ID)).length,
      sobes:     mLeads.filter((l) => l.STATUS_ID === STATUS.SOBES).length,
      dFirst:    mFirst.length,
      dumaet:    mLeads.filter((l) => l.STATUS_ID === STATUS.DUMAET).length,
      noAns:     mLeads.filter((l) => STATUS.NO_ANS.has(l.STATUS_ID)).length,
      irrelevant: mLeads.filter((l) => STATUS.IRRELEVANT.has(l.STATUS_ID)).length,
    };
  }).filter((m) => m.total > 0 || m.dFirst > 0)
    .sort((a, b) => b.dFirst - a.dFirst || b.relevant - a.relevant);

  // Park stats (per-lead park from text detection)
  const parkMap: Record<string, ParkStat> = {};
  for (const l of leads) {
    const park = l._park ?? "Не указан";
    if (!parkMap[park]) parkMap[park] = { park, total: 0, relevant: 0, sobes: 0, dumaet: 0, dFirst: 0, noAns: 0, irrelevant: 0 };
    parkMap[park].total++;
    if (STATUS.REL_YES.has(l.STATUS_ID))    parkMap[park].relevant++;
    if (l.STATUS_ID === STATUS.SOBES)       parkMap[park].sobes++;
    if (l.STATUS_ID === STATUS.DUMAET)      parkMap[park].dumaet++;
    if (STATUS.NO_ANS.has(l.STATUS_ID))     parkMap[park].noAns++;
    if (STATUS.IRRELEVANT.has(l.STATUS_ID)) parkMap[park].irrelevant++;
  }
  // Add dFirst from first shift park breakdown
  for (const l of first) {
    const park = l._park ?? "Не указан";
    if (!parkMap[park]) parkMap[park] = { park, total: 0, relevant: 0, sobes: 0, dumaet: 0, dFirst: 0, noAns: 0, irrelevant: 0 };
    parkMap[park].dFirst++;
  }
  const parkStats = Object.values(parkMap).sort((a, b) => b.total - a.total);

  // Park × Source matrix
  const parkSourceMatrix: Record<string, Record<string, number>> = {};
  for (const l of leads) {
    const park = l._park ?? "Не указан";
    const src  = l._sourceLabel ?? "Не указан";
    if (!parkSourceMatrix[park]) parkSourceMatrix[park] = {};
    parkSourceMatrix[park][src] = (parkSourceMatrix[park][src] ?? 0) + 1;
  }

  // Hour breakdown (Moscow time, 0-23)
  const hourBreakdown: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourBreakdown[h] = 0;
  for (const l of leads) {
    if (!l.DATE_CREATE) continue;
    // Bitrix returns UTC+3 offset in the string, parse the hour directly
    const match = l.DATE_CREATE.match(/T(\d{2}):/);
    if (match) {
      const hour = parseInt(match[1], 10);
      hourBreakdown[hour] = (hourBreakdown[hour] ?? 0) + 1;
    }
  }

  return {
    dateFrom: from,
    dateTo: to,
    total, relYes, relNo, noSpamDup, qualLead, oformlenie, relevant, irrelevant, sobes, dumaet, noAns, dFirst,
    convRelevToSobes: relYes > 0 ? Math.round(sobes   / relYes * 100) : 0,
    convSobesToFirst: sobes > 0    ? Math.round(dFirst  / sobes    * 100) : 0,
    rejectBreakdown,
    parkBreakdown,
    sourceBreakdown: sourceMap,
    managerStats,
    managerSourceMatrix,
    parkStats,
    parkSourceMatrix,
    hourBreakdown,
  };
}

// ── Раскат ─────────────────────────────────────────────────────────────────

export interface RaskatMetrics {
  total: number;
  relevant: number;
  irrelevant: number;
  converted: number;
  zapis: number;
  byManager: Record<string, number>;
  byStatus: Record<string, number>;
  byReject: Record<string, number>;
}

// ── Доставка ────────────────────────────────────────────────────────────────

export interface DostavkaMetrics {
  total: number;
  bySource: Record<string, number>;
  byManager: Record<string, number>;
}

export function computeDostavkaMetrics(rawLeads: BitrixLead[]): DostavkaMetrics {
  const leads = rawLeads.filter((l) => STATUS_DOSTAVKA.has(l.STATUS_ID));

  const bySource: Record<string, number> = {};
  const byManager: Record<string, number> = {};
  for (const l of leads) {
    const src  = l._sourceLabel ?? "Не указан";
    const name = TEAM_NAMES[String(l.ASSIGNED_BY_ID)] ?? `ID:${l.ASSIGNED_BY_ID}`;
    bySource[src]   = (bySource[src]   ?? 0) + 1;
    byManager[name] = (byManager[name] ?? 0) + 1;
  }

  return { total: leads.length, bySource, byManager };
}

export function computeRaskatMetrics(rawLeads: BitrixLead[]): RaskatMetrics {
  const rLeads = rawLeads.filter(
    (l) => STATUS_RASKAT.has(l.STATUS_ID) || RASKAT_IDS.has(String(l.ASSIGNED_BY_ID))
  );

  const relevant   = rLeads.filter((l) => RASKAT_RELEVANT.has(l.STATUS_ID)).length;
  const irrelevant = rLeads.filter((l) => RASKAT_IRRELEVANT.has(l.STATUS_ID)).length;
  const converted  = rLeads.filter((l) => l.STATUS_ID === "CONVERTED").length;
  const zapis      = rLeads.filter((l) => l.STATUS_ID === "UC_U8ZJ1Q").length;

  const byManager: Record<string, number> = {};
  for (const l of rLeads) {
    const name = TEAM_NAMES[String(l.ASSIGNED_BY_ID)] ?? `ID:${l.ASSIGNED_BY_ID}`;
    byManager[name] = (byManager[name] ?? 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  for (const l of rLeads) {
    const label = RASKAT_STATUS_NAMES[l.STATUS_ID] ?? l.STATUS_ID;
    byStatus[label] = (byStatus[label] ?? 0) + 1;
  }

  const byReject: Record<string, number> = {};
  for (const l of rLeads) {
    if (RASKAT_IRRELEVANT.has(l.STATUS_ID)) {
      const label = RASKAT_STATUS_NAMES[l.STATUS_ID] ?? l.STATUS_ID;
      byReject[label] = (byReject[label] ?? 0) + 1;
    }
  }

  return { total: rLeads.length, relevant, irrelevant, converted, zapis, byManager, byStatus, byReject };
}
