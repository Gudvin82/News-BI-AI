"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RevenueChart } from "@/components/charts/RevenueChart";
import {
  Banknote, Car, Users, Wallet,
  AlertTriangle, ArrowUpRight, Wrench,
  RefreshCw, CalendarDays, Megaphone, ExternalLink, X,
} from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { apiFetch, encodeHeaderJson, readYandexClientSettings } from "@/lib/utils";

// ── Date helpers ────────────────────────────────────────────────────────────
type Preset = "today" | "yesterday" | "week" | "month" | "custom";

function toISO(d: Date) { return format(d, "yyyy-MM-dd"); }

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  switch (p) {
    case "today":     return { from: toISO(now),           to: toISO(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: toISO(y), to: toISO(y) }; }
    case "week":      return { from: toISO(startOfWeek(now, { weekStartsOn: 1 })), to: toISO(now) };
    case "month":     return { from: toISO(startOfMonth(now)), to: toISO(now) };
    default:          return { from: toISO(now), to: toISO(now) };
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ParkRow  { name: string; code: string; cars: number; active: number; revenue: number; drivers: number }
interface AlertRow { id: string; level: string; text: string }
interface DashData {
  date: string;
  revenue: { today: number; yesterday: number; week: number[] };
  cash: { balance: number };
  fleet: { active: number; total: number; repair: number; idle: number };
  parks: ParkRow[];
  hire: { leads: number; sobes: number; dFirst: number; convRelevToSobes: number; convSobesToFirst: number };
  alerts: AlertRow[];
  meta: { source: string; updatedAt: string };
}

interface FinanceMini {
  totalIncome: number;
  totalExpense: number;
  profit: number;
  entries: number;
  configured: boolean;
  error?: string | null;
}

interface DtpMini {
  total: number;
  open: number;
  won: number;
  lost: number;
  totalDamage: number;
  configured: boolean;
  error?: string | null;
}

interface MarketingMini {
  totalCost: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  totalRevenue: number;
  conversionRate: number;
  avgCtr: number;
  costPerClick: number;
  costPerConversion: number;
  romi: number | null;
  campaigns: number;
  configured: boolean;
  error?: string | null;
}

interface WorkshopMini {
  grandTotal: number;
  error?: string | null;
}

interface HireDrillRow {
  id: string;
  date: string;
  title: string;
  managerId: string;
  managerName?: string;
  source: string;
  park: string;
  status: string;
  url: string;
}

function slugifyRu(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("ru-RU"); }
function pct(a: number, b: number) { return b > 0 ? Math.round(a / b * 100) : 0; }
function trend(today: number, yesterday: number) {
  if (!yesterday) return 0;
  return Math.round((today - yesterday) / yesterday * 100);
}

const DAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function withRange(path: string, from: string, to: string) {
  const params = new URLSearchParams({ from, to });
  return `${path}?${params.toString()}`;
}

function MetricLinkCard({
  href,
  title,
  value,
  subtitle,
  trend,
  icon,
  color = "default",
}: {
  href: string;
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
  color?: "default" | "success" | "danger" | "warning" | "brand";
}) {
  return (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      <MetricCard
        title={title}
        value={value}
        subtitle={subtitle}
        trend={trend}
        icon={icon}
        color={color}
        className="h-full"
      />
    </Link>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [financeMini, setFinanceMini] = useState<FinanceMini | null>(null);
  const [dtpMini, setDtpMini] = useState<DtpMini | null>(null);
  const [marketingMini, setMarketingMini] = useState<MarketingMini | null>(null);
  const [workshopMini, setWorkshopMini] = useState<WorkshopMini | null>(null);
  const [hireLeadsRows, setHireLeadsRows] = useState<HireDrillRow[]>([]);
  const [hireFirstRows, setHireFirstRows] = useState<HireDrillRow[]>([]);
  const [hireModalOpen, setHireModalOpen] = useState(false);
  const [hireTab, setHireTab] = useState<"leads" | "first">("leads");
  const [hireManagerFilter, setHireManagerFilter] = useState("all");
  const [hireParkFilter, setHireParkFilter] = useState("all");

  const [preset, setPreset]   = useState<Preset>("today");
  const [dateFrom, setDateFrom] = useState(() => toISO(new Date()));
  const [dateTo,   setDateTo]   = useState(() => toISO(new Date()));
  const [showCustom, setShowCustom] = useState(false);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setDateFrom(r.from);
      setDateTo(r.to);
      setShowCustom(false);
    } else {
      setShowCustom(true);
    }
  }

  const load = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const url = `/api/dashboard/summary${params.toString() ? "?" + params.toString() : ""}`;
      const financeDocs = readJson<Array<{ url: string; name?: string; sections?: string[]; mapping?: unknown }>>("yb_int_gsheets", [])
        .filter((doc) => doc.url?.trim() && doc.sections?.includes("finance"));
      const yandexSettings = readYandexClientSettings();

      const [dashRes, hireRes, financeRes, dtpRes, marketingRes, workshopRes] = await Promise.allSettled([
        apiFetch(url, { cache: "no-store" }),
        apiFetch(`/api/hire/summary?from=${from ?? ""}&to=${to ?? ""}`, { cache: "no-store" }),
        financeDocs.length > 0
          ? apiFetch(`/api/finance/sheets?from=${from ?? ""}&to=${to ?? ""}`, {
              cache: "no-store",
              headers: {
                "x-gsheets-docs": encodeHeaderJson(financeDocs.map((doc) => ({ url: doc.url, name: doc.name, mapping: doc.mapping }))),
              },
            })
          : Promise.resolve(null),
        apiFetch(`/api/dtp/summary?from=${from ?? ""}&to=${to ?? ""}`, { cache: "no-store" }),
        yandexSettings.enabled && yandexSettings.token && yandexSettings.clientId
          ? apiFetch(`/api/marketing/yandex?from=${from ?? ""}&to=${to ?? ""}`, {
              cache: "no-store",
              headers: {
                "x-yandex-token": yandexSettings.token,
                "x-yandex-login": yandexSettings.clientId,
              },
            })
          : Promise.resolve(null),
        apiFetch("/api/workshop/summary", { cache: "no-store" }),
      ]);

      if (dashRes.status !== "fulfilled") {
        throw dashRes.reason;
      }

      const json = await dashRes.value.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки");
      const merged = { ...json.data };
      if (hireRes.status === "fulfilled") {
        const hireJson = await hireRes.value.json();
        if (hireJson.ok && hireJson.data) {
          merged.hire = {
            leads: hireJson.data.total ?? 0,
            sobes: hireJson.data.sobes ?? 0,
            dFirst: hireJson.data.dFirst ?? 0,
            convRelevToSobes: hireJson.data.convRelevToSobes ?? 0,
            convSobesToFirst: hireJson.data.convSobesToFirst ?? 0,
          };
          setHireLeadsRows(hireJson.data?.drilldown?.leads ?? []);
          setHireFirstRows(hireJson.data?.drilldown?.firstShift ?? []);
        } else {
          setHireLeadsRows([]);
          setHireFirstRows([]);
        }
      } else {
        setHireLeadsRows([]);
        setHireFirstRows([]);
      }
      setData(merged);
      setUpdatedAt(format(new Date(), "HH:mm", { locale: ru }));

      if (financeRes.status === "fulfilled" && financeRes.value) {
        const financeJson = await financeRes.value.json();
        if (financeJson.ok) {
          setFinanceMini({
            totalIncome: financeJson.data?.totalIncome ?? 0,
            totalExpense: financeJson.data?.totalExpense ?? 0,
            profit: financeJson.data?.profit ?? 0,
            entries: financeJson.data?.entries?.length ?? 0,
            configured: true,
            error: null,
          });
        } else {
          setFinanceMini({
            totalIncome: 0,
            totalExpense: 0,
            profit: 0,
            entries: 0,
            configured: financeDocs.length > 0,
            error: financeJson.error ?? "Ошибка загрузки расходов",
          });
        }
      } else {
        setFinanceMini({
          totalIncome: 0,
          totalExpense: 0,
          profit: 0,
          entries: 0,
          configured: false,
          error: null,
        });
      }

      if (dtpRes.status === "fulfilled") {
        const dtpJson = await dtpRes.value.json();
        if (dtpJson.ok) {
          setDtpMini({
            total: dtpJson.data?.total ?? 0,
            open: dtpJson.data?.open ?? 0,
            won: dtpJson.data?.won ?? 0,
            lost: dtpJson.data?.lost ?? 0,
            totalDamage: dtpJson.data?.totalDamage ?? 0,
            configured: true,
            error: null,
          });
        } else {
          setDtpMini({
            total: 0,
            open: 0,
            won: 0,
            lost: 0,
            totalDamage: 0,
            configured: false,
            error: dtpJson.error ?? "Ошибка загрузки ДТП",
          });
        }
      } else {
        setDtpMini({
          total: 0,
          open: 0,
          won: 0,
          lost: 0,
          totalDamage: 0,
          configured: false,
          error: "Не удалось загрузить ДТП",
        });
      }

      if (marketingRes.status === "fulfilled" && marketingRes.value) {
        const marketingJson = await marketingRes.value.json();
        if (marketingJson.ok) {
          const metrics = marketingJson.data?.metrics;
          setMarketingMini({
            totalCost: metrics?.totalCost ?? 0,
            totalClicks: metrics?.totalClicks ?? 0,
            totalImpressions: metrics?.totalImpressions ?? 0,
            totalConversions: metrics?.totalConversions ?? 0,
            totalRevenue: metrics?.totalRevenue ?? 0,
            conversionRate: metrics?.conversionRate ?? 0,
            avgCtr: metrics?.avgCtr ?? 0,
            costPerClick: metrics?.costPerClick ?? 0,
            costPerConversion: metrics?.costPerConversion ?? 0,
            romi: metrics?.romi ?? null,
            campaigns: marketingJson.data?.campaigns?.length ?? metrics?.campaignStats?.length ?? 0,
            configured: true,
            error: null,
          });
        } else {
          setMarketingMini({
            totalCost: 0,
            totalClicks: 0,
            totalImpressions: 0,
            totalConversions: 0,
            totalRevenue: 0,
            conversionRate: 0,
            avgCtr: 0,
            costPerClick: 0,
            costPerConversion: 0,
            romi: null,
            campaigns: 0,
            configured: true,
            error: marketingJson.error ?? "Ошибка загрузки Яндекс Директа",
          });
        }
      } else {
        setMarketingMini({
          totalCost: 0,
          totalClicks: 0,
          totalImpressions: 0,
          totalConversions: 0,
          totalRevenue: 0,
          conversionRate: 0,
          avgCtr: 0,
          costPerClick: 0,
          costPerConversion: 0,
          romi: null,
          campaigns: 0,
          configured: false,
          error: null,
        });
      }

      if (workshopRes.status === "fulfilled") {
        const wJson = await workshopRes.value.json();
        if (wJson.ok) {
          setWorkshopMini({ grandTotal: wJson.data?.grandTotal ?? 0 });
        } else {
          setWorkshopMini({ grandTotal: 0, error: wJson.error });
        }
      } else {
        setWorkshopMini({ grandTotal: 0, error: "Не удалось загрузить СТО" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(dateFrom, dateTo); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 rounded-lg skeleton" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl skeleton" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-64 rounded-xl skeleton" />
          <div className="h-64 rounded-xl skeleton" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--color-danger)" }} />
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Ошибка загрузки</p>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--color-muted)" }}>{error}</p>
          <button
            onClick={() => load(dateFrom, dateTo)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--color-brand)" }}
          >
            Повторить
          </button>

        </div>
      </div>
    );
  }

  if (!data) return null;

  const todayTrend = trend(data.revenue.today, data.revenue.yesterday);
  const fleetPct   = pct(data.fleet.active, data.fleet.total);
  const hireFirstShiftConv = pct(data.hire.dFirst, data.hire.leads);
  const today      = format(new Date(), "d MMMM yyyy", { locale: ru });
  const weekday    = format(new Date(), "EEEE", { locale: ru });
  const financeTrend = financeMini ? trend(financeMini.profit, financeMini.totalExpense || 1) : 0;
  const periodLabel = dateFrom === dateTo ? dateFrom : `${dateFrom} — ${dateTo}`;
  const hireActiveRows = hireTab === "leads" ? hireLeadsRows : hireFirstRows;
  const hireManagers = Array.from(new Set(hireActiveRows.map((r) => (r.managerName || r.managerId).trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const hireParks = Array.from(new Set(hireActiveRows.map((r) => r.park.trim()))).sort((a, b) => a.localeCompare(b, "ru"));
  const hireFilteredRows = hireActiveRows.filter((row) => {
    const managerName = (row.managerName || row.managerId).trim();
    if (hireManagerFilter !== "all" && managerName !== hireManagerFilter) return false;
    if (hireParkFilter !== "all" && row.park.trim() !== hireParkFilter) return false;
    return true;
  });

  async function exportHireCurrentTabExcel() {
    const XLSX = await import("xlsx");
    const rows = hireFilteredRows.map((row) => ({
      "Дата": row.date.slice(0, 16).replace("T", " "),
      "Лид": row.title,
      "Статус": row.status,
      "Источник": row.source,
      "Парк": row.park,
      "Менеджер": row.managerName || row.managerId,
      "Ссылка Bitrix": row.url,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i++) {
        const cellAddress = XLSX.utils.encode_cell({ r: i + 1, c: 6 });
        const href = rows[i]["Ссылка Bitrix"];
        if (href) {
          ws[cellAddress] = { t: "s", v: "Открыть", l: { Target: href } };
        }
      }
    }
    ws["!cols"] = [
      { wch: 18 }, { wch: 48 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 26 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, hireTab === "leads" ? "Отклики" : "Первая смена");
    const filename = `naim_${hireTab}_${slugifyRu(periodLabel)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // Build chart data — week days up to today
  const weekData = data.revenue.week.map((v, i) => ({
    day:     DAYS[(new Date().getDay() - (data.revenue.week.length - 1 - i) + 7) % 7] ?? `Д${i + 1}`,
    value:   v,
    isToday: i === data.revenue.week.length - 1,
  }));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold capitalize" style={{ color: "var(--color-text)" }}>
            {weekday}, {today}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            Сводная панель · обновлено {updatedAt}
            {data.meta.source === "mock" && (
              <span className="ml-2 text-xs opacity-60">(demo-данные)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start mt-1 flex-wrap justify-end">
          {/* Date range selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                const value = e.target.value;
                setPreset("custom");
                setDateFrom(value);
                setDateTo(value);
                setShowCustom(true);
                load(value, value);
              }}
              className="h-8 px-2 rounded-lg text-xs outline-none"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              aria-label="Выбор даты"
            />
            <CalendarDays className="w-3.5 h-3.5 ml-1.5 flex-shrink-0" style={{ color: "var(--color-muted)" }} />
            {(["today", "yesterday", "week", "month"] as const).map((p) => {
              const labels = { today: "Сегодня", yesterday: "Вчера", week: "Неделя", month: "Месяц" };
              const active = preset === p;
              return (
                <button
                  key={p}
                  onClick={() => { applyPreset(p); load(presetRange(p).from, presetRange(p).to); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: active ? "var(--color-brand)" : "transparent",
                    color: active ? "#fff" : "var(--color-muted)",
                  }}
                >
                  {labels[p]}
                </button>
              );
            })}
            <button
              onClick={() => applyPreset("custom")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: preset === "custom" ? "var(--color-brand)" : "transparent",
                color: preset === "custom" ? "#fff" : "var(--color-muted)",
              }}
            >
              Период
            </button>
          </div>

          {/* Custom date inputs */}
          {showCustom && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 px-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 px-2 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
              <button
                onClick={() => load(dateFrom, dateTo)}
                className="h-8 px-3 rounded-lg text-xs font-medium text-white"
                style={{ background: "var(--color-brand)" }}
              >
                Применить
              </button>
            </div>
          )}

          <Badge variant="success">Онлайн</Badge>
          <button
            onClick={() => load(dateFrom, dateTo)}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-muted)", background: "var(--color-surface-2)" }}
            title="Обновить"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Row 1: Metrics */}
      <div className="grid grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-4">
        <MetricLinkCard
          href={withRange("/finance", dateFrom, dateTo)}
          title="Выручка сегодня"
          value={data.revenue.today > 0 ? `₽ ${fmt(data.revenue.today)}` : "Не настроено"}
          subtitle={data.revenue.today > 0 ? `Вчера: ₽ ${fmt(data.revenue.yesterday)}` : "Подключите taxicrm.ru"}
          icon={<Banknote className="w-5 h-5" />}
          color={data.revenue.today > 0 ? "brand" : "default"}
          trend={data.revenue.today > 0 ? { value: todayTrend, label: "к вчера" } : undefined}
        />
        <MetricLinkCard
          href={withRange("/finance/budget", dateFrom, dateTo)}
          title="Расходы"
          value={financeMini?.configured ? `₽ ${fmt(financeMini.totalExpense)}` : "Не настроено"}
          subtitle={financeMini?.configured ? `Результат: ₽ ${fmt(financeMini.profit)}` : "Подключите Google Sheets"}
          icon={<Banknote className="w-5 h-5" />}
          color={financeMini?.configured ? "danger" : "default"}
          trend={financeMini?.configured ? { value: financeTrend, label: "результат / расход" } : undefined}
        />
        <MetricLinkCard
          href={withRange("/operations", dateFrom, dateTo)}
          title="Выпуск парка"
          value={data.fleet.total > 0 ? `${data.fleet.active} / ${data.fleet.total}` : "Не настроено"}
          subtitle={data.fleet.total > 0 ? `${fleetPct}% от парка на линии` : "Подключите taxicrm.ru"}
          icon={<Car className="w-5 h-5" />}
          color={data.fleet.total > 0 ? (fleetPct >= 65 ? "success" : "danger") : "default"}
          trend={data.fleet.total > 0 ? { value: fleetPct - 65, label: "от нормы 65%" } : undefined}
        />
        <MetricLinkCard
          href={withRange("/hire/funnel", dateFrom, dateTo)}
          title="Найм"
          value={`${data.hire.leads} / ${data.hire.dFirst}`}
          subtitle={`Отклики / 1-я смена · Конверсия: ${hireFirstShiftConv}%`}
          icon={<Users className="w-5 h-5" />}
          color={data.hire.leads > 0 ? (hireFirstShiftConv >= 20 ? "success" : "warning") : "default"}
        />
        <MetricLinkCard
          href={withRange("/dtp", dateFrom, dateTo)}
          title="ДТП"
          value={dtpMini?.configured ? `${dtpMini.total} дел` : "Не настроено"}
          subtitle={dtpMini?.configured ? `Ущерб: ₽ ${fmt(dtpMini.totalDamage)}` : "Подключите Bitrix24"}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={dtpMini?.configured ? "warning" : "default"}
        />
        <MetricLinkCard
          href={withRange("/marketing", dateFrom, dateTo)}
          title="Маркетинг"
          value={marketingMini?.configured ? `₽ ${fmt(marketingMini.totalCost)} / ${fmt(Math.round(marketingMini.totalConversions))}` : "Не настроено"}
          subtitle={marketingMini?.configured ? `Расход / конверсии · CPA ₽ ${fmt(Math.round(marketingMini.costPerConversion))}` : "Подключите Директ"}
          icon={<Megaphone className="w-5 h-5" />}
          color={marketingMini?.configured ? "brand" : "default"}
          trend={marketingMini?.configured && marketingMini.romi !== null ? { value: Math.round(marketingMini.romi), label: "ROMI, %" } : undefined}
        />
        <MetricLinkCard
          href="/workshop"
          title="СТО — в ремонте"
          value={workshopMini ? `${workshopMini.grandTotal} авто` : "—"}
          subtitle="Сейчас в ремонте"
          icon={<Wrench className="w-5 h-5" />}
          color={workshopMini && workshopMini.grandTotal > 0 ? "danger" : "default"}
        />
        <MetricLinkCard
          href={withRange("/cash", dateFrom, dateTo)}
          title="Касса"
          value={data.cash.balance > 0 ? `₽ ${fmt(data.cash.balance)}` : "Не настроено"}
          subtitle={data.cash.balance > 0 ? "Остаток на сегодня" : "Подключите 1С"}
          icon={<Wallet className="w-5 h-5" />}
          color={data.cash.balance > 0 ? "warning" : "default"}
        />
      </div>

      {/* Row 1.5: Business blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link href={withRange("/finance", dateFrom, dateTo)} className="block transition-transform hover:-translate-y-0.5">
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Расходы и результат</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {financeMini?.configured ? `${financeMini.entries} операций за период` : "Подключите финансовые таблицы"}
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            </div>
            {financeMini?.configured ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Доходы</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#10B981" }}>₽ {fmt(financeMini.totalIncome)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Расходы</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#EF4444" }}>₽ {fmt(financeMini.totalExpense)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Результат</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: financeMini.profit >= 0 ? "#10B981" : "#EF4444" }}>
                    ₽ {fmt(financeMini.profit)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                На главной пока нечего показать по расходам. Добавьте Google Sheets для раздела `Финансы`.
              </p>
            )}
          </Card>
        </Link>

        <Link href={withRange("/marketing", dateFrom, dateTo)} className="block transition-transform hover:-translate-y-0.5">
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Маркетинг и Директ</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {marketingMini?.configured ? `${marketingMini.campaigns} кампаний за период` : "Подключите Яндекс Директ"}
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            </div>
            {marketingMini?.configured ? (
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Расход</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>₽ {fmt(marketingMini.totalCost)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Клики</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#3B82F6" }}>{fmt(marketingMini.totalClicks)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Конверсии</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#8B5CF6" }}>{fmt(Math.round(marketingMini.totalConversions))}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>CPC</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#10B981" }}>₽ {fmt(Math.round(marketingMini.costPerClick))}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>CPA</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#EF4444" }}>₽ {fmt(Math.round(marketingMini.costPerConversion))}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>ROMI</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#8B5CF6" }}>
                    {marketingMini.romi === null ? "—" : `${marketingMini.romi}%`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                После подключения Директа здесь появятся расход, клики, CPC и CTR.
              </p>
            )}
          </Card>
        </Link>

        <Link href={withRange("/dtp", dateFrom, dateTo)} className="block transition-transform hover:-translate-y-0.5">
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>ДТП и юристы</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {dtpMini?.configured ? "Сводка по делам юристов" : "Подключите Bitrix24"}
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            </div>
            {dtpMini?.configured ? (
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Всего</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{fmt(dtpMini.total)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>В работе</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-warning)" }}>{fmt(dtpMini.open)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Успех</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-success)" }}>{fmt(dtpMini.won)}</p>
                </div>
                <div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Ущерб</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: "#8B5CF6" }}>₽ {fmt(dtpMini.totalDamage)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                Блок ДТП появится после рабочего подключения Bitrix24 и модуля дел юристов.
              </p>
            )}
          </Card>
        </Link>
      </div>

      {/* Row 2: Revenue chart + Parks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue chart */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
                Выручка — неделя
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                По дням · ₽
              </p>
            </div>
            <a href="/finance" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-brand)" }}>
              Финансы <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {data.revenue.today > 0 ? (
            <>
              <RevenueChart data={weekData} height={150} />
              <div
                className="mt-3 pt-3 grid grid-cols-3 gap-2"
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                {[
                  { label: "Сегодня", val: `₽ ${fmt(data.revenue.today)}`,     hi: true },
                  { label: "Вчера",   val: `₽ ${fmt(data.revenue.yesterday)}`, hi: false },
                  { label: "Тренд",   val: `${todayTrend > 0 ? "+" : ""}${todayTrend}%`, hi: false },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>{s.label}</p>
                    <p className="text-sm font-bold tabular-nums mt-0.5"
                      style={{ color: s.hi ? "var(--color-brand)" : todayTrend > 0 && s.label === "Тренд" ? "var(--color-success)" : "var(--color-text)" }}>
                      {s.val}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>Данные выручки не подключены</p>
              <p className="text-xs text-center max-w-[220px]" style={{ color: "var(--color-muted)" }}>
                Выручка появится после подключения taxicrm.ru или другого источника смен
              </p>
            </div>
          )}
        </Card>

        {/* Alerts + fleet */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Внимание</h3>
              <AlertTriangle className="w-4 h-4" style={{ color: "var(--color-warning)" }} />
            </div>
            {data.alerts.length === 0 ? (
              <p className="text-sm text-center py-3" style={{ color: "var(--color-success)" }}>
                Нарушений нет ✓
              </p>
            ) : (
              <div className="space-y-2">
                {data.alerts.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs p-2 rounded-lg"
                       style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--color-warning)" }} />
                    <span style={{ color: "var(--color-text)" }}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Link href="/workshop" className="block">
            <Card>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Статус парка</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--color-muted)" }}>На линии</span>
                  {data.fleet.total > 0
                    ? <span className="font-bold tabular-nums" style={{ color: "var(--color-success)" }}>{data.fleet.active}</span>
                    : <span className="text-xs" style={{ color: "var(--color-muted)" }}>нет данных</span>
                  }
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--color-muted)" }}>Ремонт / СТО</span>
                  <span className="font-bold tabular-nums" style={{ color: "var(--color-danger)" }}>
                    {workshopMini ? workshopMini.grandTotal : (data.fleet.repair > 0 ? data.fleet.repair : "—")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--color-muted)" }}>Простой</span>
                  {data.fleet.total > 0
                    ? <span className="font-bold tabular-nums" style={{ color: "var(--color-muted)" }}>{data.fleet.idle}</span>
                    : <span className="text-xs" style={{ color: "var(--color-muted)" }}>нет данных</span>
                  }
                </div>
                {data.fleet.total > 0 && (
                  <div className="pt-2 mt-1 flex justify-between text-sm font-semibold"
                    style={{ borderTop: "1px solid var(--color-border)" }}>
                    <span style={{ color: "var(--color-text)" }}>Всего</span>
                    <span style={{ color: "var(--color-brand)" }}>{data.fleet.total} авто</span>
                  </div>
                )}
              </div>
            </Card>
          </Link>
        </div>
      </div>

      {/* Row 3: Parks + hire result + data freshness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Parks table */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Парки — выбранный период</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Выпуск, выручка, водители · {periodLabel}</p>
            </div>
            <a href="/operations" className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-brand)" }}>
              Операции <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
          {data.parks.length > 0 ? (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[460px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {["Парк", "Выпуск", "Выручка", "Водители"].map((h) => (
                      <th key={h} className="pb-2 text-left text-xs font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.parks.map((p) => {
                    const pp = pct(p.active, p.cars);
                    return (
                      <tr key={p.code} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td className="py-2.5 font-medium" style={{ color: "var(--color-text)" }}>{p.name}</td>
                        <td className="py-2.5">
                          <span className="font-semibold" style={{ color: pp < 60 ? "var(--color-danger)" : "var(--color-success)" }}>
                            {p.active}/{p.cars}
                          </span>
                          <span className="text-xs ml-1.5" style={{ color: "var(--color-muted)" }}>{pp}%</span>
                        </td>
                        <td className="py-2.5 font-medium" style={{ color: "var(--color-text)" }}>₽ {fmt(p.revenue)}</td>
                        <td className="py-2.5" style={{ color: "var(--color-muted)" }}>{p.drivers}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-3 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Итого</td>
                    <td className="pt-3 font-bold" style={{ color: "var(--color-text)" }}>{data.fleet.active}/{data.fleet.total}</td>
                    <td className="pt-3 font-bold" style={{ color: "var(--color-brand)" }}>₽ {fmt(data.revenue.today)}</td>
                    <td className="pt-3 font-bold" style={{ color: "var(--color-text)" }}>{data.parks.reduce((s, p) => s + p.drivers, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>Данные по паркам не подключены</p>
              <p className="text-xs text-center max-w-[240px]" style={{ color: "var(--color-muted)" }}>
                Статистика парков появится после подключения taxicrm.ru
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Найм — результат</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Отклики и выход в 1-ю смену · {periodLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setHireTab("leads");
                    setHireManagerFilter("all");
                    setHireParkFilter("all");
                    setHireModalOpen(true);
                  }}
                  className="h-7 px-2.5 rounded-lg text-xs font-medium"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-brand)" }}
                >
                  Детализация
                </button>
                <a href={withRange("/hire/funnel", dateFrom, dateTo)} className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-brand)" }}>
                  Подробнее <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>Отклики</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{fmt(data.hire.leads)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>1-я смена</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>{fmt(data.hire.dFirst)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>Конверсия</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: hireFirstShiftConv >= 20 ? "var(--color-success)" : "var(--color-warning)" }}>
                  {hireFirstShiftConv}%
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 rounded-full" style={{ background: "var(--color-surface-2)" }}>
                <div className="h-2 rounded-full" style={{ width: `${Math.min(hireFirstShiftConv, 100)}%`, background: "var(--color-brand)" }} />
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Свежесть и подключение данных</h3>
            <div className="space-y-2">
              {[
                { label: "Финансы", ok: !!financeMini?.configured, note: financeMini?.configured ? `${financeMini.entries} записей` : "не подключено" },
                { label: "Найм", ok: data.hire.leads > 0 || data.hire.dFirst > 0, note: `отклики ${data.hire.leads}, 1-я смена ${data.hire.dFirst}` },
                { label: "ДТП", ok: !!dtpMini?.configured, note: dtpMini?.configured ? `${dtpMini.total} дел` : "не подключено" },
                { label: "СТО", ok: !workshopMini?.error, note: workshopMini?.error ? "ошибка загрузки" : `${workshopMini?.grandTotal ?? 0} авто` },
                { label: "Маркетинг", ok: !!marketingMini?.configured, note: marketingMini?.configured ? `${marketingMini.campaigns} кампаний` : "не подключено" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: row.ok ? "var(--color-success)" : "var(--color-muted)" }} />
                    <span style={{ color: "var(--color-text)" }}>{row.label}</span>
                  </div>
                  <span style={{ color: "var(--color-muted)" }}>{row.note}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] mt-3" style={{ color: "var(--color-muted)" }}>
              Последнее обновление панели: {updatedAt}
            </p>
          </Card>
        </div>
      </div>

      {hireModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setHireModalOpen(false)} />
          <div
            className="relative w-full max-w-6xl rounded-2xl p-4 md:p-5 max-h-[86vh] overflow-hidden"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-semibold" style={{ color: "var(--color-text)" }}>Найм — детализация</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                  {periodLabel} · прямые ссылки на карточки в Bitrix24
                </p>
              </div>
              <button
                onClick={() => setHireModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "var(--color-surface-2)", color: "var(--color-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl mb-3 w-fit" style={{ background: "var(--color-surface-2)" }}>
              <button
                onClick={() => {
                  setHireTab("leads");
                  setHireManagerFilter("all");
                  setHireParkFilter("all");
                }}
                className="px-3 h-7 rounded-lg text-xs font-medium"
                style={{ background: hireTab === "leads" ? "var(--color-brand)" : "transparent", color: hireTab === "leads" ? "#fff" : "var(--color-muted)" }}
              >
                Отклики ({hireLeadsRows.length})
              </button>
              <button
                onClick={() => {
                  setHireTab("first");
                  setHireManagerFilter("all");
                  setHireParkFilter("all");
                }}
                className="px-3 h-7 rounded-lg text-xs font-medium"
                style={{ background: hireTab === "first" ? "var(--color-brand)" : "transparent", color: hireTab === "first" ? "#fff" : "var(--color-muted)" }}
              >
                1-я смена ({hireFirstRows.length})
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select
                value={hireManagerFilter}
                onChange={(e) => setHireManagerFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                <option value="all">Все менеджеры</option>
                {hireManagers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select
                value={hireParkFilter}
                onChange={(e) => setHireParkFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                <option value="all">Все парки</option>
                {hireParks.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                onClick={exportHireCurrentTabExcel}
                className="h-8 px-3 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-brand)", color: "#fff" }}
              >
                Excel ({hireFilteredRows.length})
              </button>
            </div>

            <div className="overflow-auto max-h-[60vh] rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
              <table className="w-full text-xs min-w-[960px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                    {["Дата", "Лид", "Статус", "Источник", "Парк", "Менеджер", "Bitrix"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--color-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hireFilteredRows.length > 0 ? hireFilteredRows.map((row) => (
                    <tr key={`${hireTab}-${row.id}-${row.date}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--color-muted)" }}>{row.date.slice(0, 16).replace("T", " ")}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text)" }}>{row.title}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-text)" }}>{row.status}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{row.source}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{row.park}</td>
                      <td className="px-3 py-2.5" style={{ color: "var(--color-muted)" }}>{row.managerName ?? row.managerId}</td>
                      <td className="px-3 py-2.5">
                        {row.url ? (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1"
                            style={{ color: "var(--color-brand)" }}
                          >
                            Открыть <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span style={{ color: "var(--color-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--color-muted)" }}>
                        Нет записей по текущим фильтрам
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
