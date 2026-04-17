"use client";

import { useEffect } from "react";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useFinanceFilters } from "@/lib/context/FinanceFilters";
import Link from "next/link";
import { markDataFreshness } from "@/lib/settings-client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}К`;
  return String(Math.round(v));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CashTooltip({ active, payload, label }: any) {
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

export default function FinancePage() {
  const { metrics, loading, error, noSheets, filters } = useFinanceFilters();

  useEffect(() => {
    if (metrics && !loading && !error) markDataFreshness("finance");
  }, [metrics, loading, error]);

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noSheets) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <FileSpreadsheet className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Google Sheets не подключён</p>
          <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
            Добавьте ссылку на таблицу с финансовыми данными в Настройки → Интеграции.
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-xl skeleton" />)}
        </div>
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

  const { totalIncome, totalExpense, profit, dailyCashflow, byPark, byCategory } = metrics;

  const chartData = dailyCashflow.map((d) => ({
    day: d.date.slice(5),
    доходы: Math.round(d.income),
    расходы: Math.round(d.expense),
  }));

  const catRows = Object.entries(byCategory)
    .map(([cat, v]) => ({ cat, total: v.income + v.expense, income: v.income, expense: v.expense }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const parkRows = Object.entries(byPark)
    .sort((a, b) => (b[1].income - b[1].expense) - (a[1].income - a[1].expense));

  const profitColor = profit >= 0 ? "#10B981" : "#EF4444";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Финансы</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · Google Sheets</p>
      </div>

      {/* 3 KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Доходы</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "#10B981" }}>{fmtR(totalIncome)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>поступления за период</p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Расходы</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmtR(totalExpense)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>выплаты за период</p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Прибыль</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: profitColor }}>{fmtR(profit)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            {profit >= 0 ? "положительный баланс" : "отрицательный баланс"}
          </p>
        </Card>
      </div>

      {/* Daily cashflow chart */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Cashflow по дням</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barCategoryGap="25%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
              <Tooltip content={<CashTooltip />} cursor={{ fill: "rgba(245,158,11,0.04)" }} />
              <Legend iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: "11px", color: "var(--color-muted)" }} />
              <Bar dataKey="доходы" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="расходы" fill="#EF4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Two-column: park + category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {parkRows.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По паркам</h3>
            <div className="space-y-2">
              {parkRows.map(([park, v]) => {
                const parkProfit = v.income - v.expense;
                return (
                  <div key={park} className="flex items-center justify-between text-sm gap-2">
                    <span className="truncate" style={{ color: "var(--color-text)" }}>{park}</span>
                    <div className="flex-shrink-0 text-right">
                      <span className="font-medium tabular-nums"
                        style={{ color: parkProfit >= 0 ? "#10B981" : "#EF4444" }}>
                        {fmtR(parkProfit)}
                      </span>
                      <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                        {fmtK(v.income)} / {fmtK(v.expense)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {catRows.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По категориям</h3>
            <div className="space-y-2">
              {catRows.map(({ cat, income, expense }) => (
                <div key={cat} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate" style={{ color: "var(--color-text)" }}>
                    {cat || "Без категории"}
                  </span>
                  <span className="text-xs flex-shrink-0 tabular-nums" style={{ color: "var(--color-muted)" }}>
                    {income > 0 && <span style={{ color: "#10B981" }}>+{fmtK(income)}</span>}
                    {expense > 0 && <span style={{ color: "#EF4444" }}> −{fmtK(expense)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
