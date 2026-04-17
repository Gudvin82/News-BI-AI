"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, AlertTriangle, Search, X, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/utils";
import type { WorkshopCarsData } from "@/app/api/workshop/cars/route";

// ── Column indices (A–L) ─────────────────────────────────────────────────────
const COL = { NUM: 0, PLATE: 1, MODEL: 2, PARK: 3, DATE: 4, LOCATION: 5, COST: 6, STATUS: 7, PARTS: 8, PARTS_DT: 9, COMMENT: 10, NORM: 11 };

function statusStyle(status: string): { bg: string; color: string } {
  const s = status.toUpperCase();
  if (s.includes("ОЖИДАН"))                       return { bg: "rgba(245,158,11,0.12)", color: "#F59E0B" };
  if (s.includes("РЕМОНТ") || s.includes("В РАБОТЕ")) return { bg: "rgba(59,130,246,0.12)",  color: "#3B82F6" };
  if (s.includes("ГОТОВ"))                         return { bg: "rgba(16,185,129,0.12)",  color: "#10B981" };
  if (s.includes("СТОИТ") || s.includes("ПРОСТОЙ"))  return { bg: "rgba(107,114,128,0.12)", color: "#9CA3AF" };
  if (s.includes("ПРОДАН") || s.includes("СПИСАН"))  return { bg: "rgba(239,68,68,0.1)",    color: "#EF4444" };
  return { bg: "var(--color-surface-2)", color: "var(--color-muted)" };
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function WorkshopCarsPage() {
  const [data, setData]       = useState<WorkshopCarsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [parkFilter, setParkFilter]     = useState("");
  const [expandedRow, setExpandedRow]   = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null); // null = original sheet order
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null);
    try {
      const res  = await apiFetch("/api/workshop/cars", { signal: abortRef.current.signal, cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки");
      setData(json.data as WorkshopCarsData);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); return () => { abortRef.current?.abort(); }; }, [load]);

  const headers  = data?.headers  ?? [];
  const allRows  = data?.rows     ?? [];
  const sections = data?.sections ?? [];

  const statuses = Array.from(new Set(allRows.map((r) => r[COL.STATUS]).filter(Boolean))).sort();
  const parks    = Array.from(new Set(allRows.map((r) => r[COL.PARK]).filter(Boolean))).sort();

  const filtered = allRows
    .map((row, i) => ({ row, section: sections[i] ?? "", origIdx: i }))
    .filter(({ row }) => {
      if (statusFilter && row[COL.STATUS] !== statusFilter) return false;
      if (parkFilter   && row[COL.PARK]   !== parkFilter)   return false;
      if (search) {
        const q = search.toLowerCase();
        if (![COL.PLATE, COL.MODEL, COL.PARK, COL.STATUS, COL.LOCATION, COL.COMMENT]
          .some((ci) => (row[ci] ?? "").toLowerCase().includes(q))) return false;
      }
      return true;
    });

  const sorted = sortCol === null
    ? filtered  // original sheet order
    : [...filtered].sort((a, b) => {
        const va = a.row[sortCol] ?? "", vb = b.row[sortCol] ?? "";
        const na = parseFloat(va.replace(/[^\d.-]/g, ""));
        const nb = parseFloat(vb.replace(/[^\d.-]/g, ""));
        const bothNum = !isNaN(na) && !isNaN(nb) && va.trim() !== "" && vb.trim() !== "";
        const cmp = bothNum ? na - nb : va.localeCompare(vb, "ru");
        return sortDir === "asc" ? cmp : -cmp;
      });

  function toggleSort(col: number) {
    if (sortCol === col) {
      if (sortDir === "desc") { setSortCol(null); } // third click = reset to original
      else setSortDir("desc");
    } else {
      setSortCol(col); setSortDir("asc");
    }
    setExpandedRow(null);
  }

  function clearFilters() { setSearch(""); setStatusFilter(""); setParkFilter(""); }
  const hasFilters = search || statusFilter || parkFilter;

  const COMPACT_COLS = [COL.NUM, COL.PLATE, COL.MODEL, COL.PARK, COL.DATE, COL.STATUS];

  // Build table rows as flat array — avoids React key/fragment issues
  function buildTableRows(): React.ReactNode[] {
    if (sorted.length === 0) {
      return [
        <tr key="empty">
          <td colSpan={7} className="py-12 text-center text-sm" style={{ color: "var(--color-muted)" }}>
            {hasFilters ? "Ничего не найдено — сбросьте фильтры" : "Нет данных"}
          </td>
        </tr>
      ];
    }

    const result: React.ReactNode[] = [];

    sorted.forEach(({ row, section, origIdx }, ri) => {
      const isExpanded  = expandedRow === origIdx;
      const status      = row[COL.STATUS] ?? "";
      const st          = statusStyle(status);
      const prevSection = ri > 0 ? sorted[ri - 1].section : null;

      // Section divider
      if (section && section !== prevSection) {
        result.push(
          <tr key={`sec-${origIdx}`}>
            <td colSpan={7} className="px-3 py-1.5 text-[11px] font-semibold"
              style={{
                background: "rgba(245,158,11,0.07)",
                color: "var(--color-brand)",
                borderBottom: "1px solid var(--color-border)",
                borderTop: ri > 0 ? "2px solid var(--color-border)" : undefined,
              }}>
              {section}
            </td>
          </tr>
        );
      }

      // Main compact row
      result.push(
        <tr
          key={`row-${origIdx}`}
          onClick={() => setExpandedRow(isExpanded ? null : origIdx)}
          className="cursor-pointer transition-colors hover:brightness-95"
          style={{
            borderBottom: "1px solid var(--color-border)",
            background: isExpanded ? "rgba(245,158,11,0.05)" : ri % 2 !== 0 ? "var(--color-surface-2)" : "transparent",
          }}
        >
          <td className="py-2.5 px-3 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
            {row[COL.NUM] || "—"}
          </td>
          <td className="py-2.5 px-3 text-xs font-semibold" style={{ color: "var(--color-text)" }}>
            <span className="block truncate">{row[COL.PLATE] || "—"}</span>
          </td>
          <td className="py-2.5 px-3 text-xs" style={{ color: "var(--color-text)" }}>
            <span className="block truncate">{row[COL.MODEL] || "—"}</span>
          </td>
          <td className="py-2.5 px-3 text-xs" style={{ color: "var(--color-muted)" }}>
            <span className="block truncate">{row[COL.PARK] || "—"}</span>
          </td>
          <td className="py-2.5 px-3 tabular-nums text-xs" style={{ color: "var(--color-muted)" }}>
            {row[COL.DATE] || "—"}
          </td>
          <td className="py-2.5 px-3 text-xs">
            {status ? (
              <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-medium max-w-full truncate"
                style={{ background: st.bg, color: st.color }}>
                {status}
              </span>
            ) : <span style={{ color: "var(--color-muted)" }}>—</span>}
          </td>
          <td className="py-2.5 px-2 text-center">
            {isExpanded
              ? <ChevronUp className="w-3.5 h-3.5 mx-auto" style={{ color: "var(--color-brand)" }} />
              : <ChevronDown className="w-3.5 h-3.5 mx-auto" style={{ color: "var(--color-muted)" }} />}
          </td>
        </tr>
      );

      // Expanded detail row
      if (isExpanded) {
        result.push(
          <tr key={`exp-${origIdx}`}
            style={{ borderBottom: "2px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.03)" }}>
            <td colSpan={7} className="px-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {headers.map((label, ci) => {
                  if (!label) return null;
                  const val    = row[ci] ?? "";
                  const isLong = val.length > 100;
                  return (
                    <div key={ci} className={isLong ? "sm:col-span-2" : ""}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                        style={{ color: "var(--color-muted)" }}>
                        {label}
                      </p>
                      {isLong ? (
                        <div className="text-xs rounded-lg p-2.5 max-h-36 overflow-y-auto whitespace-pre-wrap"
                          style={{ background: "var(--color-surface-2)", color: "var(--color-text)", border: "1px solid var(--color-border)", lineHeight: "1.6" }}>
                          {val}
                        </div>
                      ) : (
                        <p className="text-xs" style={{ color: val ? "var(--color-text)" : "var(--color-muted)" }}>
                          {val || "—"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </td>
          </tr>
        );
      }
    });

    return result;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Авто в СТО</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {loading ? "Загрузка…" : error ? "Ошибка" : `${sorted.length} из ${allRows.length} авто`}
            {data?.updatedAt && !loading && !error && <span className="ml-2">· {fmtTime(data.updatedAt)}</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <Card>
          <div className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: "#EF4444" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        </Card>
      )}

      {/* Filter bar */}
      {!error && (
        <div className="rounded-xl p-3 flex flex-wrap gap-2 items-center"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--color-muted)" }} />
            <input type="text" placeholder="Гос.номер, модель, парк…" value={search}
              onChange={(e) => { setSearch(e.target.value); setExpandedRow(null); }}
              className="h-7 pl-7 pr-3 rounded-lg text-xs outline-none w-44"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          </div>

          {statuses.length > 0 && (
            <select value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setExpandedRow(null); }}
              className="h-7 px-2 rounded-lg text-xs outline-none max-w-[180px]"
              style={{
                background: statusFilter ? "rgba(245,158,11,0.08)" : "var(--color-surface-2)",
                border: `1px solid ${statusFilter ? "var(--color-brand)" : "var(--color-border)"}`,
                color: statusFilter ? "var(--color-brand)" : "var(--color-muted)",
              }}>
              <option value="">Статус: все</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {parks.length > 0 && (
            <select value={parkFilter}
              onChange={(e) => { setParkFilter(e.target.value); setExpandedRow(null); }}
              className="h-7 px-2 rounded-lg text-xs outline-none max-w-[160px]"
              style={{
                background: parkFilter ? "rgba(245,158,11,0.08)" : "var(--color-surface-2)",
                border: `1px solid ${parkFilter ? "var(--color-brand)" : "var(--color-border)"}`,
                color: parkFilter ? "var(--color-brand)" : "var(--color-muted)",
              }}>
              <option value="">Парк: все</option>
              {parks.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          {hasFilters && (
            <button onClick={clearFilters}
              className="h-7 px-2.5 flex items-center gap-1 rounded-lg text-xs ml-auto"
              style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
              <X className="w-3 h-3" /> Сбросить
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!error && (
        <Card className="p-0 overflow-hidden">
          {loading && !data ? (
            <div className="animate-pulse">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="h-11 skeleton" style={{ borderBottom: "1px solid var(--color-border)" }} />
              ))}
            </div>
          ) : headers.length === 0 ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--color-muted)" }}>
              Нет данных — проверьте источник Google Sheets
            </div>
          ) : (
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: "42px" }} />   {/* № */}
                <col style={{ width: "13%" }} />      {/* Гос.номер */}
                <col style={{ width: "12%" }} />      {/* Модель */}
                <col style={{ width: "12%" }} />      {/* Парк */}
                <col style={{ width: "120px" }} />    {/* Дата поломки — фикс, не обрезается */}
                <col />                               {/* Статус */}
                <col style={{ width: "30px" }} />     {/* chevron */}
              </colgroup>
              <thead>
                <tr style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
                  {COMPACT_COLS.map((ci) => {
                    const active = sortCol === ci;
                    return (
                      <th key={ci} onClick={() => toggleSort(ci)}
                        className="text-left py-2.5 px-3 font-semibold text-xs cursor-pointer select-none"
                        style={{ color: active ? "var(--color-brand)" : "var(--color-muted)" }}>
                        <span className="flex items-center gap-1">
                          <span>{headers[ci] || "—"}</span>
                          {active
                            ? (sortDir === "asc"
                                ? <ChevronUp className="w-3 h-3 flex-shrink-0" />
                                : <ChevronDown className="w-3 h-3 flex-shrink-0" />)
                            : <ChevronsUpDown className="w-3 h-3 flex-shrink-0 opacity-25" />}
                        </span>
                      </th>
                    );
                  })}
                  <th style={{ width: "32px" }} />
                </tr>
              </thead>
              <tbody>
                {buildTableRows()}
              </tbody>
            </table>
          )}
          {!loading && !error && sorted.length > 0 && (
            <div className="px-4 py-2 text-[11px] border-t"
              style={{ color: "var(--color-muted)", background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}>
              {sorted.length} из {allRows.length} · нажмите строку чтобы раскрыть все поля
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
