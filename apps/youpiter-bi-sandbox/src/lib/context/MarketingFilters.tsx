"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { MarketingMetrics, YDCampaign } from "@/lib/connectors/yandex-direct";
import { apiFetch } from "@/lib/utils";

export type DateMode = "day" | "range";

export interface MarketingFilterState {
  mode: DateMode;
  date: string;
  dateFrom: string;
  dateTo: string;
  campaignId: string;
}

interface MarketingCtx {
  filters: MarketingFilterState;
  setFilters: (f: MarketingFilterState) => void;
  metrics: MarketingMetrics | null;
  campaigns: YDCampaign[];
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

export const mktDateHelpers = { todayMsk, dateOffset, firstDayOfMonth };

function defaultFilters(): MarketingFilterState {
  const today = todayMsk();
  return { mode: "day", date: today, dateFrom: dateOffset(today, -6), dateTo: today, campaignId: "" };
}

const MarketingFiltersContext = createContext<MarketingCtx>({
  filters: defaultFilters(), setFilters: () => {}, metrics: null, campaigns: [],
  loading: true, error: null, refresh: () => {}, noToken: false,
});

export function useMarketingFilters() { return useContext(MarketingFiltersContext); }

export function MarketingFiltersProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters]   = useState<MarketingFilterState>(defaultFilters);
  const [metrics, setMetrics]   = useState<MarketingMetrics | null>(null);
  const [campaigns, setCampaigns] = useState<YDCampaign[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [noToken, setNoToken]   = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (f: MarketingFilterState) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let token = "", clientLogin = "", enabled = true;
    try {
      const yd = JSON.parse(localStorage.getItem("yb_int_yandex") ?? "{}");
      token = yd.token ?? ""; clientLogin = yd.clientId ?? "";
      enabled = !Array.isArray(yd.sections) || yd.sections.includes("marketing");
    } catch { /* */ }

    setLoading(true); setError(null);
    const from = f.mode === "day" ? f.date : f.dateFrom;
    const to   = f.mode === "day" ? f.date : f.dateTo;

    try {
      if (!enabled || !token || !clientLogin) {
        setNoToken(true);
        setMetrics(null);
        setCampaigns([]);
        return;
      }
      const res  = await apiFetch(`/api/marketing/yandex?from=${from}&to=${to}`, {
        headers: { "x-yandex-token": token, "x-yandex-login": clientLogin },
        signal: abortRef.current.signal,
      });
      const json = await res.json();
      if (res.status === 503) { setNoToken(true); return; }
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setNoToken(false);
      setMetrics(json.data.metrics);
      setCampaigns(json.data.campaigns ?? []);
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
    <MarketingFiltersContext.Provider
      value={{ filters, setFilters, metrics, campaigns, loading, error, refresh, noToken }}
    >
      {children}
    </MarketingFiltersContext.Provider>
  );
}
