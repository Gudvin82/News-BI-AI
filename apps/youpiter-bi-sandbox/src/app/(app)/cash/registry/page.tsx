"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useCashFilters } from "@/lib/context/CashFilters";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }

export default function CashRegistryPage() {
  const { metrics, loading, error, filters } = useCashFilters();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | "income" | "expense">("");

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-56 rounded skeleton" />
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

  const allEntries = [...metrics.entries].sort((a, b) => b.date.localeCompare(a.date));

  const filtered = allEntries.filter((e) => {
    if (typeFilter && e.type !== typeFilter) return false;
    if (search) {
      const hay = `${e.category} ${e.comment} ${e.park}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totalIncome  = filtered.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const totalExpense = filtered.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Реестр операций</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {dateLabel} · показано {filtered.length} из {allEntries.length}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type toggle */}
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--color-surface-2)" }}>
            {([["", "Все"], ["income", "Приход"], ["expense", "Расход"]] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setTypeFilter(v)}
                className="px-3 h-7 rounded-md text-xs font-medium transition-all"
                style={{
                  background: typeFilter === v ? "var(--color-brand)" : "transparent",
                  color: typeFilter === v ? "white" : "var(--color-muted)",
                }}>
                {lbl}
              </button>
            ))}
          </div>
          {/* Search */}
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
      </div>

      {/* Summary row */}
      {filtered.length > 0 && (
        <div className="flex gap-4 flex-wrap text-sm">
          <span style={{ color: "#10B981" }}>
            Приход: <strong className="tabular-nums">{fmtR(totalIncome)}</strong>
          </span>
          <span style={{ color: "#EF4444" }}>
            Расход: <strong className="tabular-nums">{fmtR(totalExpense)}</strong>
          </span>
          <span style={{ color: (totalIncome - totalExpense) >= 0 ? "var(--color-text)" : "#EF4444" }}>
            Итог: <strong className="tabular-nums">{fmtR(totalIncome - totalExpense)}</strong>
          </span>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Дата", "Тип", "Категория", "Сумма", "Парк", "Источник", "Комментарий"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm"
                    style={{ color: "var(--color-muted)" }}>
                    {search || typeFilter ? "Ничего не найдено" : "Нет операций за период"}
                  </td>
                </tr>
              ) : (
                filtered.map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                      {e.date}
                    </td>
                    <td className="py-2.5 px-4">
                      {e.type === "income"
                        ? <Badge variant="success">Приход</Badge>
                        : e.type === "expense"
                        ? <Badge variant="danger">Расход</Badge>
                        : <Badge variant="default">—</Badge>}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-text)" }}>
                      {e.category || "—"}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums font-medium"
                      style={{ color: e.type === "income" ? "#10B981" : "#EF4444" }}>
                      {e.type === "income" ? "+" : e.type === "expense" ? "−" : ""}{fmtR(e.amount)}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                      {e.park || "—"}
                    </td>
                    <td className="py-2.5 px-4 text-xs" style={{ color: "var(--color-muted)" }}>
                      {e._sourceName || "—"}
                    </td>
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
