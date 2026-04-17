"use client";

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Check,
  Download, Copy, Search,
} from "lucide-react";
import { HireFiltersProvider, useHireFilters, dateHelpers } from "@/lib/context/HireFilters";
import type { HireFilterState, DateMode } from "@/lib/context/HireFilters";
import { TEAM_NAMES, AVTOPARK_IDS, KNOWN_PARKS } from "@/lib/config/hire";

const KNOWN_SOURCES = [
  "Авито", "AvitoJob", "HH.ru", "Яндекс Директ", "Google Реклама",
  "Яндекс Гараж", "Входящий звонок", "WhatsApp", "Сайт (прямой)",
  "ВКонтакте", "Обзвон по базе", "По рекомендации", "Соц. сети",
  "Шёл мимо", "От друга", "CRM-форма", "Email", "2GIS", "Другое",
];

const MANAGER_LIST = Array.from(AVTOPARK_IDS).map((id) => ({
  id,
  name: TEAM_NAMES[id] ?? id,
}));

// ── Multi-select dropdown ──────────────────────────────────────────────────

function MultiDropdown({
  label, options, selected, onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  }

  const displayLabel = selected.length === 0
    ? label
    : selected.length === 1
    ? selected[0]
    : `${selected[0]} +${selected.length - 1}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
        style={{
          background: selected.length ? "var(--color-brand-soft)" : "var(--color-surface-2)",
          color: selected.length ? "var(--color-brand)" : "var(--color-muted)",
          border: selected.length ? "1px solid var(--color-brand)" : "1px solid var(--color-border)",
        }}
      >
        {displayLabel}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full left-0 mt-1 z-40 rounded-xl shadow-xl overflow-hidden min-w-[180px] max-h-64 overflow-y-auto"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div className="p-1">
              <button
                onClick={() => onChange([])}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-surface-2"
                style={{ color: selected.length === 0 ? "var(--color-brand)" : "var(--color-muted)" }}
              >
                {selected.length === 0 && <Check className="w-3 h-3" />}
                <span className={selected.length === 0 ? "font-semibold" : ""}>Все</span>
              </button>
              {options.map((opt) => {
                const on = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggle(opt)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-surface-2"
                    style={{ color: on ? "var(--color-brand)" : "var(--color-text)" }}
                  >
                    <span className="w-3 h-3 flex items-center justify-center">
                      {on && <Check className="w-3 h-3" />}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────

function HireFilterBar() {
  const { filters, setFilters, loading, refresh, metrics } = useHireFilters();
  const [copied, setCopied] = useState(false);
  const { todayMsk, dateOffset, firstDayOfMonth } = dateHelpers;
  const today = todayMsk();

  function patchFilters(patch: Partial<HireFilterState>) {
    setFilters({ ...filters, ...patch });
  }

  function setMode(mode: DateMode) {
    patchFilters({ mode });
  }

  const isToday = filters.date === today;

  const quickBtns = [
    { label: "Сегодня", action: () => patchFilters({ mode: "day", date: today }),
      isActive: filters.mode === "day" && filters.date === today },
    { label: "Вчера",   action: () => patchFilters({ mode: "day", date: dateOffset(today, -1) }),
      isActive: filters.mode === "day" && filters.date === dateOffset(today, -1) },
    { label: "Неделя",  action: () => patchFilters({ mode: "range", dateFrom: dateOffset(today, -6), dateTo: today }),
      isActive: filters.mode === "range" && filters.dateFrom === dateOffset(today, -6) && filters.dateTo === today },
    { label: "Месяц",   action: () => patchFilters({ mode: "range", dateFrom: firstDayOfMonth(), dateTo: today }),
      isActive: filters.mode === "range" && filters.dateFrom === firstDayOfMonth() && filters.dateTo === today },
  ];

  function buildTextReport(): string {
    if (!metrics) return "";
    const from = filters.mode === "day" ? filters.date : filters.dateFrom;
    const to   = filters.mode === "day" ? filters.date : filters.dateTo;
    const period = from === to ? from : `${from} — ${to}`;

    const srcLines = Object.entries(metrics.sourceBreakdown)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([src, s]) => `   - ${src} = ${s.total}`)
      .join("\n");

    const rejLines = Object.entries(metrics.rejectBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([code, cnt]) => `   - ${code} = ${cnt}`)
      .join("\n");

    const mgrLines = metrics.managerStats
      .map((m) => `   - ${m.name.split(" ").slice(0, 2).join(" ")}: откл=${m.total}, релев=${m.relevant}, собес=${m.sobes}, 1см=${m.dFirst}`)
      .join("\n");

    return [
      `Отчёт найма`,
      `Период = ${period}`,
      ``,
      `1. Всего откликов = ${metrics.total}`,
      srcLines,
      ``,
      `2. Релевантные = ${metrics.relevant}`,
      `3. Нерелевантные = ${metrics.irrelevant}`,
      rejLines,
      `4. Не отвечают = ${metrics.noAns}`,
      `5. Думает = ${metrics.dumaet}`,
      `6. Собеседование = ${metrics.sobes}`,
      `7. 🚗 Первая смена = ${metrics.dFirst}`,
      ``,
      `По менеджерам:`,
      mgrLines,
    ].join("\n");
  }

  function copyReport() {
    const text = buildTextReport();
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportCSV() {
    if (!metrics) return;
    const rows: string[][] = [["Менеджер", "Отклики", "Релев.", "Нерел.", "Собес.", "Думает", "Не отв.", "1я смена", "Конв.%"]];
    for (const m of metrics.managerStats) {
      const conv = m.relevant > 0 ? Math.round(m.dFirst / m.relevant * 100) : 0;
      rows.push([m.name, String(m.total), String(m.relevant), String(m.irrelevant),
        String(m.sobes), String(m.dumaet), String(m.noAns), String(m.dFirst), `${conv}%`]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const from = filters.mode === "day" ? filters.date : filters.dateFrom;
    a.download = `hire_${from}.csv`;
    a.click();
  }

  return (
    <div
      className="rounded-xl mb-4 p-3"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Row 1: mode tabs + date pickers + actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Day / Range tabs */}
        <div
          className="flex rounded-lg p-0.5 flex-shrink-0"
          style={{ background: "var(--color-surface-2)" }}
        >
          {(["day", "range"] as DateMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 h-7 rounded-md text-xs font-medium transition-all"
              style={{
                background: filters.mode === m ? "var(--color-brand)" : "transparent",
                color: filters.mode === m ? "white" : "var(--color-muted)",
              }}
            >
              {m === "day" ? "День" : "Диапазон"}
            </button>
          ))}
        </div>

        {/* Date input(s) */}
        {filters.mode === "day" ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => patchFilters({ date: dateOffset(filters.date, -1) })}
              className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="date"
              value={filters.date}
              max={today}
              onChange={(e) => e.target.value && patchFilters({ date: e.target.value })}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            />
            <button
              onClick={() => !isToday && patchFilters({ date: dateOffset(filters.date, 1) })}
              disabled={isToday}
              className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30"
              style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo}
              onChange={(e) => e.target.value && patchFilters({ dateFrom: e.target.value })}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            />
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>—</span>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom}
              max={today}
              onChange={(e) => e.target.value && patchFilters({ dateTo: e.target.value })}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            />
          </div>
        )}

        {/* Quick buttons */}
        <div className="flex gap-1 flex-wrap">
          {quickBtns.map((btn) => (
            <button
              key={btn.label}
              onClick={btn.action}
              className="h-7 px-2.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: btn.isActive ? "var(--color-brand)" : "var(--color-surface-2)",
                       color: btn.isActive ? "white" : "var(--color-muted)" }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-auto flex-shrink-0">
          <button
            onClick={copyReport}
            disabled={!metrics}
            title="Копировать отчёт"
            className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30 transition-colors"
            style={{ background: copied ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                     color: copied ? "var(--color-brand)" : "var(--color-muted)" }}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={exportCSV}
            disabled={!metrics}
            title="Экспорт CSV"
            className="w-7 h-7 flex items-center justify-center rounded-lg disabled:opacity-30"
            style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            title="Обновить данные"
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            style={{
              background: loading ? "var(--color-brand-soft)" : "var(--color-surface-2)",
              color: loading ? "var(--color-brand)" : "var(--color-muted)",
              border: loading ? "1px solid var(--color-brand)" : "1px solid transparent",
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Row 2: Filters + Search */}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {/* Manager */}
        <select
          value={filters.manager}
          onChange={(e) => patchFilters({ manager: e.target.value })}
          className="h-8 px-3 rounded-lg text-xs outline-none"
          style={{
            background: filters.manager ? "var(--color-brand-soft)" : "var(--color-surface-2)",
            border: filters.manager ? "1px solid var(--color-brand)" : "1px solid var(--color-border)",
            color: filters.manager ? "var(--color-brand)" : "var(--color-muted)",
          }}
        >
          <option value="">Все менеджеры</option>
          {MANAGER_LIST.map((m) => (
            <option key={m.id} value={m.id}>{m.name.split(" ").slice(0, 2).join(" ")}</option>
          ))}
        </select>

        {/* Sources multi-select */}
        <MultiDropdown
          label="Все источники"
          options={KNOWN_SOURCES}
          selected={filters.sources}
          onChange={(v) => patchFilters({ sources: v })}
        />

        {/* Parks multi-select */}
        <MultiDropdown
          label="Все парки"
          options={KNOWN_PARKS}
          selected={filters.parks}
          onChange={(v) => patchFilters({ parks: v })}
        />

        {/* Search */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-muted)" }} />
          <input
            type="text"
            placeholder="Поиск по имени..."
            value={filters.search}
            onChange={(e) => patchFilters({ search: e.target.value })}
            className="flex-1 h-8 px-2 rounded-lg text-xs outline-none"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          />
        </div>

        {/* Clear filters */}
        {(filters.manager || filters.sources.length || filters.parks.length || filters.search) && (
          <button
            onClick={() => patchFilters({ manager: "", sources: [], parks: [], search: "" })}
            className="h-8 px-3 rounded-lg text-xs font-medium transition-all"
            style={{ background: "rgba(239,68,68,0.08)", color: "var(--color-danger)" }}
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}

// ── Layout wrapper ─────────────────────────────────────────────────────────

function HireInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showFilters = !pathname?.includes("/hire/settings") && !pathname?.includes("/hire/damir");

  return (
    <div>
      {showFilters && <HireFilterBar />}
      {children}
    </div>
  );
}

export default function HireLayout({ children }: { children: React.ReactNode }) {
  return (
    <HireFiltersProvider>
      <HireInner>{children}</HireInner>
    </HireFiltersProvider>
  );
}
