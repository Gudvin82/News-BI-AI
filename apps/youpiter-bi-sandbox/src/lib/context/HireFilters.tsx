"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { HireMetrics } from "@/lib/connectors/bitrix";
import { apiFetch } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

export type DateMode = "day" | "range";

export interface HireFilterState {
  mode: DateMode;
  date: string;       // for day mode
  dateFrom: string;   // for range mode
  dateTo: string;     // for range mode
  manager: string;    // "" = all, or manager ID
  sources: string[];  // [] = all
  parks: string[];    // [] = all
  search: string;     // lead name search
}

interface HireCtx {
  filters: HireFilterState;
  setFilters: (f: HireFilterState) => void;
  metrics: HireMetrics | null;
  compareMetrics: HireMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  noWebhook: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function todayMsk() {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateOffset(base: string, days: number) {
  const d = new Date(base); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export const dateHelpers = { todayMsk, dateOffset, firstDayOfMonth };

/** Compute previous comparison period for a given date range */
function prevPeriod(from: string, to: string): { prevFrom: string; prevTo: string } {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
  return {
    prevFrom: dateOffset(from, -(days + 1)),
    prevTo:   dateOffset(from, -1),
  };
}

const defaultFilters = (): HireFilterState => ({
  mode: "day",
  date: todayMsk(),
  dateFrom: dateOffset(todayMsk(), -6),
  dateTo: todayMsk(),
  manager: "",
  sources: [],
  parks: [],
  search: "",
});

// ── Context ────────────────────────────────────────────────────────────────

const HireFiltersContext = createContext<HireCtx>({
  filters: defaultFilters(),
  setFilters: () => {},
  metrics: null,
  compareMetrics: null,
  loading: true,
  error: null,
  refresh: () => {},
  noWebhook: false,
});

export function useHireFilters() {
  return useContext(HireFiltersContext);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function HireFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters]       = useState<HireFilterState>(defaultFilters);
  const [metrics, setMetrics]       = useState<HireMetrics | null>(null);
  const [compareMetrics, setCompare] = useState<HireMetrics | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [noWebhook, setNoWebhook]   = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (f: HireFilterState) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setNoWebhook(false);

    const from = f.mode === "day" ? f.date     : f.dateFrom;
    const to   = f.mode === "day" ? f.date     : f.dateTo;

    const params = new URLSearchParams({ from, to });
    if (f.manager)        params.set("manager", f.manager);
    if (f.sources.length) params.set("sources", f.sources.join(","));
    if (f.parks.length)   params.set("parks",   f.parks.join(","));

    try {
      const res  = await apiFetch(`/api/hire/summary?${params}`, { signal });
      const json = await res.json();
      if (res.status === 503) { setNoWebhook(true); return; }
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setNoWebhook(false);
      setMetrics(json.data);

      // Fetch comparison period in background (no abort — let it finish)
      const { prevFrom, prevTo } = prevPeriod(from, to);
      const cmpParams = new URLSearchParams({ from: prevFrom, to: prevTo });
      if (f.manager)        cmpParams.set("manager", f.manager);
      if (f.sources.length) cmpParams.set("sources", f.sources.join(","));
      if (f.parks.length)   cmpParams.set("parks",   f.parks.join(","));
      apiFetch(`/api/hire/summary?${cmpParams}`)
        .then((r) => r.json())
        .then((j) => { if (j.ok) setCompare(j.data); })
        .catch(() => { /* comparison is optional */ });

    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(filters), [load, filters]);

  useEffect(() => { load(filters); }, [filters, load]);

  const handleSetFilters = useCallback((f: HireFilterState) => {
    setFilters(f);
  }, []);

  return (
    <HireFiltersContext.Provider
      value={{ filters, setFilters: handleSetFilters, metrics, compareMetrics, loading, error, refresh, noWebhook }}
    >
      {children}
    </HireFiltersContext.Provider>
  );
}
