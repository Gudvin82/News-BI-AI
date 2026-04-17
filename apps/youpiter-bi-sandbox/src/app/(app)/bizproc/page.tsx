"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ArrowUpRight, RefreshCw, CalendarDays } from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import { apiFetch } from "@/lib/utils";

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

function toISO(d: Date) { return format(d, "yyyy-MM-dd"); }

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  switch (p) {
    case "today": return { from: toISO(now), to: toISO(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: toISO(y), to: toISO(y) };
    }
    case "week": return { from: toISO(startOfWeek(now, { weekStartsOn: 1 })), to: toISO(now) };
    case "month": return { from: toISO(startOfMonth(now)), to: toISO(now) };
    default: return { from: toISO(now), to: toISO(now) };
  }
}

interface BizprocData {
  configured: boolean;
  enabledInSection: boolean;
  status: "ready" | "disabled" | "not_configured";
  summary: {
    totalCount: number;
    totalAmount: number;
    active: number;
    completedToday: number;
    overdue: number;
  };
  processes: Array<{
    id: string;
    label: string;
    count: number;
    amount: number;
    active: number;
    completedToday: number;
    overdue: number;
  }>;
  message: string;
}

export default function BizprocPage() {
  const [data, setData] = useState<BizprocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>("today");
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo, setDateTo] = useState(() => toISO(new Date()));
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("yb_bizproc_last");
      if (raw) setData(JSON.parse(raw) as BizprocData);
    } catch {
      // ignore corrupted cache
    }
  }, []);

  async function load(from?: string, to?: string) {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const res = await apiFetch(`/api/bizproc/summary?${q.toString()}`, { cache: "no-store" });
      const json = await res.json();
      const next = json?.ok ? json.data : null;
      setData(next);
      if (next) {
        try { window.sessionStorage.setItem("yb_bizproc_last", JSON.stringify(next)); } catch { /* ignore */ }
      }
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "custom") {
      setShowCustom(true);
      return;
    }
    const r = presetRange(p);
    setDateFrom(r.from);
    setDateTo(r.to);
    setShowCustom(false);
    void load(r.from, r.to);
  }

  useEffect(() => {
    const r = presetRange("today");
    setDateFrom(r.from);
    setDateTo(r.to);
    void load(r.from, r.to);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Бизнес-процессы</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Только процессы: Счет на оплату, Списание топлива по ТК, Выдача наличных.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <div className="flex rounded-lg p-0.5" style={{ background: "var(--color-surface)" }}>
              {(["today", "custom"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => applyPreset(m === "today" ? "today" : "custom")}
                  className="px-3 h-7 rounded-md text-xs font-medium transition-all"
                  style={{ background: (m === "today" ? preset !== "custom" : preset === "custom") ? "var(--color-brand)" : "transparent", color: (m === "today" ? preset !== "custom" : preset === "custom") ? "#fff" : "var(--color-muted)" }}
                >
                  {m === "today" ? "День" : "Диапазон"}
                </button>
              ))}
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                const v = e.target.value;
                setPreset("today");
                setDateFrom(v);
                setDateTo(v);
                setShowCustom(false);
                void load(v, v);
              }}
              className="h-8 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            <CalendarDays className="w-3.5 h-3.5 ml-1.5 flex-shrink-0" style={{ color: "var(--color-muted)" }} />
            {(["today", "yesterday", "week", "month"] as const).map((p) => {
              const labels = { today: "Сегодня", yesterday: "Вчера", week: "Неделя", month: "Месяц" };
              const active = preset === p;
              return (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{ background: active ? "var(--color-brand)" : "transparent", color: active ? "#fff" : "var(--color-muted)" }}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          {showCustom && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 px-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 px-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
              <button
                onClick={() => load(dateFrom, dateTo)}
                className="h-8 px-3 rounded-lg text-xs font-medium text-white"
                style={{ background: "var(--color-brand)" }}
              >
                Применить
              </button>
            </div>
          )}

          <button
            onClick={() => load(dateFrom, dateTo)}
            disabled={loading}
            className="h-9 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </button>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Статус подключения</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {data?.message ?? (loading ? "Загружаем данные..." : "Нет данных")}
            </p>
          </div>
          <Badge variant={data?.status === "ready" ? "success" : "warning"}>
            {data?.status === "ready" ? "Готово" : data?.status === "disabled" ? "Отключено в разделах" : "Не настроено"}
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Всего БП", v: data?.summary.totalCount ?? 0 },
          { label: "Общая сумма", v: `₽ ${(data?.summary.totalAmount ?? 0).toLocaleString("ru-RU")}` },
          { label: "Активные", v: data?.summary.active ?? 0 },
          { label: "Просрочено", v: data?.summary.overdue ?? 0 },
        ].map((m) => (
          <Card key={m.label}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>{m.label}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums" style={{ color: "var(--color-text)" }}>{m.v}</p>
          </Card>
        ))}
      </div>

      <Card>
        <p className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Процессы</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(data?.processes ?? []).map((p) => (
            <div key={p.id} className="rounded-xl p-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{p.label}</p>
                <Badge variant={p.overdue > 0 ? "warning" : "success"}>
                  {p.overdue > 0 ? `Просрочено: ${p.overdue}` : "Без просрочек"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div>
                  <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Кол-во</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{p.count}</p>
                </div>
                <div>
                  <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Сумма</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>
                    ₽ {p.amount.toLocaleString("ru-RU")}
                  </p>
                </div>
                <div>
                  <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Активные</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{p.active}</p>
                </div>
                <div>
                  <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Закрыто сегодня</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{p.completedToday}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <a
          href="/settings/integrations"
          className="inline-flex items-center gap-1 mt-4 text-xs font-medium"
          style={{ color: "var(--color-brand)" }}
        >
          Настроить интеграцию Bitrix24 <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </Card>
    </div>
  );
}
