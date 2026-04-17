"use client";

import { AlertTriangle, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useMarketingFilters } from "@/lib/context/MarketingFilters";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}К`;
  return String(Math.round(v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-sm shadow-lg"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <p style={{ color: "var(--color-muted)" }}>{label}</p>
      <p className="font-bold" style={{ color: "var(--color-brand)" }}>
        ₽ {Number(payload[0].value).toLocaleString("ru-RU")}
      </p>
    </div>
  );
}

export default function MarketingPage() {
  const { metrics, loading, error, noToken, filters, campaigns } = useMarketingFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noToken) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Megaphone className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Яндекс Директ не подключён</p>
          <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
            Настройте интеграцию с Яндекс Директ в разделе Настройки → Интеграции.
          </p>
          <Link href="/settings/integrations"
            className="mt-1 px-4 py-2 rounded-lg text-sm font-medium text-white inline-block"
            style={{ background: "var(--color-brand)" }}>
            Настроить интеграцию
          </Link>
        </div>
      </Card>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
        <div className="h-48 rounded-xl skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm py-4 justify-center" style={{ color: "var(--color-danger)" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      </Card>
    );
  }

  if (!metrics) return null;

  const {
    totalCost, totalClicks, totalImpressions,
    totalConversions, conversionRate, totalRevenue, romi,
    avgCtr, costPerClick, costPerConversion, dailyStats, campaignStats,
  } = metrics;
  const activeDays = new Set(dailyStats.map((d) => d.date)).size || 1;
  const avgDailySpend = totalCost / activeDays;
  const bestByClicks = [...campaignStats].sort((a, b) => b.clicks - a.clicks)[0];
  const bestBySpend = [...campaignStats].sort((a, b) => b.cost - a.cost)[0];
  const noClickSpend = campaignStats
    .filter((c) => c.cost > 0 && c.clicks === 0)
    .reduce((sum, c) => sum + c.cost, 0);
  const weakCampaigns = campaignStats
    .filter((c) => c.cost > 0 && (c.clicks === 0 || c.ctr < 1))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);
  const efficientCampaigns = [...campaignStats]
    .filter((c) => c.clicks > 0)
    .sort((a, b) => (a.cost / a.clicks) - (b.cost / b.clicks))
    .slice(0, 5);
  const reportItems = [
    totalCost > 0 ? `Расход за период: ${fmtR(totalCost)}. Средний расход в день: ${fmtR(avgDailySpend)}.` : "Расходов за период нет.",
    totalClicks > 0 ? `Получено ${totalClicks.toLocaleString("ru-RU")} кликов при среднем CPC ${fmtR(costPerClick)}.` : "Кликов за период нет.",
    totalConversions > 0
      ? `Конверсии: ${Math.round(totalConversions).toLocaleString("ru-RU")} · CR: ${conversionRate}% · CPA: ${fmtR(costPerConversion)}.`
      : "Конверсий по Директу пока нет (или не передаются цели).",
    totalRevenue > 0 && romi !== null
      ? `Выручка по данным Директа: ${fmtR(totalRevenue)} · ROMI: ${romi}%.`
      : "ROMI станет доступен, когда в отчёте появится Revenue.",
    bestByClicks ? `Лидер по кликам: ${bestByClicks.campaignName} (${bestByClicks.clicks.toLocaleString("ru-RU")} кликов).` : "Нет кампаний с кликами.",
    noClickSpend > 0 ? `Расход без кликов: ${fmtR(noClickSpend)} — эти кампании нужно проверить.` : "Кампаний с расходом без кликов не найдено.",
  ];

  // Aggregate daily stats by date for chart
  const dailyMap: Record<string, number> = {};
  for (const d of dailyStats) {
    dailyMap[d.date] = (dailyMap[d.date] ?? 0) + d.cost;
  }
  const chartData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ day: date.slice(5), cost }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Маркетинг</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · Яндекс Директ
          {campaigns.length > 0 && ` · ${campaigns.length} кампаний`}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Расходы",         v: fmtR(totalCost),         sub: "сумма за период",         color: "var(--color-brand)" },
          { label: "Кликов",          v: totalClicks.toLocaleString("ru-RU"), sub: "переходов на сайт", color: "#3B82F6" },
          { label: "Конверсии",       v: Math.round(totalConversions).toLocaleString("ru-RU"), sub: `CR ${conversionRate}%`, color: "#8B5CF6" },
          { label: "CPA / CPL",       v: fmtR(costPerConversion),  sub: "цена конверсии", color: "#EF4444" },
          { label: "CTR / CPC",       v: `${avgCtr}%`,             sub: `${fmtR(costPerClick)} за клик`, color: "#10B981" },
          { label: "ROMI",            v: romi === null ? "—" : `${romi}%`, sub: totalRevenue > 0 ? `Выручка ${fmtR(totalRevenue)}` : "нет Revenue", color: "#F59E0B" },
          { label: "Показов",         v: totalImpressions > 1000 ? fmtK(totalImpressions) : String(totalImpressions), sub: "всего показов", color: "#94A3B8" },
        ].map((m) => (
          <Card key={m.label}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>{m.label}</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: m.color }}>{m.v}</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{m.sub}</p>
          </Card>
        ))}
      </div>

      {/* Management reports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Управленческий отчет</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                Что важно по Яндекс Директу за выбранный период
              </p>
            </div>
            <Link href="/marketing/analytics" className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--color-brand)" }}>
              Аналитика →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reportItems.map((item) => (
              <div key={item} className="rounded-xl p-3 text-sm" style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                {item}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Контроль качества</h2>
          <div className="space-y-3">
            {[
              { label: "Средний расход / день", value: fmtR(avgDailySpend), color: "var(--color-brand)" },
              { label: "Расход без кликов", value: fmtR(noClickSpend), color: noClickSpend > 0 ? "var(--color-danger)" : "var(--color-success)" },
              { label: "Кампаний под проверку", value: weakCampaigns.length.toLocaleString("ru-RU"), color: weakCampaigns.length ? "var(--color-warning)" : "var(--color-success)" },
              { label: "Лидер по расходу", value: bestBySpend ? bestBySpend.campaignName : "—", color: "var(--color-text)" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: "var(--color-muted)" }}>{row.label}</span>
                <span className="font-semibold tabular-nums text-right truncate max-w-[170px]" title={row.value} style={{ color: row.color }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Daily cost chart */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Расходы по дням</h2>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
              <Tooltip content={<RTooltip />} cursor={{ fill: "rgba(245,158,11,0.06)", radius: 4 }} />
              <Bar dataKey="cost" fill="#FCD34D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {(weakCampaigns.length > 0 || efficientCampaigns.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {weakCampaigns.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>
                Кампании под проверку
              </h2>
              <div className="space-y-3">
                {weakCampaigns.map((c) => (
                  <div key={c.campaignId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate" title={c.campaignName} style={{ color: "var(--color-text)" }}>{c.campaignName}</p>
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                        {c.clicks === 0 ? "есть расход, нет кликов" : `низкий CTR: ${c.ctr}%`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold tabular-nums" style={{ color: "var(--color-danger)" }}>{fmtR(c.cost)}</p>
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>{c.clicks} кликов</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {efficientCampaigns.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>
                Самые дешевые клики
              </h2>
              <div className="space-y-3">
                {efficientCampaigns.map((c) => (
                  <div key={c.campaignId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate" title={c.campaignName} style={{ color: "var(--color-text)" }}>{c.campaignName}</p>
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>{c.clicks} кликов · CTR {c.ctr}%</p>
                    </div>
                    <p className="font-bold tabular-nums flex-shrink-0" style={{ color: "var(--color-success)" }}>
                      {fmtR(c.cost / c.clicks)}/клик
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Campaign summary */}
      {campaignStats.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Кампании</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Кампания", "Расходы", "Кликов", "Показов", "CTR", "CPC"].map((h) => (
                    <th key={h} className="text-left pb-2 pr-4 text-xs font-medium"
                      style={{ color: "var(--color-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaignStats.map((c) => (
                  <tr key={c.campaignId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 pr-4 max-w-[200px] truncate"
                      style={{ color: "var(--color-text)" }}>{c.campaignName}</td>
                    <td className="py-2.5 pr-4 tabular-nums font-medium"
                      style={{ color: "var(--color-brand)" }}>{fmtR(c.cost)}</td>
                    <td className="py-2.5 pr-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                      {c.clicks.toLocaleString("ru-RU")}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums" style={{ color: "var(--color-muted)" }}>
                      {fmtK(c.impressions)}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                      {c.ctr}%
                    </td>
                    <td className="py-2.5 tabular-nums" style={{ color: "var(--color-muted)" }}>
                      {c.clicks > 0 ? fmtR(c.cost / c.clicks) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
