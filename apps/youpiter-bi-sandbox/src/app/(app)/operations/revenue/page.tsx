"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useOpsFilters } from "@/lib/context/OpsFilters";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
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

export default function RevenuePage() {
  const { metrics, loading, error, filters } = useOpsFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

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

  const { totalRevenue, dailyStats, parkBreakdown } = metrics;
  const chartData = dailyStats.map((d) => ({ day: d.date.slice(5), revenue: d.revenue }));
  const parkRows = Object.entries(parkBreakdown).sort((a, b) => b[1].revenue - a[1].revenue);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Выручка</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · Итого: {fmtR(totalRevenue)}
        </p>
      </div>

      {/* Area chart */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Динамика выручки</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
              <Tooltip content={<RTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#F59E0B" strokeWidth={2}
                fill="url(#revGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Park breakdown bars */}
      {parkRows.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>По паркам</h2>
          <div className="space-y-3">
            {parkRows.map(([park, v]) => {
              const share = totalRevenue > 0 ? v.revenue / totalRevenue : 0;
              return (
                <div key={park}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span style={{ color: "var(--color-text)" }}>{park}</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>
                      {fmtR(v.revenue)}
                      <span className="text-xs font-normal ml-1.5" style={{ color: "var(--color-muted)" }}>
                        {Math.round(share * 100)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                    <div className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${share * 100}%`, background: "var(--color-brand)" }} />
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
