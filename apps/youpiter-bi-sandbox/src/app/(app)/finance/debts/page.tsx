"use client";

import { AlertTriangle, BadgeAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useFinanceFilters } from "@/lib/context/FinanceFilters";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }

// Keywords that suggest a debt/loan entry
const DEBT_KEYWORDS = [
  "долг", "займ", "заём", "кредит", "задолж",
  "debt", "loan", "credit", "receivable",
];

function isDebtEntry(category: string, comment: string) {
  const hay = `${category} ${comment}`.toLowerCase();
  return DEBT_KEYWORDS.some((kw) => hay.includes(kw));
}

export default function DebtsPage() {
  const { metrics, loading, error, filters } = useFinanceFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-40 rounded skeleton" />
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

  const debtEntries = metrics.entries.filter((e) => isDebtEntry(e.category, e.comment));
  const totalDebt = debtEntries.reduce((s, e) => s + (e.type === "expense" ? e.amount : -e.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Долги и займы</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · Записи по ключевым словам: долг, займ, кредит
        </p>
      </div>

      {/* Summary */}
      {debtEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Записей</p>
            <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{debtEntries.length}</p>
          </Card>
          <Card>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Сумма</p>
            <p className="text-2xl font-bold tabular-nums"
              style={{ color: totalDebt >= 0 ? "#EF4444" : "#10B981" }}>
              {fmtR(Math.abs(totalDebt))}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {totalDebt >= 0 ? "чистые расходы" : "чистые поступления"}
            </p>
          </Card>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Дата", "Категория", "Сумма", "Тип", "Парк", "Комментарий"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debtEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center" style={{ color: "var(--color-muted)" }}>
                    <BadgeAlert className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Записей о долгах не найдено</p>
                    <p className="text-xs mt-1 max-w-xs mx-auto">
                      Добавьте в таблицу строки с категорией или комментарием, содержащим слова:
                      долг, займ, кредит, задолженность
                    </p>
                  </td>
                </tr>
              ) : (
                debtEntries
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                        {e.date}
                      </td>
                      <td className="py-2.5 px-4" style={{ color: "var(--color-text)" }}>
                        {e.category || "—"}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums font-medium"
                        style={{ color: e.type === "income" ? "#10B981" : "#EF4444" }}>
                        {e.type === "income" ? "+" : "−"}{fmtR(e.amount)}
                      </td>
                      <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                        {e.type === "income" ? "Приход" : e.type === "expense" ? "Расход" : "?"}
                      </td>
                      <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                        {e.park || "—"}
                      </td>
                      <td className="py-2.5 px-4 max-w-[200px] truncate"
                        style={{ color: "var(--color-muted)" }}
                        title={e.comment}>
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
