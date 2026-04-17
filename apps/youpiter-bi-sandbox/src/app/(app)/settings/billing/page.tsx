"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, TrendingDown, Clock, Info, RefreshCw, Activity, Sparkles } from "lucide-react";
import { apiFetch, formatCurrency, formatNumber } from "@/lib/utils";
import { readAiUsageLog, type AiUsageEntry } from "@/lib/ai/client-usage";

interface BillingPayload {
  provider: string;
  supportsLiveBilling: boolean;
  message?: string;
  me?: { email?: string; id?: number };
  balance?: { balance?: number; budget?: number };
  key?: {
    name?: string | null;
    budget?: {
      remaining?: number;
      initial?: number;
      reset_interval?: string;
      reset_at?: string;
      reset_in_seconds?: number;
    };
    expires_at?: string;
    expires_in_seconds?: number;
  };
  summary?: {
    today_spend?: number;
    today_requests?: number;
    month_spend?: number;
    month_requests?: number;
    avg_daily_spend?: number;
    top_model_by_spend?: string | null;
    top_model_by_spend_value?: number;
    top_model_by_requests?: string | null;
    top_model_by_requests_value?: number;
  };
  fetchedAt?: string;
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BillingPage() {
  const [provider, setProvider] = useState("aitunnel");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BillingPayload | null>(null);
  const [history, setHistory] = useState<AiUsageEntry[]>([]);

  async function load(force = false) {
    const savedProvider = localStorage.getItem("yb_ai_provider") ?? "aitunnel";
    const apiKey = localStorage.getItem("yb_ai_key") ?? "";
    setProvider(savedProvider);
    setHasKey(!!apiKey);
    setHistory(readAiUsageLog());
    setError(null);
    if (force) setRefreshing(true); else setLoading(true);

    try {
      const res = await apiFetch(`/api/ai/billing?provider=${encodeURIComponent(savedProvider)}`, {
        headers: apiKey ? { "x-ai-api-key": apiKey } : {},
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки биллинга");
      setPayload(json.data);
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (force) setRefreshing(false); else setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const onFocus = () => {
      setHistory(readAiUsageLog());
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const cards = useMemo(() => {
    const live = payload?.supportsLiveBilling ? payload : null;
    const summary = live?.summary;
    const balance = live?.key?.budget?.remaining ?? live?.balance?.budget ?? live?.balance?.balance;

    return [
      {
        label: "Текущий баланс",
        value: typeof balance === "number" ? formatCurrency(balance) : "—",
        sub: live?.key?.name
          ? `Ключ: ${live.key.name}`
          : hasKey
          ? "Ключ сохранён, баланс не получен"
          : "Нет активного ключа",
        icon: <CreditCard className="w-4 h-4" />,
        color: "var(--color-brand)",
      },
      {
        label: "Расход за месяц",
        value: typeof summary?.month_spend === "number" ? formatCurrency(summary.month_spend) : "—",
        sub: typeof summary?.month_requests === "number"
          ? `${formatNumber(summary.month_requests)} запросов за 30 дней`
          : "Нет данных",
        icon: <TrendingDown className="w-4 h-4" />,
        color: "#EF4444",
      },
      {
        label: "Запросов сегодня",
        value: typeof summary?.today_requests === "number" ? formatNumber(summary.today_requests) : "0",
        sub: typeof summary?.today_spend === "number"
          ? `${formatCurrency(summary.today_spend)} за сегодня`
          : hasKey
          ? "Ждём статистику провайдера"
          : "AI-провайдер не настроен",
        icon: <Clock className="w-4 h-4" />,
        color: "#8B5CF6",
      },
    ];
  }, [payload, hasKey]);

  const liveSummary = payload?.supportsLiveBilling ? payload.summary : null;
  const liveBudget = payload?.supportsLiveBilling ? payload.key?.budget : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Биллинг</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Баланс и история расходов по AI-провайдерам
        </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
          style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
          title="Обновить"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((item) => (
          <Card key={item.label}>
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${item.color}20`, color: item.color }}
              >
                {item.icon}
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{item.label}</p>
                <p className="text-xl font-bold mt-0.5" style={{ color: "var(--color-text)" }}>{item.value}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{item.sub}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.12)", color: "#8B5CF6" }}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Топ модель по расходу</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: "var(--color-text)" }}>
                {liveSummary?.top_model_by_spend ?? "—"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {typeof liveSummary?.top_model_by_spend_value === "number" ? formatCurrency(liveSummary.top_model_by_spend_value) : "Нет данных"}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}>
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Топ модель по запросам</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: "var(--color-text)" }}>
                {liveSummary?.top_model_by_requests ?? "—"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {typeof liveSummary?.top_model_by_requests_value === "number" ? `${formatNumber(liveSummary.top_model_by_requests_value)} запросов` : "Нет данных"}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}>
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Бюджет ключа</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: "var(--color-text)" }}>
                {typeof liveBudget?.initial === "number" ? formatCurrency(liveBudget.initial) : "—"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                {liveBudget?.reset_interval
                  ? `Сброс: ${liveBudget.reset_interval}`
                  : "Нет данных о сбросе бюджета"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Info banner */}
      <div
        className="rounded-xl p-4 flex gap-3 text-sm"
        style={{ background: "var(--color-brand-soft)", border: "1px solid var(--color-brand)" }}
      >
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--color-brand)" }} />
        <div style={{ color: "var(--color-text)" }}>
          <p className="font-medium">
            {payload?.supportsLiveBilling
              ? `Онлайн-биллинг: ${provider}`
              : "Как отслеживать расходы"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
            {error
              ? `Ошибка: ${error}`
              : payload?.supportsLiveBilling
              ? [
                  payload.me?.email ? `Аккаунт: ${payload.me.email}` : null,
                  payload.key?.budget?.reset_at ? `Сброс бюджета: ${fmtDateTime(payload.key.budget.reset_at)}` : null,
                  payload.key?.expires_at ? `Ключ истекает: ${fmtDateTime(payload.key.expires_at)}` : null,
                  payload.fetchedAt ? `Обновлено: ${fmtDateTime(payload.fetchedAt)}` : null,
                ].filter(Boolean).join(" · ")
              : payload?.message ?? "Подключите AI-ключ в разделе Настройки → ИИ. Для AITUNNEL здесь появится живой баланс и статистика по ключу."}
          </p>
        </div>
      </div>

      {/* Usage history */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Управленческая сводка</p>
          <Badge variant={payload?.supportsLiveBilling ? "success" : "default"}>
            {payload?.supportsLiveBilling ? "Онлайн-биллинг" : "Локальная аналитика"}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>Средний расход в день</p>
            <p className="text-xl font-bold mt-1" style={{ color: "var(--color-text)" }}>
              {typeof liveSummary?.avg_daily_spend === "number" ? formatCurrency(liveSummary.avg_daily_spend) : "—"}
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>Сегодняшний расход</p>
            <p className="text-xl font-bold mt-1" style={{ color: "var(--color-text)" }}>
              {typeof liveSummary?.today_spend === "number" ? formatCurrency(liveSummary.today_spend) : "—"}
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>Остаток до лимита</p>
            <p className="text-xl font-bold mt-1" style={{ color: "var(--color-text)" }}>
              {typeof liveBudget?.remaining === "number" ? formatCurrency(liveBudget.remaining) : "—"}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>История использования</p>
          <Badge variant={history.length > 0 ? "success" : "default"}>
            {history.length > 0 ? `${history.length} записей` : "Нет данных"}
          </Badge>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Clock className="w-8 h-8 animate-pulse" style={{ color: "var(--color-muted)", opacity: 0.4 }} />
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>Загружаем биллинг…</p>
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <Clock className="w-8 h-8" style={{ color: "var(--color-muted)", opacity: 0.4 }} />
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>История пока пуста</p>
            <p className="text-xs text-center max-w-xs" style={{ color: "var(--color-muted)", opacity: 0.7 }}>
              Данные появятся после первых запросов к AI-провайдеру из виджета или теста в разделе ИИ
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Дата", "Провайдер", "Модель", "Токены", "Стоимость"].map((h) => (
                  <th key={h} className="text-left pb-2 font-medium pr-4" style={{ color: "var(--color-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td className="py-2 pr-4" style={{ color: "var(--color-text)" }}>{fmtDateTime(row.time)}</td>
                  <td className="py-2 pr-4" style={{ color: "var(--color-text)" }}>{row.provider}</td>
                  <td className="py-2 pr-4" style={{ color: "var(--color-muted)" }}>{row.model}</td>
                  <td className="py-2 pr-4" style={{ color: "var(--color-text)" }}>{formatNumber(row.totalTokens)}</td>
                  <td className="py-2" style={{ color: "var(--color-text)" }}>
                    {row.costRub > 0 ? formatCurrency(row.costRub) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
