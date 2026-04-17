"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, Copy, Download } from "lucide-react";
import { useHireFilters } from "@/lib/context/HireFilters";
import { REJECT_NAMES } from "@/lib/config/hire";
import Link from "next/link";
import * as XLSX from "xlsx";

function buildTextReport(dateLabel: string, metrics: NonNullable<ReturnType<typeof useHireFilters>["metrics"]>): string {
  const srcLines = Object.entries(metrics.sourceBreakdown)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([src, s]) => `   - ${src} = ${s.total}`)
    .join("\n");

  const rejLines = Object.entries(metrics.rejectBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([code, cnt]) => `   - ${REJECT_NAMES[code] ?? code} = ${cnt}`)
    .join("\n");

  const mgrLines = metrics.managerStats
    .map((m) => `   - ${m.name.split(" ").slice(0, 2).join(" ")}: откл=${m.total}, релев=${m.relevant}, собес=${m.sobes}, 1см=${m.dFirst}`)
    .join("\n");

  return [
    `Отчет найма`,
    `Период = ${dateLabel}`,
    ``,
    `1. Всего откликов = ${metrics.total}`,
    srcLines || "   - нет данных",
    ``,
    `2. Релевантные = ${metrics.relevant}`,
    `3. Нерелевантные = ${metrics.irrelevant}`,
    rejLines || "   - нет данных",
    `4. Не отвечают = ${metrics.noAns}`,
    `5. Думает = ${metrics.dumaet}`,
    `6. Собеседование = ${metrics.sobes}`,
    `7. Первая смена = ${metrics.dFirst}`,
    ``,
    `Конверсии:`,
    `   - Релев -> Собес = ${metrics.convRelevToSobes}%`,
    `   - Собес -> Первая смена = ${metrics.convSobesToFirst}%`,
    ``,
    `По менеджерам:`,
    mgrLines || "   - нет данных",
  ].join("\n");
}

export default function HireReportPage() {
  const { metrics, loading, error, noWebhook, filters } = useHireFilters();
  const [copied, setCopied] = useState(false);

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noWebhook) {
    return (
      <Card>
        <div className="text-center py-10">
          <p className="font-semibold mb-2" style={{ color: "var(--color-text)" }}>Bitrix24 не подключен</p>
          <Link href="/settings/integrations"
            className="inline-block mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--color-brand)" }}>
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

  if (loading && !metrics) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 rounded-xl skeleton" />
        <div className="h-64 rounded-xl skeleton" />
      </div>
    );
  }

  if (!metrics) return null;

  const reportText = buildTextReport(dateLabel, metrics);

  function copyReport() {
    navigator.clipboard.writeText(reportText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadReport() {
    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hire_report_${dateLabel.replace(/\s+/g, "_").replace(/[^\w-]/g, "_")}.txt`;
    a.click();
  }

  function exportExcelDetails() {
    if (!metrics) return;
    const leads = metrics.drilldown?.leads ?? [];
    const oform = metrics.drilldown?.oformlenie ?? [];
    const first = metrics.drilldown?.firstShift ?? [];
    const mapRows = (rows: Array<{ date?: string; title?: string; status?: string; source?: string; park?: string; managerName?: string; managerId?: string; url?: string }>) =>
      rows.map((r) => ({
        "Дата": String(r.date || "").slice(0, 16).replace("T", " "),
        "Лид/Сделка": r.title || "",
        "Статус": r.status || "",
        "Источник": r.source || "",
        "Парк": r.park || "",
        "Менеджер": r.managerName || r.managerId || "",
        "Ссылка Bitrix": r.url || "",
      }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapRows(leads)), "Отклики");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapRows(oform)), "Оформление");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapRows(first)), "Первая смена");
    XLSX.writeFile(wb, `hire_report_${dateLabel.replace(/[^\dA-Za-zА-Яа-я_-]+/g, "_")}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Отчет</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          Найм за период {dateLabel}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Отклики", value: metrics.total },
          { label: "Релевантные", value: metrics.relevant },
          { label: "Собеседования", value: metrics.sobes },
          { label: "Первая смена", value: metrics.dFirst },
          { label: "Конв. Собес->1", value: `${metrics.convSobesToFirst}%` },
        ].map((m) => (
          <Card key={m.label}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>{m.label}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: "var(--color-brand)" }}>{m.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Текст отчета</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={copyReport}
              className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{ background: copied ? "var(--color-brand-soft)" : "var(--color-surface-2)", color: copied ? "var(--color-brand)" : "var(--color-muted)" }}
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <button
              onClick={downloadReport}
              className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}
            >
              <Download className="w-3.5 h-3.5" />
              TXT
            </button>
            <button
              onClick={exportExcelDetails}
              className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
              style={{ background: "var(--color-brand)", color: "#fff" }}
            >
              <Download className="w-3.5 h-3.5" />
              Excel детали
            </button>
          </div>
        </div>
        <pre
          className="text-xs leading-relaxed whitespace-pre-wrap rounded-xl p-4 overflow-x-auto"
          style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
        >
          {reportText}
        </pre>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Срез по менеджерам</h3>
        <div className="space-y-2">
          {metrics.managerStats.slice(0, 10).map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--color-text)" }}>{m.name.split(" ").slice(0, 2).join(" ")}</span>
              <div className="flex items-center gap-2">
                <Badge variant="default">{m.total}</Badge>
                <Badge variant="success">{m.dFirst}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
