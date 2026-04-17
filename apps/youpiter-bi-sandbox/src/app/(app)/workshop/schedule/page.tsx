"use client";

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useWorkshopFilters } from "@/lib/context/WorkshopFilters";
import type { SheetEntry } from "@/lib/connectors/gsheets";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }

// Group entries by date for a calendar-style view
function groupByDate(entries: SheetEntry[]) {
  const map: Record<string, SheetEntry[]> = {};
  for (const e of entries) {
    if (!map[e.date]) map[e.date] = [];
    map[e.date].push(e);
  }
  return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
}

export default function WorkshopSchedulePage() {
  const { metrics, loading, error, filters } = useWorkshopFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (loading && !metrics) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-56 rounded skeleton" />
        {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
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

  const { entries } = metrics;
  const byDate = groupByDate(entries as SheetEntry[]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Расписание СТО</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · {entries.length} операций по датам
        </p>
      </div>

      {byDate.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>Нет записей за период</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {byDate.map(([date, items]) => (
            <Card key={date} className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{date}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="default">{items.length} оп.</Badge>
                  <span className="text-xs tabular-nums font-medium" style={{ color: "#EF4444" }}>
                    {fmtR(items.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0))}
                  </span>
                </div>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {items.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {e.category || "Без категории"}
                        </span>
                        {e.park && (
                          <span className="text-xs px-1.5 py-0.5 rounded"
                            style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
                            {e.park}
                          </span>
                        )}
                      </div>
                      {e.comment && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>
                          {e.comment}
                        </p>
                      )}
                    </div>
                    <span className="text-sm tabular-nums font-medium flex-shrink-0"
                      style={{ color: e.type === "income" ? "#10B981" : "#EF4444" }}>
                      {e.type === "income" ? "+" : "−"}{fmtR(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
