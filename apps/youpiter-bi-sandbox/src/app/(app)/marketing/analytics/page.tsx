"use client";

import { AlertTriangle, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useMarketingFilters } from "@/lib/context/MarketingFilters";
import Link from "next/link";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtK(v: number) {
  if (v >= 1_000) return `${Math.round(v / 1_000)}К`;
  return String(Math.round(v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MultiTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg space-y-1"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <p className="font-medium mb-1" style={{ color: "var(--color-muted)" }}>{label}</p>
      {payload.map((p: { color: string; name: string; value: number }) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--color-muted)" }}>{p.name}:</span>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function MarketingAnalyticsPage() {
  const { metrics, loading, error, noToken } = useMarketingFilters();

  if (noToken) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Megaphone className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Яндекс Директ не подключён</p>
          <Link href="/settings/integrations"
            className="mt-1 px-4 py-2 rounded-lg text-sm font-medium text-white inline-block"
            style={{ background: "var(--color-brand)" }}>
            Настроить
          </Link>
        </div>
      </Card>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-56 rounded-xl skeleton" />
        <div className="h-40 rounded-xl skeleton" />
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

  // Aggregate daily stats
  const dailyMap: Record<string, { cost: number; clicks: number; impressions: number }> = {};
  for (const d of metrics.dailyStats) {
    if (!dailyMap[d.date]) dailyMap[d.date] = { cost: 0, clicks: 0, impressions: 0 };
    dailyMap[d.date].cost        += d.cost;
    dailyMap[d.date].clicks      += d.clicks;
    dailyMap[d.date].impressions += d.impressions;
  }

  const chartData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      day: date.slice(5),
      расходы: Math.round(v.cost),
      клики: v.clicks,
      cpc: v.clicks > 0 ? Math.round(v.cost / v.clicks) : 0,
    }));

  // Top campaigns by clicks
  const topByCpc = [...metrics.campaignStats]
    .filter((c) => c.clicks > 0)
    .sort((a, b) => (a.cost / a.clicks) - (b.cost / b.clicks))
    .slice(0, 10);

  const maxCpc = Math.max(...topByCpc.map((c) => c.cost / c.clicks), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Аналитика</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          Тренды расходов, CPC и кликов по дням
        </p>
      </div>

      {/* Clicks + Cost trend */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Клики и расходы</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
              <Tooltip content={<MultiTooltip />} />
              <Legend
                iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: "11px", color: "var(--color-muted)" }}
              />
              <Line type="monotone" dataKey="клики" stroke="#3B82F6" strokeWidth={2}
                dot={false} />
              <Line type="monotone" dataKey="расходы" stroke="#F59E0B" strokeWidth={2}
                dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* CPC trend */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>CPC (стоимость клика) по дням</h2>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false}
                tickFormatter={(v) => `₽${v}`}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={44} />
              <Tooltip content={<MultiTooltip />} />
              <Line type="monotone" dataKey="cpc" stroke="#10B981" strokeWidth={2}
                dot={false} name="CPC" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top campaigns by CPC (most efficient) */}
      {topByCpc.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>
            Самые эффективные кампании (минимальный CPC)
          </h2>
          <div className="space-y-3">
            {topByCpc.map((c) => {
              const cpc = c.cost / c.clicks;
              const barWidth = maxCpc > 0 ? cpc / maxCpc : 0;
              return (
                <div key={c.campaignId}>
                  <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                    <span className="truncate flex-1" style={{ color: "var(--color-text)" }}
                      title={c.campaignName}>{c.campaignName}</span>
                    <span className="tabular-nums flex-shrink-0 font-medium"
                      style={{ color: "var(--color-brand)" }}>
                      {fmtR(cpc)}/клик · {c.clicks} кл
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                    <div className="h-1.5 rounded-full"
                      style={{ width: `${barWidth * 100}%`, background: "#10B981" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
