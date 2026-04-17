"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { FinanceMetrics } from "@/lib/connectors/gsheets";
import { apiFetch, encodeHeaderJson } from "@/lib/utils";

export type DateMode = "day" | "range";

export interface CashFilterState {
  mode: DateMode;
  date: string;
  dateFrom: string;
  dateTo: string;
}

interface CashCtx {
  filters: CashFilterState;
  setFilters: (f: CashFilterState) => void;
  metrics: FinanceMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  noSheets: boolean;
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

export const cashDateHelpers = { todayMsk, dateOffset, firstDayOfMonth };

function defaultFilters(): CashFilterState {
  const today = todayMsk();
  return { mode: "day", date: today, dateFrom: firstDayOfMonth(), dateTo: today };
}

const CashFiltersContext = createContext<CashCtx>({
  filters: defaultFilters(), setFilters: () => {}, metrics: null,
  loading: true, error: null, refresh: () => {}, noSheets: false,
});

export function useCashFilters() { return useContext(CashFiltersContext); }

export function CashFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<CashFilterState>(defaultFilters);
  const [metrics, setMetrics] = useState<FinanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [noSheets, setNoSheets] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (f: CashFilterState) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let docs: Array<{ url: string; name?: string; mapping?: unknown }> = [];
    try {
      const rawDocs = JSON.parse(localStorage.getItem("yb_int_gsheets") ?? "[]");
      docs = (rawDocs as Array<{ url?: string; name?: string; sections?: string[]; mapping?: unknown }>)
        .filter((d) => d.url && (!d.sections || d.sections.includes("cash")))
        .map((d) => ({ url: d.url!, name: d.name, mapping: d.mapping }));
    } catch { /* */ }

    setLoading(true); setError(null);
    const from = f.mode === "day" ? f.date : f.dateFrom;
    const to   = f.mode === "day" ? f.date : f.dateTo;

    try {
      const res = await apiFetch(`/api/cash/daily?from=${from}&to=${to}`, {
        headers: { "x-gsheets-docs": encodeHeaderJson(docs) },
        signal: abortRef.current.signal,
      });
      const json = await res.json();
      if (res.status === 503) { setNoSheets(true); return; }
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setNoSheets(false);
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
    <CashFiltersContext.Provider value={{ filters, setFilters, metrics, loading, error, refresh, noSheets }}>
      {children}
    </CashFiltersContext.Provider>
  );
}
