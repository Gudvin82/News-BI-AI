"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useCashFilters } from "@/lib/context/CashFilters";
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

export default function DailyCashPage() {
  const { metrics, loading, error, filters } = useCashFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-56 rounded-xl skeleton" />
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

  const { dailyCashflow, totalIncome, totalExpense, profit } = metrics;

  const chartData = dailyCashflow.map((d) => ({
    day: d.date.slice(5),
    приход: Math.round(d.income),
    расход: Math.round(d.expense),
  }));

  const finalBalance = dailyCashflow.at(-1)?.balance ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Дневная касса</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · Итог: {fmtR(profit)}
        </p>
      </div>

      {/* Bar chart */}
      {chartData.length > 1 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Движение средств</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barCategoryGap="25%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="day" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={fmtK}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }} width={40} />
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(245,158,11,0.04)" }} />
              <Legend iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: "11px", color: "var(--color-muted)" }} />
              <Bar dataKey="приход" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="расход" fill="#EF4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Daily table */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Детализация</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Дата", "Приход", "Расход", "Итог", "Остаток"].map((h) => (
                  <th key={h} className="text-left py-2.5 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dailyCashflow.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm"
                    style={{ color: "var(--color-muted)" }}>Нет данных за период</td>
                </tr>
              ) : (
                dailyCashflow.map((d) => {
                  const day = d.income - d.expense;
                  return (
                    <tr key={d.date} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2.5 px-4 tabular-nums font-medium"
                        style={{ color: "var(--color-text)" }}>{d.date}</td>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "#10B981" }}>
                        {d.income > 0 ? fmtR(d.income) : "—"}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "#EF4444" }}>
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
                })
              )}
              {dailyCashflow.length > 0 && (
                <tr style={{ background: "var(--color-surface-2)" }}>
                  <td className="py-2.5 px-4 font-semibold" style={{ color: "var(--color-text)" }}>Итого</td>
                  <td className="py-2.5 px-4 font-bold tabular-nums" style={{ color: "#10B981" }}>{fmtR(totalIncome)}</td>
                  <td className="py-2.5 px-4 font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmtR(totalExpense)}</td>
                  <td className="py-2.5 px-4 font-bold tabular-nums"
                    style={{ color: profit >= 0 ? "#10B981" : "#EF4444" }}>
                    {profit >= 0 ? "+" : ""}{fmtR(profit)}
                  </td>
                  <td className="py-2.5 px-4 font-bold tabular-nums"
                    style={{ color: finalBalance >= 0 ? "var(--color-text)" : "#EF4444" }}>
                    {fmtR(finalBalance)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
