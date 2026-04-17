"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Wrench, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useWorkshopFilters } from "@/lib/context/WorkshopFilters";
import Link from "next/link";
import { markDataFreshness } from "@/lib/settings-client";
import { apiFetch } from "@/lib/utils";
import type { WorkshopSummaryData } from "@/app/api/workshop/summary/route";
import type { WorkshopHistoryPoint } from "@/app/api/workshop/history/route";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}К`;
  return String(Math.round(v));
}
function todayMsk() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
}

// ── Delta badge ────────────────────────────────────────────────────────────
function Delta({ a, b }: { a: number; b: number }) {
  const diff = b - a;
  if (diff === 0) return <span className="text-xs tabular-nums" style={{ color: "var(--color-muted)" }}>—</span>;
  const color = diff > 0 ? "#EF4444" : "#10B981"; // more in repair = bad
  const Icon  = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums" style={{ color }}>
      <Icon className="w-3 h-3" />
      {diff > 0 ? "+" : ""}{diff}
    </span>
  );
}

// ── Динамика block ─────────────────────────────────────────────────────────
interface SnapData {
  groups:     WorkshopSummaryData["groups"];
  grandTotal: number;
  extras:     WorkshopSummaryData["extras"];
  updatedAt:  string;
}

function DynamicsBlock({ date }: { date: string }) {
  const isToday = date === todayMsk();

  const [morning,  setMorning]  = useState<SnapData | null>(null);
  const [current,  setCurrent]  = useState<SnapData | null>(null);
  const [loadingM, setLoadingM] = useState(true);
  const [loadingC, setLoadingC] = useState(true);
  const [errorM,   setErrorM]   = useState("");
  const [errorC,   setErrorC]   = useState("");

  const loadMorning = useCallback(async () => {
    setLoadingM(true); setErrorM("");
    try {
      const res  = await apiFetch(`/api/workshop/snapshot?date=${date}&type=morning`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setMorning(json.data);
    } catch (e) { setErrorM(e instanceof Error ? e.message : "Ошибка"); }
    finally { setLoadingM(false); }
  }, [date]);

  const loadCurrent = useCallback(async () => {
    setLoadingC(true); setErrorC("");
    try {
      if (isToday) {
        // Live fetch + auto-save morning if not yet saved
        const [liveRes] = await Promise.all([
          apiFetch("/api/workshop/summary", { cache: "no-store" }),
        ]);
        const liveJson = await liveRes.json();
        if (!liveJson.ok) throw new Error(liveJson.error ?? "Ошибка");
        setCurrent(liveJson.data);
        // Auto-save evening snapshot in background
        apiFetch("/api/workshop/snapshot", { method: "POST", body: JSON.stringify({ type: "evening" }) }).catch(() => {});
      } else {
        // Past day — load evening snapshot
        const res  = await apiFetch(`/api/workshop/snapshot?date=${date}&type=evening`, { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Ошибка");
        setCurrent(json.data);
      }
    } catch (e) { setErrorC(e instanceof Error ? e.message : "Ошибка"); }
    finally { setLoadingC(false); }
  }, [date, isToday]);

  // Auto-save morning snapshot when visiting today (if not already saved)
  useEffect(() => {
    if (isToday) {
      apiFetch("/api/workshop/snapshot?date=" + date + "&type=morning", { cache: "no-store" })
        .then(r => r.json())
        .then(j => {
          if (!j.data) {
            // No morning snapshot yet → save now
            apiFetch("/api/workshop/snapshot", { method: "POST", body: JSON.stringify({ type: "morning" }) }).catch(() => {});
          }
        }).catch(() => {});
    }
  }, [date, isToday]);

  useEffect(() => { void loadMorning(); }, [loadMorning]);
  useEffect(() => { void loadCurrent(); }, [loadCurrent]);

  const leftLabel  = "00:30 МСК";
  const rightLabel = isToday
    ? `Сейчас ${current ? new Date(current.updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}`
    : "23:30 МСК";

  // Build unified group list
  const groupNames = [
    ...(morning?.groups ?? []),
    ...(current?.groups ?? []),
  ].map(g => g.category).filter((v, i, a) => a.indexOf(v) === i);

  const getGroupTotal = (snap: SnapData | null, cat: string) =>
    snap?.groups.find(g => g.category === cat)?.total ?? 0;
  const getGroupItems = (snap: SnapData | null, cat: string) =>
    snap?.groups.find(g => g.category === cat)?.items ?? [];

  const allItemNames = (cat: string) => {
    const set = new Set<string>();
    (morning?.groups.find(g => g.category === cat)?.items ?? []).forEach(i => set.add(i.name));
    (current?.groups.find(g => g.category === cat)?.items ?? []).forEach(i => set.add(i.name));
    return Array.from(set);
  };

  const getItemCount = (snap: SnapData | null, cat: string, name: string) =>
    snap?.groups.find(g => g.category === cat)?.items.find(i => i.name === name)?.count ?? 0;

  const GROUP_COLORS = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"];

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Динамика за день</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {date} · сравнение начало и конец дня
          </p>
        </div>
        {isToday && (
          <button
            onClick={() => { void loadMorning(); void loadCurrent(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
            title="Обновить"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loadingM || loadingC) ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="text-xs font-semibold text-center py-1 px-2 rounded-lg"
          style={{ background: "var(--color-surface-2)", color: "#3B82F6" }}>
          {leftLabel}
        </div>
        <div className="text-xs" style={{ color: "var(--color-muted)" }}>→</div>
        <div className="text-xs font-semibold text-center py-1 px-2 rounded-lg"
          style={{ background: "var(--color-surface-2)", color: isToday ? "#EF4444" : "#8B5CF6" }}>
          {rightLabel}
        </div>
      </div>

      {/* Grand total row */}
      {(!loadingM || !loadingC) && (
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center px-2 py-2 rounded-xl"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
          <div className="text-center">
            {loadingM
              ? <div className="h-6 w-10 mx-auto rounded skeleton" />
              : <span className="text-2xl font-bold tabular-nums" style={{ color: "#3B82F6" }}>
                  {morning?.grandTotal ?? "—"}
                </span>
            }
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>итого авто</p>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            {!loadingM && !loadingC && morning && current
              ? <Delta a={morning.grandTotal} b={current.grandTotal} />
              : <Minus className="w-3 h-3" style={{ color: "var(--color-muted)" }} />
            }
          </div>
          <div className="text-center">
            {loadingC
              ? <div className="h-6 w-10 mx-auto rounded skeleton" />
              : <span className="text-2xl font-bold tabular-nums" style={{ color: isToday ? "#EF4444" : "#8B5CF6" }}>
                  {current?.grandTotal ?? "—"}
                </span>
            }
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>итого авто</p>
          </div>
        </div>
      )}

      {/* Per-group breakdown */}
      {groupNames.length > 0 && (
        <div className="space-y-3">
          {groupNames.map((cat, gi) => {
            const color = GROUP_COLORS[gi % GROUP_COLORS.length];
            const mTotal = getGroupTotal(morning, cat);
            const cTotal = getGroupTotal(current, cat);
            const items  = allItemNames(cat);

            return (
              <div key={cat} className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--color-border)" }}>
                {/* Category header */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center px-3 py-2"
                  style={{ background: "var(--color-surface-2)" }}>
                  <span className="text-sm font-bold tabular-nums text-center" style={{ color: "#3B82F6" }}>
                    {loadingM ? "…" : mTotal}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide px-2" style={{ color }}>
                    {cat}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-center"
                    style={{ color: isToday ? "#EF4444" : "#8B5CF6" }}>
                    {loadingC ? "…" : cTotal}
                    {!loadingM && !loadingC && <span className="ml-1.5 text-xs font-normal"><Delta a={mTotal} b={cTotal} /></span>}
                  </span>
                </div>

                {/* Items */}
                {items.length > 0 && (
                  <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {items.map(name => {
                      const mCount = getItemCount(morning, cat, name);
                      const cCount = getItemCount(current, cat, name);
                      return (
                        <div key={name} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center px-3 py-1.5">
                          <span className="text-sm tabular-nums text-center font-medium"
                            style={{ color: "var(--color-muted)" }}>
                            {loadingM ? "·" : mCount || "—"}
                          </span>
                          <span className="text-xs text-center truncate max-w-[120px]"
                            style={{ color: "var(--color-muted)" }}>
                            {name}
                          </span>
                          <div className="text-sm tabular-nums text-center font-medium flex items-center justify-center gap-1"
                            style={{ color: "var(--color-text)" }}>
                            {loadingC ? "·" : (cCount || "—")}
                            {!loadingM && !loadingC && mCount !== cCount && (
                              <Delta a={mCount} b={cCount} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Errors */}
      {(errorM || errorC) && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {errorM || errorC}
        </div>
      )}

      {/* No morning snapshot hint */}
      {!loadingM && !morning && !errorM && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
          <TrendingUp className="w-3.5 h-3.5" />
          Снимок 00:30 МСК ещё не сохранён.
          {isToday ? " Он сохранится автоматически при первом посещении этой страницы после 00:30." : " Данные за утро этого дня недоступны."}
        </div>
      )}
      {!loadingC && !current && !errorC && !isToday && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
          <TrendingDown className="w-3.5 h-3.5" />
          Снимок 23:30 МСК за этот день не найден.
        </div>
      )}
    </Card>
  );
}

// ── Range chart (sparkline) ────────────────────────────────────────────────
function RangeChart({ points }: { points: WorkshopHistoryPoint[] }) {
  if (points.length === 0) return (
    <p className="text-sm text-center py-6" style={{ color: "var(--color-muted)" }}>
      Нет данных за выбранный период
    </p>
  );

  const max = Math.max(...points.map(p => p.grandTotal), 1);
  const min = Math.min(...points.map(p => p.grandTotal));
  const range = max - min || 1;

  const w = 600, h = 80, pad = 8;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const pts = points.map((p, i) => ({
    x: pad + (i / Math.max(points.length - 1, 1)) * innerW,
    y: pad + (1 - (p.grandTotal - min) / range) * innerH,
    p,
  }));

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-2">
        <span style={{ color: "var(--color-muted)" }}>Авто в ремонте — динамика</span>
        <span style={{ color: "var(--color-muted)" }}>мин {min} / макс {max}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
        <polyline
          points={pts.map(({ x, y }) => `${x},${y}`).join(" ")}
          fill="none" stroke="#EF4444" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
        />
        {pts.map(({ x, y, p }) => (
          <circle key={p.date} cx={x} cy={y} r="3" fill="#EF4444" />
        ))}
      </svg>
      <div className="flex items-center justify-between text-xs mt-1" style={{ color: "var(--color-muted)" }}>
        <span>{points[0].date.slice(5)}</span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Day breakdown (groups + extras) ───────────────────────────────────────
function DayBreakdown({ data, onRefresh }: { data: WorkshopSummaryData; onRefresh?: () => void }) {
  const GROUP_COLORS = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Статус парка — сейчас в ремонте
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Обновлено: {new Date(data.updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold tabular-nums" style={{ color: "#EF4444" }}>
              {data.grandTotal}
            </span>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>авто в ремонте</span>
          </div>
          {onRefresh && (
            <button onClick={onRefresh}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.groups.map((group, gi) => {
          const color    = GROUP_COLORS[gi % GROUP_COLORS.length];
          const maxCount = Math.max(...group.items.map(i => i.count), 1);
          return (
            <div key={group.category} className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                  {group.category}
                </span>
                <span className="text-lg font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                  {group.total}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map(item => {
                  const pct = Math.round(item.count / maxCount * 100);
                  return (
                    <div key={item.name}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span style={{ color: "var(--color-muted)" }} className="truncate pr-2">{item.name}</span>
                        <span className="font-semibold flex-shrink-0" style={{ color: "var(--color-text)" }}>{item.count}</span>
                      </div>
                      <div className="h-1 rounded-full" style={{ background: "var(--color-border)" }}>
                        <div className="h-1 rounded-full transition-all"
                          style={{ width: `${Math.max(pct, 2)}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {data.extras.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {data.extras.map(e => (
            <div key={e.name}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-muted)" }}>{e.name}</span>
              <span className="font-bold" style={{ color: "var(--color-text)" }}>{e.count}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Workshop summary block ─────────────────────────────────────────────────
function WorkshopSummaryBlock() {
  const { filters } = useWorkshopFilters();
  const isRange = filters.mode === "range";
  const isToday = !isRange && filters.date === todayMsk();

  const [dayData,   setDayData]   = useState<WorkshopSummaryData | null>(null);
  const [rangeData, setRangeData] = useState<WorkshopHistoryPoint[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const loadDay = useCallback(async (date: string) => {
    setLoading(true); setError("");
    try {
      if (date === todayMsk()) {
        const res  = await apiFetch("/api/workshop/summary", { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки");
        setDayData(json.data);
      } else {
        const res  = await apiFetch(`/api/workshop/snapshot?date=${date}&type=evening`, { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки снапшота");
        setDayData(json.data);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setLoading(false); }
  }, []);

  const loadRange = useCallback(async (from: string, to: string) => {
    setLoading(true); setError("");
    try {
      const res  = await apiFetch(`/api/workshop/history?from=${from}&to=${to}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки истории");
      const pts = (json.data ?? []) as WorkshopHistoryPoint[];
      setRangeData(pts);
      if (pts.length > 0) {
        const last = pts[pts.length - 1];
        setDayData({ groups: last.groups, grandTotal: last.grandTotal, extras: last.extras, updatedAt: last.capturedAt });
      } else {
        setDayData(null);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (isRange) void loadRange(filters.dateFrom, filters.dateTo);
    else void loadDay(filters.date);
  }, [isRange, filters.date, filters.dateFrom, filters.dateTo, loadDay, loadRange]);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
      {[0, 1].map(i => <div key={i} className="h-36 rounded-xl skeleton" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
      style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
    </div>
  );

  return (
    <Card className="space-y-4">
      {isRange ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Статус парка — динамика за период
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {filters.dateFrom} — {filters.dateTo} · {rangeData.length} точек
              </p>
            </div>
            {rangeData.length > 0 && (
              <div className="flex flex-col items-end">
                <span className="text-xl font-bold tabular-nums" style={{ color: "#EF4444" }}>
                  {rangeData[rangeData.length - 1].grandTotal}
                </span>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>последний снапшот</span>
              </div>
            )}
          </div>
          <RangeChart points={rangeData} />
          {rangeData.length === 0 && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
              <TrendingUp className="w-3.5 h-3.5" />
              Данные появятся после сохранения снапшотов. Зайдите на страницу Сегодня, чтобы создать первый снимок.
            </div>
          )}
          {dayData && (
            <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-xs font-medium mb-3" style={{ color: "var(--color-muted)" }}>
                Последний снапшот ({rangeData[rangeData.length - 1]?.date ?? ""})
              </p>
              <DayBreakdown data={dayData} />
            </div>
          )}
        </>
      ) : (
        dayData
          ? <DayBreakdown data={dayData} onRefresh={isToday ? () => loadDay(filters.date) : undefined} />
          : (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                Снапшот за {filters.date} не найден
              </p>
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                Данные сохраняются при просмотре дня в реальном времени
              </p>
            </div>
          )
      )}
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function WorkshopPage() {
  const { metrics, loading, error, noSheets, filters } = useWorkshopFilters();

  useEffect(() => {
    if (metrics && !loading && !error) markDataFreshness("workshop");
  }, [metrics, loading, error]);

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  // For DynamicsBlock: use current day or last day of range
  const dynamicsDate = filters.mode === "day"
    ? filters.date
    : filters.dateTo;

  if (noSheets) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>СТО — Обзор</h1>
        <WorkshopSummaryBlock />
        <DynamicsBlock date={dynamicsDate} />
        <Card>
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <Wrench className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
            <p className="font-semibold" style={{ color: "var(--color-text)" }}>Детальная аналитика не настроена</p>
            <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
              Добавьте Google Sheets с данными по обслуживанию в Настройки → Интеграции.
              При добавлении отметьте раздел <strong>СТО</strong>.
            </p>
            <Link href="/settings/integrations"
              className="mt-1 px-4 py-2 rounded-lg text-sm font-medium text-white inline-block"
              style={{ background: "var(--color-brand)" }}>
              Настроить
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

  const { totalExpense, entries, byCategory, byPark } = metrics;
  const totalIncome = metrics.totalIncome;

  const topCategories = Object.entries(byCategory)
    .filter(([, v]) => v.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense)
    .slice(0, 8);

  const topCars = Object.entries(byPark)
    .filter(([, v]) => v.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>СТО — Обзор</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · {entries.length} записей
        </p>
      </div>

      <WorkshopSummaryBlock />
      <DynamicsBlock date={dynamicsDate} />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Затраты на обслуживание</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmtR(totalExpense)}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>расходы</p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Записей</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{entries.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>операций</p>
        </Card>
        <Card>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>Категорий</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
            {Object.keys(byCategory).length}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>видов работ</p>
          {totalIncome > 0 && (
            <p className="text-xs mt-1" style={{ color: "#10B981" }}>
              Компенсации: {fmtR(totalIncome)}
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topCategories.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По видам работ</h3>
            <div className="space-y-2.5">
              {topCategories.map(([cat, v]) => {
                const pct = totalExpense > 0 ? Math.round(v.expense / totalExpense * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: "var(--color-text)" }}>{cat || "Без категории"}</span>
                      <span className="tabular-nums font-medium" style={{ color: "#EF4444" }}>
                        {fmtR(v.expense)} <span style={{ color: "var(--color-muted)" }}>({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "#EF4444" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {topCars.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По авто / паркам</h3>
            <div className="space-y-2">
              {topCars.map(([name, v]) => {
                const net = v.expense - v.income;
                return (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--color-text)" }}>{name}</span>
                    <span className="tabular-nums font-medium" style={{ color: "#EF4444" }}>
                      {fmtR(net)}
                      {v.income > 0 && (
                        <span className="text-xs ml-1.5 font-normal" style={{ color: "#10B981" }}>
                          +{fmtK(v.income)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
