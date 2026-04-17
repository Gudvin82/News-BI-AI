"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Clock3, DatabaseZap, Eraser, Globe2, ImageIcon, Moon, RefreshCw, Settings2, ShieldAlert, Sun, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PinDialog } from "@/components/settings/PinDialog";
import { defaultGeneralSettings, readDataFreshness, readGeneralSettings, saveGeneralSettings, type GeneralSettingsData } from "@/lib/settings-client";
import { writeLog } from "@/lib/logger";
import { writeServerAudit } from "@/lib/audit-client";

type ResetAction = "stats" | "integrations" | "cache" | "filters" | "tokens" | null;

function fmtTime(iso?: string) {
  if (!iso) return "ещё не обновлялось";
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

const FRESHNESS_SECTIONS = [
  { id: "finance", label: "Финансы" },
  { id: "hire", label: "Найм" },
  { id: "dtp", label: "ДТП" },
  { id: "bizproc", label: "Бизнес-процессы" },
  { id: "workshop", label: "СТО" },
] as const;

export default function GeneralSettingsPage() {
  const [isDark, setIsDark] = useState(false);
  const [settings, setSettings] = useState<GeneralSettingsData>(defaultGeneralSettings());
  const [savedMsg, setSavedMsg] = useState("");
  const [freshness, setFreshness] = useState(readDataFreshness());
  const [pendingReset, setPendingReset] = useState<ResetAction>(null);
  const [resetResult, setResetResult] = useState("");

  useEffect(() => {
    setIsDark(localStorage.getItem("yb_theme") === "dark");
    setSettings(readGeneralSettings());
    setFreshness(readDataFreshness());
  }, []);

  const resetMeta = useMemo(() => ({
    stats: {
      title: "Обнулить статистику",
      description: "Очищает локальную статистику и рабочий кэш браузера.",
    },
    integrations: {
      title: "Сбросить все интеграции",
      description: "Удаляет локальные настройки интеграций и токены из браузера.",
    },
    cache: {
      title: "Очистить кэш",
      description: "Удаляет только кэшированные данные без изменения настроек.",
    },
    filters: {
      title: "Очистить фильтры",
      description: "Сбрасывает сохранённые пресеты дат и пользовательские фильтры.",
    },
    tokens: {
      title: "Очистить локальные токены",
      description: "Удаляет локально сохранённые ключи и токены без удаления структуры настроек.",
    },
  }), []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    const val = next ? "dark" : "light";
    localStorage.setItem("yb_theme", val);
    document.documentElement.setAttribute("data-theme", val);
    document.documentElement.classList.toggle("dark", next);
    writeLog("settings", `Тема изменена на: ${val}`);
    void writeServerAudit("settings", "Изменена тема оформления", `Тема: ${val}`);
  }

  function updateField<K extends keyof GeneralSettingsData>(key: K, value: GeneralSettingsData[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function saveAll() {
    saveGeneralSettings(settings);
    writeLog("settings", "Общие настройки сохранены", `${settings.companyName} · ${settings.timezone}`);
    void writeServerAudit("settings", "Сохранены общие настройки", `${settings.companyName} · ${settings.timezone}`);
    setSavedMsg("Изменения сохранены");
    setTimeout(() => setSavedMsg(""), 2500);
  }

  function resetByAction(action: Exclude<ResetAction, null>) {
    const keys = Object.keys(localStorage);
    let toDelete: string[] = [];

    if (action === "stats") {
      toDelete = keys.filter((k) => k.startsWith("yb_stat") || k.startsWith("yb_cache") || k.startsWith("bj-wh"));
    }
    if (action === "integrations") {
      toDelete = keys.filter((k) => k.startsWith("yb_int"));
    }
    if (action === "cache") {
      toDelete = keys.filter((k) => k.startsWith("yb_cache") || k === "yb_settings_freshness");
    }
    if (action === "filters") {
      toDelete = keys.filter((k) => k.includes("filter") || k.includes("filters"));
    }
    if (action === "tokens") {
      toDelete = keys.filter((k) =>
        k === "yb_ai_key" ||
        k === "yb_ai_provider" ||
        k === "yb_ai_model" ||
        k === "yb_ai_system_prompt"
      );
    }

    toDelete.forEach((key) => localStorage.removeItem(key));
    if (action === "cache") setFreshness({});

    const label = resetMeta[action].title;
    const detail = `Удалено ключей: ${toDelete.length}`;
    setResetResult(`${label}: ${detail}`);
    writeLog("settings", label, detail);
    void writeServerAudit("settings", label, detail);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Общие настройки</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Локаль, бренд, рабочий календарь, дефолтные параметры дашбордов и безопасные reset-операции.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={saveAll}>
            <Settings2 className="w-3.5 h-3.5" />
            Сохранить изменения
          </Button>
          {savedMsg && <span className="text-xs font-medium" style={{ color: "#10B981" }}>{savedMsg}</span>}
        </div>
      </div>

      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Логика работы</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Сохранить → Проверить подключение → Используется в разделе
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {["Общие", "Интеграции", "Уведомления", "Аудит"].map((item) => (
            <span
              key={item}
              className="px-2.5 py-1 rounded-lg"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Локаль и даты</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Таймзона</span>
              <input value={settings.timezone} onChange={(e) => updateField("timezone", e.target.value)} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Валюта</span>
              <select value={settings.currency} onChange={(e) => updateField("currency", e.target.value)} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Формат дат</span>
              <select value={settings.dateFormat} onChange={(e) => updateField("dateFormat", e.target.value)} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Первый день недели</span>
              <select value={settings.weekStartsOn} onChange={(e) => updateField("weekStartsOn", e.target.value as "monday" | "sunday")} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                <option value="monday">Понедельник</option>
                <option value="sunday">Воскресенье</option>
              </select>
            </label>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Компания и бренд</p>
          </div>
          <div className="space-y-3">
            <label className="space-y-1.5 block">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Название компании</span>
              <input value={settings.companyName} onChange={(e) => updateField("companyName", e.target.value)} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>Короткое имя проекта</span>
                <input value={settings.projectShortName} onChange={(e) => updateField("projectShortName", e.target.value)} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>URL логотипа</span>
                <input value={settings.logoUrl} onChange={(e) => updateField("logoUrl", e.target.value)} placeholder="/logo.svg" className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              </label>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Тема</span>
              <div className="flex gap-2">
                {[
                  { label: "Светлая", dark: false, icon: <Sun className="w-4 h-4" /> },
                  { label: "Тёмная", dark: true, icon: <Moon className="w-4 h-4" /> },
                ].map((theme) => {
                  const active = isDark === theme.dark;
                  return (
                    <button
                      key={theme.label}
                      onClick={toggleTheme}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                      style={{
                        background: active ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                        border: active ? "1px solid var(--color-brand)" : "1px solid var(--color-border)",
                        color: active ? "var(--color-brand)" : "var(--color-muted)",
                      }}
                    >
                      {theme.icon}
                      {theme.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Рабочий календарь</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Выходные (0=вс,6=сб)</span>
              <input
                value={settings.weekendDays.join(", ")}
                onChange={(e) => updateField("weekendDays", e.target.value.split(",").map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n)))}
                className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>День расчётного периода</span>
              <input type="number" min={1} max={31} value={settings.payrollCutoffDay} onChange={(e) => updateField("payrollCutoffDay", Number(e.target.value) || 25)} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
            </label>
          </div>
          <label className="space-y-1.5 block">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>Праздники (по одному YYYY-MM-DD в строке)</span>
            <textarea
              rows={4}
              value={settings.holidayDates.join("\n")}
              onChange={(e) => updateField("holidayDates", e.target.value.split("\n").map((v) => v.trim()).filter(Boolean))}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
          </label>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock3 className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Фильтры и свежесть данных</p>
          </div>
          <label className="space-y-1.5 block">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>Дефолтный период для дашбордов</span>
            <select value={settings.defaultDatePreset} onChange={(e) => updateField("defaultDatePreset", e.target.value as GeneralSettingsData["defaultDatePreset"])} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              <option value="today">Сегодня</option>
              <option value="yesterday">Вчера</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="custom">Период</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FRESHNESS_SECTIONS.map((section) => (
              <div
                key={section.id}
                className="rounded-lg px-3 py-2"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
              >
                <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>{section.label}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                  {fmtTime(freshness[section.id])}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" style={{ color: "#EF4444" }} />
          <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Безопасный сброс</p>
        </div>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Все критичные действия ниже требуют повторного подтверждения отдельным PIN-кодом настроек.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {([
            ["stats", "Обнулить статистику", "Локальная статистика и рабочий кэш браузера."],
            ["integrations", "Сбросить все интеграции", "Убирает все локальные настройки интеграций."],
            ["cache", "Очистить кэш", "Удаляет кэшированные данные и свежесть модулей."],
            ["filters", "Очистить фильтры", "Сбрасывает пользовательские фильтры и пресеты дат."],
            ["tokens", "Очистить локальные токены", "Удаляет локальные AI-ключи и клиентские токены."],
          ] as const).map(([action, title, description]) => (
            <div key={action} className="rounded-xl p-4 space-y-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
              <div className="space-y-1">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{title}</p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>{description}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setPendingReset(action)}>
                {action === "integrations" ? <Trash2 className="w-3.5 h-3.5" /> : <Eraser className="w-3.5 h-3.5" />}
                Выполнить
              </Button>
            </div>
          ))}
        </div>
        {resetResult && (
          <div className="text-xs font-medium" style={{ color: "#10B981" }}>
            {resetResult}
          </div>
        )}
      </Card>

      <PinDialog
        open={pendingReset !== null}
        title={pendingReset ? resetMeta[pendingReset].title : ""}
        description={pendingReset ? resetMeta[pendingReset].description : ""}
        confirmLabel="Подтвердить действие"
        onClose={() => setPendingReset(null)}
        onConfirmed={() => {
          if (pendingReset) resetByAction(pendingReset);
        }}
      />
    </div>
  );
}
