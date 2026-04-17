"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useOpsFilters } from "@/lib/context/OpsFilters";
import { apiFetch, readTaxiClientSettings } from "@/lib/utils";
import type { TaxiCRMShift } from "@/lib/connectors/taxicrm";
import { SHIFT_STATUS_LABELS } from "@/lib/config/operations";

function fmtR(n: number) { return `₽\u00A0${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function statusVariant(s: string): "success" | "warning" | "danger" | "default" {
  if (s === "closed") return "success";
  if (s === "open") return "warning";
  if (s === "canceled") return "danger";
  return "default";
}

export default function ShiftsPage() {
  const { filters, noToken } = useOpsFilters();
  const [shifts, setShifts] = useState<TaxiCRMShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const from = filters.mode === "day" ? filters.date : filters.dateFrom;
  const to   = filters.mode === "day" ? filters.date : filters.dateTo;

  useEffect(() => {
    if (noToken) { setLoading(false); return; }
    setLoading(true); setError(null);
    const { token, enabled } = readTaxiClientSettings();
    if (!enabled || !token) {
      setLoading(false);
      setError("TaxiCRM не подключён или отключён для раздела Операции.");
      setShifts([]);
      return;
    }

    apiFetch(`/api/operations/shifts?from=${from}&to=${to}`, { headers: { "x-taxi-token": token } })
      .then((r) => r.json())
      .then((j) => { if (!j.ok) throw new Error(j.error ?? "Ошибка"); setShifts(j.data ?? []); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to, noToken]);

  const dateLabel = filters.mode === "day" ? filters.date : `${from} — ${to}`;

  const filtered = search
    ? shifts.filter((s) =>
        s.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.car_plate?.toLowerCase().includes(search.toLowerCase()) ||
        s.park_name?.toLowerCase().includes(search.toLowerCase()))
    : shifts;

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 w-56 rounded skeleton" />
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Смены</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {dateLabel} · {shifts.length} смен
          </p>
        </div>
        <input
          type="text"
          placeholder="Поиск по водителю, авто, парку…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 px-3 rounded-lg text-sm outline-none w-64"
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text)",
          }}
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Водитель", "Авто", "Парк", "Начало", "Конец", "Статус", "Выручка", "Комиссия"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm"
                    style={{ color: "var(--color-muted)" }}>
                    {search ? "Ничего не найдено" : "Нет смен за период"}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-text)" }}>
                      {s.driver_name || "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs tabular-nums"
                      style={{ color: "var(--color-text)" }}>
                      {s.car_plate || "—"}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                      {s.park_name || s.park_id || "—"}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                      {fmtTime(s.started_at)}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-muted)" }}>
                      {s.ended_at ? fmtTime(s.ended_at) : "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant={statusVariant(s.status)}>
                        {SHIFT_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums font-medium"
                      style={{ color: "var(--color-brand)" }}>
                      {s.revenue != null ? fmtR(s.revenue) : "—"}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums"
                      style={{ color: "var(--color-muted)" }}>
                      {s.commission != null ? fmtR(s.commission) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
