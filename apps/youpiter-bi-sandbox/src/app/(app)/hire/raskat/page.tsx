"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useHireFilters } from "@/lib/context/HireFilters";
import type { RaskatMetrics } from "@/lib/connectors/bitrix";
import { apiFetch } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { RASKAT_RELEVANT, RASKAT_IRRELEVANT } from "@/lib/config/hire";

type DrillRow = {
  id: string;
  date: string;
  title: string;
  managerId: string;
  managerName: string;
  source: string;
  park: string;
  statusId: string;
  status: string;
  url: string;
};

function fmt(n: number) { return n.toLocaleString("ru-RU"); }

export default function HireRaskatPage() {
  const { filters, noWebhook } = useHireFilters();
  const [metrics, setMetrics] = useState<(RaskatMetrics & { dateFrom: string; dateTo: string; drilldown: DrillRow[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState("Раскат — детализация");
  const [drillManager, setDrillManager] = useState("all");
  const [drillStatus, setDrillStatus] = useState("all");
  const [drillSource, setDrillSource] = useState("all");
  const [drillStatusIds, setDrillStatusIds] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    const from = filters.mode === "day" ? filters.date : filters.dateFrom;
    const to = filters.mode === "day" ? filters.date : filters.dateTo;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/hire/raskat?from=${from}&to=${to}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка сервера");
      setMetrics(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const dateLabel = filters.mode === "day" ? filters.date : `${filters.dateFrom} — ${filters.dateTo}`;
  const rows = metrics?.drilldown ?? [];
  const managers = Array.from(new Set(rows.map((r) => (r.managerName || r.managerId).trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const statuses = Array.from(new Set(rows.map((r) => (r.status || r.statusId).trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const sources = Array.from(new Set(rows.map((r) => (r.source || "Не указан").trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const filteredRows = rows.filter((r) => {
    const managerName = (r.managerName || r.managerId).trim();
    if (drillManager !== "all" && managerName !== drillManager) return false;
    if (drillStatusIds?.length && !drillStatusIds.includes(String(r.statusId || ""))) return false;
    if (drillStatus !== "all" && (r.status || r.statusId) !== drillStatus) return false;
    if (drillSource !== "all" && (r.source || "Не указан").trim() !== drillSource) return false;
    return true;
  });

  function openDrill(title: string, opts?: { manager?: string; status?: string; source?: string; statusIds?: string[] | null }) {
    setDrillTitle(title);
    setDrillManager(opts?.manager ?? "all");
    setDrillStatus(opts?.status ?? "all");
    setDrillSource(opts?.source ?? "all");
    setDrillStatusIds(opts?.statusIds ?? null);
    setDrillOpen(true);
  }

  function exportExcel() {
    if (!filteredRows.length) return;
    const data = filteredRows.map((r) => ({
      "Дата": String(r.date || "").slice(0, 16).replace("T", " "),
      "Лид": r.title || "",
      "Статус": r.status || "",
      "Источник": r.source || "",
      "Парк": r.park || "",
      "Менеджер": r.managerName || r.managerId || "",
      "Ссылка Bitrix": r.url || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Раскат");
    XLSX.writeFile(wb, `raskat_${dateLabel.replace(/[^\dA-Za-zА-Яа-я_-]+/g, "_")}.xlsx`);
  }

  if (noWebhook) {
    return (
      <Card>
        <div className="text-center py-10">
          <p className="font-semibold mb-2" style={{ color: "var(--color-text)" }}>Bitrix24 не подключён</p>
          <Link href="/settings/integrations" className="inline-block mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "var(--color-brand)" }}>Настроить</Link>
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

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <div key={i} className="h-24 rounded-xl skeleton" />)}
        </div>
        <div className="h-64 rounded-xl skeleton" />
      </div>
    );
  }

  if (!metrics) return null;

  const { total, relevant, irrelevant, converted, zapis, byManager, byStatus, byReject } = metrics;
  const convRate = total > 0 ? Math.round(relevant / total * 100) : 0;
  const funnelSteps = [
    { label: "Все лиды", v: total, color: "#4f6ef7" },
    { label: "Релевантные", v: relevant, color: "#10B981" },
    { label: "Запись на встречу", v: zapis, color: "#8B5CF6" },
    { label: "Качественный лид", v: converted, color: "#F59E0B" },
  ];
  const maxV = Math.max(total, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Раскат</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · Bitrix24</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Все лиды", v: total, sub: "за период" },
          { label: "Релевантные", v: relevant, sub: `${convRate}% от всех` },
          { label: "Нерелевантные", v: irrelevant, sub: "брак / спам" },
          { label: "Запись на встречу", v: zapis, sub: "UC_U8ZJ1Q" },
          { label: "Качественный лид", v: converted, sub: "CONVERTED" },
        ].map((m) => (
          <Card key={m.label}>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>{m.label}</p>
            <button
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--color-brand)" }}
              onClick={() => openDrill(
                m.label,
                m.label === "Релевантные"
                  ? { statusIds: Array.from(RASKAT_RELEVANT) }
                  : m.label === "Нерелевантные"
                  ? { statusIds: Array.from(RASKAT_IRRELEVANT) }
                  : m.label === "Запись на встречу"
                  ? { statusIds: ["UC_U8ZJ1Q"] }
                  : m.label === "Качественный лид"
                  ? { statusIds: ["CONVERTED"] }
                  : {}
              )}
            >
              {fmt(m.v)}
            </button>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{m.sub} · подробнее</p>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-text)" }}>Воронка</h2>
        <div className="space-y-4">
          {funnelSteps.map((step) => {
            const pct = Math.round(step.v / maxV * 100);
            return (
              <div key={step.label}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span style={{ color: "var(--color-text)" }}>{step.label}</span>
                  <span className="font-bold tabular-nums" style={{ color: step.color }}>{fmt(step.v)}<span className="font-normal text-xs ml-2" style={{ color: "var(--color-muted)" }}>{pct}%</span></span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                  <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${Math.max(pct, 1)}%`, background: step.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По менеджерам</h3>
          <div className="space-y-2">
            {Object.entries(byManager).sort((a, b) => b[1] - a[1]).map(([name, cnt]) => (
              <button key={name} className="w-full flex items-center justify-between text-sm text-left" onClick={() => openDrill(`Раскат · менеджер ${name}`, { manager: name, statusIds: null })}>
                <span style={{ color: "var(--color-muted)" }}>{name}</span>
                <Badge variant="default">{cnt}</Badge>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>По статусам</h3>
          <div className="space-y-2">
            {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([label, cnt]) => (
              <button key={label} className="w-full flex items-center justify-between text-sm text-left" onClick={() => openDrill(`Раскат · статус ${label}`, { status: label, statusIds: null })}>
                <span style={{ color: "var(--color-muted)" }}>{label}</span>
                <Badge variant="default">{cnt}</Badge>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Причины нерелевантности</h3>
          <div className="space-y-2">
            {Object.entries(byReject).sort((a, b) => b[1] - a[1]).map(([label, cnt]) => (
              <button key={label} className="w-full flex items-center justify-between text-sm text-left" onClick={() => openDrill(`Раскат · причина ${label}`, { status: label, statusIds: null })}>
                <span style={{ color: "var(--color-muted)" }}>{label}</span>
                <Badge variant="danger">{cnt}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {drillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrillOpen(false)} />
          <div className="relative w-full max-w-6xl rounded-2xl p-4 md:p-5 max-h-[86vh] overflow-hidden" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Раскат — детализация</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{dateLabel} · {drillTitle}</p>
              </div>
              <button onClick={() => setDrillOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select value={drillManager} onChange={(e) => setDrillManager(e.target.value)} className="h-8 px-2.5 rounded-lg text-xs outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="all">Все менеджеры</option>
                {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select
                value={drillStatus}
                onChange={(e) => {
                  setDrillStatus(e.target.value);
                  setDrillStatusIds(null);
                }}
                className="h-8 px-2.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                <option value="all">Все статусы</option>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={drillSource} onChange={(e) => setDrillSource(e.target.value)} className="h-8 px-2.5 rounded-lg text-xs outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="all">Все источники</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={exportExcel} className="h-8 px-3 rounded-lg text-xs font-medium" style={{ background: "var(--color-brand)", color: "#fff" }}>Excel ({filteredRows.length})</button>
            </div>
            <div className="overflow-auto max-h-[60vh] rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
              <table className="w-full text-xs min-w-[920px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {["Дата", "Лид", "Статус", "Источник", "Парк", "Менеджер", "Bitrix"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((r) => (
                    <tr key={`${r.id}-${r.date}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--color-muted)" }}>{String(r.date || "").slice(0, 16).replace("T", " ")}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text)" }}>{r.title}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text)" }}>{r.status}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{r.source}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{r.park}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{r.managerName || r.managerId}</td>
                      <td className="px-3 py-2.5">
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: "var(--color-brand)" }}>Открыть <ExternalLink className="w-3 h-3" /></a> : "—"}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--color-muted)" }}>Нет записей по текущим фильтрам</td></tr>
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
