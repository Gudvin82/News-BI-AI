"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Car } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch, readTaxiClientSettings } from "@/lib/utils";
import type { TaxiCRMCar } from "@/lib/connectors/taxicrm";
import Link from "next/link";

function carStatusVariant(s?: string): "success" | "warning" | "danger" | "default" {
  if (!s) return "default";
  if (s === "active") return "success";
  if (s === "repair") return "warning";
  if (s === "blocked" || s === "archive") return "danger";
  return "default";
}

function carStatusLabel(s?: string) {
  const map: Record<string, string> = {
    active: "Активен", repair: "Ремонт",
    idle: "Простой", blocked: "Заблокирован", archive: "Архив",
  };
  return s ? (map[s] ?? s) : "—";
}

export default function CarsPage() {
  const [cars, setCars] = useState<TaxiCRMCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noToken, setNoToken] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const { token, enabled } = readTaxiClientSettings();
    if (!enabled || !token) { setNoToken(true); setLoading(false); return; }

    apiFetch("/api/operations/cars", { headers: { "x-taxi-token": token } })
      .then((r) => r.json())
      .then((j) => { if (!j.ok) throw new Error(j.error ?? "Ошибка"); setCars(j.data ?? []); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (noToken) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Car className="w-10 h-10" style={{ color: "var(--color-muted)" }} />
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
    ? cars.filter((c) =>
        c.plate?.toLowerCase().includes(search.toLowerCase()) ||
        c.model?.toLowerCase().includes(search.toLowerCase()) ||
        c.park_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.driver_name?.toLowerCase().includes(search.toLowerCase()))
    : cars;

  // Stats
  const active = cars.filter((c) => c.status === "active").length;
  const repair = cars.filter((c) => c.status === "repair").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Автопарк</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Всего: {cars.length} · Активных: {active} · В ремонте: {repair}
          </p>
        </div>
        <input
          type="text"
          placeholder="Поиск по номеру, модели, парку…"
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
                {["Номер", "Модель", "Парк", "Водитель", "Статус"].map((h) => (
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
                    {search ? "Ничего не найдено" : "Нет автомобилей"}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="py-2.5 px-4 font-mono text-xs font-bold tabular-nums"
                      style={{ color: "var(--color-text)" }}>
                      {c.plate || "—"}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-text)" }}>
                      {c.model || "—"}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                      {c.park_name || c.park_id || "—"}
                    </td>
                    <td className="py-2.5 px-4" style={{ color: "var(--color-muted)" }}>
                      {c.driver_name || "—"}
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant={carStatusVariant(c.status)}>
                        {carStatusLabel(c.status)}
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
