"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { OpsMetrics } from "@/lib/connectors/taxicrm";
import { apiFetch } from "@/lib/utils";

export type DateMode = "day" | "range";

export interface OpsFilterState {
  mode: DateMode;
  date: string;
  dateFrom: string;
  dateTo: string;
  park: string;
}

interface OpsCtx {
  filters: OpsFilterState;
  setFilters: (f: OpsFilterState) => void;
  metrics: OpsMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  noToken: boolean;
}

function todayMsk() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
}

function dateOffset(base: string, days: number) {
  const d = new Date(base); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const d = new Date(Date.now() + 3 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export const opsDateHelpers = { todayMsk, dateOffset, firstDayOfMonth };

function defaultFilters(): OpsFilterState {
  const today = todayMsk();
  return { mode: "day", date: today, dateFrom: dateOffset(today, -6), dateTo: today, park: "" };
}

const OpsFiltersContext = createContext<OpsCtx>({
  filters: defaultFilters(), setFilters: () => {}, metrics: null,
  loading: true, error: null, refresh: () => {}, noToken: false,
});

export function useOpsFilters() { return useContext(OpsFiltersContext); }

export function OpsFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<OpsFilterState>(defaultFilters);
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [noToken, setNoToken] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (f: OpsFilterState) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Read token from localStorage each time (picks up settings changes)
    let token = "", enabled = true;
    try {
      const settings = JSON.parse(localStorage.getItem("yb_int_taxicrm") ?? "{}");
      token = settings.token ?? "";
      enabled = !Array.isArray(settings.sections) || settings.sections.includes("operations");
    } catch { /* */ }

    setLoading(true); setError(null);
    const from = f.mode === "day" ? f.date : f.dateFrom;
    const to   = f.mode === "day" ? f.date : f.dateTo;

    try {
      if (!enabled || !token) {
        setNoToken(true);
        setMetrics(null);
        return;
      }
      const res  = await apiFetch(`/api/operations/summary?from=${from}&to=${to}`, {
        headers: { "x-taxi-token": token },
        signal: abortRef.current.signal,
      });
      const json = await res.json();
      if (res.status === 503) { setNoToken(true); return; }
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setNoToken(false);
      setMetrics(json.data);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(filters), [load, filters]);
  useEffect(() => { load(filters); }, [filters, load]);

  return (
    <OpsFiltersContext.Provider
      value={{ filters, setFilters, metrics, loading, error, refresh, noToken }}
    >
      {children}
    </OpsFiltersContext.Provider>
  );
}
