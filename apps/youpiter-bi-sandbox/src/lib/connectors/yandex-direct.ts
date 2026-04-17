/**
 * Yandex Direct API v5 connector.
 * Docs: https://yandex.ru/dev/direct/doc/ref-v5/concepts/about.html
 */

import { YANDEX_DIRECT_BASE, YD_COST_DIVISOR } from "@/lib/config/marketing";

// ── Types ──────────────────────────────────────────────────────────────────

export interface YDCampaign {
  id: string;
  name: string;
  status: string;
  type?: string;
}

export interface YDDailyStat {
  date: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number; // rubles (if ecommerce goals are available)
  ctr: number;
  cost: number;   // rubles
}

export interface MarketingMetrics {
  dateFrom: string;
  dateTo: string;
  totalCost: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  conversionRate: number;
  avgCtr: number;
  costPerClick: number;
  costPerConversion: number;
  totalRevenue: number;
  romi: number | null;
  dailyStats: YDDailyStat[];
  campaignStats: Array<{
    campaignId: string;
    campaignName: string;
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
    revenue: number;
    ctr: number;
  }>;
}

// ── Internal ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ── Yandex Direct Reports API (returns TSV) ─────────────────────────────────

function parseTsvReport(tsv: string): YDDailyStat[] {
  const lines = tsv.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");

  const idx = (name: string) => headers.indexOf(name);
  const iDate    = idx("Date");
  const iCampId  = idx("CampaignId");
  const iCamp    = idx("CampaignName");
  const iImp     = idx("Impressions");
  const iClk     = idx("Clicks");
  const iConv    = idx("Conversions");
  const iRevenue = idx("Revenue");
  const iCtr     = idx("Ctr");
  const iCost    = idx("Cost");

  return lines.slice(1).map((line): YDDailyStat => {
    const cols = line.split("\t");
    return {
      date:         cols[iDate]   ?? "",
      campaignId:   cols[iCampId] ?? "",
      campaignName: cols[iCamp]   ?? "",
      impressions:  parseInt(cols[iImp]  ?? "0", 10) || 0,
      clicks:       parseInt(cols[iClk]  ?? "0", 10) || 0,
      conversions:  iConv >= 0 ? (parseFloat(cols[iConv] ?? "0") || 0) : 0,
      revenue:      iRevenue >= 0 ? ((parseFloat(cols[iRevenue] ?? "0") || 0) / YD_COST_DIVISOR) : 0,
      ctr:          parseFloat(cols[iCtr] ?? "0") || 0,
      cost:         (parseInt(cols[iCost] ?? "0", 10) || 0) / YD_COST_DIVISOR,
    };
  }).filter((r) => r.date);
}

export async function fetchYDReport(
  token: string,
  clientLogin: string,
  from: string,
  to: string,
  attempt = 0,
  useExtendedFields = true
): Promise<YDDailyStat[]> {
  if (attempt > 4) throw new Error("Yandex Direct: отчёт не готов после 4 попыток");

  const res = await fetch(`${YANDEX_DIRECT_BASE}/reports`, {
    method: "POST",
    headers: {
      "Authorization":      `Bearer ${token}`,
      "Client-Login":       clientLogin,
      "Accept-Language":    "ru",
      "Content-Type":       "application/json",
      "processingMode":     "auto",
      "returnMoneyInMicros":"true",
      "skipReportHeader":   "true",
      "skipReportSummary":  "true",
    },
    body: JSON.stringify({
      params: {
        SelectionCriteria: { DateFrom: from, DateTo: to },
        FieldNames: useExtendedFields
          ? ["Date", "CampaignId", "CampaignName", "Impressions", "Clicks", "Conversions", "Revenue", "Ctr", "Cost"]
          : ["Date", "CampaignId", "CampaignName", "Impressions", "Clicks", "Ctr", "Cost"],
        ReportName:   `youpiter_${Date.now()}`,
        ReportType:   "CAMPAIGN_PERFORMANCE_REPORT",
        DateRangeType:"CUSTOM_DATE",
        Format:       "TSV",
        IncludeVAT:   "YES",
        IncludeDiscount: "NO",
      },
    }),
    cache: "no-store",
  });

  if (res.status === 201 || res.status === 202) {
    await sleep(5000 * (attempt + 1));
    return fetchYDReport(token, clientLogin, from, to, attempt + 1, useExtendedFields);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Some Direct accounts do not support Revenue/Conversions fields.
    if (useExtendedFields && res.status === 400) {
      return fetchYDReport(token, clientLogin, from, to, 0, false);
    }
    throw new Error(`Yandex Direct /reports ${res.status}: ${text.slice(0, 300)}`);
  }

  const tsv = await res.text();
  return parseTsvReport(tsv);
}

export async function fetchYDCampaigns(
  token: string, clientLogin: string
): Promise<YDCampaign[]> {
  const res = await fetch(`${YANDEX_DIRECT_BASE}/campaigns`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Client-Login":  clientLogin,
      "Accept-Language": "ru",
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      method: "get",
      params: { SelectionCriteria: {}, FieldNames: ["Id", "Name", "Status", "Type"] },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yandex Direct /campaigns ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { result?: { Campaigns?: Array<{ Id: number; Name: string; Status: string; Type: string }> } };
  return (data.result?.Campaigns ?? []).map((c) => ({
    id: String(c.Id), name: c.Name, status: c.Status, type: c.Type,
  }));
}

// ── Compute ─────────────────────────────────────────────────────────────────

export function computeMarketingMetrics(
  daily: YDDailyStat[], from: string, to: string
): MarketingMetrics {
  const totalCost        = daily.reduce((s, d) => s + d.cost, 0);
  const totalClicks      = daily.reduce((s, d) => s + d.clicks, 0);
  const totalImpressions = daily.reduce((s, d) => s + d.impressions, 0);
  const totalConversions = daily.reduce((s, d) => s + d.conversions, 0);
  const totalRevenue     = daily.reduce((s, d) => s + d.revenue, 0);
  const avgCtr           = totalImpressions > 0 ? totalClicks / totalImpressions * 100 : 0;
  const costPerClick     = totalClicks > 0 ? totalCost / totalClicks : 0;
  const conversionRate   = totalClicks > 0 ? totalConversions / totalClicks * 100 : 0;
  const costPerConversion = totalConversions > 0 ? totalCost / totalConversions : 0;
  const romi = totalCost > 0 && totalRevenue > 0
    ? ((totalRevenue - totalCost) / totalCost) * 100
    : null;

  const campMap: Record<string, MarketingMetrics["campaignStats"][0]> = {};
  for (const d of daily) {
    if (!campMap[d.campaignId]) {
      campMap[d.campaignId] = {
        campaignId: d.campaignId,
        campaignName: d.campaignName,
        cost: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        revenue: 0,
        ctr: 0,
      };
    }
    campMap[d.campaignId].cost        += d.cost;
    campMap[d.campaignId].clicks      += d.clicks;
    campMap[d.campaignId].impressions += d.impressions;
    campMap[d.campaignId].conversions = (campMap[d.campaignId].conversions ?? 0) + d.conversions;
    campMap[d.campaignId].revenue = (campMap[d.campaignId].revenue ?? 0) + d.revenue;
  }
  for (const c of Object.values(campMap)) {
    c.ctr = c.impressions > 0 ? Math.round(c.clicks / c.impressions * 10000) / 100 : 0;
  }

  return {
    dateFrom: from, dateTo: to,
    totalCost:        Math.round(totalCost * 100) / 100,
    totalClicks,
    totalImpressions,
    totalConversions: Math.round(totalConversions * 100) / 100,
    conversionRate:   Math.round(conversionRate * 100) / 100,
    avgCtr:           Math.round(avgCtr * 100) / 100,
    costPerClick:     Math.round(costPerClick * 100) / 100,
    costPerConversion: Math.round(costPerConversion * 100) / 100,
    totalRevenue:     Math.round(totalRevenue * 100) / 100,
    romi:             romi === null ? null : Math.round(romi * 100) / 100,
    dailyStats: daily,
    campaignStats: Object.values(campMap).sort((a, b) => b.cost - a.cost),
  };
}
