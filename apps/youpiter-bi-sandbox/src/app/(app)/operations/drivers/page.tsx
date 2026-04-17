"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch, readTaxiClientSettings } from "@/lib/utils";
import type { TaxiCRMDriver } from "@/lib/connectors/taxicrm";
import { DRIVER_STATUS_LABELS } from "@/lib/config/operations";
import Link from "next/link";

function driverVariant(s: string): "success" | "warning" | "danger" | "default" {
  if (s === "active") return "success";
  if (s === "blocked") return "danger";
  if (s === "archive") return "default";
  return "default";
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<TaxiCRMDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noToken, setNoToken] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const { token, enabled } = readTaxiClientSettings();
    if (!enabled || !token) { setNoToken(true); setLoading(false); return; }

    apiFetch("/api/operations/drivers", { headers: { "x-taxi-token": token } })
      .then((r) => r.json())
      .then((j) => { if (!j.ok) throw new Error(j.error ?? "Ошибка"); setDrivers(j.data ?? []); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (noToken) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Users className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>TaxiCRM не подключён или отключён для Операций</p>
          <Link href="/settings/integrations"
            className="mt-1 px-4 py-2 rounded-lg text-sm font-medium text-white inline-block"
            style={{ background: "var(--color-brand)" }}>
            Настроить
          </Link>
        </div>
      </Card>
    );
  }

  if (loading) {
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

  const filtered = search
    ? drivers.filter((d) =>
        d.name?.toLowerCase().includes(search.toLowerCase()) ||
        d.phone?.includes(search) ||
        d.park_name?.toLowerCase().includes(search.toLowerCase()))
    : drivers;

  const active  = drivers.filter((d) => d.status === "active").length;
  const blocked = drivers.filter((d) => d.status === "blocked").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Водители</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Всего: {drivers.length} · Активных: {active} · Заблокировано: {blocked}
          </p>
        </div>
        <input
          type="text"
          placeholder="Поиск по имени, телефону, парку…"
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
                {["ФИО", "Телефон", "Парк", "Смен", "Статус"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-medium"
                    style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm"
                    style={{ color: "var(--color-muted)" }}>
                    {search ? "Ничего не найдено" : "Нет водителей"}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-text)" }}>
                      {d.name || "—"}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums font-mono text-xs"
                      style={{ color: "var(--color-muted)" }}>
                      {d.phone || "—"}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                      {d.park_name || d.park_id || "—"}
                    </td>
                    <td className="py-2.5 px-4 tabular-nums" style={{ color: "var(--color-text)" }}>
                      {d.shifts_total ?? "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant={driverVariant(d.status)}>
                        {DRIVER_STATUS_LABELS[d.status] ?? d.status}
                      </Badge>
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
