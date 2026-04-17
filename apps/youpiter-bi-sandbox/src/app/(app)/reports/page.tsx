"use client";

import { useState, useCallback } from "react";
import { writeLog } from "@/lib/logger";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  FileText, Copy, Check, RefreshCw, ChevronDown, ChevronUp,
  Send, Wifi, WifiOff, Plus, Trash2,
} from "lucide-react";
import { apiFetch, encodeHeaderJson, readSheetsDocsForSection, readTaxiClientSettings } from "@/lib/utils";

function todayMsk() { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); }
function dateOffset(base: string, days: number) {
  const d = new Date(base); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
}
function firstDayOfMonth() {
  const d = new Date(Date.now() + 3 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtR(n: number) { return `₽ ${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`; }
function fmtPct(a: number, b: number) { return b > 0 ? `${Math.round(a / b * 100)}%` : "0%"; }

type ReportType = "daily" | "weekly" | "hire";
type TestState  = "idle" | "checking" | "ok" | "error";
interface ReportData { type: ReportType; period: string; text: string; generatedAt: string }
interface Messenger  { id: string; type: "telegram" | "max" | "whatsapp"; token: string; chatId: string }

function uid() { return Math.random().toString(36).slice(2, 9); }

const REPORT_TEMPLATES: { type: ReportType; label: string; desc: string; icon: string }[] = [
  { type: "daily",  label: "Ежедневный операционный", desc: "Выпуск авто, смены, выручка по паркам за сегодня", icon: "📊" },
  { type: "weekly", label: "Еженедельный финансовый",  desc: "Доходы, расходы, прибыль за последние 7 дней",    icon: "💰" },
  { type: "hire",   label: "Отчёт по найму",            desc: "Воронка, менеджеры, источники за текущий месяц",  icon: "👥" },
];

const CONSTRUCTOR_SECTIONS = [
  { id: "dashboard",  label: "Дашборд",   icon: "📈", subs: [] },
  { id: "finance",    label: "Финансы",    icon: "💰", subs: [
    { id: "finance/overview", label: "Обзор" }, { id: "finance/cashflow", label: "Cashflow" },
    { id: "finance/debts",    label: "Долги" }, { id: "finance/budget",   label: "Бюджет"   },
  ]},
  { id: "operations", label: "Операции",  icon: "🚗", subs: [
    { id: "operations/cars",    label: "Автопарк"  }, { id: "operations/drivers", label: "Водители" },
    { id: "operations/shifts",  label: "Смены"     }, { id: "operations/revenue", label: "Выручка"  },
  ]},
  { id: "hire",       label: "Найм",      icon: "👥", subs: [
    { id: "hire/funnel",      label: "Воронка"    }, { id: "hire/managers",    label: "Менеджеры" },
    { id: "hire/parks",       label: "Парки"      }, { id: "hire/first-shift", label: "1-я смена" },
    { id: "hire/sources",     label: "Источники"  }, { id: "hire/dostavka",    label: "Доставка"  },
    { id: "hire/raskat",      label: "Раскат"     },
  ]},
  { id: "cash",       label: "Касса",     icon: "💳", subs: [
    { id: "cash/daily",    label: "Дневная касса" }, { id: "cash/registry", label: "Реестр" },
  ]},
  { id: "workshop",   label: "СТО",       icon: "🔧", subs: [
    { id: "workshop/cars",     label: "Автомобили" }, { id: "workshop/schedule", label: "Расписание" },
    { id: "workshop/costs",    label: "Расходы"    },
  ]},
  { id: "marketing",  label: "Маркетинг", icon: "🎯", subs: [
    { id: "marketing/overview",  label: "Обзор"          }, { id: "marketing/yandex",    label: "Яндекс Директ" },
    { id: "marketing/analytics", label: "Аналитика"      },
  ]},
];

const MES_TYPES: { type: Messenger["type"]; label: string; color: string; logo: string }[] = [
  { type: "telegram", label: "Telegram", color: "#2AABEE", logo: "TG" },
  { type: "max",      label: "MAX",      color: "#FF6B35", logo: "MX" },
  { type: "whatsapp", label: "WhatsApp", color: "#25D366", logo: "WA" },
];

// ── DeliveryBlock ────────────────────────────────────────────────────────────
function DeliveryBlock({ logo, color, name, connected, defaultOpen = false, children }: {
  logo: string; color: string; name: string; connected: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-90"
        style={{ background: "var(--color-surface-2)" }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: color }}>
          {logo}
        </div>
        <p className="flex-1 font-medium text-sm" style={{ color: "var(--color-text)" }}>{name}</p>
        <Badge variant={connected ? "success" : "default"}>{connected ? "Подключено" : "Не настроено"}</Badge>
        {open ? <ChevronUp className="w-4 h-4 ml-1" style={{ color: "var(--color-muted)" }} />
               : <ChevronDown className="w-4 h-4 ml-1" style={{ color: "var(--color-muted)" }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-9 px-3 rounded-lg text-sm outline-none"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
    </div>
  );
}

function TestBtn({ state, onTest }: { state: TestState; onTest: () => void }) {
  const color = state === "ok" ? "#10B981" : state === "error" ? "#EF4444" : "var(--color-muted)";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button onClick={onTest} disabled={state === "checking"}
        className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-muted)", opacity: state === "checking" ? 0.6 : 1 }}>
        <Send className="w-3.5 h-3.5" />
        {state === "checking" ? "Отправка…" : "Тест отправки"}
      </button>
      {state !== "idle" && state !== "checking" && (
        <span className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
          {state === "ok" ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {state === "ok" ? "Отправлено" : "Ошибка отправки"}
        </span>
      )}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [loading, setLoading]   = useState<ReportType | null>(null);
  const [reports, setReports]   = useState<Partial<Record<ReportType, ReportData>>>({});
  const [copied, setCopied]     = useState<ReportType | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const [b24ChatId, setB24ChatId] = useState("");
  const [b24Test, setB24Test]     = useState<TestState>("idle");

  const [messengers, setMessengers]   = useState<Messenger[]>([]);
  const [mesTests, setMesTests]       = useState<Record<string, TestState>>({});

  const [selectedSections, setSelectedSections]   = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections]   = useState<Set<string>>(new Set());

  function addMessenger(type: Messenger["type"]) {
    setMessengers((p) => [...p, { id: uid(), type, token: "", chatId: "" }]);
  }
  function updateMessenger(id: string, patch: Partial<Messenger>) {
    setMessengers((p) => p.map((m) => m.id === id ? { ...m, ...patch } : m));
  }
  function removeMessenger(id: string) {
    setMessengers((p) => p.filter((m) => m.id !== id));
    setMesTests((p) => { const n = { ...p }; delete n[id]; return n; });
  }
  async function testB24() {
    setB24Test("checking"); await new Promise((r) => setTimeout(r, 900));
    setB24Test(b24ChatId ? "ok" : "error");
  }
  async function testMessenger(m: Messenger) {
    setMesTests((p) => ({ ...p, [m.id]: "checking" }));
    await new Promise((r) => setTimeout(r, 900));
    setMesTests((p) => ({ ...p, [m.id]: m.token && m.chatId ? "ok" : "error" }));
  }

  function toggleSection(id: string, subs: { id: string }[]) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (subs.length === 0) { next.has(id) ? next.delete(id) : next.add(id); }
      else {
        const allOn = subs.every((s) => next.has(s.id));
        allOn ? (subs.forEach((s) => next.delete(s.id)), next.delete(id))
              : (subs.forEach((s) => next.add(s.id)), next.add(id));
      }
      return next;
    });
  }
  function toggleSub(parentId: string, subId: string, subs: { id: string }[]) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      next.has(subId) ? next.delete(subId) : next.add(subId);
      subs.some((s) => next.has(s.id)) ? next.add(parentId) : next.delete(parentId);
      return next;
    });
  }
  function toggleExpand(id: string) {
    setExpandedSections((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const generate = useCallback(async (type: ReportType) => {
    setLoading(type); setError(null);
    const today = todayMsk(); const lines: string[] = [];
    try {
      if (type === "daily") {
        const { token, enabled } = readTaxiClientSettings();
        lines.push(`📊 Операционный отчёт — ${today}`); lines.push("─".repeat(32));
        if (enabled && token) {
          const r = await apiFetch(`/api/operations/summary?from=${today}&to=${today}`, { headers: { "x-taxi-token": token } });
          const j = await r.json();
          if (j.ok && j.data) {
            const d = j.data;
            lines.push(`🚗 Выпуск авто: ${d.carsOut}`); lines.push(`🔄 Смен: ${d.shiftsCount}`);
            lines.push(`💵 Выручка: ${fmtR(d.totalRevenue)}`); lines.push(`👤 Активных водителей: ${d.driversActive}`);
            if (Object.keys(d.parkBreakdown ?? {}).length > 0) {
              lines.push(""); lines.push("По паркам:");
              for (const [park, v] of Object.entries(d.parkBreakdown as Record<string, { revenue: number; carsOut: number }>))
                lines.push(`  ${park}: ${v.carsOut} авто · ${fmtR(v.revenue)}`);
            }
          } else { lines.push("TaxiCRM: нет данных"); }
        } else { lines.push("TaxiCRM не подключён или отключён для раздела Операции"); }
      } else if (type === "weekly") {
        const from = dateOffset(today, -6);
        const docs = readSheetsDocsForSection("finance");
        lines.push(`💰 Финансовый отчёт — ${from} — ${today}`); lines.push("─".repeat(32));
        if (docs.length > 0) {
          const r = await apiFetch(`/api/finance/sheets?from=${from}&to=${today}`, { headers: { "x-gsheets-docs": encodeHeaderJson(docs) } });
          const j = await r.json();
          if (j.ok && j.data) {
            const d = j.data;
            lines.push(`📥 Доходы: ${fmtR(d.totalIncome)}`); lines.push(`📤 Расходы: ${fmtR(d.totalExpense)}`);
            lines.push(`💹 Прибыль: ${fmtR(d.profit)}`);
            const entries: { balance: number }[] = d.dailyCashflow ?? [];
            if (entries.length > 0) lines.push(`📊 Остаток: ${fmtR(entries.at(-1)?.balance ?? 0)}`);
          } else { lines.push("Google Sheets: нет данных"); }
        } else { lines.push("Google Sheets не подключён"); }
      } else if (type === "hire") {
        const from = firstDayOfMonth();
        lines.push(`👥 Отчёт найма — ${from} — ${today}`); lines.push("─".repeat(32));
        const r = await apiFetch(`/api/hire/summary?from=${from}&to=${today}`);
        const j = await r.json();
        if (j.ok && j.data) {
          const d = j.data;
          lines.push(`📋 Всего откликов: ${d.total}`); lines.push(`✅ Релевантных: ${d.relevant} (${fmtPct(d.relevant, d.total)})`);
          lines.push(`❌ Нерелевантных: ${d.irrelevant}`); lines.push(`🤝 Собеседований: ${d.sobes}`);
          lines.push(`🚗 Первых смен: ${d.dFirst}`); lines.push(`📈 Конв. Релев→Собес: ${d.convRelevToSobes}%`);
          lines.push(`📈 Конв. Собес→1см: ${d.convSobesToFirst}%`);
        } else { lines.push(j.error ?? "Bitrix24: нет данных"); }
      }
      lines.push(""); lines.push(`Сформировано: ${new Date().toLocaleString("ru-RU")}`);
      const labels: Record<ReportType, string> = { daily: "Ежедневный операционный", weekly: "Еженедельный финансовый", hire: "Отчёт по найму" };
      writeLog("report", `Сформирован отчёт: ${labels[type]}`, `Дата: ${today}`);
      setReports((prev) => ({ ...prev, [type]: { type, period: today, text: lines.join("\n"), generatedAt: new Date().toISOString() } }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(null); }
  }, []);

  async function copyReport(type: ReportType) {
    const text = reports[type]?.text; if (!text) return;
    await navigator.clipboard.writeText(text); setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  const b24Connected  = !!b24ChatId;
  const mesConnected  = messengers.some((m) => m.token && m.chatId);
  const selectedCount = selectedSections.size;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Отчёты</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Генерация и отправка отчётов по подключённым источникам</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}

      {/* ── Report templates ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {REPORT_TEMPLATES.map(({ type, label, desc, icon }) => {
          const report = reports[type]; const isLoading = loading === type; const isCopied = copied === type;
          return (
            <Card key={type} className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {report && (
                    <button onClick={() => copyReport(type)}
                      className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                      style={{ background: isCopied ? "rgba(16,185,129,0.1)" : "var(--color-surface-2)", color: isCopied ? "#10B981" : "var(--color-muted)", border: `1px solid ${isCopied ? "rgba(16,185,129,0.3)" : "var(--color-border)"}` }}>
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {isCopied ? "Скопировано" : "Копировать"}
                    </button>
                  )}
                  <button onClick={() => generate(type)} disabled={isLoading}
                    className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 text-white transition-all disabled:opacity-60"
                    style={{ background: "var(--color-brand)" }}>
                    {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    {isLoading ? "Генерация…" : report ? "Обновить" : "Сформировать"}
                  </button>
                </div>
              </div>
              {report && (
                <div style={{ borderTop: "1px solid var(--color-border)" }}>
                  <textarea readOnly value={report.text}
                    className="w-full p-4 text-xs font-mono resize-none outline-none"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text)", minHeight: "220px" }} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Конструктор отчёта ───────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold" style={{ color: "var(--color-text)" }}>Конструктор отчёта</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>Выберите разделы для включения в отчёт</p>
          </div>
          {selectedCount > 0 && <Badge variant="success">{selectedCount} выбрано</Badge>}
        </div>
        <div className="space-y-1.5">
          {CONSTRUCTOR_SECTIONS.map(({ id, label, icon, subs }) => {
            const hasSubs   = subs.length > 0;
            const isExpanded = expandedSections.has(id);
            const allSubsOn  = hasSubs && subs.every((s) => selectedSections.has(s.id));
            const someSubsOn = hasSubs && subs.some((s) => selectedSections.has(s.id));
            const isOn = hasSubs ? allSubsOn : selectedSections.has(id);
            return (
              <div key={id}>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors"
                  style={{ background: isOn || someSubsOn ? "var(--color-brand-soft)" : "var(--color-surface-2)", border: `1.5px solid ${isOn || someSubsOn ? "var(--color-brand)" : "transparent"}` }}>
                  <button onClick={() => toggleSection(id, subs)} className="flex items-center gap-2 flex-1 text-left">
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{ background: isOn ? "var(--color-brand)" : someSubsOn ? "var(--color-brand)" : "var(--color-surface)", border: `1.5px solid ${isOn || someSubsOn ? "var(--color-brand)" : "var(--color-border)"}`, opacity: someSubsOn && !isOn ? 0.6 : 1 }}>
                      {(isOn || someSubsOn) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="text-sm">{icon}</span>
                    <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{label}</span>
                  </button>
                  {hasSubs && (
                    <button onClick={() => toggleExpand(id)} className="p-1 rounded-lg transition-colors" style={{ color: "var(--color-muted)" }}>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
                {hasSubs && isExpanded && (
                  <div className="ml-6 mt-1 space-y-1">
                    {subs.map((sub) => {
                      const subOn = selectedSections.has(sub.id);
                      return (
                        <button key={sub.id} onClick={() => toggleSub(id, sub.id, subs)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                          style={{ background: subOn ? "var(--color-brand-soft)" : "var(--color-surface-2)", border: `1.5px solid ${subOn ? "var(--color-brand)" : "transparent"}` }}>
                          <div className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: subOn ? "var(--color-brand)" : "var(--color-surface)", border: `1.5px solid ${subOn ? "var(--color-brand)" : "var(--color-border)"}` }}>
                            {subOn && <Check className="w-2 h-2 text-white" />}
                          </div>
                          <span className="text-xs" style={{ color: "var(--color-text)" }}>{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {selectedCount > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Выбранные разделы будут включены в следующий сформированный отчёт. Генерация по конструктору — в разработке.
            </p>
          </div>
        )}
      </Card>

      {/* ── Отправка отчётов ─────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <p className="font-semibold" style={{ color: "var(--color-text)" }}>Отправка отчётов</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            Настройте каналы доставки — отчёты будут отправляться автоматически по расписанию
          </p>
        </div>
        <div className="space-y-3">
          {/* Bitrix24 */}
          <DeliveryBlock logo="B24" color="#E2533D" name="Bitrix24" connected={b24Connected}>
            <FieldInput label="ID чата или беседы Bitrix24" value={b24ChatId} onChange={setB24ChatId} placeholder="chat123 или group456" />
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Найти ID: откройте чат в Bitrix24 → скопируйте из адресной строки (…/chat/ID/…)
            </p>
            <TestBtn state={b24Test} onTest={testB24} />
          </DeliveryBlock>

          {/* Messengers */}
          <DeliveryBlock logo="✉" color="#6366F1" name="Мессенджеры" connected={mesConnected}>
            {messengers.length === 0 && (
              <p className="text-xs py-1" style={{ color: "var(--color-muted)" }}>Добавьте один или несколько каналов доставки.</p>
            )}
            {messengers.map((m) => {
              const meta = MES_TYPES.find((t) => t.type === m.type)!;
              const testState = mesTests[m.id] ?? ("idle" as TestState);
              return (
                <div key={m.id} className="rounded-xl p-3 space-y-2"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: meta.color }}>{meta.logo}</div>
                      <span className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>{meta.label}</span>
                    </div>
                    <button onClick={() => removeMessenger(m.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
                      style={{ color: "var(--color-muted)" }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {m.type === "telegram" && <>
                      <FieldInput label="Bot Token" value={m.token} onChange={(v) => updateMessenger(m.id, { token: v })} placeholder="1234567890:AAF..." type="password" />
                      <FieldInput label="Chat ID"   value={m.chatId} onChange={(v) => updateMessenger(m.id, { chatId: v })} placeholder="-1001234567890" />
                    </>}
                    {m.type === "max" && <>
                      <FieldInput label="API Token MAX" value={m.token} onChange={(v) => updateMessenger(m.id, { token: v })} placeholder="Токен бота MAX" type="password" />
                      <FieldInput label="Chat ID"       value={m.chatId} onChange={(v) => updateMessenger(m.id, { chatId: v })} placeholder="ID чата MAX" />
                    </>}
                    {m.type === "whatsapp" && <>
                      <FieldInput label="API Token"      value={m.token} onChange={(v) => updateMessenger(m.id, { token: v })} placeholder="Токен WA Business" type="password" />
                      <FieldInput label="Номер / Chat ID" value={m.chatId} onChange={(v) => updateMessenger(m.id, { chatId: v })} placeholder="+7900..." />
                    </>}
                  </div>
                  <TestBtn state={testState} onTest={() => testMessenger(m)} />
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              {MES_TYPES.filter((t) => !messengers.find((m) => m.type === t.type)).map((t) => (
                <button key={t.type} onClick={() => addMessenger(t.type)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                  <Plus className="w-3 h-3" />{t.label}
                </button>
              ))}
            </div>
          </DeliveryBlock>
        </div>
      </div>
    </div>
  );
}
