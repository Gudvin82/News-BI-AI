"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useFinanceFilters } from "@/lib/context/FinanceFilters";
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
function BalanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const balance = payload.find((p: { name: string }) => p.name === "баланс");
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
      {balance && (
        <div className="pt-1 mt-1 font-semibold" style={{ borderTop: "1px solid var(--color-border)" }}>
          <span style={{ color: Number(balance.value) >= 0 ? "#10B981" : "#EF4444" }}>
            Остаток: {fmtR(Number(balance.value))}
          </span>
        </div>
      )}
    </div>
  );
}

export default function CashflowPage() {
  const { metrics, loading, error, filters } = useFinanceFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-56 rounded-xl skeleton" />
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

  const { dailyCashflow, totalIncome, totalExpense, profit } = metrics;

  const chartData = dailyCashflow.map((d) => ({
    day: d.date.slice(5),
    доходы: Math.round(d.income),
    расходы: Math.round(d.expense),
    баланс: Math.round(d.balance),
  }));

  const finalBalance = dailyCashflow.at(-1)?.balance ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Cashflow</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · Итог: {fmtR(profit)} · Остаток: {fmtR(finalBalance)}
        </p>
      </div>

      {/* Balance area chart */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Накопленный остаток</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={44} />
              <Tooltip content={<BalanceTooltip />} />
              <Area type="monotone" dataKey="баланс" stroke="#10B981" strokeWidth={2}
                fill="url(#balGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Daily table */}
      {dailyCashflow.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Детализация по дням
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Дата", "Доходы", "Расходы", "Итог дня", "Накопл. остаток"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 text-xs font-medium"
                      style={{ color: "var(--color-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyCashflow.map((d) => {
                  const day = d.income - d.expense;
                  return (
                    <tr key={d.date} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                        {d.date}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums font-medium"
                        style={{ color: "#10B981" }}>
                        {d.income > 0 ? fmtR(d.income) : "—"}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums font-medium"
                        style={{ color: "#EF4444" }}>
                        {d.expense > 0 ? fmtR(d.expense) : "—"}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums font-medium"
                        style={{ color: day >= 0 ? "#10B981" : "#EF4444" }}>
                        {day >= 0 ? "+" : ""}{fmtR(day)}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums"
                        style={{ color: d.balance >= 0 ? "var(--color-text)" : "#EF4444" }}>
                        {fmtR(d.balance)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--color-surface-2)" }}>
                  <td className="py-2.5 px-4 font-semibold" style={{ color: "var(--color-text)" }}>Итого</td>
                  <td className="py-2.5 px-4 font-bold tabular-nums" style={{ color: "#10B981" }}>
                    {fmtR(totalIncome)}
                  </td>
                  <td className="py-2.5 px-4 font-bold tabular-nums" style={{ color: "#EF4444" }}>
                    {fmtR(totalExpense)}
                  </td>
                  <td className="py-2.5 px-4 font-bold tabular-nums"
                    style={{ color: profit >= 0 ? "#10B981" : "#EF4444" }}>
                    {profit >= 0 ? "+" : ""}{fmtR(profit)}
                  </td>
                  <td className="py-2.5 px-4 font-bold tabular-nums"
                    style={{ color: finalBalance >= 0 ? "var(--color-text)" : "#EF4444" }}>
                    {fmtR(finalBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
