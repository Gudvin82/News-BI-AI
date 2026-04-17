"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, ChevronDown, ChevronUp, ChevronsUpDown,
  GraduationCap, MapPin, TrendingUp, TrendingDown, Search,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/utils";

// ── Sheet tabs ────────────────────────────────────────────────────────────────
const SHEETS = [
  { key: "0",          label: "Все",           monthFrom: null,        monthTo: null        },
  { key: "1150803438", label: "Октябрь 2025",  monthFrom: "2025-10-01", monthTo: "2025-10-31" },
  { key: "21189194",   label: "Ноябрь 2025",   monthFrom: "2025-11-01", monthTo: "2025-11-30" },
  { key: "1112752394", label: "Декабрь 2025",  monthFrom: "2025-12-01", monthTo: "2025-12-31" },
  { key: "939053051",  label: "Январь 2026",   monthFrom: "2026-01-01", monthTo: "2026-01-31" },
  { key: "1673268885", label: "Февраль 2026",  monthFrom: "2026-02-01", monthTo: "2026-02-28" },
  { key: "1270214432", label: "Март 2026",     monthFrom: "2026-03-01", monthTo: "2026-03-31" },
  { key: "245688127",  label: "Апрель 2026",   monthFrom: "2026-04-01", monthTo: "2026-04-30" },
];

// ── Date helpers ──────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}
function offsetDate(base: string, days: number) {
  const d = new Date(base); d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}
function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Number parser (handles "9 662,00" / "9662.00" / "-") ─────────────────────
function parseNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const clean = raw.replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function fmtNum(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }: { col: number; sortCol: number | null; sortDir: "asc" | "desc" }) {
  if (sortCol !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3" style={{ color: "var(--color-brand)" }} />
    : <ChevronDown className="w-3 h-3" style={{ color: "var(--color-brand)" }} />;
}

// ── Compact columns shown in main table ──────────────────────────────────────
// Indices: 0=ФИО, 2=АТП, 4=Дата 1 смены, 5=Кол-во смен до, 8=Ср.накат до, 10=Дата обуч., 11/12=накат после
const COMPACT_COLS = [0, 2, 5, 8, 10, 11];
const COMPACT_LABELS = ["ФИО", "Парк", "Смен до", "Ср.накат до", "Дата обуч.", "Накат после"];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DamirPage() {
  // Month tab
  const [activeSheet, setActiveSheet] = useState(SHEETS[0].key);

  // Date filter — null means "show all data from the sheet"
  type DateMode = "day" | "range";
  const [dateMode, setDateMode]   = useState<DateMode>("range");
  const [date, setDate]           = useState(todayISO());
  const [dateFrom, setDateFrom]   = useState(todayISO());
  const [dateTo, setDateTo]       = useState(todayISO());
  // filterActive: false = load all rows from sheet, true = apply date filter
  const [filterActive, setFilterActive] = useState(false);

  // Data
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rows, setRows]           = useState<string[][]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Table state
  const [sortCol, setSortCol]     = useState<number | null>(null);
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("asc");
  const [search, setSearch]       = useState("");
  const [parkFilter, setParkFilter] = useState("");
  const [expanded, setExpanded]   = useState<Set<number>>(new Set());

  const today = todayISO();

  const from = dateMode === "day" ? date : dateFrom;
  const to   = dateMode === "day" ? date : dateTo;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    try {
      const params = new URLSearchParams({ gid: activeSheet });
      // Only apply date filter when explicitly activated by user
      if (filterActive) {
        params.set("dateFrom", from);
        params.set("dateTo", to);
      }
      const res = await apiFetch(`/api/hire/damir?${params}`);
      const text = await res.text();
      let json: { ok: boolean; data?: { headers: string[]; rows: string[][] }; error?: string };
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Ответ сервера (${res.status}): ${text.slice(0, 120)}`);
      }
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setHeaders(json.data!.headers as string[]);
      setRows(json.data!.rows as string[][]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [activeSheet, from, to, filterActive]);

  useEffect(() => { void load(); }, [load]);

  // ── Derived column indices ───────────────────────────────────────────────
  const colIdx = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

  const idxATP    = Math.max(colIdx("АТП"), colIdx("Парк"), 2);
  const idxAvgBef = colIdx("Ср. накат До обуч");
  const idxTrainDate = colIdx("Дата обучения");
  // "Средний. накат после обуч." (newer sheets) or col 11 which may be "Макс. накат"
  const idxAvgAft = (() => {
    const i = colIdx("Средний. накат после обуч");
    if (i >= 0) return i;
    // fallback: col after "Дата обучения"
    return idxTrainDate >= 0 ? idxTrainDate + 1 : 11;
  })();

  // ── KPI stats ────────────────────────────────────────────────────────────
  const totalRows      = rows.length;
  const trainedCount   = rows.filter((r) => r[idxTrainDate]?.trim()).length;
  const uniqueParks    = new Set(rows.map((r) => r[idxATP]?.trim()).filter(Boolean)).size;

  const avgBefore = (() => {
    const nums = rows.map((r) => parseNum(r[idxAvgBef])).filter((n): n is number => n !== null && n > 0);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  })();

  const avgAfter = (() => {
    const nums = rows.map((r) => parseNum(r[idxAvgAft])).filter((n): n is number => n !== null && n > 0);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  })();

  const diff = avgBefore !== null && avgAfter !== null ? avgAfter - avgBefore : null;

  // ── Parks for filter dropdown ────────────────────────────────────────────
  const allParks = Array.from(new Set(rows.map((r) => r[idxATP]?.trim()).filter(Boolean))).sort();

  // ── Filtered rows ────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    if (parkFilter && r[idxATP]?.trim() !== parkFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.some((c) => c.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // ── Sorted rows ──────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    if (sortCol === null) return 0;
    const av = a[sortCol] ?? "", bv = b[sortCol] ?? "";
    const an = parseNum(av), bn = parseNum(bv);
    const cmp = an !== null && bn !== null ? an - bn : av.localeCompare(bv, "ru");
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(col: number) {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); }
    } else {
      setSortCol(col); setSortDir("asc");
    }
  }

  function toggleExpand(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  // ── Build compact col mapping ─────────────────────────────────────────────
  // Map COMPACT_COLS indices to real header indices (fallback to position)
  const compactMap: number[] = COMPACT_COLS.map((pos, i) => {
    if (i === 1) return idxATP;           // Park
    if (i === 3) return idxAvgBef >= 0 ? idxAvgBef : pos;  // Avg before
    if (i === 5) return idxAvgAft;        // Avg after
    return pos;
  });

  // ── Quick date buttons ────────────────────────────────────────────────────
  const quickBtns = [
    { label: "Сегодня", action: () => { setDateMode("day"); setDate(today); setFilterActive(true); },
      active: filterActive && dateMode === "day" && date === today },
    { label: "Вчера",   action: () => { setDateMode("day"); setDate(offsetDate(today, -1)); setFilterActive(true); },
      active: filterActive && dateMode === "day" && date === offsetDate(today, -1) },
    { label: "Неделя",  action: () => { setDateMode("range"); setDateFrom(offsetDate(today, -6)); setDateTo(today); setFilterActive(true); },
      active: filterActive && dateMode === "range" && dateFrom === offsetDate(today, -6) && dateTo === today },
    { label: "Месяц",   action: () => { setDateMode("range"); setDateFrom(firstOfMonth()); setDateTo(today); setFilterActive(true); },
      active: filterActive && dateMode === "range" && dateFrom === firstOfMonth() && dateTo === today },
  ];

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Обучение водителей</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
          Результаты обучений по месяцам · фильтр по дате обучения
        </p>
      </div>

      {/* Month tabs */}
      <div className="flex flex-wrap gap-1">
        {SHEETS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setActiveSheet(s.key);
              // Reset date filter when switching tabs
              setFilterActive(false);
            }}
            className="px-3 h-7 rounded-lg text-xs font-medium transition-all"
            style={{
              background: activeSheet === s.key ? "var(--color-brand)" : "var(--color-surface-2)",
              color: activeSheet === s.key ? "white" : "var(--color-muted)",
              border: activeSheet === s.key ? "none" : "1px solid var(--color-border)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Date filter bar */}
      <div className="rounded-xl p-3" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode tabs */}
          <div className="flex rounded-lg p-0.5 flex-shrink-0" style={{ background: "var(--color-surface-2)" }}>
            {(["day", "range"] as DateMode[]).map((m) => (
              <button key={m} onClick={() => setDateMode(m)}
                className="px-3 h-7 rounded-md text-xs font-medium transition-all"
                style={{ background: dateMode === m ? "var(--color-brand)" : "transparent",
                         color: dateMode === m ? "white" : "var(--color-muted)" }}>
                {m === "day" ? "День" : "Диапазон"}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          {dateMode === "range" ? (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input type="date" value={dateFrom} max={dateTo}
                onChange={(e) => { if (e.target.value) { setDateFrom(e.target.value); setFilterActive(true); } }}
                className="h-7 px-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>—</span>
              <input type="date" value={dateTo} min={dateFrom} max={today}
                onChange={(e) => { if (e.target.value) { setDateTo(e.target.value); setFilterActive(true); } }}
                className="h-7 px-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </div>
          ) : (
            <input type="date" value={date} max={today}
              onChange={(e) => { if (e.target.value) { setDate(e.target.value); setFilterActive(true); } }}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          )}

          {/* Quick buttons */}
          <div className="flex gap-1">
            {quickBtns.map((b) => (
              <button key={b.label} onClick={b.action}
                className="h-7 px-2.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: b.active ? "var(--color-brand)" : "var(--color-surface-2)",
                         color: b.active ? "white" : "var(--color-muted)" }}>
                {b.label}
              </button>
            ))}
          </div>

          {/* Reset filter */}
          {filterActive && (
            <button onClick={() => setFilterActive(false)}
              className="h-7 px-2.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
              Сбросить
            </button>
          )}

          {/* Refresh */}
          <button onClick={load} disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg ml-auto"
            style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Всего записей</p>
          </div>
          <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
            {loading ? "—" : totalRows}
          </p>
          {!loading && trainedCount > 0 && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-muted)" }}>
              обучено: <span style={{ color: "#10B981", fontWeight: 600 }}>{trainedCount}</span>
            </p>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4" style={{ color: "#6366F1" }} />
            <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Парки</p>
          </div>
          <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
            {loading ? "—" : uniqueParks}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4" style={{ color: "#F59E0B" }} />
            <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Ср. накат до обуч.</p>
          </div>
          <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
            {loading ? "—" : fmtNum(avgBefore)}
          </p>
          {avgBefore !== null && <p className="text-[11px] mt-0.5" style={{ color: "var(--color-muted)" }}>руб./смена</p>}
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4" style={{ color: "#10B981" }} />
            <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Ср. накат после обуч.</p>
          </div>
          <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
            {loading ? "—" : fmtNum(avgAfter)}
          </p>
          {diff !== null && (
            <p className="text-[11px] mt-0.5 font-semibold" style={{ color: diff >= 0 ? "#10B981" : "#EF4444" }}>
              {diff >= 0 ? "+" : ""}{fmtNum(diff)} к среднему до
            </p>
          )}
        </Card>
      </div>

      {/* Error */}
      {error && (
        <Card>
          <p className="text-sm" style={{ color: "#EF4444" }}>{error}</p>
        </Card>
      )}

      {/* Table */}
      <div>
        {/* Table controls */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-muted)" }} />
            <input
              type="text"
              placeholder="Поиск по ФИО, парку..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 h-7 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
          </div>
          {allParks.length > 0 && (
            <select value={parkFilter} onChange={(e) => setParkFilter(e.target.value)}
              className="h-7 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              <option value="">Все парки</option>
              {allParks.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <p className="text-xs ml-auto" style={{ color: "var(--color-muted)" }}>
            {filtered.length} из {rows.length}
          </p>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs" style={{ minWidth: 700 }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: 28 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
                  <th className="px-2 py-2.5 text-left font-semibold" style={{ color: "var(--color-muted)" }}>№</th>
                  {COMPACT_LABELS.map((label, i) => {
                    const col = compactMap[i];
                    return (
                      <th key={i}
                        onClick={() => toggleSort(col)}
                        className="px-2 py-2.5 text-left font-semibold cursor-pointer select-none"
                        style={{ color: "var(--color-muted)" }}>
                        <div className="flex items-center gap-1">
                          <span className="truncate">{label}</span>
                          <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                        </div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                      Загрузка...
                    </td>
                  </tr>
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm" style={{ color: "var(--color-muted)" }}>
                      Нет данных за выбранный период
                    </td>
                  </tr>
                ) : (
                  sorted.map((row, ri) => {
                    const origIdx = rows.indexOf(row);
                    const isExp = expanded.has(origIdx);
                    const trainDate = row[idxTrainDate]?.trim();
                    return [
                      <tr key={`row-${origIdx}`}
                        onClick={() => toggleExpand(origIdx)}
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid var(--color-border)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td className="px-2 py-2 tabular-nums" style={{ color: "var(--color-muted)" }}>{ri + 1}</td>
                        {compactMap.map((col, ci) => {
                          const val = row[col] ?? "";
                          // Color "Накат после" green/red vs before
                          let style: React.CSSProperties = { color: "var(--color-text)" };
                          if (ci === 5) {
                            const after = parseNum(val), before = parseNum(row[idxAvgBef >= 0 ? idxAvgBef : compactMap[3]]);
                            if (after !== null && before !== null) {
                              style = { color: after >= before ? "#10B981" : "#EF4444", fontWeight: 600 };
                            }
                          }
                          return (
                            <td key={ci} className="px-2 py-2 truncate" title={val} style={style}>
                              {val || <span style={{ color: "var(--color-muted)", opacity: 0.4 }}>—</span>}
                            </td>
                          );
                        })}
                        <td className="px-1 py-2 text-right">
                          {isExp
                            ? <ChevronUp className="w-3.5 h-3.5 ml-auto" style={{ color: "var(--color-brand)" }} />
                            : <ChevronDown className="w-3.5 h-3.5 ml-auto" style={{ color: "var(--color-muted)", opacity: 0.4 }} />}
                        </td>
                      </tr>,
                      isExp && (
                        <tr key={`exp-${origIdx}`} style={{ background: "var(--color-surface-2)" }}>
                          <td colSpan={8} className="px-4 py-3">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                              {headers.map((h, hi) => {
                                const val = row[hi] ?? "";
                                if (!h.trim()) return null;
                                return (
                                  <div key={hi} className="flex flex-col gap-0.5">
                                    <span className="text-[10px] font-medium truncate" style={{ color: "var(--color-muted)" }}>{h}</span>
                                    <span className="text-xs break-words" style={{ color: val ? "var(--color-text)" : "var(--color-muted)", opacity: val ? 1 : 0.4 }}>
                                      {val || "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ),
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {!loading && sorted.length > 0 && (
            <div className="px-4 py-2 text-[11px]"
              style={{ color: "var(--color-muted)", background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
              {SHEETS.find((s) => s.key === activeSheet)?.label} · {sorted.length} записей · фильтр по дате обучения
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
