"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useWorkshopFilters } from "@/lib/context/WorkshopFilters";
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
function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg space-y-1"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <p className="font-medium mb-1" style={{ color: "var(--color-muted)" }}>{label}</p>
      {payload.map((p: { color: string; name: string; value: number }) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--color-muted)" }}>{p.name}:</span>
          <span className="font-bold tabular-nums" style={{ color: p.color }}>
            ₽ {Number(p.value).toLocaleString("ru-RU")}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function WorkshopCostsPage() {
  const { metrics, loading, error, filters } = useWorkshopFilters();
  const [search, setSearch] = useState("");

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-56 rounded skeleton" />
        <div className="h-48 rounded-xl skeleton" />
        <div className="h-64 rounded-xl skeleton" />
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

  const { entries, totalExpense, byCategory, dailyCashflow } = metrics;
  const expenseEntries = entries.filter((e) => e.type === "expense");
  const filtered = expenseEntries.filter((e) => {
    if (!search) return true;
    return `${e.category} ${e.comment} ${e.park}`.toLowerCase().includes(search.toLowerCase());
  });

  // Chart: top 8 categories
  const chartData = Object.entries(byCategory)
    .filter(([, v]) => v.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense)
    .slice(0, 8)
    .map(([cat, v]) => ({ name: cat || "Прочее", затраты: Math.round(v.expense) }));

  const trendData = dailyCashflow
    .filter((d) => d.expense > 0)
    .map((d) => ({ day: d.date.slice(5), расход: Math.round(d.expense) }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Затраты СТО</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {dateLabel} · итого: {fmtR(totalExpense)}
          </p>
        </div>
        <input
          type="text"
          placeholder="Поиск по категории, комментарию…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 px-3 rounded-lg text-sm outline-none w-56"
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {chartData.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>По категориям</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={fmtK} axisLine={false} tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
                <YAxis type="category" dataKey="name" width={80} axisLine={false} tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(239,68,68,0.05)" }} />
                <Bar dataKey="затраты" fill="#EF4444" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {trendData.length > 1 && (
          <Card>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Динамика расходов</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trendData} barCategoryGap="30%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" axisLine={false} tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }} width={36} />
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(239,68,68,0.05)" }} />
                <Bar dataKey="расход" fill="#EF4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {/* Entries table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Операции · {filtered.length}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Дата", "Категория", "Сумма", "Авто / Парк", "Источник", "Комментарий"].map((h) => (
                  <th key={h} className="text-left py-2.5 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                    {search ? "Ничего не найдено" : "Нет записей за период"}
                  </td>
                </tr>
              ) : (
                filtered.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>{e.date}</td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-text)" }}>{e.category || "—"}</td>
                    <td className="py-2.5 px-4 tabular-nums font-medium" style={{ color: "#EF4444" }}>
                      −{fmtR(e.amount)}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>{e.park || "—"}</td>
                    <td className="py-2.5 px-4 text-xs" style={{ color: "var(--color-muted)" }}>{e._sourceName || "—"}</td>
                    <td className="py-2.5 px-4 max-w-[200px] truncate text-xs"
                      style={{ color: "var(--color-muted)" }} title={e.comment}>
                      {e.comment || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
