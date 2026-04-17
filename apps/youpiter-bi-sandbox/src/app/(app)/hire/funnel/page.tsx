"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, Users, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { useHireFilters } from "@/lib/context/HireFilters";
import { REJECT_NAMES, STATUS, AVTOPARK_IDS, TEAM_NAMES } from "@/lib/config/hire";
import Link from "next/link";
import { markDataFreshness } from "@/lib/settings-client";
import { apiFetch } from "@/lib/utils";
import * as XLSX from "xlsx";

function fmt(n: number) { return n.toLocaleString("ru-RU"); }

function delta(prev: number, cur: number) {
  const d = cur - prev;
  const pct = prev > 0 ? Math.round(Math.abs(d) / prev * 100) : 0;
  const sign = d >= 0 ? "+" : "";
  return { d, pct, label: `${sign}${d} (${d >= 0 ? "+" : ""}${pct}%)`, up: d >= 0 };
}

export default function HireFunnelPage() {
  const { metrics, compareMetrics, loading, error, noWebhook, filters } = useHireFilters();
  const [reportOpen, setReportOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(true);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTab, setDrillTab] = useState<"leads" | "oform" | "first">("leads");
  const [drillManager, setDrillManager] = useState("all");
  const [drillPark, setDrillPark] = useState("all");
  const [drillSource, setDrillSource] = useState<string | null>(null);
  const [drillStatusIds, setDrillStatusIds] = useState<string[] | null>(null);
  const [drillExcludeStatusIds, setDrillExcludeStatusIds] = useState<string[] | null>(null);
  const [drillTitle, setDrillTitle] = useState("Найм — детализация");
  const [showZerosSrc, setShowZerosSrc] = useState(false);
  const [showZerosRel, setShowZerosRel] = useState(false);
  const [showZerosFS, setShowZerosFS] = useState(false);

  // Время работы менеджеров
  type TimeEntry = { start: string; end: string | null; status: string } | null;
  const [timemanData, setTimemanData] = useState<Record<string, TimeEntry>>({});
  const timemanDate = filters.mode === "day" ? filters.date : filters.dateTo;
  const timemanFetchedRef = useRef<string>("");

  useEffect(() => {
    const cacheKey = `yb-wh-date-${timemanDate}`;
    if (timemanFetchedRef.current === cacheKey) return;
    timemanFetchedRef.current = cacheKey;

    const mgrIds = [...AVTOPARK_IDS];
    const result: Record<string, TimeEntry> = {};
    mgrIds.forEach((id) => {
      const lsKey = `yb-wh-${id}-${timemanDate}`;
      const cached = localStorage.getItem(lsKey);
      if (cached) { try { result[id] = JSON.parse(cached); } catch { /* ignore */ } }
    });
    setTimemanData({ ...result });

    const todayMsk = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const isToday = timemanDate === todayMsk;

    if (isToday) {
      mgrIds.forEach((id) => {
        const lsKey = `yb-wh-${id}-${timemanDate}`;
        if (result[id]?.status === "CLOSED" && result[id]?.end) return;
        apiFetch(`/api/hire/timeman?userId=${id}`)
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok || !d.data) return;
            const { startDate, start, end, status } = d.data;
            const entry: TimeEntry = { start, end, status };
            if (startDate === timemanDate) {
              localStorage.setItem(lsKey, JSON.stringify(entry));
              setTimemanData((prev) => ({ ...prev, [id]: entry }));
            }
          })
          .catch(() => { /* silent */ });
      });
    } else {
      mgrIds.filter((id) => !result[id]).forEach((id) => {
        const lsKey = `yb-wh-${id}-${timemanDate}`;
        apiFetch(`/api/hire/timeman/history?userId=${id}&from=${timemanDate}&to=${timemanDate}`)
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok || !Array.isArray(d.data) || !d.data.length) return;
            const day = d.data[0];
            if (!day.start) return;
            const entry: TimeEntry = { start: day.start, end: day.end, status: day.status };
            localStorage.setItem(lsKey, JSON.stringify(entry));
            setTimemanData((prev) => ({ ...prev, [id]: entry }));
          })
          .catch(() => { /* silent */ });
      });
    }
  }, [timemanDate]);

  useEffect(() => {
    if (metrics && !loading && !error) markDataFreshness("hire");
  }, [metrics, loading, error]);

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noWebhook) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12 text-center">
          <div className="max-w-xs">
            <Users className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--color-muted)" }} />
            <p className="font-semibold mb-2" style={{ color: "var(--color-text)" }}>Bitrix24 не подключён</p>
            <Link href="/settings/integrations"
              className="inline-block mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "var(--color-brand)" }}>
              Настроить интеграцию
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(11)].map((_, i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
        <div className="h-64 rounded-xl skeleton" />
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

  const { total, relevant, relNo, noSpamDup, qualLead, oformlenie, irrelevant, sobes, dumaet, noAns, dFirst,
          convRelevToSobes, convSobesToFirst, rejectBreakdown, parkBreakdown,
          hourBreakdown } = metrics;

  const funnelSteps = [
    { label: "Отклики",        v: total,    pct: 100,                                                    color: "var(--color-brand)" },
    { label: "Релевантные",    v: relevant, pct: total > 0 ? Math.round(relevant / total * 100) : 0,     color: "#10B981" },
    { label: "Собеседование",  v: sobes,    pct: total > 0 ? Math.round(sobes    / total * 100) : 0,     color: "#3B82F6" },
    { label: "Качественный",   v: qualLead, pct: total > 0 ? Math.round(qualLead / total * 100) : 0,     color: "#F59E0B" },
  ];

  // Source entries sorted by total desc (used in 3 source blocks)
  const srcEntries = Object.entries(metrics.sourceBreakdown).sort((a, b) => b[1].total - a[1].total);

  function renderSourceRows(
    getValue: (s: { total: number; relevant: number; sobes: number; dFirst: number }) => number,
    onClick: (src: string) => void,
    showZeros: boolean,
    onToggleZeros: () => void,
  ) {
    const nonZero = srcEntries.filter(([, s]) => getValue(s) > 0);
    const zeros   = srcEntries.filter(([, s]) => getValue(s) === 0);
    return (
      <>
        <div className="space-y-1.5">
          {nonZero.length === 0 && (
            <p className="text-sm py-1" style={{ color: "var(--color-muted)" }}>Нет данных</p>
          )}
          {nonZero.map(([src, stat]) => (
            <button key={src} type="button" onClick={() => onClick(src)}
              className="w-full flex items-center justify-between text-sm text-left hover:opacity-75">
              <span className="truncate pr-2" style={{ color: "var(--color-muted)" }}>{src}</span>
              <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--color-text)" }}>{getValue(stat)}</span>
            </button>
          ))}
        </div>
        {zeros.length > 0 && (
          <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
            <button type="button" onClick={onToggleZeros}
              className="text-xs w-full text-center py-1 hover:opacity-75"
              style={{ color: "var(--color-muted)" }}>
              {showZeros ? "▴ скрыть нули" : `▾ нули (${zeros.length})`}
            </button>
            {showZeros && (
              <div className="space-y-1.5 mt-2">
                {zeros.map(([src]) => (
                  <div key={src} className="w-full flex items-center justify-between text-sm">
                    <span style={{ color: "var(--color-border)" }}>{src}</span>
                    <span style={{ color: "var(--color-border)" }}>0</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  // Peak hours
  const maxHour = Math.max(...Object.values(hourBreakdown), 1);
  const peakHour = Object.entries(hourBreakdown).sort((a, b) => b[1] - a[1])[0];
  const drillLeadsRows = metrics.drilldown?.leads ?? [];
  const drillOformRows = metrics.drilldown?.oformlenie ?? [];
  const drillFirstRows = metrics.drilldown?.firstShift ?? [];
  const drillRows = drillTab === "leads" ? drillLeadsRows : drillTab === "oform" ? drillOformRows : drillFirstRows;
  const drillManagers = Array.from(new Set(drillRows.map((r) => (r.managerName || r.managerId).trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const drillParks = Array.from(new Set(drillRows.map((r) => (r.park || "Не указан").trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const filteredRows = drillRows.filter((r) => {
    const managerName = (r.managerName || r.managerId).trim();
    if (drillManager !== "all" && managerName !== drillManager) return false;
    if (drillPark !== "all" && (r.park || "Не указан").trim() !== drillPark) return false;
    if (drillSource && (r.source || "Не указан") !== drillSource) return false;
    if (drillStatusIds?.length && !drillStatusIds.includes(String(r.statusId || ""))) return false;
    if (drillExcludeStatusIds?.length && drillExcludeStatusIds.includes(String(r.statusId || ""))) return false;
    return true;
  });

  function openDrilldown(tab: "leads" | "oform" | "first", opts?: { title?: string; statusIds?: string[]; excludeStatusIds?: string[]; source?: string; park?: string }) {
    setDrillTab(tab);
    setDrillManager("all");
    setDrillPark(opts?.park ?? "all");
    setDrillSource(opts?.source ?? null);
    setDrillStatusIds(opts?.statusIds ?? null);
    setDrillExcludeStatusIds(opts?.excludeStatusIds ?? null);
    setDrillTitle(opts?.title ?? "Найм — детализация");
    setDrillOpen(true);
  }

  function exportCurrentTabExcel() {
    if (!filteredRows.length) return;
    const rows = filteredRows.map((r) => ({
      "Дата": String(r.date || "").slice(0, 16).replace("T", " "),
      "Лид/Сделка": r.title || "",
      "Имя": r.contactName || "",
      "Код статуса": r.statusId || "",
      "Статус": r.status || "",
      "Источник": r.source || "",
      "Парк": r.park || "",
      "Менеджер": r.managerName || r.managerId || "",
      "Ссылка Bitrix": r.url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, drillTab === "leads" ? "Отклики" : drillTab === "oform" ? "Оформление" : "Первая смена");
    XLSX.writeFile(wb, `naim_${drillTab}_${dateLabel.replace(/[^\dA-Za-zА-Яа-я_-]+/g, "_")}.xlsx`);
  }

  // Text report
  function buildReport() {
    const srcLines = Object.entries(metrics!.sourceBreakdown)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([src, s]) => `   - ${src} = ${s.total}`).join("\n");
    const rejLines = Object.entries(rejectBreakdown).sort((a, b) => b[1] - a[1])
      .map(([code, cnt]) => `   - ${REJECT_NAMES[code] ?? code} = ${cnt}`).join("\n");
    const mgrLines = metrics!.managerStats
      .map((m) => `   - ${m.name.split(" ").slice(0, 2).join(" ")}: откл=${m.total}, релев=${m.relevant}, собес=${m.sobes}, 1см=${m.dFirst}`)
      .join("\n");
    return [
      `Отчёт найма`, `Период = ${dateLabel}`, ``,
      `1. Всего откликов = ${total}`, srcLines, ``,
      `1.1 Отклики без спама/дублей = ${noSpamDup}`,
      `2. Релевантные = ${relevant}`,
      `2.1 Релевантные / не подходим = ${relNo}`,
      `3. Нерелевантные = ${irrelevant}`, rejLines,
      `4. Не отвечают = ${noAns}`,
      `5. Думает = ${dumaet}`,
      `6. Собеседование = ${sobes}`,
      `6.1 Качественный лид = ${qualLead}`,
      `6.2 Оформление = ${oformlenie}`,
      `7. 🚗 Первая смена = ${dFirst}`, ``,
      `По менеджерам:`, mgrLines,
    ].join("\n");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Сводка найма</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · Bitrix24</p>
      </div>

      {/* Key metrics (parity with legacy) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3">
        {[
          { label: "Всего откликов",  v: total,     sub: "Все лиды за период",                        color: "var(--color-brand)", tab: "leads" as const },
          { label: "Отклики без спама и дублей", v: noSpamDup, sub: "Отклики без мусора",             color: "#6366F1", tab: "leads" as const, excludeStatusIds: ["10", "12"] },
          { label: "Релевантные / мы подходим", v: relevant,  sub: "Лид в работе · Ожидание ОС · Думает · Собес", color: "#10B981", tab: "leads" as const, statusIds: [...STATUS.REL_YES] },
          { label: "Релевантные / не подходим", v: relNo, sub: "Не отв. · Условия · Не актуально · ЧС и др.",      color: "#F97316", tab: "leads" as const, statusIds: [...STATUS.REL_NO] },
          { label: "Нерелевантные",   v: irrelevant,sub: "Спам · Дубли · Иностранец",                 color: "#EF4444", tab: "leads" as const, statusIds: [...STATUS.IRRELEVANT] },
          { label: "Собеседование",   v: sobes,     sub: "Согласились / пришли",                      color: "#3B82F6", tab: "leads" as const, statusIds: [STATUS.SOBES] },
          { label: "Думает",          v: dumaet,    sub: "Интересно, не готов прийти",                color: "#8B5CF6", tab: "leads" as const, statusIds: [STATUS.DUMAET] },
          { label: "Качественный лид", v: qualLead, sub: "Согласился выйти на работу",                color: "#06B6D4", tab: "leads" as const, statusIds: [STATUS.CONVERTED] },
          { label: "Оформление", v: oformlenie, sub: "Документы · Ожидание · Оформлен",               color: "#7C3AED", tab: "oform" as const },
          { label: "Не отвечают",     v: noAns,     sub: "До 3х раз · неделю · 2 недели",             color: "#94A3B8", tab: "leads" as const, statusIds: [...STATUS.NO_ANS] },
          { label: "🚗 Первая смена", v: dFirst,    sub: "Вышел на смену — финал воронки",            color: "#F59E0B", tab: "first" as const },
        ].map((m) => (
          <Card key={m.label} className="min-w-0">
            <button
              type="button"
              onClick={() => openDrilldown(m.tab, { title: m.label, statusIds: m.statusIds, excludeStatusIds: m.excludeStatusIds })}
              title="Открыть детализацию"
              className="w-full text-left"
            >
              <p className="text-xs font-medium mb-1 leading-tight" style={{ color: "var(--color-muted)" }}>{m.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: m.color }}>{fmt(m.v)}</p>
              <p className="text-xs mt-1 leading-tight" style={{ color: "var(--color-muted)" }}>
                {m.sub} · подробнее
              </p>
            </button>
          </Card>
        ))}
      </div>

      {/* Funnel + Conversions */}
      <Card>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Конверсия воронки</h2>
        <div className="space-y-4">
          {funnelSteps.map((step) => (
            <div key={step.label}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span style={{ color: "var(--color-text)" }}>
                  {step.label} <span className="text-xs ml-1" style={{ color: "var(--color-muted)" }}>({step.pct}%)</span>
                </span>
                <span className="font-bold tabular-nums" style={{ color: step.color }}>{fmt(step.v)}</span>
              </div>
              <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                <div className="h-2 rounded-full transition-all duration-500"
                     style={{ width: `${step.pct}%`, background: step.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 grid grid-cols-2 gap-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          {[
            {
              label: "Релевантные → Собес.",
              v: `${convRelevToSobes}%`,
              sub: `${sobes} из ${relevant} релевантных`,
              onClick: () => openDrilldown("leads", { title: "Собеседование", statusIds: [STATUS.SOBES] }),
            },
            {
              label: "Собеседование → 1 смена",
              v: `${convSobesToFirst}%`,
              sub: `${dFirst} из ${sobes} собесов`,
              onClick: () => openDrilldown("first", { title: "Первая смена" }),
            },
          ].map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.onClick}
              className="text-center p-3 rounded-xl"
              style={{ background: "var(--color-surface-2)" }}
            >
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>{c.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-brand)" }}>{c.v}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{c.sub} · подробнее</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Comparison block */}
      {compareMetrics && (
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
            Сравнение с {compareMetrics.dateFrom === compareMetrics.dateTo
              ? compareMetrics.dateFrom
              : `${compareMetrics.dateFrom} — ${compareMetrics.dateTo}`}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            {[
              { label: "Все отклики",  prev: compareMetrics.total,     cur: total     },
              { label: "Релевантные",  prev: compareMetrics.relevant,  cur: relevant  },
              { label: "Собеседование",prev: compareMetrics.sobes,     cur: sobes     },
              { label: "1я смена",     prev: compareMetrics.dFirst,    cur: dFirst    },
              { label: "Нерелев.",     prev: compareMetrics.irrelevant,cur: irrelevant},
            ].map((row) => {
              const { d, label: dLabel, up } = delta(row.prev, row.cur);
              return (
                <div key={row.label} className="p-3 rounded-xl" style={{ background: "var(--color-surface-2)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>{row.label}</p>
                  <p className="font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                    {row.prev} → {row.cur}
                  </p>
                  <p className="text-xs mt-0.5 font-medium tabular-nums"
                     style={{ color: d === 0 ? "var(--color-muted)" : up ? "#10B981" : "#EF4444" }}>
                    {dLabel}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Sources + Rejects + First shift by sources (3 columns, left stacks 2 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">

        {/* Left: stacked — Все отклики + Релевантные по источникам */}
        <div className="flex flex-col gap-4">
          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
              Все отклики по источникам
              <span className="ml-1.5 font-normal text-xs" style={{ color: "var(--color-muted)" }}>{total}</span>
            </h3>
            {srcEntries.length === 0
              ? <p className="text-sm py-1" style={{ color: "var(--color-muted)" }}>Нет данных</p>
              : renderSourceRows(
                  (s) => s.total,
                  (src) => openDrilldown("leads", { title: `Источник: ${src}`, source: src }),
                  showZerosSrc,
                  () => setShowZerosSrc((v) => !v),
                )
            }
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
              Релевантные по источникам
              <span className="ml-1.5 font-normal text-xs" style={{ color: "var(--color-muted)" }}>{relevant}</span>
            </h3>
            {srcEntries.length === 0
              ? <p className="text-sm py-1" style={{ color: "var(--color-muted)" }}>Нет данных</p>
              : renderSourceRows(
                  (s) => s.relevant,
                  (src) => openDrilldown("leads", { title: `Релевантные: ${src}`, source: src, statusIds: [...STATUS.RELEVANT] }),
                  showZerosRel,
                  () => setShowZerosRel((v) => !v),
                )
            }
          </Card>
        </div>

        {/* Middle: Причины нерелевантности */}
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
            Причины нерелевантности
            <span className="ml-1.5 font-normal text-xs" style={{ color: "var(--color-muted)" }}>{irrelevant}</span>
          </h3>
          {Object.keys(rejectBreakdown).length === 0 ? (
            <p className="text-sm py-2" style={{ color: "var(--color-muted)" }}>Нет данных</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(rejectBreakdown).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => openDrilldown("leads", { title: `Причина: ${REJECT_NAMES[code] ?? code}`, statusIds: [code] })}
                  className="w-full flex items-center justify-between text-sm text-left hover:opacity-75"
                >
                  <span style={{ color: "var(--color-muted)" }}>{REJECT_NAMES[code] ?? code}</span>
                  <Badge variant="danger">{count}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Right: Первая смена по источникам */}
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>
            🚗 Первая смена по источникам
            <span className="ml-1.5 font-normal text-xs" style={{ color: "var(--color-muted)" }}>{dFirst}</span>
          </h3>
          {srcEntries.length === 0
            ? <p className="text-sm py-1" style={{ color: "var(--color-muted)" }}>Нет данных</p>
            : renderSourceRows(
                (s) => s.dFirst,
                (src) => openDrilldown("first", { title: `Первая смена: ${src}`, source: src }),
                showZerosFS,
                () => setShowZerosFS((v) => !v),
              )
          }
        </Card>
      </div>

      {/* Peak hours */}
      <Card className="p-0 overflow-hidden">
        <button
          onClick={() => setHoursOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          <span>
            Часы пик — когда приходят лиды
            {peakHour && (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-muted)" }}>
                Пик: {peakHour[0]}:00–{String(Number(peakHour[0]) + 1).padStart(2, "0")}:00 ({peakHour[1]} лидов)
              </span>
            )}
          </span>
          {hoursOpen
            ? <ChevronUp className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
            : <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />}
        </button>
        {hoursOpen && (
          <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--color-border)" }}>
            <div className="flex items-end gap-0.5 h-24 mt-4">
              {Array.from({ length: 24 }, (_, h) => {
                const cnt = hourBreakdown[h] ?? 0;
                const pct = maxHour > 0 ? cnt / maxHour : 0;
                const isPeak = cnt === maxHour && cnt > 0;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full relative flex items-end justify-center" style={{ height: "72px" }}>
                      <div
                        className="w-full rounded-sm transition-all"
                        style={{
                          height: `${Math.max(pct * 100, cnt > 0 ? 4 : 0)}%`,
                          background: isPeak ? "var(--color-brand)" : "var(--color-surface-2)",
                          minHeight: cnt > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    {cnt > 0 && (
                      <span className="text-xs tabular-nums" style={{ color: isPeak ? "var(--color-brand)" : "var(--color-muted)" }}>
                        {cnt}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Hour labels */}
            <div className="flex mt-1">
              {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
                <div key={h} className="text-xs" style={{ flex: `0 0 ${(h === 0 ? 1 : 3) / 24 * 100}%`, color: "var(--color-muted)" }}>
                  {h}:00
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Text report */}
      <Card className="p-0 overflow-hidden">
        <button
          onClick={() => setReportOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          <span>Текст отчёта</span>
          {reportOpen
            ? <ChevronUp className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
            : <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />}
        </button>
        {reportOpen && (
          <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--color-border)" }}>
            <textarea
              readOnly
              value={buildReport()}
              className="w-full mt-4 p-3 rounded-lg text-xs font-mono resize-none outline-none"
              style={{
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                minHeight: "280px",
              }}
            />
          </div>
        )}
      </Card>

      {/* Время работы менеджеров */}
      <Card>
        <h2 className="text-base font-semibold mb-3" style={{ color: "var(--color-text)" }}>
          Время работы менеджеров
          <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-muted)" }}>{timemanDate}</span>
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {[...AVTOPARK_IDS].map((id) => {
            const name = TEAM_NAMES[id] ?? `ID:${id}`;
            const entry = timemanData[id];
            const shortName = name.split(" ").slice(0, 2).join(" ");
            return (
              <div key={id} className="rounded-xl p-3" style={{ background: "var(--color-surface-2)" }}>
                <p className="text-xs font-medium truncate mb-1" style={{ color: "var(--color-text)" }}>{shortName}</p>
                {entry ? (
                  <p className="text-xs tabular-nums" style={{ color: "#1D9E75" }}>
                    {entry.start} – {entry.end ?? "идёт…"}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: "var(--color-border)" }}>нет данных</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {drillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrillOpen(false)} />
          <div
            className="relative w-full max-w-6xl rounded-2xl p-4 md:p-5 max-h-[86vh] overflow-hidden"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Найм — детализация</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {dateLabel} · {drillTitle} · ссылки ведут в Bitrix24
                </p>
              </div>
              <button
                onClick={() => setDrillOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl mb-3 w-fit" style={{ background: "var(--color-surface-2)" }}>
              <button
                onClick={() => {
                  setDrillTab("leads");
                  setDrillManager("all");
                  setDrillPark("all");
                  setDrillSource(null);
                  setDrillStatusIds(null);
                  setDrillExcludeStatusIds(null);
                  setDrillTitle("Отклики");
                }}
                className="px-3 h-7 rounded-lg text-xs font-medium"
                style={{ background: drillTab === "leads" ? "var(--color-brand)" : "transparent", color: drillTab === "leads" ? "#fff" : "var(--color-muted)" }}
              >
                Отклики ({drillLeadsRows.length})
              </button>
              <button
                onClick={() => {
                  setDrillTab("oform");
                  setDrillManager("all");
                  setDrillPark("all");
                  setDrillSource(null);
                  setDrillStatusIds(null);
                  setDrillExcludeStatusIds(null);
                  setDrillTitle("Оформление");
                }}
                className="px-3 h-7 rounded-lg text-xs font-medium"
                style={{ background: drillTab === "oform" ? "var(--color-brand)" : "transparent", color: drillTab === "oform" ? "#fff" : "var(--color-muted)" }}
              >
                Оформление ({drillOformRows.length})
              </button>
              <button
                onClick={() => {
                  setDrillTab("first");
                  setDrillManager("all");
                  setDrillPark("all");
                  setDrillSource(null);
                  setDrillStatusIds(null);
                  setDrillExcludeStatusIds(null);
                  setDrillTitle("Первая смена");
                }}
                className="px-3 h-7 rounded-lg text-xs font-medium"
                style={{ background: drillTab === "first" ? "var(--color-brand)" : "transparent", color: drillTab === "first" ? "#fff" : "var(--color-muted)" }}
              >
                1-я смена ({drillFirstRows.length})
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select
                value={drillManager}
                onChange={(e) => setDrillManager(e.target.value)}
                className="h-8 px-2.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                <option value="all">Все менеджеры</option>
                {drillManagers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select
                value={drillPark}
                onChange={(e) => setDrillPark(e.target.value)}
                className="h-8 px-2.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                <option value="all">Все парки</option>
                {drillParks.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={exportCurrentTabExcel}
                className="h-8 px-3 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-brand)", color: "#fff" }}
              >
                Excel ({filteredRows.length})
              </button>
            </div>

            <div className="overflow-auto max-h-[60vh] rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
              <table className="w-full text-xs min-w-[960px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {["Дата", "Лид/Сделка", "Имя", "Статус", "Источник", "Парк", "Менеджер", "Bitrix"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length > 0 ? filteredRows.map((row) => (
                    <tr key={`${drillTab}-${row.id}-${row.date}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--color-muted)" }}>{String(row.date || "").slice(0, 16).replace("T", " ")}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text)" }}>{row.title}</td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--color-text)" }}>{row.contactName ?? "—"}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text)" }}>{row.status}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{row.source}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{row.park}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{row.managerName || row.managerId}</td>
                      <td className="px-3 py-2.5">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1"
                            style={{ color: "var(--color-brand)" }}
                          >
                            Открыть <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span style={{ color: "var(--color-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--color-muted)" }}>
                        Нет записей по текущим фильтрам
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
