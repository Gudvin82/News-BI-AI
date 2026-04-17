"use client";

import { useState } from "react";
import { Star, MapPin, MessageSquare, Clock, AlertCircle, ChevronRight, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";

// ── Parks ─────────────────────────────────────────────────────────────────────
const PARKS = [
  "Лесная", "Ладожская", "Старая Деревня", "Литовская",
  "Якорная", "Магнитогорская", "Витебский", "Сабировская",
];

// ── Period options ────────────────────────────────────────────────────────────
type Period = "all" | "year" | "month3" | "month" | "week";
const PERIODS: { label: string; value: Period }[] = [
  { label: "Всё время", value: "all"    },
  { label: "Год",       value: "year"   },
  { label: "3 месяца",  value: "month3" },
  { label: "Месяц",     value: "month"  },
  { label: "Неделя",    value: "week"   },
];

// ── Stars ─────────────────────────────────────────────────────────────────────
function Stars({ rating }: { rating: number | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="w-3.5 h-3.5"
          style={{
            fill: rating !== null && i < Math.round(rating) ? "#F59E0B" : "transparent",
            color: rating !== null && i < Math.round(rating) ? "#F59E0B" : "var(--color-border)",
          }} />
      ))}
    </div>
  );
}

// ── Source card ───────────────────────────────────────────────────────────────
function SourceCard({
  logo, name, rating, count, newCount, trend, connected, hint, period,
}: {
  logo: React.ReactNode; name: string;
  rating: number | null; count: number | null;
  newCount?: number | null; trend?: number | null;
  connected: boolean; hint: string; period: Period;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {logo}
          <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{name}</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{
            background: connected ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
            color: connected ? "#10B981" : "#9CA3AF",
          }}>
          {connected ? "Подключено" : "Не подключено"}
        </span>
      </div>

      {connected && rating !== null ? (
        <div className="space-y-2">
          <div className="flex items-end gap-3">
            <span className="text-4xl font-bold tabular-nums" style={{ color: "var(--color-text)", lineHeight: 1 }}>
              {rating.toFixed(1)}
            </span>
            <div className="pb-1">
              <Stars rating={rating} />
              <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                {count?.toLocaleString("ru-RU")} отзывов всего
              </p>
            </div>
            {trend !== undefined && trend !== null && (
              <div className="ml-auto pb-1 flex items-center gap-1 text-xs font-medium"
                style={{ color: trend >= 0 ? "#10B981" : "#EF4444" }}>
                <TrendingUp className="w-3.5 h-3.5" style={{ transform: trend < 0 ? "scaleY(-1)" : undefined }} />
                {trend >= 0 ? "+" : ""}{trend.toFixed(1)}
              </div>
            )}
          </div>
          {period !== "all" && newCount !== undefined && newCount !== null && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              За период: <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{newCount}</span> новых отзывов
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-4 flex flex-col items-center gap-2 text-center"
          style={{ background: "var(--color-surface-2)", border: "1px dashed var(--color-border)" }}>
          <AlertCircle className="w-5 h-5" style={{ color: "var(--color-muted)", opacity: 0.5 }} />
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>{hint}</p>
        </div>
      )}
    </Card>
  );
}

// ── Park row ──────────────────────────────────────────────────────────────────
function ParkRow({ park }: { park: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--color-border)" }} />
      <p className="text-sm flex-1" style={{ color: "var(--color-text)" }}>{park}</p>
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className="text-[10px] mb-1" style={{ color: "var(--color-muted)" }}>Яндекс</p>
          <Stars rating={null} />
        </div>
        <div className="text-center">
          <p className="text-[10px] mb-1" style={{ color: "var(--color-muted)" }}>2ГИС</p>
          <Stars rating={null} />
        </div>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--color-muted)", opacity: 0.4 }} />
      </div>
    </div>
  );
}

function YandexLogo() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
      style={{ background: "#FC3F1D", color: "white" }}>Я</div>
  );
}
function TwoGisLogo() {
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0"
      style={{ background: "#1DB954", color: "white", letterSpacing: "-0.5px" }}>2ГИС</div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RatingsPage() {
  const [period, setPeriod] = useState<Period>("all");
  const [sourceTab, setSourceTab] = useState<"all" | "yandex" | "2gis">("all");

  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? "Всё время";

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header + period selector */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Рейтинги и отзывы</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Мониторинг репутации компании · {periodLabel}
          </p>
        </div>
        {/* Period chips */}
        <div className="flex rounded-xl p-1 gap-0.5 flex-shrink-0"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
          {PERIODS.map((p) => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className="px-3 h-7 rounded-lg text-xs font-medium transition-all"
              style={{
                background: period === p.value ? "var(--color-brand)" : "transparent",
                color: period === p.value ? "white" : "var(--color-muted)",
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Source blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SourceCard
          logo={<YandexLogo />}
          name="Яндекс Карты"
          rating={null} count={null} newCount={null} trend={null}
          connected={false}
          hint="Нужен OAuth-токен Яндекс Бизнеса"
          period={period}
        />
        <SourceCard
          logo={<TwoGisLogo />}
          name="2ГИС"
          rating={null} count={null} newCount={null} trend={null}
          connected={false}
          hint="Нужен API-ключ 2ГИС (dev.2gis.ru) и ID организации"
          period={period}
        />
      </div>

      {/* Reviews */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
            Отзывы
            {period !== "all" && (
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-muted)" }}>
                за {periodLabel.toLowerCase()}
              </span>
            )}
          </h2>
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--color-surface-2)" }}>
            {(["all", "yandex", "2gis"] as const).map((t) => (
              <button key={t} onClick={() => setSourceTab(t)}
                className="px-3 h-6 rounded-md text-xs font-medium transition-all"
                style={{
                  background: sourceTab === t ? "var(--color-brand)" : "transparent",
                  color: sourceTab === t ? "white" : "var(--color-muted)",
                }}>
                {t === "all" ? "Все" : t === "yandex" ? "Яндекс" : "2ГИС"}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MessageSquare className="w-8 h-8" style={{ color: "var(--color-muted)", opacity: 0.3 }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Отзывы появятся после подключения источников
            </p>
            <p className="text-xs max-w-xs" style={{ color: "var(--color-muted)" }}>
              Подключите Яндекс Карты и 2ГИС через Настройки → Интеграции
            </p>
          </div>
          {/* Dimmed preview */}
          <div className="space-y-2 opacity-25 pointer-events-none select-none">
            {["Яндекс", "2ГИС", "Яндекс"].map((src, i) => (
              <div key={i} className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="w-8 h-8 rounded-full skeleton flex-shrink-0" />
                <div className="flex-1 space-y-1.5 py-0.5">
                  <div className="flex items-center gap-2">
                    <Stars rating={4} />
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                      {src}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                      {PARKS[i]}
                    </span>
                  </div>
                  <div className="h-2.5 rounded skeleton w-3/4" />
                  <div className="h-2.5 rounded skeleton w-1/2" />
                </div>
                <div className="flex items-center gap-1 text-[10px] pt-0.5" style={{ color: "var(--color-muted)" }}>
                  <Clock className="w-3 h-3" /><span>2 дня назад</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Ratings by park */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>По паркам</h2>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
            <MapPin className="w-3.5 h-3.5" />{PARKS.length} парков
          </div>
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5"
            style={{ background: "var(--color-surface-2)", borderBottom: "2px solid var(--color-border)" }}>
            <div className="w-2 flex-shrink-0" />
            <p className="text-xs font-semibold flex-1" style={{ color: "var(--color-muted)" }}>Парк</p>
            <div className="flex items-center gap-6">
              <p className="text-xs font-semibold w-20 text-center" style={{ color: "var(--color-muted)" }}>Яндекс</p>
              <p className="text-xs font-semibold w-20 text-center" style={{ color: "var(--color-muted)" }}>2ГИС</p>
              <div className="w-3.5" />
            </div>
          </div>
          <div className="px-4">
            {PARKS.map((park) => <ParkRow key={park} park={park} />)}
          </div>
          <div className="px-4 py-2.5 text-[11px]"
            style={{ color: "var(--color-muted)", background: "var(--color-surface-2)", borderTop: "1px solid var(--color-border)" }}>
            {period === "all"
              ? "Рейтинг за всё время по каждому парку"
              : `Динамика рейтинга за ${periodLabel.toLowerCase()} · появится после подключения источников`}
          </div>
        </Card>
      </div>
    </div>
  );
}
