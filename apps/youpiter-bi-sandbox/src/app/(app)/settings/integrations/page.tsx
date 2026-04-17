"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ExternalLink, Plus, Trash2, ChevronDown, ChevronUp, Check, Wifi, WifiOff, Settings2 } from "lucide-react";
import { apiFetch, encodeHeaderJson } from "@/lib/utils";
import { writeLog } from "@/lib/logger";
import { writeServerAudit } from "@/lib/audit-client";
import SheetsWizard, { type WizardResult } from "@/components/integrations/SheetsWizard";
import type { SheetMapping } from "@/lib/types/sheets";

function todayStr() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
}

function firstDayOfMonthStr() {
  const d = new Date(Date.now() + 3 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type TestState = "idle" | "checking" | "ok" | "error";

interface TestResult { state: TestState; message?: string; testedSections?: string[] }

function TestButton({
  label, result, onTest,
}: { label?: string; result: TestResult; onTest: () => void }) {
  const icon = result.state === "ok"
    ? <Wifi className="w-3.5 h-3.5" />
    : result.state === "error"
    ? <WifiOff className="w-3.5 h-3.5" />
    : null;

  const color = result.state === "ok"
    ? "#10B981"
    : result.state === "error"
    ? "#EF4444"
    : "var(--color-muted)";

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={onTest}
        disabled={result.state === "checking"}
        className="h-8 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-muted)",
          opacity: result.state === "checking" ? 0.6 : 1,
        }}
      >
        {result.state === "checking" ? "Проверяем…" : (label ?? "Проверить подключение")}
      </button>
      {result.state !== "idle" && result.state !== "checking" && (
        <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
          {icon}
          <span>{result.message ?? (result.state === "ok" ? "Успешно" : "Ошибка")}</span>
        </div>
      )}
    </div>
  );
}

// ── Sections that can be driven by integrations ─────────────────────────────
const ALL_SECTIONS = [
  { id: "finance",    label: "Финансы" },
  { id: "operations", label: "Операции" },
  { id: "hire",       label: "Найм" },
  { id: "dtp",        label: "ДТП" },
  { id: "bizproc",    label: "Бизнес-процессы" },
  { id: "cash",       label: "Касса" },
  { id: "workshop",   label: "СТО" },
  { id: "reports",    label: "Отчёты" },
  { id: "marketing",  label: "Маркетинг" },
];

const SECTION_LABELS = Object.fromEntries(ALL_SECTIONS.map((s) => [s.id, s.label])) as Record<string, string>;

function sectionLabels(ids: string[] | undefined) {
  return (ids ?? []).map((id) => SECTION_LABELS[id] ?? id);
}

function testTargetLabel(ids: string[] | undefined) {
  const labels = sectionLabels(ids);
  if (labels.length === 0) return "разделов";
  if (labels.length === 1) return labels[0];
  return labels.join(", ");
}

function getSectionState(sectionId: string, selected: string[] | undefined, test?: TestResult) {
  if (!(selected ?? []).includes(sectionId)) return "unused";
  if (test?.state === "ok" && (test.testedSections ?? []).includes(sectionId)) return "verified";
  return "connected";
}

function SectionStatusGrid({
  selected,
  test,
}: {
  selected: string[] | undefined;
  test?: TestResult;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
          Статус по разделам
        </p>
        <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
          Не используется / Подключено / Проверено
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SECTIONS.map((section) => {
          const state = getSectionState(section.id, selected, test);
          const style = state === "verified"
            ? { background: "#DCFCE7", color: "#166534", border: "1px solid #86EFAC" }
            : state === "connected"
            ? { background: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }
            : { background: "var(--color-surface-2)", color: "var(--color-muted)", border: "1px solid var(--color-border)" };
          const label = state === "verified" ? "Проверено" : state === "connected" ? "Подключено" : "Не используется";

          return (
            <div
              key={section.id}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
              style={style}
              title={`${section.label}: ${label}`}
            >
              <span>{section.label}</span>
              <span style={{ opacity: 0.78 }}> · {label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Google Sheets doc entry ──────────────────────────────────────────────────
interface SheetDoc {
  id: string;
  name: string;
  url: string;
  sections: string[];
  prompt?: string;
  mapping?: SheetMapping;
  totalRows?: number;
}

// ── Yandex Fleet park entry ───────────────────────────────────────────────────
interface FleetPark {
  id: string;
  name: string;
  parkId: string;
  clientId: string;
  apiKey: string;
}

type DeleteTarget =
  | { kind: "gsheet"; id: string; title: string }
  | { kind: "fleet"; id: string; title: string };

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Section checkbox selector ────────────────────────────────────────────────
function SectionSelector({
  selected, onChange,
}: { selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }
  function toggleAll() {
    onChange(selected.length === ALL_SECTIONS.length ? [] : ALL_SECTIONS.map((s) => s.id));
  }
  const allSelected = selected.length === ALL_SECTIONS.length;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
          Применять в разделах:
        </p>
        <button
          onClick={toggleAll}
          className="text-xs px-2 py-0.5 rounded-md transition-colors"
          style={{
            background: allSelected ? "var(--color-brand-soft)" : "var(--color-surface-2)",
            color: allSelected ? "var(--color-brand)" : "var(--color-muted)",
          }}
        >
          {allSelected ? "Снять все" : "Все"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_SECTIONS.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: on ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                color: on ? "var(--color-brand)" : "var(--color-muted)",
                border: on ? "1.5px solid var(--color-brand)" : "1.5px solid transparent",
              }}
            >
              {on && <Check className="w-3 h-3" />}
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Collapsible integration block ────────────────────────────────────────────
function IntegrationBlock({
  color, logo, name, status, docsUrl, defaultOpen = false, children,
}: {
  color: string; logo: string; name: string;
  status: "connected" | "partial" | "disconnected";
  docsUrl: string; defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const badge = status === "connected" ? "success" : status === "partial" ? "warning" : "default";
  const badgeLabel = status === "connected" ? "Подключено" : status === "partial" ? "Настроено" : "Не подключено";

  return (
    <Card className="overflow-hidden p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2/30"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: color }}
        >
          {logo}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{name}</p>
            <Badge variant={badge}>{badgeLabel}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
            style={{ color: "var(--color-muted)" }}
            title="Документация"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {open ? (
            <ChevronUp className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <div className="pt-4">{children}</div>
        </div>
      )}
    </Card>
  );
}

// ── Text input row ───────────────────────────────────────────────────────────
function FieldRow({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 px-3 rounded-lg text-sm outline-none transition-all"
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text)",
        }}
      />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  // Bitrix24
  const [b24Webhook, setB24Webhook]     = useState("");
  const [b24Sections, setB24Sections]   = useState<string[]>(["hire"]);
  const [b24Saving, setB24Saving]       = useState(false);
  const [b24ServerConfigured, setB24ServerConfigured] = useState(false);

  // taxicrm.ru
  const [taxiToken, setTaxiToken]         = useState("");
  const [taxiSections, setTaxiSections]   = useState<string[]>(["operations", "finance"]);
  const [taxiSaving, setTaxiSaving]       = useState(false);

  // Google Sheets
  const [docs, setDocs]                   = useState<SheetDoc[]>([]);
  const [sheetsSaving, setSheetsSaving]   = useState(false);

  // 1С
  const [oneC, setOneC]                   = useState({ url: "", login: "", password: "" });
  const [oneCsections, setOneCsections]   = useState<string[]>(["finance", "cash"]);
  const [oneCsaving, setOneCsaving]       = useState(false);
  const [oneCTest, setOneCTest]           = useState<TestResult>({ state: "idle" });

  // 1С Atimo
  const [atimo, setAtimo]                 = useState({ baseUrl: "", apiKey: "" });
  const [atimoSections, setAtimoSections] = useState<string[]>(["workshop"]);
  const [atimoSaving, setAtimoSaving]     = useState(false);
  const [atimoTest, setAtimoTest]         = useState<TestResult>({ state: "idle" });

  // Яндекс Такси (Fleet) — multi-park
  const [fleetParks, setFleetParks]       = useState<FleetPark[]>([]);
  const [fleetSections, setFleetSections] = useState<string[]>(["operations", "hire"]);
  const [fleetSaving, setFleetSaving]     = useState(false);
  const [fleetTests, setFleetTests]       = useState<Record<string, TestResult>>({});

  // AmoCRM
  const [amo, setAmo]                     = useState({ domain: "", apiKey: "" });
  const [amoSections, setAmoSections]     = useState<string[]>(["hire"]);
  const [amoSaving, setAmoSaving]         = useState(false);
  const [amoTest, setAmoTest]             = useState<TestResult>({ state: "idle" });

  // Яндекс Директ
  const [yd, setYd]                       = useState({ token: "", clientId: "" });
  const [ydSections, setYdSections]       = useState<string[]>(["marketing"]);
  const [ydSaving, setYdSaving]           = useState(false);

  // Test connection results
  const [taxiTest,  setTaxiTest]  = useState<TestResult>({ state: "idle" });
  const [ydTest,    setYdTest]    = useState<TestResult>({ state: "idle" });
  const [b24Test,   setB24Test]   = useState<TestResult>({ state: "idle" });
  const [docTests,  setDocTests]  = useState<Record<string, TestResult>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deleteError, setDeleteError] = useState("");
  // null = closed, "new" = new doc wizard, docId = editing existing
  const [wizardDocId, setWizardDocId] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const b24 = JSON.parse(localStorage.getItem("yb_int_bitrix24") ?? "{}");
      if (b24.webhook)  setB24Webhook(b24.webhook);
      if (b24.sections) setB24Sections(b24.sections);

      const taxi = JSON.parse(localStorage.getItem("yb_int_taxicrm") ?? "{}");
      if (taxi.token)    setTaxiToken(taxi.token);
      if (taxi.sections) setTaxiSections(taxi.sections);

      const savedDocs = JSON.parse(localStorage.getItem("yb_int_gsheets") ?? "[]");
      if (Array.isArray(savedDocs)) setDocs(savedDocs);

      const oc = JSON.parse(localStorage.getItem("yb_int_1c") ?? "{}");
      if (oc.url)      setOneC((p) => ({ ...p, url: oc.url ?? "" }));
      if (oc.login)    setOneC((p) => ({ ...p, login: oc.login ?? "" }));
      if (oc.sections) setOneCsections(oc.sections);

      const fleetData = JSON.parse(localStorage.getItem("yb_int_ytfleet") ?? "{}");
      if (Array.isArray(fleetData.parks)) setFleetParks(fleetData.parks);
      if (fleetData.sections) setFleetSections(fleetData.sections);

      const ydData = JSON.parse(localStorage.getItem("yb_int_yandex") ?? "{}");
      if (ydData.token)    setYd((p) => ({ ...p, token: ydData.token ?? "" }));
      if (ydData.clientId) setYd((p) => ({ ...p, clientId: ydData.clientId ?? "" }));
      if (ydData.sections) setYdSections(ydData.sections);

      const at = JSON.parse(localStorage.getItem("yb_int_atimo") ?? "{}");
      if (at.baseUrl)  setAtimo((p) => ({ ...p, baseUrl: at.baseUrl ?? "" }));
      if (at.apiKey)   setAtimo((p) => ({ ...p, apiKey: at.apiKey ?? "" }));
      if (at.sections) setAtimoSections(at.sections);

      const amoData = JSON.parse(localStorage.getItem("yb_int_amocrm") ?? "{}");
      if (amoData.domain)   setAmo((p) => ({ ...p, domain: amoData.domain ?? "" }));
      if (amoData.apiKey)   setAmo((p) => ({ ...p, apiKey: amoData.apiKey ?? "" }));
      if (amoData.sections) setAmoSections(amoData.sections);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch("/api/settings/integrations/bitrix", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted || !j?.ok) return;
        const webhook = String(j.data?.webhook ?? "");
        const sections = Array.isArray(j.data?.sections)
          ? j.data.sections.map((v: unknown) => String(v))
          : [];
        if (webhook) {
          setB24ServerConfigured(true);
          setB24Webhook((prev) => prev || webhook);
        }
        if (sections.length > 0) {
          setB24Sections(sections);
        }
      })
      .catch(() => { /* ignore */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch("/api/settings/integrations/taxicrm", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted || !j?.ok) return;
        const token = String(j.data?.token ?? "");
        const sections = Array.isArray(j.data?.sections)
          ? j.data.sections.map((v: unknown) => String(v))
          : [];
        if (token) setTaxiToken((prev) => prev || token);
        if (sections.length > 0) setTaxiSections(sections);
      })
      .catch(() => { /* ignore */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch("/api/settings/integrations/yandex", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!mounted || !j?.ok) return;
        const token = String(j.data?.token ?? "");
        const clientId = String(j.data?.clientId ?? "");
        const sections = Array.isArray(j.data?.sections)
          ? j.data.sections.map((v: unknown) => String(v))
          : [];
        if (token) setYd((prev) => ({ ...prev, token: prev.token || token }));
        if (clientId) setYd((prev) => ({ ...prev, clientId: prev.clientId || clientId }));
        if (sections.length > 0) setYdSections(sections);
      })
      .catch(() => { /* ignore */ });
    return () => { mounted = false; };
  }, []);

  async function testTaxi() {
    if (!taxiToken) { setTaxiTest({ state: "error", message: "Введите токен" }); return; }
    setTaxiTest({ state: "checking" });
    const today = todayStr();
    try {
      const r = await apiFetch(`/api/operations/summary?from=${today}&to=${today}`, {
        headers: { "x-taxi-token": taxiToken },
      });
      const j = await r.json();
      if (r.status === 503) { setTaxiTest({ state: "error", message: "Нет токена или 503" }); return; }
      if (!j.ok) { setTaxiTest({ state: "error", message: j.error ?? "Ошибка API" }); return; }
      setTaxiTest({ state: "ok", message: `Подключение успешно · выпуск авто: ${j.data?.carsOut ?? 0}` });
    } catch (e) {
      setTaxiTest({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function testYandex() {
    if (!yd.token) { setYdTest({ state: "error", message: "Введите токен" }); return; }
    setYdTest({ state: "checking" });
    const today = todayStr();
    try {
      const r = await apiFetch(`/api/marketing/yandex?from=${today}&to=${today}`, {
        headers: { "x-yandex-token": yd.token, "x-yandex-login": yd.clientId },
      });
      const j = await r.json();
      if (r.status === 503) { setYdTest({ state: "error", message: "Нет токена или 503" }); return; }
      if (!j.ok) { setYdTest({ state: "error", message: j.error ?? "Ошибка API" }); return; }
      const n = j.data?.campaigns?.length ?? 0;
      setYdTest({ state: "ok", message: `Подключение успешно · кампаний: ${n}` });
    } catch (e) {
      setYdTest({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function testDoc(doc: SheetDoc) {
    if (!doc.url) {
      setDocTests((p) => ({ ...p, [doc.id]: { state: "error", message: "Укажите URL таблицы" } }));
      return;
    }
    if (!doc.sections?.length) {
      setDocTests((p) => ({ ...p, [doc.id]: { state: "error", message: "Выберите хотя бы один раздел" } }));
      return;
    }
    setDocTests((p) => ({ ...p, [doc.id]: { state: "checking" } }));
    const today = todayStr();
    const from  = firstDayOfMonthStr();
    const secs  = doc.sections ?? [];
    const testedSections = secs.includes("workshop")
      ? ["workshop"]
      : secs.includes("cash")
      ? ["cash"]
      : secs.filter((s) => s !== "workshop" && s !== "cash");
    const endpoint = testedSections.includes("workshop") ? "/api/workshop/sheets"
      : testedSections.includes("cash") ? "/api/cash/daily"
      : "/api/finance/sheets";
    const target = testedSections.length === 1
      ? (SECTION_LABELS[testedSections[0]] ?? testedSections[0])
      : testedSections.length > 1
      ? testTargetLabel(testedSections)
      : "Финансы";
    try {
      const r = await apiFetch(`${endpoint}?from=${from}&to=${today}`, {
        headers: { "x-gsheets-docs": encodeHeaderJson([{ url: doc.url, name: doc.name, mapping: doc.mapping }]) },
      });
      const j = await r.json();
      if (!j.ok) { setDocTests((p) => ({ ...p, [doc.id]: { state: "error", message: j.error ?? "Ошибка", testedSections } })); return; }
      const cnt = j.data?.entries?.length ?? 0;
      setDocTests((p) => ({ ...p, [doc.id]: { state: "ok", message: `Подключение успешно · ${target}: ${cnt} записей за период`, testedSections } }));
    } catch (e) {
      setDocTests((p) => ({ ...p, [doc.id]: { state: "error", message: e instanceof Error ? e.message : String(e), testedSections } }));
    }
  }

  async function testB24() {
    if (!b24Webhook) { setB24Test({ state: "error", message: "Введите webhook URL" }); return; }
    setB24Test({ state: "checking" });
    // Direct browser fetch — Bitrix24 REST supports CORS
    const url = b24Webhook.replace(/\/$/, "") + "/app.info.json";
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) { setB24Test({ state: "error", message: `HTTP ${r.status}` }); return; }
      const j = await r.json();
      if (j.error) { setB24Test({ state: "error", message: j.error_description ?? j.error }); return; }
      setB24Test({ state: "ok", message: `Подключение успешно · ${j.result?.TITLE ?? "Bitrix24"}` });
    } catch (e) {
      setB24Test({ state: "error", message: e instanceof Error ? e.message : "Не удалось подключиться" });
    }
  }

  function save(key: string, data: unknown, setSaving: (v: boolean) => void, label?: string) {
    setSaving(true);
    localStorage.setItem(key, JSON.stringify(data));
    if (label) writeLog("integration", `Сохранена интеграция: ${label}`);
    if (label) void writeServerAudit("integration", "Сохранена интеграция", label);
    setTimeout(() => setSaving(false), 500);
  }

  async function saveBitrix() {
    setB24Saving(true);
    try {
      const r = await apiFetch("/api/settings/integrations/bitrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook: b24Webhook, sections: b24Sections }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Не удалось сохранить Bitrix24.");

      localStorage.setItem("yb_int_bitrix24", JSON.stringify({ webhook: j.data.webhook, sections: j.data.sections ?? b24Sections }));
      setB24Webhook(j.data.webhook);
      setB24Sections(Array.isArray(j.data?.sections) ? j.data.sections : b24Sections);
      setB24ServerConfigured(true);
      writeLog("integration", "Сохранена интеграция: Bitrix24");
      void writeServerAudit("integration", "Сохранена интеграция", "Bitrix24");
    } catch (e) {
      setB24Test({ state: "error", message: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setB24Saving(false);
    }
  }

  async function saveTaxi() {
    setTaxiSaving(true);
    try {
      const r = await apiFetch("/api/settings/integrations/taxicrm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: taxiToken, sections: taxiSections }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Не удалось сохранить taxicrm.ru.");

      localStorage.setItem("yb_int_taxicrm", JSON.stringify({ token: j.data.token, sections: j.data.sections ?? taxiSections }));
      setTaxiSections(Array.isArray(j.data?.sections) ? j.data.sections : taxiSections);
      writeLog("integration", "Сохранена интеграция: taxicrm.ru");
      void writeServerAudit("integration", "Сохранена интеграция", "taxicrm.ru");
    } catch (e) {
      setTaxiTest({ state: "error", message: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setTaxiSaving(false);
    }
  }

  async function saveYandex() {
    setYdSaving(true);
    try {
      const r = await apiFetch("/api/settings/integrations/yandex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: yd.token, clientId: yd.clientId, sections: ydSections }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Не удалось сохранить Яндекс Директ.");

      localStorage.setItem("yb_int_yandex", JSON.stringify({
        token: j.data.token,
        clientId: j.data.clientId,
        sections: j.data.sections ?? ydSections,
      }));
      setYdSections(Array.isArray(j.data?.sections) ? j.data.sections : ydSections);
      writeLog("integration", "Сохранена интеграция: Яндекс Директ");
      void writeServerAudit("integration", "Сохранена интеграция", "Яндекс Директ");
    } catch (e) {
      setYdTest({ state: "error", message: e instanceof Error ? e.message : "Ошибка сохранения" });
    } finally {
      setYdSaving(false);
    }
  }

  function requestDelete(target: DeleteTarget) {
    setDeleteTarget(target);
    setDeletePin("");
    setDeleteError("");
  }

  function closeDeleteDialog() {
    setDeleteTarget(null);
    setDeletePin("");
    setDeleteError("");
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deletePin !== "1234") {
      setDeleteError("Неверный PIN-код");
      return;
    }

    if (deleteTarget.kind === "gsheet") {
      const nextDocs = docs.filter((d) => d.id !== deleteTarget.id);
      setDocs(nextDocs);
      localStorage.setItem("yb_int_gsheets", JSON.stringify(nextDocs));
      writeLog("integration", "Удалена интеграция: Google Sheets", deleteTarget.title);
      void writeServerAudit("integration", "Удалена интеграция", deleteTarget.title);
    } else {
      const nextParks = fleetParks.filter((p) => p.id !== deleteTarget.id);
      setFleetParks(nextParks);
      localStorage.setItem("yb_int_ytfleet", JSON.stringify({ parks: nextParks, sections: fleetSections }));
      setFleetTests((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      writeLog("integration", "Удалён парк интеграции: Яндекс Fleet", deleteTarget.title);
      void writeServerAudit("integration", "Удалён парк интеграции", deleteTarget.title);
    }

    closeDeleteDialog();
  }

  // Google Sheets helpers
  function addDoc() {
    setDocs((prev) => [...prev, { id: uid(), name: "", url: "", sections: [], prompt: "" }]);
  }
  function updateDoc(id: string, patch: Partial<SheetDoc>) {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, ...patch } : d));
  }

  function handleWizardSave(result: WizardResult) {
    if (wizardDocId === "new") {
      const newDoc: SheetDoc = { id: uid(), name: result.name, url: result.url, sections: result.sections, prompt: result.prompt, mapping: result.mapping, totalRows: result.totalRows };
      const next = [...docs, newDoc];
      setDocs(next);
      localStorage.setItem("yb_int_gsheets", JSON.stringify(next));
      writeLog("integration", "Добавлена таблица через мастер: " + result.name);
      void writeServerAudit("integration", "Добавлена таблица Google Sheets", result.name);
    } else if (wizardDocId) {
      const next = docs.map((d) => d.id === wizardDocId ? { ...d, name: result.name, url: result.url, sections: result.sections, prompt: result.prompt, mapping: result.mapping, totalRows: result.totalRows } : d);
      setDocs(next);
      localStorage.setItem("yb_int_gsheets", JSON.stringify(next));
      writeLog("integration", "Обновлён маппинг таблицы: " + result.name);
      void writeServerAudit("integration", "Обновлён маппинг Google Sheets", result.name);
    }
    setWizardDocId(null);
  }

  // Fleet park helpers
  function addFleetPark() {
    setFleetParks((prev) => [...prev, { id: uid(), name: "", parkId: "", clientId: "", apiKey: "" }]);
  }
  function updateFleetPark(id: string, patch: Partial<FleetPark>) {
    setFleetParks((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  }

  async function testFleetPark(park: FleetPark) {
    if (!park.parkId || !park.clientId || !park.apiKey) {
      setFleetTests((prev) => ({ ...prev, [park.id]: { state: "error", message: "Заполните все три поля" } }));
      return;
    }
    setFleetTests((prev) => ({ ...prev, [park.id]: { state: "checking" } }));
    try {
      const r = await apiFetch("/api/fleet/test", {
        headers: {
          "x-fleet-park-id":   park.parkId,
          "x-fleet-client-id": park.clientId,
          "x-fleet-api-key":   park.apiKey,
        },
      });
      const j = await r.json();
      if (!j.ok) {
        setFleetTests((prev) => ({ ...prev, [park.id]: { state: "error", message: j.error ?? "Ошибка" } }));
        return;
      }
      setFleetTests((prev) => ({ ...prev, [park.id]: { state: "ok", message: `Подключение успешно · ${j.data?.name ?? "Парк подключён"}` } }));
    } catch (e) {
      setFleetTests((prev) => ({ ...prev, [park.id]: { state: "error", message: e instanceof Error ? e.message : "Ошибка соединения" } }));
    }
  }

  async function testAtimo() {
    if (!atimo.baseUrl) { setAtimoTest({ state: "error", message: "Введите базовый URL" }); return; }
    setAtimoTest({ state: "checking" });
    try {
      const base = atimo.baseUrl.replace(/\/$/, "");
      const r = await fetch(`${base}/api/v1/ping`, {
        headers: atimo.apiKey ? { Authorization: `Bearer ${atimo.apiKey}` } : {},
        cache: "no-store",
      });
      if (!r.ok) { setAtimoTest({ state: "error", message: `HTTP ${r.status}` }); return; }
      setAtimoTest({ state: "ok", message: "Подключение успешно" });
    } catch (e) {
      setAtimoTest({ state: "error", message: e instanceof Error ? e.message : "Не удалось подключиться" });
    }
  }

  async function testOneC() {
    if (!oneC.url) { setOneCTest({ state: "error", message: "Введите URL веб-сервиса" }); return; }
    setOneCTest({ state: "checking" });
    try {
      const r = await apiFetch("/api/settings/integrations/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "onec",
          url: oneC.url,
          login: oneC.login,
          password: oneC.password,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setOneCTest({ state: "error", message: j.error ?? "Ошибка проверки" }); return; }
      setOneCTest({ state: "ok", message: j.data?.message ?? "Подключение успешно" });
    } catch (e) {
      setOneCTest({ state: "error", message: e instanceof Error ? e.message : "Не удалось подключиться" });
    }
  }

  async function testAmo() {
    if (!amo.domain) { setAmoTest({ state: "error", message: "Введите домен" }); return; }
    if (!amo.apiKey) { setAmoTest({ state: "error", message: "Введите API-токен" }); return; }
    setAmoTest({ state: "checking" });
    try {
      const r = await apiFetch("/api/settings/integrations/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "amocrm",
          domain: amo.domain,
          apiKey: amo.apiKey,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setAmoTest({ state: "error", message: j.error ?? "Ошибка проверки" }); return; }
      setAmoTest({ state: "ok", message: j.data?.message ?? "Подключение успешно" });
    } catch (e) {
      setAmoTest({ state: "error", message: e instanceof Error ? e.message : "Не удалось подключиться" });
    }
  }

  const atimoStatus: "partial" | "disconnected" = atimo.baseUrl ? "partial" : "disconnected";
  const fleetStatus: "partial" | "disconnected" = fleetParks.some((p) => p.parkId && p.apiKey) ? "partial" : "disconnected";
  const amoStatus:   "partial" | "disconnected" = amo.domain ? "partial" : "disconnected";

  const b24Status = (b24ServerConfigured || !!b24Webhook) ? "partial" : "disconnected";
  const taxiStatus = taxiToken ? "partial" : "disconnected";
  const sheetsStatus = docs.some((d) => d.url) ? "partial" : "disconnected";
  const oneCStatus = oneC.url ? "partial" : "disconnected";
  const ydStatus = yd.token ? "partial" : "disconnected";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Интеграции</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Подключение внешних систем. Для каждой интеграции выберите разделы, в которых она применяется.
        </p>
      </div>

      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Как работать с интеграциями</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Сохранить → Проверить подключение → Используется в разделе
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["Не используется", "var(--color-surface)"],
            ["Подключено", "#FEF3C7"],
            ["Проверено", "#DCFCE7"],
          ].map(([label, bg]) => (
            <span key={label} className="px-2.5 py-1 rounded-lg text-xs" style={{ background: bg, border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Bitrix24 ───────────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="B24" color="#E2533D" name="Bitrix24" status={b24Status}
        docsUrl="https://dev.1c-bitrix.ru/rest_help/"
      >
        <FieldRow
          label="Webhook URL"
          value={b24Webhook}
          onChange={setB24Webhook}
          placeholder="https://yourdomain.bitrix24.ru/rest/1/token/"
        />
        <SectionSelector selected={b24Sections} onChange={setB24Sections} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            loading={b24Saving}
            onClick={saveBitrix}
          >
            Сохранить
          </Button>
          <TestButton result={b24Test} onTest={testB24} />
        </div>
      </IntegrationBlock>

      {/* ── taxicrm.ru ────────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="TCR" color="#3B82F6" name="taxicrm.ru" status={taxiStatus}
        docsUrl="https://taxicrm.ru"
      >
        <FieldRow
          label="API-токен"
          value={taxiToken}
          onChange={setTaxiToken}
          placeholder="Ваш API-токен taxicrm.ru"
          type="password"
        />
        <SectionSelector selected={taxiSections} onChange={setTaxiSections} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            loading={taxiSaving}
            onClick={saveTaxi}
          >
            Сохранить
          </Button>
          <TestButton result={taxiTest} onTest={testTaxi} />
        </div>
      </IntegrationBlock>

      {/* ── Яндекс Такси (Fleet API) — multi-park ────────────────────── */}
      <IntegrationBlock
        logo="ЯТ" color="#FFCC00" name="Яндекс Такси (Fleet)" status={fleetStatus}
        docsUrl="https://fleet.yandex.ru/docs/api/ru/"
      >
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Подключите один или несколько парков из{" "}
          <a href="https://fleet.yandex.ru" target="_blank" rel="noopener noreferrer" className="underline">fleet.yandex.ru</a>
          {" "}→ Настройки → API. Ключи у каждого парка свои.
        </p>

        <div className="space-y-4 mt-1">
          {fleetParks.map((park, idx) => {
            const test = fleetTests[park.id] ?? { state: "idle" as const };
            return (
              <div
                key={park.id}
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                    Парк {idx + 1}
                  </p>
                  <button
                    onClick={() => requestDelete({ kind: "fleet", id: park.id, title: park.name || `Парк ${idx + 1}` })}
                    className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <FieldRow
                  label="Название (для вашего удобства)"
                  value={park.name}
                  onChange={(v) => updateFleetPark(park.id, { name: v })}
                  placeholder="Например: Парк Север"
                />
                <FieldRow
                  label="Park ID"
                  value={park.parkId}
                  onChange={(v) => updateFleetPark(park.id, { parkId: v })}
                  placeholder="park_id из кабинета Fleet"
                />
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow
                    label="Client ID"
                    value={park.clientId}
                    onChange={(v) => updateFleetPark(park.id, { clientId: v })}
                    placeholder="client_id"
                  />
                  <FieldRow
                    label="API-ключ"
                    value={park.apiKey}
                    onChange={(v) => updateFleetPark(park.id, { apiKey: v })}
                    placeholder="api_key"
                    type="password"
                  />
                </div>
                <TestButton result={test} onTest={() => testFleetPark(park)} label="Проверить парк" />
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-1">
          <Button variant="secondary" size="sm" onClick={addFleetPark}>
            <Plus className="w-3.5 h-3.5" />
            Добавить парк
          </Button>
          <Button
            size="sm"
            loading={fleetSaving}
            disabled={fleetParks.length === 0}
            onClick={() => save("yb_int_ytfleet", { parks: fleetParks, sections: fleetSections }, setFleetSaving, "Яндекс Fleet")}
          >
            Сохранить
          </Button>
        </div>

        <SectionSelector selected={fleetSections} onChange={setFleetSections} />
      </IntegrationBlock>

      {/* ── Google Sheets ─────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="GS" color="#34A853" name="Google Sheets" status={sheetsStatus}
        docsUrl="https://developers.google.com/sheets/api"
      >
        <div className="flex gap-5 items-start">
          {/* ── Left: form ── */}
          <div className="flex-1 min-w-0 space-y-4">
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Добавьте один или несколько документов. Для каждого укажите разделы и опишите структуру для ИИ.
            </p>

            <div className="space-y-4">
              {docs.map((doc, idx) => (
                <div
                  key={doc.id}
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                        Документ {idx + 1}
                      </p>
                      {doc.mapping?.confirmedByUser && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{ background: "var(--color-brand-soft)", color: "var(--color-brand)" }}
                        >
                          Настроено{doc.totalRows ? ` · ${doc.totalRows.toLocaleString("ru-RU")} строк` : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        title="Настроить через мастер"
                        onClick={() => setWizardDocId(doc.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors hover:bg-brand-soft"
                        style={{ color: "var(--color-muted)" }}
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => requestDelete({ kind: "gsheet", id: doc.id, title: doc.name || doc.url || `Документ ${idx + 1}` })}
                        className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
                        style={{ color: "var(--color-muted)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <FieldRow
                    label="Название (для вашего удобства)"
                    value={doc.name}
                    onChange={(v) => updateDoc(doc.id, { name: v })}
                    placeholder="Например: Финансовый план 2026"
                  />
                  <FieldRow
                    label="URL Google Sheets"
                    value={doc.url}
                    onChange={(v) => updateDoc(doc.id, { url: v })}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                  />
                  <SectionSelector
                    selected={doc.sections}
                    onChange={(v) => updateDoc(doc.id, { sections: v })}
                  />
                  <div
                    className="rounded-lg px-3 py-2 space-y-2"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                          Где документ будет использоваться
                        </p>
                        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                          После сохранения таблица будет читаться только в выбранных разделах.
                        </p>
                      </div>
                      <Badge variant={doc.sections?.length ? "brand" : "default"}>
                        {doc.sections?.length ? `${doc.sections.length} раздел${doc.sections.length === 1 ? "" : doc.sections.length < 5 ? "а" : "ов"}` : "Разделы не выбраны"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {doc.sections?.length ? sectionLabels(doc.sections).map((label) => (
                        <Badge key={label} variant="brand">{label}</Badge>
                      )) : (
                        <span className="text-xs" style={{ color: "#EF4444" }}>
                          Сначала выбери хотя бы один раздел, иначе документ нигде не будет использоваться.
                        </span>
                      )}
                    </div>
                    {doc.sections?.includes("workshop") && (
                      <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                        Для раздела <strong style={{ color: "var(--color-text)" }}>СТО</strong> документ будет проверяться и загружаться через модуль затрат/операций СТО.
                      </p>
                    )}
                  </div>
                  <div
                    className="rounded-lg px-3 py-2"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
                  >
                    <SectionStatusGrid selected={doc.sections} test={docTests[doc.id]} />
                  </div>
                  <TestButton
                    label={doc.sections?.length ? `Проверить для: ${testTargetLabel(doc.sections)}` : "Проверить таблицу"}
                    result={docTests[doc.id] ?? { state: "idle" }}
                    onTest={() => testDoc(doc)}
                  />
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
                      Промт для ИИ — что содержит эта таблица
                    </label>
                    <textarea
                      value={doc.prompt ?? ""}
                      onChange={(e) => updateDoc(doc.id, { prompt: e.target.value })}
                      rows={3}
                      placeholder={"Столбцы: дата, парк, выручка план, выручка факт, расходы.\nНазначение: план/факт анализ по паркам за месяц.\nЧто нужно: итого выручка, расходы, отклонение."}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none transition-all"
                      style={{
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text)",
                        lineHeight: "1.5",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => setWizardDocId("new")}>
                <Plus className="w-3.5 h-3.5" />
                Добавить через мастер
              </Button>
              <Button variant="secondary" size="sm" onClick={addDoc} title="Добавить без мастера — потребуется настроить маппинг вручную">
                Добавить вручную
              </Button>
              <Button
                size="sm"
                loading={sheetsSaving}
                disabled={docs.length === 0}
                onClick={() => save("yb_int_gsheets", docs, setSheetsSaving, "Google Sheets")}
              >
                Сохранить
              </Button>
            </div>
          </div>

          {/* ── Right: hint panel ── */}
          <div
            className="w-52 flex-shrink-0 rounded-xl p-3.5 space-y-4 text-xs sticky top-4"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
          >
            <div className="space-y-2">
              <p className="font-semibold" style={{ color: "var(--color-text)" }}>
                Как подключить
              </p>
              <ol className="space-y-1.5 list-none" style={{ color: "var(--color-muted)" }}>
                {[
                  "Откройте доступ: Файл → Поделиться → Все, у кого есть ссылка → Читатель",
                  "Нажмите «Добавить через мастер» и вставьте ссылку",
                  "Мастер сам найдёт листы и предложит строку заголовка",
                  "Укажите какие столбцы — дата, сумма и т.д.",
                  "Проверьте подключение прямо в мастере",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold mt-px"
                      style={{ background: "var(--color-brand-soft)", color: "var(--color-brand)" }}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-1.5" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "0.75rem" }}>
              <p className="font-semibold" style={{ color: "var(--color-text)" }}>
                Что писать в промте
              </p>
              <ul className="space-y-1 list-none" style={{ color: "var(--color-muted)" }}>
                <li>• <span style={{ color: "var(--color-text)" }}>Столбцы</span> — их названия</li>
                <li>• <span style={{ color: "var(--color-text)" }}>Назначение</span> — финансы, КПИ и т.д.</li>
                <li>• <span style={{ color: "var(--color-text)" }}>Что извлекать</span> — нужные показатели</li>
              </ul>
              <p className="pt-1 leading-relaxed" style={{ color: "var(--color-muted)", opacity: 0.7 }}>
                Таблица должна содержать строки-операции, а не итоговые сводки.
              </p>
            </div>
          </div>
        </div>
      </IntegrationBlock>

      {/* ── 1С Бухгалтерия ───────────────────────────────────────────── */}
      <IntegrationBlock
        logo="1С" color="#F59E0B" name="1С Бухгалтерия" status={oneCStatus}
        docsUrl="https://v8.1c.ru"
      >
        <FieldRow
          label="URL веб-сервиса 1С"
          value={oneC.url}
          onChange={(v) => setOneC((p) => ({ ...p, url: v }))}
          placeholder="http://your-1c-server/ws/service"
        />
        <div className="grid grid-cols-2 gap-3">
          <FieldRow
            label="Логин"
            value={oneC.login}
            onChange={(v) => setOneC((p) => ({ ...p, login: v }))}
            placeholder="admin"
          />
          <FieldRow
            label="Пароль"
            value={oneC.password}
            onChange={(v) => setOneC((p) => ({ ...p, password: v }))}
            placeholder="••••••••"
            type="password"
          />
        </div>
        <SectionSelector selected={oneCsections} onChange={setOneCsections} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            loading={oneCsaving}
            onClick={() => save("yb_int_1c", { url: oneC.url, login: oneC.login, sections: oneCsections }, setOneCsaving, "1С Бухгалтерия")}
          >
            Сохранить
          </Button>
          <TestButton result={oneCTest} onTest={testOneC} />
        </div>
      </IntegrationBlock>

      {/* ── Яндекс Директ ────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="ЯД" color="#FC3F1D" name="Яндекс Директ" status={ydStatus}
        docsUrl="https://yandex.ru/dev/direct/"
      >
        <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
          Получите OAuth-токен в кабинете Яндекс Директ и укажите логин рекламодателя.
        </p>
        <FieldRow
          label="OAuth-токен"
          value={yd.token}
          onChange={(v) => setYd((p) => ({ ...p, token: v }))}
          placeholder="y0_AgAAAA..."
          type="password"
        />
        <FieldRow
          label="Логин клиента (рекламодателя)"
          value={yd.clientId}
          onChange={(v) => setYd((p) => ({ ...p, clientId: v }))}
          placeholder="your-yandex-login"
        />
        <SectionSelector selected={ydSections} onChange={setYdSections} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            loading={ydSaving}
            onClick={saveYandex}
          >
            Сохранить
          </Button>
          <TestButton result={ydTest} onTest={testYandex} />
        </div>
      </IntegrationBlock>

      {/* ── AmoCRM ───────────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="AMO" color="#0055CC" name="AmoCRM" status={amoStatus}
        docsUrl="https://www.amocrm.ru/developers/content/crm_platform/api-reference"
      >
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          CRM для управления лидами и воронками. Подключите для получения данных по найму и сделкам.
          Токен API — в кабинете AmoCRM → Настройки → Интеграции → API.
        </p>
        <FieldRow
          label="Домен (поддомен.amocrm.ru)"
          value={amo.domain}
          onChange={(v) => setAmo((p) => ({ ...p, domain: v }))}
          placeholder="yourdomain.amocrm.ru"
        />
        <FieldRow
          label="API-токен (долгосрочный)"
          value={amo.apiKey}
          onChange={(v) => setAmo((p) => ({ ...p, apiKey: v }))}
          placeholder="Ваш токен AmoCRM"
          type="password"
        />
        <SectionSelector selected={amoSections} onChange={setAmoSections} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            loading={amoSaving}
            onClick={() => save("yb_int_amocrm", { domain: amo.domain, apiKey: amo.apiKey, sections: amoSections }, setAmoSaving, "AmoCRM")}
          >
            Сохранить
          </Button>
          <TestButton result={amoTest} onTest={testAmo} />
        </div>
      </IntegrationBlock>

      {/* ── 1С Atimo ─────────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="AT" color="#7C3AED" name="1С Atimo" status={atimoStatus}
        docsUrl="https://dev.atimo.app/dlya-taksoparka/"
      >
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Платформа автоматизации для таксопарков. Подключите API для получения данных СТО и операционной статистики.
          API предоставляется по запросу — свяжитесь с <a href="https://dev.atimo.app/dlya-taksoparka/" target="_blank" rel="noopener noreferrer" className="underline">Atimo</a>.
        </p>
        <FieldRow
          label="Базовый URL API"
          value={atimo.baseUrl}
          onChange={(v) => setAtimo((p) => ({ ...p, baseUrl: v }))}
          placeholder="https://api.atimo.app"
        />
        <FieldRow
          label="API-ключ"
          value={atimo.apiKey}
          onChange={(v) => setAtimo((p) => ({ ...p, apiKey: v }))}
          placeholder="Ваш API-ключ Atimo"
          type="password"
        />
        <SectionSelector selected={atimoSections} onChange={setAtimoSections} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            loading={atimoSaving}
            onClick={() => save("yb_int_atimo", { baseUrl: atimo.baseUrl, apiKey: atimo.apiKey, sections: atimoSections }, setAtimoSaving, "1С Atimo")}
          >
            Сохранить
          </Button>
          <TestButton result={atimoTest} onTest={testAtimo} />
        </div>
      </IntegrationBlock>

      {/* ── Подключение банка ────────────────────────────────────────── */}
      <IntegrationBlock
        logo="БК" color="#1E3A5F" name="Подключение банка" status="disconnected"
        docsUrl="https://www.cbr.ru/development/"
      >
        <div className="py-6 flex flex-col items-center gap-2 text-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-surface-2)" }}
          >
            <span className="text-lg">🏦</span>
          </div>
          <p className="font-medium text-sm" style={{ color: "var(--color-text)" }}>В разработке</p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
            Прямое подключение к банковскому API для автоматической загрузки выписок и отслеживания
            движения денежных средств. Поддержка: Тинькофф, Сбербанк, Альфа-банк.
          </p>
        </div>
      </IntegrationBlock>

      {/* ── VK Реклама ───────────────────────────────────────────────── */}
      <IntegrationBlock
        logo="VK" color="#0077FF" name="VK Реклама" status="disconnected"
        docsUrl="https://ads.vk.com/help/articles/api"
      >
        <div className="py-6 flex flex-col items-center gap-2 text-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "var(--color-surface-2)" }}
          >
            <span className="text-lg">🎯</span>
          </div>
          <p className="font-medium text-sm" style={{ color: "var(--color-text)" }}>В разработке</p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
            Интеграция с VK Рекламой для отслеживания кампаний по найму водителей: показы, клики,
            стоимость лида, конверсия в первую смену.
          </p>
        </div>
      </IntegrationBlock>

      {/* ── Google Sheets wizard ─────────────────────────────────────── */}
      {wizardDocId && (() => {
        const editingDoc = wizardDocId === "new" ? null : docs.find((d) => d.id === wizardDocId);
        return (
          <SheetsWizard
            initialUrl={editingDoc?.url ?? ""}
            initialName={editingDoc?.name ?? ""}
            initialSections={editingDoc?.sections ?? []}
            initialPrompt={editingDoc?.prompt ?? ""}
            initialMapping={editingDoc?.mapping}
            onSave={handleWizardSave}
            onClose={() => setWizardDocId(null)}
          />
        );
      })()}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeDeleteDialog} />
          <div
            className="relative w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <div>
              <p className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Подтверждение удаления</p>
              <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
                Для удаления введите PIN-код подтверждения.
              </p>
              <p className="text-sm mt-2" style={{ color: "var(--color-text)" }}>
                Будет удалено: {deleteTarget.title}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
                PIN-код
              </label>
              <input
                type="password"
                value={deletePin}
                onChange={(e) => { setDeletePin(e.target.value); setDeleteError(""); }}
                placeholder="Введите PIN-код"
                className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  border: `1px solid ${deleteError ? "#EF4444" : "var(--color-border)"}`,
                  color: "var(--color-text)",
                }}
              />
              {deleteError && (
                <p className="text-xs mt-1" style={{ color: "#EF4444" }}>{deleteError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={closeDeleteDialog}>
                Отмена
              </Button>
              <Button size="sm" onClick={confirmDelete} style={{ background: "#EF4444", borderColor: "#EF4444" }}>
                Удалить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
