"use client";

import { AlertTriangle, Car } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useOpsFilters } from "@/lib/context/OpsFilters";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

function fmt(n: number) { return n.toLocaleString("ru-RU"); }
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

export default function OpsPage() {
  const { metrics, loading, error, noToken, filters } = useOpsFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noToken) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Car className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>TaxiCRM не подключён</p>
          <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
            Настройте интеграцию с taxicrm.ru в разделе Настройки → Интеграции.
          </p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
        <div className="h-48 rounded-xl skeleton" />
        <div className="h-32 rounded-xl skeleton" />
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

  const { totalRevenue, carsOut, shiftsCount, driversActive, dailyStats, parkBreakdown } = metrics;

  const chartData = dailyStats.map((d) => ({ day: d.date.slice(5), revenue: d.revenue }));
  const parkRows = Object.entries(parkBreakdown).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalParkRevenue = parkRows.reduce((s, [, v]) => s + v.revenue, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Операционный обзор</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · taxicrm.ru</p>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Выручка",        v: fmtR(totalRevenue), sub: "за период",          color: "var(--color-brand)" },
          { label: "Выпуск авто",    v: fmt(carsOut),        sub: "авто на линии",      color: "#10B981" },
          { label: "Смены",          v: fmt(shiftsCount),    sub: "смен за период",     color: "#3B82F6" },
          { label: "Акт. водители",  v: fmt(driversActive),  sub: "макс. за период",    color: "#8B5CF6" },
        ].map((m) => (
          <Card key={m.label}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>{m.label}</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: m.color }}>{m.v}</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{m.sub}</p>
          </Card>
        ))}
      </div>

      {/* Daily revenue bar chart */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Выручка по дням</h2>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
              <Tooltip content={<RTooltip />} cursor={{ fill: "rgba(245,158,11,0.06)", radius: 4 }} />
              <Bar dataKey="revenue" fill="#FCD34D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Park breakdown table */}
      {parkRows.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>По паркам</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Парк", "Выручка", "Авто", "Смены", "Доля"].map((h) => (
                    <th key={h} className="text-left pb-2 pr-4 text-xs font-medium"
                      style={{ color: "var(--color-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parkRows.map(([park, v]) => {
                  const share = totalParkRevenue > 0
                    ? Math.round(v.revenue / totalParkRevenue * 100) : 0;
                  return (
                    <tr key={park} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2.5 pr-4" style={{ color: "var(--color-text)" }}>{park}</td>
                      <td className="py-2.5 pr-4 tabular-nums font-medium"
                        style={{ color: "var(--color-brand)" }}>{fmtR(v.revenue)}</td>
                      <td className="py-2.5 pr-4 tabular-nums" style={{ color: "var(--color-text)" }}>{v.carsOut}</td>
                      <td className="py-2.5 pr-4 tabular-nums" style={{ color: "var(--color-text)" }}>{v.shifts}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full"
                            style={{ background: "var(--color-surface-2)" }}>
                            <div className="h-1.5 rounded-full"
                              style={{ width: `${share}%`, background: "var(--color-brand)" }} />
                          </div>
                          <span className="text-xs tabular-nums"
                            style={{ color: "var(--color-muted)" }}>{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="pt-3 pr-4 font-semibold" style={{ color: "var(--color-text)" }}>Итого</td>
                  <td className="pt-3 pr-4 tabular-nums font-bold"
                    style={{ color: "var(--color-brand)" }}>{fmtR(totalRevenue)}</td>
                  <td className="pt-3 pr-4 tabular-nums font-semibold"
                    style={{ color: "var(--color-text)" }}>{carsOut}</td>
                  <td className="pt-3 pr-4 tabular-nums font-semibold"
                    style={{ color: "var(--color-text)" }}>{shiftsCount}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
