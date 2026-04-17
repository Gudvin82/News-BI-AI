"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useFinanceFilters } from "@/lib/context/FinanceFilters";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }

export default function BudgetPage() {
  const { metrics, loading, error, filters } = useFinanceFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded skeleton" />
        <div className="h-80 rounded-xl skeleton" />
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

  const { byCategory, totalIncome, totalExpense } = metrics;

  // Split into income categories and expense categories
  const incomeCategories = Object.entries(byCategory)
    .filter(([, v]) => v.income > v.expense)
    .map(([cat, v]) => ({ cat, amount: v.income }))
    .sort((a, b) => b.amount - a.amount);

  const expenseCategories = Object.entries(byCategory)
    .filter(([, v]) => v.expense >= v.income)
    .map(([cat, v]) => ({ cat, amount: v.expense }))
    .sort((a, b) => b.amount - a.amount);

  const maxIncome = Math.max(...incomeCategories.map((c) => c.amount), 1);
  const maxExpense = Math.max(...expenseCategories.map((c) => c.amount), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Бюджет</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · Структура доходов и расходов
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Income categories */}
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "#10B981" }}>
            Доходы — {fmtR(totalIncome)}
          </h2>
          {incomeCategories.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--color-muted)" }}>Нет данных</p>
          ) : (
            <div className="space-y-3">
              {incomeCategories.map(({ cat, amount }) => {
                const share = amount / maxIncome;
                const pct = totalIncome > 0 ? Math.round(amount / totalIncome * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="truncate flex-1" style={{ color: "var(--color-text)" }}>
                        {cat || "Без категории"}
                      </span>
                      <span className="flex-shrink-0 ml-2 tabular-nums font-medium"
                        style={{ color: "#10B981" }}>
                        {fmtR(amount)}
                        <span className="ml-1" style={{ color: "var(--color-muted)" }}>{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                      <div className="h-2 rounded-full"
                        style={{ width: `${share * 100}%`, background: "#10B981" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Expense categories */}
        <Card>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "#EF4444" }}>
            Расходы — {fmtR(totalExpense)}
          </h2>
          {expenseCategories.length === 0 ? (
            <p className="text-sm py-4" style={{ color: "var(--color-muted)" }}>Нет данных</p>
          ) : (
            <div className="space-y-3">
              {expenseCategories.map(({ cat, amount }) => {
                const share = amount / maxExpense;
                const pct = totalExpense > 0 ? Math.round(amount / totalExpense * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="truncate flex-1" style={{ color: "var(--color-text)" }}>
                        {cat || "Без категории"}
                      </span>
                      <span className="flex-shrink-0 ml-2 tabular-nums font-medium"
                        style={{ color: "#EF4444" }}>
                        {fmtR(amount)}
                        <span className="ml-1" style={{ color: "var(--color-muted)" }}>{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                      <div className="h-2 rounded-full"
                        style={{ width: `${share * 100}%`, background: "#EF4444" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
