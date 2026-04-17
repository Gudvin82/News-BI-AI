"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Users, Wrench, TrendingUp, CalendarCheck, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/utils";

function fmtR(n: number) {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр",
  "05": "Май", "06": "Июн", "07": "Июл", "08": "Авг",
  "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек",
};

function nowMsk() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return {
    month: String(d.getUTCMonth() + 1).padStart(2, "0"),
    year: String(d.getUTCFullYear()),
  };
}

interface WorkerDay { raw: string; pay: number; shifts: number; colored: boolean; }
interface Worker { name: string; park: string; section: "mechanic" | "driver"; shifts: number; pay: number; days: Record<string, WorkerDay>; }
interface Park { park: string; section: "mechanic" | "driver"; totalShifts: number; totalPay: number; workers: Worker[]; }
interface SalaryData { parks: Park[]; totalPay: number; totalShifts: number; }

function WorkerRow({ worker }: { worker: Worker }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(worker.days).filter(([, d]) => d.pay > 0 || d.shifts > 0);

  return (
    <>
      <tr
        className="cursor-pointer transition-colors"
        style={{ borderBottom: "1px solid var(--color-border)" }}
        onClick={() => setOpen((o) => !o)}
      >
        <td className="py-2 px-3 text-sm font-medium" style={{ color: "var(--color-text)" }}>
          <div className="flex items-center gap-1.5">
            {open
              ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-muted)" }} />
              : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-muted)" }} />}
            {worker.name}
          </div>
        </td>
        <td className="py-2 px-3 text-sm text-center tabular-nums" style={{ color: "var(--color-muted)" }}>
          {worker.shifts % 1 === 0 ? worker.shifts : worker.shifts.toFixed(1)}
        </td>
        <td className="py-2 px-3 text-sm text-right tabular-nums font-semibold" style={{ color: "var(--color-brand)" }}>
          {fmtR(worker.pay)}
        </td>
      </tr>
      {open && entries.length > 0 && (
        <tr style={{ background: "var(--color-surface-2)" }}>
          <td colSpan={3} className="px-6 py-3">
            <div className="flex flex-wrap gap-1.5">
              {entries.map(([date, d]) => (
                <div
                  key={date}
                  className="flex flex-col items-center rounded-lg px-2 py-1 text-center"
                  style={{
                    background: d.colored ? "rgba(34,197,94,0.12)" : "var(--color-surface)",
                    border: `1px solid ${d.colored ? "rgba(34,197,94,0.3)" : "var(--color-border)"}`,
                    minWidth: 72,
                  }}
                >
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>{date.slice(3, 8)}</span>
                  <span className="text-xs font-medium mt-0.5" style={{ color: "var(--color-text)" }}>
                    {d.raw || (d.colored ? "цвет" : "—")}
                  </span>
                  <span className="text-xs font-bold" style={{ color: "var(--color-brand)" }}>{fmtR(d.pay)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ParkCard({ park }: { park: Park }) {
  const [open, setOpen] = useState(true);
  const icon  = park.section === "mechanic" ? "🔧" : "🚗";
  const label = park.section === "mechanic" ? "Механики" : "Перегонщики";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:opacity-80"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">{icon}</span>
          <div className="text-left">
            <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{park.park}</div>
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>{label} · {park.workers.length} чел.</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>Смен</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
              {park.totalShifts % 1 === 0 ? park.totalShifts : park.totalShifts.toFixed(1)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: "var(--color-muted)" }}>ФОТ</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>{fmtR(park.totalPay)}</div>
          </div>
          {open
            ? <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
            : <ChevronRight className="w-4 h-4" style={{ color: "var(--color-muted)" }} />}
        </div>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--color-surface-2)" }}>
                <th className="py-2 px-3 text-xs text-left font-medium" style={{ color: "var(--color-muted)" }}>Сотрудник</th>
                <th className="py-2 px-3 text-xs text-center font-medium" style={{ color: "var(--color-muted)" }}>Смен</th>
                <th className="py-2 px-3 text-xs text-right font-medium" style={{ color: "var(--color-muted)" }}>ЗП</th>
              </tr>
            </thead>
            <tbody>
              {park.workers.map((w) => <WorkerRow key={w.name} worker={w} />)}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
                <td className="py-2 px-3 text-xs font-semibold" style={{ color: "var(--color-muted)" }}>Итого</td>
                <td className="py-2 px-3 text-xs text-center font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                  {park.totalShifts % 1 === 0 ? park.totalShifts : park.totalShifts.toFixed(1)}
                </td>
                <td className="py-2 px-3 text-xs text-right font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>
                  {fmtR(park.totalPay)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SalaryPage() {
  const { month: curMonth, year: curYear } = nowMsk();

  // Available months from API (format: "MM.YYYY")
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Selected period
  const [month, setMonth] = useState(curMonth);
  const [year, setYear]   = useState(curYear);

  const [data, setData]       = useState<SalaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  // Load available months once on mount
  useEffect(() => {
    apiFetch("/api/workshop/salary/months")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.data)) setAvailableMonths(j.data);
      })
      .catch(() => {/* silent */});
  }, []);

  const load = useCallback(async (m: string, y: string) => {
    setLoading(true);
    setError("");
    try {
      const res  = await apiFetch(`/api/workshop/salary?month=${m}.${y}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка");
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(month, year); }, [load, month, year]);

  // Unique years from available months, sorted desc
  const availableYears = [...new Set(availableMonths.map((m) => m.split(".")[1]))]
    .sort((a, b) => Number(b) - Number(a));

  // Months available for selected year
  const monthsForYear = availableMonths
    .filter((m) => m.split(".")[1] === year)
    .map((m) => m.split(".")[0]);

  const mechanics    = data?.parks.filter((p) => p.section === "mechanic") ?? [];
  const drivers      = data?.parks.filter((p) => p.section === "driver")   ?? [];
  const mechPay      = mechanics.reduce((s, p) => s + p.totalPay, 0);
  const driverPay    = drivers.reduce((s, p) => s + p.totalPay, 0);
  const mechShifts   = mechanics.reduce((s, p) => s + p.totalShifts, 0);
  const driverShifts = drivers.reduce((s, p) => s + p.totalShifts, 0);
  const totalWorkers = data?.parks.reduce((s, p) => s + p.workers.length, 0) ?? 0;
  const hasData      = (data?.parks.length ?? 0) > 0;

  function handleYearSelect(y: string) {
    setYear(y);
    // If current month isn't available in the new year, pick the latest available
    const months = availableMonths.filter((m) => m.split(".")[1] === y).map((m) => m.split(".")[0]);
    if (months.length && !months.includes(month)) {
      setMonth(months[months.length - 1]);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>Зарплата СТО</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Рабочий табель из Google Sheets</p>
        </div>
        <button
          onClick={() => load(month, year)}
          disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
          style={{
            background: loading ? "var(--color-brand-soft)" : "var(--color-surface-2)",
            color:      loading ? "var(--color-brand)"      : "var(--color-muted)",
            border:     loading ? "1px solid var(--color-brand)" : "1px solid transparent",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Month / Year selector */}
      <div className="rounded-xl p-3 space-y-2.5" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {/* Year tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium w-10 flex-shrink-0" style={{ color: "var(--color-muted)" }}>Год</span>
          <div className="flex flex-wrap gap-1">
            {(availableYears.length ? availableYears : [curYear]).map((y) => (
              <button
                key={y}
                onClick={() => handleYearSelect(y)}
                className="h-7 px-3 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: year === y ? "var(--color-brand)" : "var(--color-surface-2)",
                  color:      year === y ? "white"              : "var(--color-muted)",
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Month buttons — only show months available for selected year */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium w-10 flex-shrink-0" style={{ color: "var(--color-muted)" }}>Мес.</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(MONTH_LABELS).map(([n, label]) => {
              const available = monthsForYear.includes(n);
              const selected  = month === n;
              return (
                <button
                  key={n}
                  onClick={() => available && setMonth(n)}
                  disabled={!available}
                  className="h-7 px-2.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: selected   ? "var(--color-brand)"
                              : available  ? "var(--color-surface-2)"
                              : "transparent",
                    color:      selected   ? "white"
                              : available  ? "var(--color-muted)"
                              : "var(--color-border)",
                    cursor: available ? "pointer" : "default",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto" style={{ color: "var(--color-brand)" }} />
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>Загрузка табеля...</p>
          </div>
        </div>
      )}

      {/* No data */}
      {!loading && !error && !hasData && (
        <div className="rounded-xl px-4 py-8 text-center"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Нет данных за {MONTH_LABELS[month]} {year}
          </p>
        </div>
      )}

      {/* Summary cards */}
      {!loading && hasData && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Итого ФОТ</span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "var(--color-brand)" }}>{fmtR(data!.totalPay)}</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>за месяц</div>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <CalendarCheck className="w-4 h-4" style={{ color: "#8b5cf6" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Всего смен</span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "#8b5cf6" }}>
              {data!.totalShifts % 1 === 0 ? data!.totalShifts : data!.totalShifts.toFixed(1)}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>факт за месяц</div>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="w-4 h-4" style={{ color: "#3b82f6" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Механики</span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "#3b82f6" }}>{fmtR(mechPay)}</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {mechShifts % 1 === 0 ? mechShifts : mechShifts.toFixed(1)} смен · {mechanics.length} парков
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4" style={{ color: "#10b981" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Перегонщики</span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "#10b981" }}>{fmtR(driverPay)}</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              {driverShifts % 1 === 0 ? driverShifts : driverShifts.toFixed(1)} смен
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Сотрудников</span>
            </div>
            <div className="text-xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{totalWorkers}</div>
            <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{data!.parks.length} подразделений</div>
          </div>
        </div>
      )}

      {/* Mechanics */}
      {!loading && mechanics.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text)" }}>
            <Wrench className="w-4 h-4" style={{ color: "#3b82f6" }} />
            Механики
            <span className="text-xs font-normal" style={{ color: "var(--color-muted)" }}>· 3 500 ₽/смена</span>
          </h2>
          <div className="space-y-2">
            {mechanics.map((p) => <ParkCard key={`${p.section}-${p.park}`} park={p} />)}
          </div>
        </div>
      )}

      {/* Drivers */}
      {!loading && drivers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--color-text)" }}>
            <Users className="w-4 h-4" style={{ color: "#10b981" }} />
            Перегонщики
            <span className="text-xs font-normal" style={{ color: "var(--color-muted)" }}>· 3 000 ₽/смена</span>
          </h2>
          <div className="space-y-2">
            {drivers.map((p) => <ParkCard key={`${p.section}-${p.park}`} park={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}
