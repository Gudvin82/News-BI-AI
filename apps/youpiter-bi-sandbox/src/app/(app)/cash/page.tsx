"use client";

import { AlertTriangle, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useCashFilters } from "@/lib/context/CashFilters";
import Link from "next/link";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}К`;
  return String(Math.round(v));
}

export default function CashPage() {
  const { metrics, loading, error, noSheets, filters } = useCashFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noSheets) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Wallet className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Касса не настроена</p>
          <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
            Добавьте Google Sheets с кассовыми данными в Настройки → Интеграции.
            При добавлении отметьте раздел <strong>Касса</strong>.
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
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
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

  const { totalIncome, totalExpense, profit, dailyCashflow, byCategory, byPark } = metrics;
  const finalBalance = dailyCashflow.at(-1)?.balance ?? 0;
  const profitColor = profit >= 0 ? "#10B981" : "#EF4444";

  // Top income/expense categories
  const topCats = Object.entries(byCategory)
    .map(([cat, v]) => ({ cat, income: v.income, expense: v.expense }))
    .sort((a, b) => (b.income + b.expense) - (a.income + a.expense))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Касса</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · {metrics.entries.length} операций
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Приход</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "#10B981" }}>{fmtR(totalIncome)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>поступления</p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Расход</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmtR(totalExpense)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>выплаты</p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Итог периода</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: profitColor }}>{fmtR(profit)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            {profit >= 0 ? "профицит" : "дефицит"}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Остаток</p>
          <p className="text-2xl font-bold tabular-nums"
            style={{ color: finalBalance >= 0 ? "var(--color-text)" : "#EF4444" }}>
            {fmtR(finalBalance)}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>накопленный</p>
        </Card>
      </div>

      {/* Daily table (compact) */}
      {dailyCashflow.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>По дням</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Дата", "Приход", "Расход", "Итог дня", "Остаток"].map((h) => (
                    <th key={h} className="text-left pb-2 pr-6 text-xs font-medium"
                      style={{ color: "var(--color-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyCashflow.map((d) => {
                  const day = d.income - d.expense;
                  return (
                    <tr key={d.date} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2 pr-6 tabular-nums" style={{ color: "var(--color-text)" }}>{d.date}</td>
                      <td className="py-2 pr-6 tabular-nums font-medium" style={{ color: "#10B981" }}>
                        {d.income > 0 ? fmtR(d.income) : "—"}
                      </td>
                      <td className="py-2 pr-6 tabular-nums font-medium" style={{ color: "#EF4444" }}>
                        {d.expense > 0 ? fmtR(d.expense) : "—"}
                      </td>
                      <td className="py-2 pr-6 tabular-nums font-medium"
                        style={{ color: day >= 0 ? "#10B981" : "#EF4444" }}>
                        {day >= 0 ? "+" : ""}{fmtR(day)}
                      </td>
                      <td className="py-2 tabular-nums"
                        style={{ color: d.balance >= 0 ? "var(--color-text)" : "#EF4444" }}>
                        {fmtR(d.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Two-column breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By park */}
        {Object.keys(byPark).length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По паркам</h3>
            <div className="space-y-2">
              {Object.entries(byPark)
                .sort((a, b) => (b[1].income - b[1].expense) - (a[1].income - a[1].expense))
                .map(([park, v]) => {
                  const net = v.income - v.expense;
                  return (
                    <div key={park} className="flex items-center justify-between text-sm">
                      <span style={{ color: "var(--color-text)" }}>{park}</span>
                      <span className="tabular-nums font-medium"
                        style={{ color: net >= 0 ? "#10B981" : "#EF4444" }}>
                        {net >= 0 ? "+" : ""}{fmtR(net)}
                        <span className="text-xs ml-1.5 font-normal" style={{ color: "var(--color-muted)" }}>
                          {fmtK(v.income)}/{fmtK(v.expense)}
                        </span>
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}

        {/* By category */}
        {topCats.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По категориям</h3>
            <div className="space-y-2">
              {topCats.map(({ cat, income, expense }) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--color-text)" }}>{cat || "Без категории"}</span>
                  <span className="tabular-nums text-xs" style={{ color: "var(--color-muted)" }}>
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
