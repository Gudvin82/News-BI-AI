"use client";

import { AlertTriangle, BarChart2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useMarketingFilters } from "@/lib/context/MarketingFilters";
import Link from "next/link";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}М`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}К`;
  return String(v);
}

function campaignStatusVariant(s: string): "success" | "warning" | "danger" | "default" {
  if (s === "SERVING" || s === "ON") return "success";
  if (s === "SUSPENDED" || s === "PAUSED") return "warning";
  if (s === "ENDED" || s === "ARCHIVED") return "danger";
  return "default";
}

function campaignStatusLabel(s: string) {
  const map: Record<string, string> = {
    SERVING: "Активна", ON: "Активна",
    SUSPENDED: "Приостановлена", PAUSED: "Пауза",
    ENDED: "Завершена", ARCHIVED: "Архив",
  };
  return map[s] ?? s;
}

export default function YandexDirectPage() {
  const { metrics, campaigns, loading, error, noToken, filters } = useMarketingFilters();

  const dateLabel = filters.mode === "day"
    ? filters.date
    : `${filters.dateFrom} — ${filters.dateTo}`;

  if (noToken) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <BarChart2 className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Яндекс Директ не подключён</p>
          <Link href="/settings/integrations"
            className="mt-1 px-4 py-2 rounded-lg text-sm font-medium text-white inline-block"
            style={{ background: "var(--color-brand)" }}>
            Настроить
          </Link>
        </div>
      </Card>
    );
  }

  if (loading && !metrics) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-40 rounded skeleton" />
        <div className="h-80 rounded-xl skeleton" />
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

  // Merge campaignStats (with cost/clicks data) with campaigns (with status)
  const statusMap: Record<string, string> = {};
  for (const c of campaigns) statusMap[c.id] = c.status;

  const { campaignStats } = metrics;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Яндекс Директ</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          {dateLabel} · {campaignStats.length} кампаний
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Кампания", "Статус", "Расходы", "Показов", "Кликов", "CTR", "CPC"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaignStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm"
                    style={{ color: "var(--color-muted)" }}>
                    Нет данных за период
                  </td>
                </tr>
              ) : (
                campaignStats.map((c) => {
                  const status = statusMap[c.campaignId];
                  return (
                    <tr key={c.campaignId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="py-2.5 px-4 max-w-[220px]" style={{ color: "var(--color-text)" }}>
                        <span className="block truncate" title={c.campaignName}>{c.campaignName}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        {status ? (
                          <Badge variant={campaignStatusVariant(status)}>
                            {campaignStatusLabel(status)}
                          </Badge>
                        ) : <span style={{ color: "var(--color-muted)" }}>—</span>}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums font-medium"
                        style={{ color: "var(--color-brand)" }}>{fmtR(c.cost)}</td>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-muted)" }}>
                        {fmtK(c.impressions)}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                        {c.clicks.toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                        {c.ctr}%
                      </td>
                      <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-muted)" }}>
                        {c.clicks > 0 ? fmtR(c.cost / c.clicks) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
