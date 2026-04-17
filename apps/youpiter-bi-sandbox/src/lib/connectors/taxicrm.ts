/**
 * taxicrm.ru REST API connector.
 * Token is supplied per-request (from client localStorage → API route header).
 */

import { TAXICRM_BASE_URL } from "@/lib/config/operations";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaxiCRMDailyStat {
  date: string;
  park_id?: string;
  park_name?: string;
  cars_out: number;
  shifts_count: number;
  drivers_active: number;
  revenue: number;
}

export interface TaxiCRMShift {
  id: string;
  driver_id: string;
  driver_name: string;
  car_id: string;
  car_plate: string;
  park_id?: string;
  park_name?: string;
  started_at: string;
  ended_at?: string;
  status: string;
  revenue?: number;
  commission?: number;
}

export interface TaxiCRMDriver {
  id: string;
  name: string;
  phone?: string;
  park_id?: string;
  park_name?: string;
  status: string;
  shifts_total?: number;
}

export interface TaxiCRMCar {
  id: string;
  plate: string;
  model?: string;
  park_id?: string;
  park_name?: string;
  status?: string;
  driver_id?: string;
  driver_name?: string;
}

export interface OpsMetrics {
  dateFrom: string;
  dateTo: string;
  totalRevenue: number;
  carsOut: number;
  shiftsCount: number;
  driversActive: number;
  dailyStats: TaxiCRMDailyStat[];
  parkBreakdown: Record<string, { revenue: number; carsOut: number; shifts: number }>;
}

// ── Internal ────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function taxiGet<T>(
  token: string,
  path: string,
  params?: Record<string, string>,
  baseUrl = TAXICRM_BASE_URL
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  let attempt = 0;
  while (true) {
    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json", "User-Agent": "YoupiterBI/1.0" },
      cache: "no-store",
    });
    if (res.ok) return res.json() as Promise<T>;
    if (res.status === 429 && attempt < 3) {
      attempt++;
      await sleep(2000 * attempt);
      continue;
    }
    const body = await res.text().catch(() => "");
    throw new Error(`taxicrm API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

export async function fetchDailyStats(
  token: string, from: string, to: string, baseUrl?: string
): Promise<TaxiCRMDailyStat[]> {
  const data = await taxiGet<{ data: TaxiCRMDailyStat[] }>(
    token, "/api/v2/daily_stats", { date_from: from, date_to: to }, baseUrl
  );
  return data.data ?? [];
}

export async function fetchShifts(
  token: string, from: string, to: string, baseUrl?: string
): Promise<TaxiCRMShift[]> {
  const all: TaxiCRMShift[] = [];
  let page = 1;
  while (true) {
    const data = await taxiGet<{ data: TaxiCRMShift[]; next_page?: number }>(
      token, "/api/v2/shifts",
      { date_from: from, date_to: to, page: String(page), per_page: "100" },
      baseUrl
    );
    all.push(...(data.data ?? []));
    if (!data.next_page) break;
    page = data.next_page;
    await sleep(300);
  }
  return all;
}

export async function fetchDrivers(token: string, baseUrl?: string): Promise<TaxiCRMDriver[]> {
  const data = await taxiGet<{ data: TaxiCRMDriver[] }>(token, "/api/v2/drivers", undefined, baseUrl);
  return data.data ?? [];
}

export async function fetchCars(token: string, baseUrl?: string): Promise<TaxiCRMCar[]> {
  const data = await taxiGet<{ data: TaxiCRMCar[] }>(token, "/api/v2/cars", undefined, baseUrl);
  return data.data ?? [];
}

// ── Compute ─────────────────────────────────────────────────────────────────

export function computeOpsMetrics(
  dailyStats: TaxiCRMDailyStat[], from: string, to: string
): OpsMetrics {
  let totalRevenue = 0, carsOut = 0, shiftsCount = 0, driversActive = 0;
  const parkBreakdown: OpsMetrics["parkBreakdown"] = {};

  for (const d of dailyStats) {
    totalRevenue  += d.revenue      ?? 0;
    carsOut       += d.cars_out     ?? 0;
    shiftsCount   += d.shifts_count ?? 0;
    driversActive  = Math.max(driversActive, d.drivers_active ?? 0);

    const park = d.park_name ?? d.park_id ?? "Не указан";
    if (!parkBreakdown[park]) parkBreakdown[park] = { revenue: 0, carsOut: 0, shifts: 0 };
    parkBreakdown[park].revenue += d.revenue      ?? 0;
    parkBreakdown[park].carsOut += d.cars_out     ?? 0;
    parkBreakdown[park].shifts  += d.shifts_count ?? 0;
  }

  return { dateFrom: from, dateTo: to, totalRevenue, carsOut, shiftsCount, driversActive, dailyStats, parkBreakdown };
}
