"use client";

import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/utils";
import { DTP_STAGES, parseDtpTitle } from "@/lib/config/dtp";
import { markDataFreshness } from "@/lib/settings-client";
import {
  ShieldAlert, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Banknote, Calendar, Car, List, ArrowRight,
  CalendarDays, Clock,
} from "lucide-react";
import Link from "next/link";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";

// ── Date helpers ──────────────────────────────────────────────────────────────
type Preset = "all" | "today" | "yesterday" | "week" | "month" | "custom";

function toISO(d: Date) { return format(d, "yyyy-MM-dd"); }

function presetDates(p: Preset): { from: string; to: string } | null {
  const now = new Date();
  if (p === "today")     return { from: toISO(now), to: toISO(now) };
  if (p === "yesterday") { const y = subDays(now,1); return { from: toISO(y), to: toISO(y) }; }
  if (p === "week")      return { from: toISO(startOfWeek(now,{weekStartsOn:1})), to: toISO(now) };
  if (p === "month")     return { from: toISO(startOfMonth(now)), to: toISO(now) };
  return null;
}

const LABELS: Record<Preset, string> = {
  all: "Всё время", today: "Сегодня", yesterday: "Вчера",
  week: "Неделя",   month: "Месяц",   custom: "Период",
};

// ── Stage groups ──────────────────────────────────────────────────────────────
const GROUPS = [
  {
    key: "register", label: "Регистрация",
    color: "#6366F1", bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.2)",
    ids: ["DT1050_20:UC_IM4KKN","DT1050_20:NEW"],
  },
  {
    key: "assess", label: "Оценка",
    color: "#0EA5E9", bg: "rgba(14,165,233,0.06)", border: "rgba(14,165,233,0.2)",
    ids: ["DT1050_20:PREPARATION","DT1050_20:CLIENT","DT1050_20:UC_G28IPD","DT1050_20:UC_872IOR"],
  },
  {
    key: "resolve", label: "Урегулирование",
    color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.2)",
    ids: ["DT1050_20:UC_WUGKXZ","DT1050_20:UC_3373WQ","DT1050_20:UC_933TIW","DT1050_20:UC_ND8CR0"],
  },
  {
    key: "close", label: "Завершение",
    color: "#10B981", bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.2)",
    ids: ["DT1050_20:UC_0XNHIJ","DT1050_20:UC_7GEBUG","DT1050_20:UC_OUXL84","DT1050_20:SUCCESS","DT1050_20:FAIL"],
  },
] as const;

const STAGE_MAP = Object.fromEntries(DTP_STAGES.map((s) => [s.id, s]));

// ── Types ─────────────────────────────────────────────────────────────────────
interface RecentItem {
  id: number; title: string; stageId: string; stageName: string;
  stageColor: string; stageGroup: string; createdTime: string; opportunity: number;
}
interface SummaryData {
  total: number; open: number; won: number; lost: number;
  thisMonth: number; totalDamage: number;
  byStage: Record<string, number>;
  byStageAmount: Record<string, number>;
  recent: RecentItem[];
  meta: { source: string; updatedAt: string };
}

function fmt(n: number) { return n.toLocaleString("ru-RU"); }
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"}); }
  catch { return iso?.slice(0,10) ?? ""; }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DtpPage() {
  // Date range stored as plain strings — no objects, no URL
  const [from, setFrom] = useState("");
  const [to,   setTo]   = useState("");
  // Refs so the effect always reads the latest values
  const fromRef = useRef("");
  const toRef   = useRef("");

  // Integer counter — incrementing it ALWAYS triggers the effect
  const [loadKey, setLoadKey] = useState(0);

  const [preset, setPreset]   = useState<Preset>("all");
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => toISO(new Date()));
  const [customTo,   setCustomTo]   = useState(() => toISO(new Date()));

  const [data, setData]           = useState<SummaryData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  // ── Helper: update refs + state + trigger fetch ───────────────────────────
  function triggerLoad(newFrom: string, newTo: string) {
    fromRef.current = newFrom;
    toRef.current   = newTo;
    setFrom(newFrom);
    setTo(newTo);
    setLoadKey((k) => k + 1); // guaranteed to change → effect runs
  }

  // ── Preset buttons ────────────────────────────────────────────────────────
  function handlePreset(p: Preset) {
    setPreset(p);
    if (p === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const r = presetDates(p);
    triggerLoad(r?.from ?? "", r?.to ?? "");
  }

  function handleApplyCustom() {
    setShowCustom(false);
    triggerLoad(customFrom, customTo);
  }

  // ── Fetch on loadKey change ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const f = fromRef.current;
    const t = toRef.current;
    const params = new URLSearchParams();
    if (f) params.set("from", f);
    if (t) params.set("to",   t);
    const url = `/api/dtp/summary${params.toString() ? "?" + params.toString() : ""}`;

    apiFetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки");
        setData(json.data);
        markDataFreshness("dtp");
        setUpdatedAt(new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [loadKey]); // integer — always a new value ✓

  // ── Skeletons ─────────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-lg skeleton" />
        <div className="h-10 w-full rounded-xl skeleton" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_,i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
        {[...Array(4)].map((_,i) => <div key={i} className="h-32 rounded-xl skeleton" />)}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--color-danger)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Ошибка загрузки</p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--color-muted)" }}>{error}</p>
          <button onClick={() => triggerLoad(from, to)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--color-brand)" }}>Повторить</button>
        </div>
      </div>
    );
  }

  const periodLabel = !from ? "за всё время"
    : preset === "custom" ? `${from} — ${to}`
    : LABELS[preset].toLowerCase();

  // List link passes current date range as params
  const listHref = from ? `/dtp/list?from=${from}&to=${to}` : "/dtp/list";

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(239,68,68,0.12)" }}>
            <ShieldAlert className="w-5 h-5" style={{ color: "#EF4444" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>ДТП — Обзор</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              {data ? `${data.total} дел` : "—"} {periodLabel}
              {updatedAt ? ` · обновлено ${updatedAt}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Date preset bar */}
          <div className="flex items-center gap-1 p-1 rounded-xl"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="relative flex items-center">
              <CalendarDays className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                style={{ color: "var(--color-muted)" }} />
              <input
                type="date"
                value={preset === "custom" ? customFrom : ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  setPreset("custom");
                  setShowCustom(false);
                  setCustomFrom(value);
                  setCustomTo(value);
                  triggerLoad(value, value);
                }}
                className="h-8 pl-8 pr-2.5 rounded-lg text-xs outline-none"
                style={{
                  width: "134px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
                aria-label="Выбрать конкретную дату"
              />
            </div>
            {(["all","today","yesterday","week","month","custom"] as const).map((p) => (
              <button key={p} onClick={() => handlePreset(p)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: preset === p ? "var(--color-brand)" : "transparent",
                  color:      preset === p ? "#fff" : "var(--color-muted)",
                }}>
                {LABELS[p]}
              </button>
            ))}
          </div>

          <Badge variant="success">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-amber-400" : "bg-green-400 animate-pulse"}`} />
              {loading ? "Загрузка…" : "Онлайн"}
            </span>
          </Badge>

          <Link href={listHref}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-surface-2)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <List className="w-3.5 h-3.5" />
            Все дела
          </Link>

          <button onClick={() => triggerLoad(from, to)} disabled={loading}
            className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
            style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Custom date inputs ─────────────────────────────────────────────── */}
      {showCustom && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl flex-wrap"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Выберите период:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: "var(--color-muted)" }}>С</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 px-2.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: "var(--color-muted)" }}>По</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 px-2.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
          </div>
          <button onClick={handleApplyCustom}
            className="h-8 px-4 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: "var(--color-brand)" }}>
            Применить
          </button>
          {from && (
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              Период: {from} — {to}
            </span>
          )}
        </div>
      )}

      {/* ── Metric cards ─────────────────────────────────────────────────────── */}
      {data && (
        <>
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity duration-200 ${loading ? "opacity-40" : "opacity-100"}`}>
            {[
              { label: "Всего дел",
                value: fmt(data.total),
                sub: !from ? `${data.thisMonth} за текущий месяц` : `за ${periodLabel}`,
                icon: <ShieldAlert className="w-5 h-5" />, bg: "rgba(239,68,68,0.1)",  color: "#EF4444" },
              { label: "В работе",
                value: fmt(data.open),
                sub: `${data.total ? Math.round(data.open/data.total*100) : 0}% от всех`,
                icon: <Clock className="w-5 h-5" />,       bg: "rgba(245,158,11,0.1)", color: "#F59E0B" },
              { label: "Закрыто успешно",
                value: fmt(data.won),
                sub: `Провалов: ${data.lost}`,
                icon: <CheckCircle2 className="w-5 h-5" />,bg: "rgba(16,185,129,0.1)", color: "#10B981" },
              { label: "Сумма ущерба",
                value: data.totalDamage > 0 ? `₽ ${fmt(data.totalDamage)}` : "—",
                sub: `По ${fmt(data.total)} делам`,
                icon: <Banknote className="w-5 h-5" />,    bg: "rgba(99,102,241,0.1)", color: "#6366F1" },
            ].map((m) => (
              <Card key={m.label}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs mb-1 truncate" style={{ color: "var(--color-muted)" }}>{m.label}</p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{m.value}</p>
                    <p className="text-xs mt-1 truncate" style={{ color: "var(--color-muted)" }}>{m.sub}</p>
                  </div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: m.bg, color: m.color }}>{m.icon}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* ── Kanban groups ─────────────────────────────────────────────────── */}
          <div className={`space-y-4 transition-opacity duration-200 ${loading ? "opacity-40" : "opacity-100"}`}>
            {GROUPS.map((group) => {
              const groupTotal = group.ids.reduce((s, id) => s + (data.byStage[id] ?? 0), 0);

              return (
                <div key={group.key} className="rounded-xl p-4"
                  style={{ background: group.bg, border: `1px solid ${group.border}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
                      <span className="text-sm font-semibold" style={{ color: group.color }}>{group.label}</span>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: group.color + "20", color: group.color }}>
                      {groupTotal} дел
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {group.ids.map((stageId) => {
                      const stage = STAGE_MAP[stageId];
                      if (!stage) return null;
                      const count = data.byStage[stageId] ?? 0;
                      const amount = data.byStageAmount[stageId] ?? 0;
                      const pct   = data.total > 0 ? Math.round(count / data.total * 100) : 0;

                      // Link to list with this stage + current date range
                      const stageParams = new URLSearchParams();
                      stageParams.set("stage", stageId);
                      if (from) { stageParams.set("from", from); stageParams.set("to", to); }
                      const href = `/dtp/list?${stageParams.toString()}`;

                      return (
                        <Link key={stageId} href={href}
                          className="rounded-xl p-3 block transition-all hover:scale-[1.02]"
                          style={{
                            background: "var(--color-surface)",
                            border: `1px solid ${count > 0 ? stage.color + "50" : "var(--color-border)"}`,
                          }}>
                          <p className="text-xs leading-tight mb-2 line-clamp-2"
                            style={{ color: count > 0 ? "var(--color-text)" : "var(--color-muted)", minHeight: "2.4em" }}>
                            {stage.group === "win"  && <CheckCircle2 className="w-3 h-3 inline mr-1 mb-0.5" style={{ color: "#22C55E" }} />}
                            {stage.group === "fail" && <XCircle      className="w-3 h-3 inline mr-1 mb-0.5" style={{ color: "#94A3B8" }} />}
                            {stage.name}
                          </p>
                          <p className="text-2xl font-bold tabular-nums leading-none"
                            style={{ color: count > 0 ? stage.color : "var(--color-muted)" }}>
                            {count}
                          </p>
                          <p className="text-xs mt-1 font-medium tabular-nums"
                            style={{ color: amount > 0 ? "var(--color-text)" : "var(--color-muted)" }}>
                            {amount > 0 ? `₽ ${fmt(amount)}` : "—"}
                          </p>
                          <div className="mt-2 h-1 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                            <div className="h-1 rounded-full" style={{
                              width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                              background: count > 0 ? stage.color : "transparent",
                            }} />
                          </div>
                          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                            {count > 0 ? `${pct}%` : "—"}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Recent items ─────────────────────────────────────────────────── */}
          {data.recent.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Последние дела</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{periodLabel}</p>
                </div>
                <Link href={listHref}
                  className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-brand)" }}>
                  Все <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {["Дата","Парк","ТС / Номер","Водитель","Стадия","Ущерб"].map((h) => (
                        <th key={h} className="pb-2 text-left text-xs font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((item) => {
                      const parts = parseDtpTitle(item.title);
                      return (
                        <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td className="py-2.5 text-xs whitespace-nowrap" style={{ color: "var(--color-muted)" }}>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {parts.date ?? fmtDate(item.createdTime)}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                              {parts.park ?? "—"}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs">
                            <span className="flex items-center gap-1.5">
                              <Car className="w-3 h-3 opacity-40" />
                              {parts.car && <span className="truncate max-w-[100px]" style={{ color: "var(--color-text)" }}>{parts.car}</span>}
                              {parts.plate && (
                                <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded"
                                  style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                                  {parts.plate}
                                </span>
                              )}
                              {!parts.car && !parts.plate && <span style={{ color: "var(--color-muted)" }}>—</span>}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs max-w-[140px] truncate" style={{ color: "var(--color-text)" }}>
                            {parts.driver ?? <span style={{ color: "var(--color-muted)" }}>—</span>}
                          </td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ background: item.stageColor + "20", color: item.stageColor }}>
                              {item.stageName}
                            </span>
                          </td>
                          <td className="py-2.5 text-xs font-mono tabular-nums"
                            style={{ color: item.opportunity > 0 ? "var(--color-text)" : "var(--color-muted)" }}>
                            {item.opportunity > 0 ? `₽ ${fmt(item.opportunity)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
