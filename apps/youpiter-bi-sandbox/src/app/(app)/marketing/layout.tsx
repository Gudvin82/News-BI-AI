"use client";

import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { MarketingFiltersProvider, useMarketingFilters, mktDateHelpers } from "@/lib/context/MarketingFilters";
import type { MarketingFilterState, DateMode } from "@/lib/context/MarketingFilters";

function MktFilterBar() {
  const { filters, setFilters, loading, refresh, campaigns } = useMarketingFilters();
  const { todayMsk, dateOffset, firstDayOfMonth } = mktDateHelpers;
  const today = todayMsk();

  function patch(p: Partial<MarketingFilterState>) { setFilters({ ...filters, ...p }); }

  const quickBtns = [
    { label: "Сегодня", action: () => patch({ mode: "day", date: today }),
      isActive: filters.mode === "day" && filters.date === today },
    { label: "Вчера",   action: () => patch({ mode: "day", date: dateOffset(today, -1) }),
      isActive: filters.mode === "day" && filters.date === dateOffset(today, -1) },
    { label: "Неделя",  action: () => patch({ mode: "range", dateFrom: dateOffset(today, -6), dateTo: today }),
      isActive: filters.mode === "range" && filters.dateFrom === dateOffset(today, -6) && filters.dateTo === today },
    { label: "Месяц",   action: () => patch({ mode: "range", dateFrom: firstDayOfMonth(), dateTo: today }),
      isActive: filters.mode === "range" && filters.dateFrom === firstDayOfMonth() && filters.dateTo === today },
  ];

  return (
    <div className="rounded-xl mb-4 p-3" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Mode tabs */}
        <div className="flex rounded-lg p-0.5 flex-shrink-0" style={{ background: "var(--color-surface-2)" }}>
          {(["day", "range"] as DateMode[]).map((m) => (
            <button key={m} onClick={() => patch({ mode: m })}
              className="px-3 h-7 rounded-md text-xs font-medium transition-all"
              style={{ background: filters.mode === m ? "var(--color-brand)" : "transparent",
                       color: filters.mode === m ? "white" : "var(--color-muted)" }}>
              {m === "day" ? "День" : "Диапазон"}
            </button>
          ))}
        </div>

        {filters.mode === "range" ? (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input type="date" value={filters.dateFrom} max={filters.dateTo}
              onChange={(e) => e.target.value && patch({ dateFrom: e.target.value })}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>—</span>
            <input type="date" value={filters.dateTo} min={filters.dateFrom} max={today}
              onChange={(e) => e.target.value && patch({ dateTo: e.target.value })}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          </div>
        ) : (
          <input type="date" value={filters.date} max={today}
            onChange={(e) => e.target.value && patch({ date: e.target.value })}
            className="h-7 px-2 rounded-lg text-xs outline-none"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
        )}

        <div className="flex gap-1">
          {quickBtns.map((b) => (
            <button key={b.label} onClick={b.action}
              className="h-7 px-2.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: b.isActive ? "var(--color-brand)" : "var(--color-surface-2)",
                       color: b.isActive ? "white" : "var(--color-muted)" }}>
              {b.label}
            </button>
          ))}
        </div>

        {campaigns.length > 0 && (
          <select value={filters.campaignId} onChange={(e) => patch({ campaignId: e.target.value })}
            className="h-8 px-3 rounded-lg text-xs outline-none"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
            <option value="">Все кампании</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <button onClick={refresh} disabled={loading}
          className="w-7 h-7 flex items-center justify-center rounded-lg ml-auto"
          style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}

function MktInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showFilters =
    !pathname?.includes("/marketing/analytics") &&
    !pathname?.includes("/marketing/ratings") &&
    !pathname?.includes("/marketing/hire-bot");
  return <div>{showFilters && <MktFilterBar />}{children}</div>;
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingFiltersProvider><MktInner>{children}</MktInner></MarketingFiltersProvider>;
}
