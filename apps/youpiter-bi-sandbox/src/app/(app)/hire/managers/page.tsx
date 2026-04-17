"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { useHireFilters } from "@/lib/context/HireFilters";
import { PARK_ICONS, KNOWN_PARKS, STATUS, AVTOPARK_IDS, TEAM_NAMES } from "@/lib/config/hire";
import { apiFetch } from "@/lib/utils";
import Link from "next/link";
import * as XLSX from "xlsx";

type DrillTab = "leads" | "oform" | "first";

export default function HireManagersPage() {
  const { metrics, loading, error, noWebhook, filters } = useHireFilters();
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [parkMatrixOpen, setParkMatrixOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(true);

  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTab, setDrillTab] = useState<DrillTab>("leads");
  const [drillTitle, setDrillTitle] = useState("Детализация");
  const [drillManager, setDrillManager] = useState("all");
  const [drillPark, setDrillPark] = useState("all");
  const [drillSource, setDrillSource] = useState<string | null>(null);
  const [drillStatusIds, setDrillStatusIds] = useState<string[] | null>(null);
  const [drillExcludeStatusIds, setDrillExcludeStatusIds] = useState<string[] | null>(null);

  const dateLabel = filters.mode === "day" ? filters.date : `${filters.dateFrom} — ${filters.dateTo}`;

  // Timeman: work start/end per manager for the selected date
  type TimeEntry = { start: string; end: string | null; status: string } | null;
  const [timemanData, setTimemanData] = useState<Record<string, TimeEntry>>({});
  const timemanDate = filters.mode === "day" ? filters.date : filters.dateTo;
  const timemanFetchedRef = useRef<string>("");

  // Schedule modal: 30-day history for a single manager
  type ScheduleDay = { date: string; start: string | null; end: string | null; status: string };
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleManagerId, setScheduleManagerId] = useState("");
  const [scheduleManagerName, setScheduleManagerName] = useState("");
  const [scheduleData, setScheduleData] = useState<ScheduleDay[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  function openSchedule(id: string, name: string) {
    setScheduleManagerId(id);
    setScheduleManagerName(name);
    setScheduleData([]);
    setScheduleOpen(true);
    setScheduleLoading(true);
    // Last 30 days up to today (MSK)
    const todayMsk = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const d = new Date(todayMsk);
    d.setDate(d.getDate() - 29);
    const from30 = d.toISOString().slice(0, 10);
    apiFetch(`/api/hire/timeman/history?userId=${id}&from=${from30}&to=${todayMsk}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.data)) {
          // Build full 30-day grid (fill missing dates with null)
          const byDate: Record<string, ScheduleDay> = {};
          (d.data as ScheduleDay[]).forEach((item) => { if (item.date) byDate[item.date] = item; });
          const grid: ScheduleDay[] = [];
          for (let i = 0; i < 30; i++) {
            const dd = new Date(from30);
            dd.setDate(dd.getDate() + i);
            const dateStr = dd.toISOString().slice(0, 10);
            grid.push(byDate[dateStr] ?? { date: dateStr, start: null, end: null, status: "NONE" });
          }
          setScheduleData(grid.reverse()); // newest first
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => setScheduleLoading(false));
  }

  useEffect(() => {
    const cacheKey = `yb-wh-date-${timemanDate}`;
    if (timemanFetchedRef.current === cacheKey) return;
    timemanFetchedRef.current = cacheKey;

    const mgrIds = [...AVTOPARK_IDS];
    const result: Record<string, TimeEntry> = {};

    // Try localStorage first
    mgrIds.forEach((id) => {
      const lsKey = `yb-wh-${id}-${timemanDate}`;
      const cached = localStorage.getItem(lsKey);
      if (cached) {
        try { result[id] = JSON.parse(cached); } catch { /* ignore */ }
      }
    });
    setTimemanData({ ...result });

    // Fetch from API for those without cached data (or to update open sessions)
    const todayMsk = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const isToday = timemanDate === todayMsk;

    if (isToday) {
      // Today: use timeman.status (real-time current session)
      mgrIds.forEach((id) => {
        const lsKey = `yb-wh-${id}-${timemanDate}`;
        const cached = result[id];
        if (cached?.status === "CLOSED" && cached.end) return;
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
      // Past date: use historystatus.list for accurate historical data
      const missingIds = mgrIds.filter((id) => !result[id]);
      if (missingIds.length > 0) {
        missingIds.forEach((id) => {
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
    }
  }, [timemanDate]);

  const drillLeadsRows = metrics?.drilldown?.leads ?? [];
  const drillOformRows = metrics?.drilldown?.oformlenie ?? [];
  const drillFirstRows = metrics?.drilldown?.firstShift ?? [];
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

  function openDrilldown(tab: DrillTab, opts?: {
    title?: string;
    managerName?: string;
    park?: string;
    source?: string;
    statusIds?: string[];
    excludeStatusIds?: string[];
  }) {
    setDrillTab(tab);
    setDrillTitle(opts?.title ?? "Детализация");
    setDrillManager(opts?.managerName ?? "all");
    setDrillPark(opts?.park ?? "all");
    setDrillSource(opts?.source ?? null);
    setDrillStatusIds(opts?.statusIds ?? null);
    setDrillExcludeStatusIds(opts?.excludeStatusIds ?? null);
    setDrillOpen(true);
  }

  function exportCurrentTabExcel() {
    if (!filteredRows.length) return;
    const rows = filteredRows.map((r) => ({
      "Дата": String(r.date || "").slice(0, 16).replace("T", " "),
      "Лид/Сделка": r.title || "",
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
    XLSX.writeFile(wb, `naim_mgr_park_${drillTab}_${dateLabel.replace(/[^\dA-Za-zА-Яа-я_-]+/g, "_")}.xlsx`);
  }

  if (noWebhook) {
    return (
      <Card>
        <div className="text-center py-10">
          <p className="font-semibold mb-2" style={{ color: "var(--color-text)" }}>Bitrix24 не подключён</p>
          <Link href="/settings/integrations" className="inline-block mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-brand)" }}>
            Настроить интеграцию
          </Link>
        </div>
      </Card>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Менеджеры и парки</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · Bitrix24</p>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Всего лидов", v: metrics.total, tab: "leads" as DrillTab },
            { label: "Релевантные", v: metrics.relevant, tab: "leads" as DrillTab, statusIds: [...STATUS.REL_YES] },
            { label: "Собеседования", v: metrics.sobes, tab: "leads" as DrillTab, statusIds: [STATUS.SOBES] },
            { label: "Первая смена", v: metrics.dFirst, tab: "first" as DrillTab },
          ].map((m) => (
            <Card key={m.label}>
              <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{m.label}</p>
              <button className="text-3xl font-bold tabular-nums mt-1" style={{ color: "var(--color-brand)" }} onClick={() => openDrilldown(m.tab, { title: m.label, statusIds: m.statusIds })}>
                {m.v}
              </button>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Менеджеры по подбору</h2>
        {loading && !metrics ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded-lg skeleton" />)}
          </div>
        ) : !metrics || metrics.managerStats.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>Нет данных за {dateLabel}</p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Менеджер", "Откл.", "Релев.", "Нерел.", "Собес.", "Думает", "Не отв.", "1я смена", "Конв.%"].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.managerStats.map((m, idx) => {
                  const conv = m.relevant > 0 ? Math.round(m.dFirst / m.relevant * 100) : 0;
                  const managerName = m.name.split(" ").slice(0, 2).join(" ");
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: idx < 3 ? "var(--color-brand)" : "var(--color-surface-2)", color: idx < 3 ? "white" : "var(--color-muted)" }}>
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                          </span>
                          <span className="font-medium" style={{ color: "var(--color-text)" }}>{managerName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `${managerName} · Отклики`, managerName })} style={{ color: "var(--color-muted)" }}>{m.total}</button></td>
                      <td className="py-2.5 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `${managerName} · Релевантные`, managerName, statusIds: [...STATUS.REL_YES] })} style={{ color: "var(--color-text)" }}>{m.relevant}</button></td>
                      <td className="py-2.5 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `${managerName} · Нерелевантные`, managerName, statusIds: [...STATUS.IRRELEVANT] })} style={{ color: "var(--color-muted)" }}>{m.irrelevant}</button></td>
                      <td className="py-2.5 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `${managerName} · Собеседование`, managerName, statusIds: [STATUS.SOBES] })} style={{ color: "var(--color-text)" }}>{m.sobes}</button></td>
                      <td className="py-2.5 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `${managerName} · Думает`, managerName, statusIds: [STATUS.DUMAET] })} style={{ color: "var(--color-muted)" }}>{m.dumaet}</button></td>
                      <td className="py-2.5 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `${managerName} · Не отвечают`, managerName, statusIds: [...STATUS.NO_ANS] })} style={{ color: "var(--color-muted)" }}>{m.noAns}</button></td>
                      <td className="py-2.5"><button onClick={() => openDrilldown("first", { title: `${managerName} · 1-я смена`, managerName })}><Badge variant={m.dFirst > 0 ? "success" : "default"}>{m.dFirst}</Badge></button></td>
                      <td className="py-2.5 tabular-nums font-semibold" style={{ color: conv > 0 ? "var(--color-success)" : "var(--color-muted)" }}>
                        {conv > 0 ? (
                          <button
                            onClick={() => openDrilldown("first", { title: `${managerName} · Конверсия в 1-ю смену`, managerName })}
                          >
                            {conv}%
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {metrics && Object.keys(metrics.managerSourceMatrix).length > 0 && (
        <Card className="p-0 overflow-hidden">
          <button onClick={() => setMatrixOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            <span>Матрица: Менеджер × Источник</span>
            {matrixOpen ? <ChevronUp className="w-4 h-4" style={{ color: "var(--color-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />}
          </button>
          {matrixOpen && (() => {
            const matrix = metrics.managerSourceMatrix;
            const managerIds = metrics.managerStats.map((m) => m.id);
            const allSources = Array.from(new Set(Object.values(matrix).flatMap((row) => Object.keys(row)))).sort();
            return (
              <div className="overflow-x-auto px-5 pb-5" style={{ borderTop: "1px solid var(--color-border)" }}>
                <table className="w-full text-xs mt-4">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <th className="pb-2 text-left font-medium pr-4" style={{ color: "var(--color-muted)" }}>Менеджер</th>
                      <th className="pb-2 text-right font-medium pr-4" style={{ color: "var(--color-text)" }}>Итого</th>
                      {allSources.map((src) => <th key={src} className="pb-2 text-right font-medium px-2 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>{src.length > 12 ? `${src.slice(0, 12)}...` : src}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {managerIds.map((mid) => {
                      const row = matrix[mid] ?? {};
                      const rowTotal = Object.values(row).reduce((s, v) => s + v, 0);
                      const mStat = metrics.managerStats.find((m) => m.id === mid);
                      const managerName = (mStat?.name ?? mid).split(" ").slice(0, 2).join(" ");
                      if (!mStat && rowTotal === 0) return null;
                      return (
                        <tr key={mid} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td className="py-2 pr-4 font-medium" style={{ color: "var(--color-text)" }}>{managerName}</td>
                          <td className="py-2 text-right pr-4 font-bold tabular-nums" style={{ color: "var(--color-brand)" }}><button onClick={() => openDrilldown("leads", { title: `${managerName} · Отклики`, managerName })}>{rowTotal}</button></td>
                          {allSources.map((src) => (
                            <td key={src} className="py-2 text-right px-2 tabular-nums" style={{ color: row[src] ? "var(--color-text)" : "var(--color-border)" }}>
                              {row[src] ? <button onClick={() => openDrilldown("leads", { title: `${managerName} · ${src}`, managerName, source: src })}>{row[src]}</button> : "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Card>
      )}

      {/* Timeman: работа менеджеров — начало / конец дня */}
      <Card>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          Менеджеры — начало / конец дня
          <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-muted)" }}>{timemanDate}</span>
        </h2>
        <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {[...AVTOPARK_IDS].map((id) => {
            const name = TEAM_NAMES[id] ?? `ID:${id}`;
            const entry = timemanData[id];
            return (
              <button
                key={id}
                onClick={() => openSchedule(id, name)}
                className="w-full flex items-center justify-between py-2.5 text-sm text-left hover:opacity-70 transition-opacity"
              >
                <span className="font-medium" style={{ color: "var(--color-text)" }}>{name}</span>
                {entry ? (
                  <span style={{ color: "#1D9E75", fontSize: "12px" }}>
                    {entry.start} – {entry.end ?? "идёт…"}
                  </span>
                ) : (
                  <span style={{ color: "var(--color-border)", fontSize: "12px" }}>нет данных</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {metrics && (() => {
        const knownOrder = [...KNOWN_PARKS, "Не указан"];
        const sortedParks = [...metrics.parkStats].sort((a, b) => {
          const ai = knownOrder.indexOf(a.park);
          const bi = knownOrder.indexOf(b.park);
          if (ai === -1 && bi === -1) return b.total - a.total;
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        const parkSourceMatrix = metrics.parkSourceMatrix;
        const allSources = Array.from(new Set(Object.values(parkSourceMatrix).flatMap((row) => Object.keys(row)))).sort();
        const maxHour = Math.max(...Object.values(metrics.hourBreakdown), 1);
        const peakHour = Object.entries(metrics.hourBreakdown).sort((a, b) => b[1] - a[1])[0];

        return (
          <>
            <Card>
              <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Статистика по паркам</h2>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm min-w-[600px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {["Парк", "Все", "Релев.", "Собес.", "Думает", "1я смена", "Не отв.", "Нерелев."].map((h) => <th key={h} className="pb-2 text-left text-xs font-medium px-1" style={{ color: "var(--color-muted)" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedParks.map((p) => {
                      const pctRel = p.total > 0 ? Math.round(p.relevant / p.total * 100) : 0;
                      if (p.total === 0) {
                        return (
                          <tr key={p.park} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td className="py-2.5 px-1"><span className="font-medium" style={{ color: "var(--color-text)" }}>{PARK_ICONS[p.park] ?? "⚪"} {p.park}</span></td>
                            <td colSpan={7} className="py-2.5 px-1 text-xs" style={{ color: "var(--color-muted)" }}>— нет лидов —</td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={p.park} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td className="py-2.5 px-1"><span className="font-medium" style={{ color: "var(--color-text)" }}>{PARK_ICONS[p.park] ?? "⚪"} {p.park}</span></td>
                          <td className="py-2.5 px-1 tabular-nums font-medium"><button onClick={() => openDrilldown("leads", { title: `Парк ${p.park} · Отклики`, park: p.park })} style={{ color: "var(--color-text)" }}>{p.total}</button></td>
                          <td className="py-2.5 px-1 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `Парк ${p.park} · Релевантные`, park: p.park, statusIds: [...STATUS.REL_YES] })} style={{ color: "var(--color-text)" }}>{p.relevant}</button> <span className="text-xs" style={{ color: "var(--color-muted)" }}>{pctRel}%</span></td>
                          <td className="py-2.5 px-1 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `Парк ${p.park} · Собеседование`, park: p.park, statusIds: [STATUS.SOBES] })} style={{ color: "var(--color-muted)" }}>{p.sobes}</button></td>
                          <td className="py-2.5 px-1 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `Парк ${p.park} · Думает`, park: p.park, statusIds: [STATUS.DUMAET] })} style={{ color: "var(--color-muted)" }}>{p.dumaet}</button></td>
                          <td className="py-2.5 px-1 tabular-nums font-bold" style={{ color: p.dFirst > 0 ? "var(--color-brand)" : "var(--color-border)" }}>{p.dFirst > 0 ? <button onClick={() => openDrilldown("first", { title: `Парк ${p.park} · 1-я смена`, park: p.park })} style={{ color: "var(--color-brand)" }}>{p.dFirst}</button> : "—"}</td>
                          <td className="py-2.5 px-1 tabular-nums"><button onClick={() => openDrilldown("leads", { title: `Парк ${p.park} · Не отвечают`, park: p.park, statusIds: [...STATUS.NO_ANS] })} style={{ color: "var(--color-muted)" }}>{p.noAns}</button></td>
                          <td className="py-2.5 px-1 tabular-nums" style={{ color: p.irrelevant > 0 ? "#EF4444" : "var(--color-muted)" }}><button onClick={() => openDrilldown("leads", { title: `Парк ${p.park} · Нерелевантные`, park: p.park, statusIds: [...STATUS.IRRELEVANT] })} style={{ color: p.irrelevant > 0 ? "#EF4444" : "var(--color-muted)" }}>{p.irrelevant}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-0 overflow-hidden">
              <button onClick={() => setParkMatrixOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                <span>Матрица: Парк × Источник</span>
                {parkMatrixOpen ? <ChevronUp className="w-4 h-4" style={{ color: "var(--color-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />}
              </button>
              {parkMatrixOpen && (
                <div className="overflow-x-auto px-5 pb-5" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <table className="w-full text-xs mt-4">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th className="pb-2 text-left font-medium pr-4" style={{ color: "var(--color-muted)" }}>Парк</th>
                        <th className="pb-2 text-right font-medium pr-4" style={{ color: "var(--color-text)" }}>Итого</th>
                        {allSources.map((src) => <th key={src} className="pb-2 text-right font-medium px-2 whitespace-nowrap" style={{ color: "var(--color-muted)" }}>{src.length > 12 ? `${src.slice(0, 12)}...` : src}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedParks.filter((p) => p.total > 0).map((p) => {
                        const row = parkSourceMatrix[p.park] ?? {};
                        const rowTotal = Object.values(row).reduce((s, v) => s + v, 0);
                        return (
                          <tr key={p.park} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td className="py-2 pr-4 font-medium" style={{ color: "var(--color-text)" }}>{PARK_ICONS[p.park] ?? "⚪"} {p.park}</td>
                            <td className="py-2 text-right pr-4 font-bold tabular-nums" style={{ color: "var(--color-brand)" }}><button onClick={() => openDrilldown("leads", { title: `${p.park} · Отклики`, park: p.park })}>{rowTotal}</button></td>
                            {allSources.map((src) => {
                              const cnt = row[src];
                              const pct = rowTotal > 0 && cnt ? Math.round(cnt / rowTotal * 100) : 0;
                              return (
                                <td key={src} className="py-2 text-right px-2 tabular-nums" style={{ color: cnt ? "var(--color-text)" : "var(--color-border)" }}>
                                  {cnt ? <button onClick={() => openDrilldown("leads", { title: `${p.park} · ${src}`, park: p.park, source: src })}>{cnt} {pct}%</button> : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-0 overflow-hidden">
              <button onClick={() => setHoursOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                <span>
                  Время активности откликов
                  {peakHour && <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-muted)" }}>Пик: {peakHour[0]}:00-{String(Number(peakHour[0]) + 1).padStart(2, "0")}:00 ({peakHour[1]} лидов)</span>}
                </span>
                {hoursOpen ? <ChevronUp className="w-4 h-4" style={{ color: "var(--color-muted)" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />}
              </button>
              {hoursOpen && (
                <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
                    {Object.entries(metrics.hourBreakdown).map(([hour, count]) => {
                      const pct = Math.round((count / maxHour) * 100);
                      return (
                        <div key={hour} className="rounded-xl p-3" style={{ background: "var(--color-surface-2)" }}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span style={{ color: "var(--color-muted)" }}>{hour}:00</span>
                            <span className="font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{count}</span>
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: "var(--color-brand)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </>
        );
      })()}

      {drillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrillOpen(false)} />
          <div className="relative w-full max-w-6xl rounded-2xl p-4 md:p-5 max-h-[86vh] overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Найм — детализация</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · {drillTitle}</p>
              </div>
              <button onClick={() => setDrillOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl mb-3 w-fit" style={{ background: "var(--color-surface-2)" }}>
              <button onClick={() => { setDrillTab("leads"); setDrillStatusIds(null); setDrillExcludeStatusIds(null); setDrillSource(null); setDrillTitle("Отклики"); }} className="px-3 h-7 rounded-lg text-xs font-medium" style={{ background: drillTab === "leads" ? "var(--color-brand)" : "transparent", color: drillTab === "leads" ? "#fff" : "var(--color-muted)" }}>Отклики ({drillLeadsRows.length})</button>
              <button onClick={() => { setDrillTab("oform"); setDrillStatusIds(null); setDrillExcludeStatusIds(null); setDrillSource(null); setDrillTitle("Оформление"); }} className="px-3 h-7 rounded-lg text-xs font-medium" style={{ background: drillTab === "oform" ? "var(--color-brand)" : "transparent", color: drillTab === "oform" ? "#fff" : "var(--color-muted)" }}>Оформление ({drillOformRows.length})</button>
              <button onClick={() => { setDrillTab("first"); setDrillStatusIds(null); setDrillExcludeStatusIds(null); setDrillSource(null); setDrillTitle("1-я смена"); }} className="px-3 h-7 rounded-lg text-xs font-medium" style={{ background: drillTab === "first" ? "var(--color-brand)" : "transparent", color: drillTab === "first" ? "#fff" : "var(--color-muted)" }}>1-я смена ({drillFirstRows.length})</button>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select value={drillManager} onChange={(e) => setDrillManager(e.target.value)} className="h-8 px-2.5 rounded-lg text-xs outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="all">Все менеджеры</option>
                {drillManagers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={drillPark} onChange={(e) => setDrillPark(e.target.value)} className="h-8 px-2.5 rounded-lg text-xs outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="all">Все парки</option>
                {drillParks.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button onClick={exportCurrentTabExcel} className="h-8 px-3 rounded-lg text-xs font-medium" style={{ background: "var(--color-brand)", color: "#fff" }}>Excel ({filteredRows.length})</button>
            </div>

            <div className="overflow-auto max-h-[60vh] rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
              <table className="w-full text-xs min-w-[960px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {["Дата", "Лид/Сделка", "Имя", "Статус", "Источник", "Парк", "Менеджер", "Bitrix"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>)}
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
                        {row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: "var(--color-brand)" }}>Открыть <ExternalLink className="w-3 h-3" /></a> : <span style={{ color: "var(--color-muted)" }}>—</span>}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--color-muted)" }}>Нет записей по текущим фильтрам</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 30-day schedule modal */}
      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setScheduleOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl p-5 max-h-[86vh] overflow-hidden flex flex-col" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>{scheduleManagerName}</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Расписание за 30 дней</p>
              </div>
              <button onClick={() => setScheduleOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-auto flex-1">
              {scheduleLoading ? (
                <div className="space-y-2 animate-pulse">
                  {[...Array(10)].map((_, i) => <div key={i} className="h-9 rounded-lg skeleton" />)}
                </div>
              ) : scheduleData.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: "var(--color-muted)" }}>Нет данных о рабочем времени</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {["Дата", "Начало", "Конец", "Статус"].map((h) => (
                        <th key={h} className="pb-2 text-left text-xs font-medium pr-4" style={{ color: "var(--color-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleData.map((day) => {
                      const isWorked = day.status !== "NONE" && day.start;
                      const isClosed = day.status === "CLOSED";
                      const isOpen = day.status === "OPENED";
                      const [y, m, d] = day.date.split("-");
                      const dateLabel = `${d}.${m}.${y}`;
                      const weekday = new Date(day.date).toLocaleDateString("ru-RU", { weekday: "short" });
                      const isWeekend = [0, 6].includes(new Date(day.date).getDay());
                      return (
                        <tr key={day.date} style={{ borderBottom: "1px solid var(--color-border)", opacity: isWorked ? 1 : 0.45 }}>
                          <td className="py-2.5 pr-4 tabular-nums" style={{ color: isWeekend ? "var(--color-brand)" : "var(--color-text)" }}>
                            {dateLabel} <span className="text-xs" style={{ color: "var(--color-muted)" }}>{weekday}</span>
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums font-medium" style={{ color: isWorked ? "#1D9E75" : "var(--color-border)" }}>
                            {day.start ?? "—"}
                          </td>
                          <td className="py-2.5 pr-4 tabular-nums" style={{ color: isClosed && day.end ? "var(--color-text)" : "var(--color-muted)" }}>
                            {isClosed && day.end ? day.end : isOpen ? "идёт…" : "—"}
                          </td>
                          <td className="py-2.5">
                            {isClosed ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-xs" style={{ background: "rgba(29,158,117,0.12)", color: "#1D9E75" }}>закрыт</span>
                            ) : isOpen ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-xs" style={{ background: "rgba(245,158,11,0.12)", color: "var(--color-brand)" }}>открыт</span>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--color-border)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
