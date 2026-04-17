"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, TrendingUp, TrendingDown, Car, BarChart2,
  ChevronDown, ChevronUp, ChevronsUpDown,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParkMonth {
  cars: number | null; activeCars: number | null; utilPct: number | null;
  revenue: number | null; revenuePerCar: number | null;
  expenses: number | null; profit: number | null; profitPerCar: number | null;
}
interface ParkData { park: string; months: Record<string, ParkMonth>; }
interface TotalMonth {
  revenue: number | null; expenses: number | null; profit: number | null;
  cashflow: number | null; cars: number | null; activeCars: number | null; utilPct: number | null;
}
interface ExpenseRow { park: string; category: string; months: Record<string, number | null>; yearTotal: number | null; }
interface IncomeRow  { park: string; source: string;   months: Record<string, number | null>; yearTotal: number | null; }

interface PlanfactData {
  cashflow?: { parks: ParkData[]; totals: Record<string, TotalMonth> };
  cashflowMonths?: string[];
  expenses?: { rows: ExpenseRow[]; months: string[] };
  income?:   { rows: IncomeRow[];  months: string[] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const MONTHS_RU: Record<string, string> = {
  "янв.26": "Янв", "фев.26": "Фев", "мар.26": "Мар",
  "апр.26": "Апр", "май.26": "Май", "июн.26": "Июн",
  "июл.26": "Июл", "авг.26": "Авг", "сент.26": "Сен",
  "окт.26": "Окт", "ноя.26": "Ноя", "дек.26": "Дек",
};
const PF_MONTHS_SHORT: Record<string, string> = {
  "Январь": "Янв", "Февраль": "Фев", "Март": "Мар",
  "Апрель": "Апр", "Май": "Май", "Июнь": "Июн",
};

function fmt(n: number | null, compact = false): string {
  if (n === null) return "—";
  if (compact && Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + " млн";
  if (compact && Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + " тыс";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(0) + "%";
}

function profitColor(n: number | null): string {
  if (n === null) return "var(--color-text)";
  return n >= 0 ? "#10B981" : "#EF4444";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string;
  color?: string; icon?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-medium truncate" style={{ color: "var(--color-muted)" }}>{label}</p>
      </div>
      <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color: color ?? "var(--color-text)" }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: "var(--color-muted)" }}>{sub}</p>}
    </Card>
  );
}

// ── Month pill selector ───────────────────────────────────────────────────────
function MonthPicker({ months, active, onChange, labelMap }: {
  months: string[]; active: string; onChange: (m: string) => void;
  labelMap: Record<string, string>;
}) {
  const hasData = months.filter(m => labelMap[m]);
  return (
    <div className="flex gap-1 flex-wrap">
      {hasData.map(m => (
        <button key={m} onClick={() => onChange(m)}
          className="px-2.5 h-7 rounded-lg text-xs font-medium transition-all"
          style={{
            background: active === m ? "var(--color-brand)" : "var(--color-surface-2)",
            color: active === m ? "white" : "var(--color-muted)",
            border: active === m ? "none" : "1px solid var(--color-border)",
          }}>
          {labelMap[m] ?? m}
        </button>
      ))}
    </div>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIco({ col, sc, sd }: { col: string; sc: string | null; sd: "asc" | "desc" }) {
  if (sc !== col) return <ChevronsUpDown className="w-3 h-3 opacity-25" />;
  return sd === "asc"
    ? <ChevronUp className="w-3 h-3" style={{ color: "var(--color-brand)" }} />
    : <ChevronDown className="w-3 h-3" style={{ color: "var(--color-brand)" }} />;
}

// ── Tab: Обзор ────────────────────────────────────────────────────────────────
function TabOverview({ data }: { data: PlanfactData }) {
  const cf = data.cashflow;
  const allMonths = (data.cashflowMonths ?? []).filter(m => MONTHS_RU[m]);
  const hasData = allMonths.filter(m => cf?.totals[m]?.revenue !== null && cf?.totals[m]?.revenue !== 0);
  const [month, setMonth] = useState(hasData[hasData.length - 1] ?? allMonths[0] ?? "мар.26");

  const t = cf?.totals[month];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>Месяц:</p>
        <MonthPicker months={allMonths} active={month} onChange={setMonth} labelMap={MONTHS_RU} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Доходы" value={fmt(t?.revenue ?? null, true)}
          color="#10B981" icon={<TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: "#10B981" }} />} />
        <KpiCard label="Расходы" value={fmt(t?.expenses ?? null, true)}
          color="#EF4444" icon={<TrendingDown className="w-4 h-4 flex-shrink-0" style={{ color: "#EF4444" }} />} />
        <KpiCard
          label="Прибыль" value={fmt(t?.profit ?? null, true)}
          color={profitColor(t?.profit ?? null)}
          icon={<BarChart2 className="w-4 h-4 flex-shrink-0" style={{ color: profitColor(t?.profit ?? null) }} />}
        />
        <KpiCard label="Операц. поток" value={fmt(t?.cashflow ?? null, true)}
          color={profitColor(t?.cashflow ?? null)}
          sub={t?.cashflow !== null ? (t!.cashflow! >= 0 ? "положительный" : "отрицательный") : undefined}
        />
      </div>

      {/* Fleet KPI */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Автопарк" value={fmt(t?.cars ?? null)}
          icon={<Car className="w-4 h-4 flex-shrink-0" style={{ color: "var(--color-brand)" }} />}
          sub="всего а/м" />
        <KpiCard label="Активных а/м" value={fmt(t?.activeCars ?? null)} sub="выходили на линию" />
        <KpiCard label="% выхода" value={fmtPct(t?.utilPct ?? null)}
          color={t?.utilPct != null ? (t.utilPct >= 65 ? "#10B981" : t.utilPct >= 50 ? "#F59E0B" : "#EF4444") : undefined}
        />
      </div>

      {/* Monthly trend table */}
      {hasData.length > 1 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Динамика по месяцам</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className="px-4 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Показатель</th>
                  {hasData.map(m => (
                    <th key={m} className="px-3 py-2 text-right font-semibold" style={{ color: "var(--color-muted)" }}>
                      {MONTHS_RU[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Доходы", key: "revenue" as const, color: "#10B981" },
                  { label: "Расходы", key: "expenses" as const, color: "#EF4444" },
                  { label: "Прибыль", key: "profit" as const, dynamic: true },
                  { label: "Опер. поток", key: "cashflow" as const, dynamic: true },
                ].map(({ label, key, color, dynamic }, ri) => (
                  <tr key={key} style={{ borderBottom: "1px solid var(--color-border)", background: ri % 2 ? "var(--color-surface-2)" : "" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: "var(--color-text)" }}>{label}</td>
                    {hasData.map(m => {
                      const v = cf?.totals[m]?.[key] ?? null;
                      return (
                        <td key={m} className="px-3 py-2.5 text-right tabular-nums font-semibold"
                          style={{ color: dynamic ? profitColor(v) : (color ?? "var(--color-text)") }}>
                          {fmt(v, true)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tab: По паркам ────────────────────────────────────────────────────────────
function TabParks({ data }: { data: PlanfactData }) {
  const cf = data.cashflow;
  const allMonths = (data.cashflowMonths ?? []).filter(m => MONTHS_RU[m]);
  const hasData = allMonths.filter(m => {
    return cf?.parks.some(p => p.months[m]?.revenue);
  });
  const [month, setMonth] = useState(hasData[hasData.length - 1] ?? allMonths[0] ?? "мар.26");
  const [sortCol, setSortCol] = useState<string | null>("profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const parks = cf?.parks ?? [];

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const sorted = [...parks].sort((a, b) => {
    const av = a.months[month]?.[sortCol as keyof ParkMonth] as number ?? -Infinity;
    const bv = b.months[month]?.[sortCol as keyof ParkMonth] as number ?? -Infinity;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const cols: { key: keyof ParkMonth; label: string; fmt: (v: number | null) => string; dynamic?: boolean }[] = [
    { key: "cars",         label: "А/м",      fmt: v => fmt(v) },
    { key: "utilPct",      label: "Выход %",   fmt: fmtPct },
    { key: "revenue",      label: "Доходы",    fmt: v => fmt(v, true), },
    { key: "expenses",     label: "Расходы",   fmt: v => fmt(v, true) },
    { key: "profit",       label: "Прибыль",   fmt: v => fmt(v, true), dynamic: true },
    { key: "profitPerCar", label: "Приб/авт",  fmt: v => fmt(v, true), dynamic: true },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>Месяц:</p>
        <MonthPicker months={allMonths} active={month} onChange={setMonth} labelMap={MONTHS_RU} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
                <th className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Парк</th>
                {cols.map(c => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}
                    className="px-3 py-2.5 text-right font-semibold cursor-pointer select-none whitespace-nowrap"
                    style={{ color: "var(--color-muted)" }}>
                    <div className="flex items-center justify-end gap-1">
                      {c.label}<SortIco col={c.key} sc={sortCol} sd={sortDir} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, ri) => {
                const m = p.months[month] ?? {} as ParkMonth;
                return (
                  <tr key={p.park} style={{ borderBottom: "1px solid var(--color-border)", background: ri % 2 ? "var(--color-surface-2)" : "" }}>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: "var(--color-text)" }}>{p.park}</td>
                    {cols.map(c => {
                      const v = m[c.key] as number | null ?? null;
                      return (
                        <td key={c.key} className="px-3 py-2.5 text-right tabular-nums"
                          style={{ color: c.dynamic ? profitColor(v) : "var(--color-text)", fontWeight: c.dynamic ? 600 : 400 }}>
                          {c.fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px]"
          style={{ color: "var(--color-muted)", background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
          {MONTHS_RU[month]} 2026 · {parks.length} отделов · данные из Кэш-фло факт
        </div>
      </Card>
    </div>
  );
}

// ── Tab: Расходы ──────────────────────────────────────────────────────────────
function TabExpenses({ data }: { data: PlanfactData }) {
  const exp = data.expenses;
  const months = exp?.months ?? [];
  const [month, setMonth] = useState(months.filter(m => PF_MONTHS_SHORT[m]).slice(-1)[0] ?? months[0] ?? "");
  const [park, setPark] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = exp?.rows ?? [];
  const parks = Array.from(new Set(rows.map(r => r.park))).sort();
  const visMonths = months.filter(m => PF_MONTHS_SHORT[m]);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const filtered = rows.filter(r => !park || r.park === park);
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    const av = sortCol === "yearTotal" ? (a.yearTotal ?? 0) : (a.months[sortCol] ?? 0);
    const bv = sortCol === "yearTotal" ? (b.yearTotal ?? 0) : (b.months[sortCol] ?? 0);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={park} onChange={e => setPark(e.target.value)}
          className="h-7 px-2 rounded-lg text-xs outline-none"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          <option value="">Все парки</option>
          {parks.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <p className="text-xs ml-auto" style={{ color: "var(--color-muted)" }}>{filtered.length} строк</p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed" style={{ minWidth: 600 }}>
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "24%" }} />
              {visMonths.map(m => <col key={m} style={{ width: "12%" }} />)}
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Парк</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Статья</th>
                {visMonths.map(m => (
                  <th key={m} onClick={() => toggleSort(m)}
                    className="px-2 py-2.5 text-right font-semibold cursor-pointer select-none"
                    style={{ color: "var(--color-muted)" }}>
                    <div className="flex items-center justify-end gap-0.5">
                      {PF_MONTHS_SHORT[m] ?? m}<SortIco col={m} sc={sortCol} sd={sortDir} />
                    </div>
                  </th>
                ))}
                <th onClick={() => toggleSort("yearTotal")}
                  className="px-2 py-2.5 text-right font-semibold cursor-pointer select-none"
                  style={{ color: "var(--color-muted)" }}>
                  <div className="flex items-center justify-end gap-0.5">
                    Итого<SortIco col="yearTotal" sc={sortCol} sd={sortDir} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, ri) => (
                <tr key={`${row.park}-${row.category}-${ri}`}
                  style={{ borderBottom: "1px solid var(--color-border)", background: ri % 2 ? "var(--color-surface-2)" : "" }}>
                  <td className="px-3 py-2 truncate" title={row.park} style={{ color: "var(--color-muted)" }}>{row.park}</td>
                  <td className="px-3 py-2 truncate" title={row.category} style={{ color: "var(--color-text)" }}>{row.category}</td>
                  {visMonths.map(m => (
                    <td key={m} className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                      {row.months[m] ? fmt(row.months[m], true) : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: "#EF4444" }}>
                    {fmt(row.yearTotal, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px]"
          style={{ color: "var(--color-muted)", background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
          ПланФакт — Расходы · {sorted.length} статей
        </div>
      </Card>
    </div>
  );
}

// ── Tab: Доходы ───────────────────────────────────────────────────────────────
function TabIncome({ data }: { data: PlanfactData }) {
  const inc = data.income;
  const months = inc?.months ?? [];
  const [park, setPark] = useState("");
  const [sortCol, setSortCol] = useState<string | null>("yearTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = inc?.rows ?? [];
  const parks = Array.from(new Set(rows.map(r => r.park))).sort();
  const visMonths = months.filter(m => PF_MONTHS_SHORT[m]);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  const filtered = rows.filter(r => !park || r.park === park);
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    const av = sortCol === "yearTotal" ? (a.yearTotal ?? 0) : (a.months[sortCol] ?? 0);
    const bv = sortCol === "yearTotal" ? (b.yearTotal ?? 0) : (b.months[sortCol] ?? 0);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  // Park totals for summary cards
  const parkTotals = parks.map(p => {
    const pr = rows.filter(r => r.park === p);
    const total = pr.reduce((s, r) => s + (r.yearTotal ?? 0), 0);
    const jan = pr.reduce((s, r) => s + (r.months["Январь"] ?? 0), 0);
    const feb = pr.reduce((s, r) => s + (r.months["Февраль"] ?? 0), 0);
    const mar = pr.reduce((s, r) => s + (r.months["Март"] ?? 0), 0);
    return { park: p, total, jan, feb, mar };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      {/* Park summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {parkTotals.map(p => (
          <div key={p.park} className="cursor-pointer" onClick={() => setPark(park === p.park ? "" : p.park)}>
            <Card className={park === p.park ? "ring-1 ring-amber-400" : ""}>
              <p className="text-xs font-semibold truncate mb-1"
                style={{ color: park === p.park ? "var(--color-brand)" : "var(--color-text)" }}>{p.park}</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: "#10B981" }}>{fmt(p.total, true)}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--color-muted)" }}>за период (итого)</p>
            </Card>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={park} onChange={e => setPark(e.target.value)}
          className="h-7 px-2 rounded-lg text-xs outline-none"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          <option value="">Все парки</option>
          {parks.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {park && <button onClick={() => setPark("")}
          className="h-7 px-2 rounded-lg text-xs" style={{ color: "#EF4444", background: "rgba(239,68,68,0.08)" }}>
          Сбросить
        </button>}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed" style={{ minWidth: 600 }}>
            <colgroup>
              <col style={{ width: "18%" }} />
              <col style={{ width: "28%" }} />
              {visMonths.map(m => <col key={m} style={{ width: "12%" }} />)}
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Парк</th>
                <th className="px-3 py-2.5 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Источник</th>
                {visMonths.map(m => (
                  <th key={m} onClick={() => toggleSort(m)}
                    className="px-2 py-2.5 text-right font-semibold cursor-pointer select-none"
                    style={{ color: "var(--color-muted)" }}>
                    <div className="flex items-center justify-end gap-0.5">
                      {PF_MONTHS_SHORT[m] ?? m}<SortIco col={m} sc={sortCol} sd={sortDir} />
                    </div>
                  </th>
                ))}
                <th onClick={() => toggleSort("yearTotal")}
                  className="px-2 py-2.5 text-right font-semibold cursor-pointer select-none"
                  style={{ color: "var(--color-muted)" }}>
                  <div className="flex items-center justify-end gap-0.5">
                    Итого<SortIco col="yearTotal" sc={sortCol} sd={sortDir} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, ri) => (
                <tr key={`${row.park}-${row.source}-${ri}`}
                  style={{ borderBottom: "1px solid var(--color-border)", background: ri % 2 ? "var(--color-surface-2)" : "" }}>
                  <td className="px-3 py-2 truncate" title={row.park} style={{ color: "var(--color-muted)" }}>{row.park}</td>
                  <td className="px-3 py-2 truncate" title={row.source} style={{ color: "var(--color-text)" }}>{row.source}</td>
                  {visMonths.map(m => (
                    <td key={m} className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--color-text)" }}>
                      {row.months[m] ? fmt(row.months[m], true) : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: "#10B981" }}>
                    {fmt(row.yearTotal, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[11px]"
          style={{ color: "var(--color-muted)", background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
          ПланФакт — Доходы · {sorted.length} строк
        </div>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Tab = "overview" | "parks" | "expenses" | "income";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview",  label: "Обзор"      },
  { key: "parks",     label: "По паркам"  },
  { key: "expenses",  label: "Расходы"    },
  { key: "income",    label: "Доходы"     },
];

export default function PlanfactPage() {
  const [tab, setTab]       = useState<Tab>("overview");
  const [data, setData]     = useState<PlanfactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/finance/planfact?tab=all");
      const text = await res.text();
      let json: { ok: boolean; data?: PlanfactData; error?: string };
      try { json = JSON.parse(text); }
      catch { throw new Error(`Ответ сервера (${res.status}): ${text.slice(0, 120)}`); }
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setData(json.data!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>ПланФакт</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Финансовая аналитика · данные из Google Sheets
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl p-1 gap-0.5"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 h-7 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tab === t.key ? "var(--color-brand)" : "transparent",
              color: tab === t.key ? "white" : "var(--color-muted)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "var(--color-muted)" }} />
          <span className="ml-3 text-sm" style={{ color: "var(--color-muted)" }}>Загрузка данных из Google Sheets...</span>
        </div>
      )}

      {error && !loading && (
        <Card>
          <p className="text-sm font-medium" style={{ color: "#EF4444" }}>{error}</p>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          {tab === "overview"  && <TabOverview  data={data} />}
          {tab === "parks"     && <TabParks     data={data} />}
          {tab === "expenses"  && <TabExpenses  data={data} />}
          {tab === "income"    && <TabIncome    data={data} />}
        </>
      )}
    </div>
  );
}
