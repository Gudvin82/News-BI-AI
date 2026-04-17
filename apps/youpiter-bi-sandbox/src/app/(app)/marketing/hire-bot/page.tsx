"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { apiFetch } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";

type StepType = "text" | "single" | "multi";
type TabKey = "settings" | "scenario" | "parks" | "bitrix" | "logs";
type QuickActionId = "start_quiz" | "contact_manager" | "show_parks" | "show_help" | "restart";

type QuickButton = { id: string; label: string; action: string; order: number };
type ScenarioStep = {
  id: string;
  order: number;
  type: StepType;
  title: string;
  text: string;
  options: string[];
  condition: string;
  nextStepId?: string;
};
type ParkItem = {
  id: string;
  metro: string;
  fullAddress: string;
  shortLabel: string;
  bitrixStringValue: string;
  bitrixEnumId?: string;
};
type ScenarioHistoryItem = {
  id: string;
  at: string;
  actor?: string;
  note: string;
  snapshot?: {
    status: "draft" | "published";
    draft: ScenarioStep[];
    published: ScenarioStep[];
  };
};

type AdminConfig = {
  bot: {
    username: string;
    slug: string;
    fullDescription: string;
    shortDescription: string;
    greeting: string;
    quickButtons: QuickButton[];
  };
  scenario: {
    status: "draft" | "published";
    draft: ScenarioStep[];
    published: ScenarioStep[];
    updatedAt: string;
    history: ScenarioHistoryItem[];
  };
  parks: {
    bitrixStringField: string;
    bitrixEnumField: string;
    items: ParkItem[];
  };
  bitrix: {
    mode: "webhook";
    webhookUrl: string;
    assignedById: string;
    leadStatusId: string;
    duplicateMode: "always_new" | "update_duplicates";
  };
};

type RuntimeInfo = { path: string; service: string; mode: string };

type AdminAuditRow = { id: string; time: string; action: string; detail?: string };
type LeadLogRow = {
  id: number;
  createdAt: string;
  chatId: number;
  username: string;
  fullName: string;
  phone: string;
  email: string;
  scenarioSlug: string;
  bitrixLeadId: number | null;
  bitrixStatus: string;
  bitrixError: string;
  park: string;
  answersPreview: string;
};
type TimelineRow = {
  id: number;
  created: string;
  authorId: string;
  comment: string;
  hasFiles: boolean;
};

type SyncStatus = {
  lastAppliedAt?: string;
  appliedBy?: string;
  backupId?: string;
  serviceActive?: boolean;
  serviceStatus?: string;
  lastError?: string;
  backups: string[];
};

const QUICK_ACTION_OPTIONS: Array<{ value: QuickActionId; label: string; hint: string }> = [
  { value: "start_quiz", label: "Начать анкету", hint: "Запускает сценарий опроса кандидата" },
  { value: "contact_manager", label: "Связаться с менеджером", hint: "Показывает контакт и переводит в диалог" },
  { value: "show_parks", label: "Показать парки", hint: "Показывает список парков/метро" },
  { value: "show_help", label: "Помощь", hint: "Показывает инструкцию кандидату" },
  { value: "restart", label: "Начать заново", hint: "Сбрасывает диалог и стартует сначала" },
];

const SCENARIO_STEP_TEMPLATES: Array<{
  title: string;
  description: string;
  step: Omit<ScenarioStep, "id" | "order">;
}> = [
  {
    title: "Имя кандидата",
    description: "Просим представиться",
    step: { type: "text", title: "Имя", text: "Как вас зовут?", options: [], condition: "" },
  },
  {
    title: "Телефон",
    description: "Контакт для связи",
    step: { type: "text", title: "Телефон", text: "Укажите ваш номер телефона для связи.", options: [], condition: "" },
  },
  {
    title: "Выбор графика",
    description: "Single choice вопрос",
    step: { type: "single", title: "График", text: "Какой график вам удобен?", options: ["Смена", "Подработка", "Гибкий"], condition: "" },
  },
  {
    title: "Опыт кандидата",
    description: "Один вариант ответа",
    step: { type: "single", title: "Опыт", text: "Есть опыт работы в такси?", options: ["Да", "Нет"], condition: "" },
  },
  {
    title: "Удобные парки",
    description: "Multi choice вопрос",
    step: { type: "multi", title: "Парки", text: "Какие парки вам удобны? Можно выбрать несколько.", options: ["Ладожская", "Автово", "Парнас"], condition: "" },
  },
];

type DiffSummary = {
  oldCount: number;
  newCount: number;
  added: number;
  removed: number;
  changed: number;
  changedSteps: Array<{ index: number; title: string; fields: string[] }>;
};
type HistoryDiffPayload = {
  historyId: string;
  historyAt: string;
  note: string;
  draftDiff: DiffSummary;
  publishedDiff: DiffSummary;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function MarketingHireBotPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("settings");

  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenMasked, setTokenMasked] = useState("");
  const [tokenExists, setTokenExists] = useState(false);

  const [testState, setTestState] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [applying, setApplying] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [rollbackBackupId, setRollbackBackupId] = useState("");
  const [diffLoadingId, setDiffLoadingId] = useState<string | null>(null);
  const [historyDiff, setHistoryDiff] = useState<HistoryDiffPayload | null>(null);
  const [dragStepId, setDragStepId] = useState<string | null>(null);

  const [loadingLogs, setLoadingLogs] = useState(false);
  const [leadLogs, setLeadLogs] = useState<LeadLogRow[]>([]);
  const [adminAudit, setAdminAudit] = useState<AdminAuditRow[]>([]);
  const [botTail, setBotTail] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [selectedBitrixLeadId, setSelectedBitrixLeadId] = useState<number | null>(null);
  const [logFilters, setLogFilters] = useState({
    dateFrom: monthStartIso(),
    dateTo: todayIso(),
    status: "all",
    q: "",
  });

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/marketing/hire-bot/config", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки");
      setConfig(json.data.config);
      setRuntime(json.data.runtime ?? null);
      setTokenMasked(json.data.secrets.tokenMasked ?? "");
      setTokenExists(Boolean(json.data.secrets.tokenExists));
      setTokenInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncStatus() {
    try {
      const res = await apiFetch("/api/marketing/hire-bot/status", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        const data = json.data ?? null;
        setSyncStatus(data);
        if (data?.backupId) setRollbackBackupId(data.backupId);
        else if (Array.isArray(data?.backups) && data.backups.length > 0) setRollbackBackupId(data.backups[0]);
      }
    } catch {
      // ignore
    }
  }

  async function loadLogs(leadIdOverride?: number | null) {
    setLoadingLogs(true);
    try {
      const qs = new URLSearchParams();
      qs.set("dateFrom", logFilters.dateFrom);
      qs.set("dateTo", logFilters.dateTo);
      qs.set("status", logFilters.status);
      if (logFilters.q.trim()) qs.set("q", logFilters.q.trim());
      const leadId = leadIdOverride !== undefined ? leadIdOverride : selectedBitrixLeadId;
      if (leadId) qs.set("leadId", String(leadId));
      qs.set("limit", "250");

      const res = await apiFetch(`/api/marketing/hire-bot/logs?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка загрузки логов");
      setLeadLogs(Array.isArray(json.data?.leads) ? json.data.leads : []);
      setAdminAudit(Array.isArray(json.data?.adminAudit) ? json.data.adminAudit : []);
      setBotTail(Array.isArray(json.data?.tail) ? json.data.tail : []);
      setTimeline(Array.isArray(json.data?.timeline) ? json.data.timeline : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingLogs(false);
    }
  }

  useEffect(() => {
    loadConfig();
    loadSyncStatus();
  }, []);

  useEffect(() => {
    if (tab === "logs") loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function patch(next: Partial<AdminConfig>) {
    if (!config) return;
    setConfig({ ...config, ...next });
  }
  function patchBot(next: Partial<AdminConfig["bot"]>) {
    if (!config) return;
    patch({ bot: { ...config.bot, ...next } });
  }
  function patchScenario(next: Partial<AdminConfig["scenario"]>) {
    if (!config) return;
    patch({ scenario: { ...config.scenario, ...next } });
  }
  function patchParks(next: Partial<AdminConfig["parks"]>) {
    if (!config) return;
    patch({ parks: { ...config.parks, ...next } });
  }
  function patchBitrix(next: Partial<AdminConfig["bitrix"]>) {
    if (!config) return;
    patch({ bitrix: { ...config.bitrix, ...next } });
  }

  async function save(publish = false) {
    if (!config) return;
    setError(null);
    setOk(null);
    publish ? setPublishing(true) : setSaving(true);
    try {
      const res = await apiFetch("/api/marketing/hire-bot/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          token: tokenInput.trim() || undefined,
          publish,
          actor: "admin",
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка сохранения");
      setOk(publish ? "Сценарий опубликован" : "Настройки сохранены");
      if (tokenInput.trim()) {
        setTokenInput("");
        setTokenExists(true);
      }
      await loadConfig();
      if (tab === "logs") await loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  }

  async function applyToBot() {
    setApplying(true);
    setError(null);
    setOk(null);
    try {
      const res = await apiFetch("/api/marketing/hire-bot/apply", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка применения в бот");
      setOk(`Конфиг применен в прод-бота. Бэкап: ${json.data?.backupId ?? "—"}`);
      if (json.data?.status) setSyncStatus(json.data.status);
      else await loadSyncStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  async function rollbackBot() {
    setRollingBack(true);
    setError(null);
    setOk(null);
    try {
      const backupId = rollbackBackupId || syncStatus?.backupId || syncStatus?.backups?.[0];
      const res = await apiFetch("/api/marketing/hire-bot/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка отката");
      setOk(`Откат выполнен. Бэкап: ${json.data?.rollbackId ?? "—"}`);
      if (json.data?.status) setSyncStatus(json.data.status);
      else await loadSyncStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRollingBack(false);
    }
  }

  async function loadHistoryDiff(historyId: string) {
    setDiffLoadingId(historyId);
    setError(null);
    try {
      const res = await apiFetch(`/api/marketing/hire-bot/diff?historyId=${encodeURIComponent(historyId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка расчета diff");
      setHistoryDiff(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiffLoadingId(null);
    }
  }

  async function restoreScenario(historyId: string, target: "draft" | "published") {
    setError(null);
    setOk(null);
    try {
      const res = await apiFetch("/api/marketing/hire-bot/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId, target }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Ошибка восстановления");
      setOk(target === "draft" ? "Черновик восстановлен" : "Published версия восстановлена");
      await loadConfig();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function testBitrix() {
    if (!config) return;
    setTestState("checking");
    setTestMsg("");
    try {
      const res = await apiFetch("/api/marketing/hire-bot/test-bitrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: config.bitrix.webhookUrl }),
      });
      const json = await res.json();
      if (!json.ok) {
        setTestState("error");
        setTestMsg(json.error ?? "Ошибка проверки");
        return;
      }
      setTestState("ok");
      setTestMsg("Bitrix webhook отвечает корректно");
    } catch (e) {
      setTestState("error");
      setTestMsg(e instanceof Error ? e.message : String(e));
    }
  }

  const tabs = useMemo(
    () => [
      { key: "settings" as const, label: "Настройки бота" },
      { key: "scenario" as const, label: "Конструктор сценария" },
      { key: "parks" as const, label: "Парки и маппинг" },
      { key: "bitrix" as const, label: "Интеграция Bitrix24" },
      { key: "logs" as const, label: "Диалоги/Логи" },
    ],
    [],
  );

  function dropStep(targetId: string) {
    if (!config || !dragStepId || dragStepId === targetId) return;
    const sorted = [...config.scenario.draft].sort((a, b) => a.order - b.order);
    const from = sorted.findIndex((s) => s.id === dragStepId);
    const to = sorted.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;

    const moved = [...sorted];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item);
    const reindexed = moved.map((s, idx) => ({ ...s, order: idx + 1 }));
    patchScenario({ draft: reindexed });
    setDragStepId(null);
  }

  const payloadPreview = useMemo(() => {
    if (!config) return "{}";
    return JSON.stringify(
      {
        fields: {
          TITLE: "Бот ТГ | Новый кандидат-водитель",
          ASSIGNED_BY_ID: Number(config.bitrix.assignedById || "1"),
          STATUS_ID: config.bitrix.leadStatusId || "NEW",
          SOURCE_ID: "WEB",
          UF_CRM_1745483677126: config.parks.items[0]?.bitrixStringValue || "Метро + адрес",
          UF_CRM_1741343224057: config.parks.items[0]?.bitrixEnumId || "ENUM_ID",
          COMMENTS: `Бот: ${config.bot.slug}\nСценарий: ${config.scenario.status}\nТелефон: +7...`,
        },
      },
      null,
      2,
    );
  }, [config]);

  const scenarioWarnings = useMemo(() => {
    if (!config) return [];
    const warnings: string[] = [];
    const draft = [...config.scenario.draft].sort((a, b) => a.order - b.order);
    if (draft.length === 0) warnings.push("Сценарий пустой: добавьте хотя бы 1 шаг.");
    draft.forEach((step, idx) => {
      const stepNo = idx + 1;
      if (!step.title.trim()) warnings.push(`Шаг ${stepNo}: пустой заголовок.`);
      if (!step.text.trim()) warnings.push(`Шаг ${stepNo}: пустой текст сообщения.`);
      if ((step.type === "single" || step.type === "multi") && step.options.filter(Boolean).length < 2) {
        warnings.push(`Шаг ${stepNo}: для выбора нужно минимум 2 варианта.`);
      }
    });
    return warnings.slice(0, 12);
  }, [config]);

  const livePreview = useMemo(() => {
    if (!config) {
      return { greeting: "Привет! Начнем анкету.", buttons: [], firstSteps: [] as ScenarioStep[] };
    }
    const draft = [...config.scenario.draft].sort((a, b) => a.order - b.order);
    return {
      greeting: config.bot.greeting || "Привет! Начнем анкету.",
      buttons: [...config.bot.quickButtons].sort((a, b) => a.order - b.order).map((b) => b.label).filter(Boolean),
      firstSteps: draft.slice(0, 4),
    };
  }, [config]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-12 rounded-xl skeleton" />
        <div className="h-80 rounded-xl skeleton" />
      </div>
    );
  }

  if (!config) {
    return (
      <Card>
        <div className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Не удалось загрузить конфигурацию ТГ бота
          </p>
          {error && (
            <p className="text-xs" style={{ color: "var(--color-danger)" }}>
              {error}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Проверьте доступ к API и повторите попытку.
          </p>
          <button
            onClick={() => loadConfig()}
            className="h-8 px-3 rounded-lg text-xs font-medium"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            Обновить
          </button>
        </div>
      </Card>
    );
  }

  const sortedButtons = [...config.bot.quickButtons].sort((a, b) => a.order - b.order);
  const sortedDraft = [...config.scenario.draft].sort((a, b) => a.order - b.order);
  const sortedHistory = [...(config.scenario.history ?? [])].slice(0, 15);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>ТГ Бот Найма</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
          Управление ботом найма, сценарием, парками и Bitrix-интеграцией
        </p>
        {runtime && (
          <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
            Runtime: {runtime.service} · {runtime.path}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="h-8 px-3 rounded-lg text-xs font-medium"
            style={{
              background: tab === t.key ? "var(--color-brand)" : "var(--color-surface-2)",
              color: tab === t.key ? "#fff" : "var(--color-muted)",
            }}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={applyToBot}
            disabled={applying || saving || publishing}
            className="h-8 px-3 rounded-lg text-xs font-medium"
            style={{ background: "rgba(34,197,94,.14)", color: "var(--color-success)" }}
          >
            {applying ? "Применяем..." : "Применить в бота"}
          </button>
          <button
            onClick={rollbackBot}
            disabled={rollingBack || applying}
            className="h-8 px-3 rounded-lg text-xs font-medium"
            style={{ background: "rgba(239,68,68,.12)", color: "var(--color-danger)" }}
          >
            {rollingBack ? "Откат..." : "Откат"}
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving || publishing}
            className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
          >
            <Save className="w-3.5 h-3.5" /> {saving ? "Сохраняем..." : "Сохранить"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={saving || publishing}
            className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ background: "var(--color-brand)", color: "#fff" }}
          >
            <Send className="w-3.5 h-3.5" /> {publishing ? "Публикуем..." : "Publish"}
          </button>
        </div>
      </div>

      {error && (
        <Card>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-danger)" }}>
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        </Card>
      )}
      {ok && (
        <Card>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--color-success)" }}>
            <Check className="w-4 h-4" /> {ok}
          </div>
        </Card>
      )}
      {syncStatus && (
        <Card>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span style={{ color: "var(--color-text)" }}>
              Статус сервиса бота:{" "}
              <b style={{ color: syncStatus.serviceActive ? "var(--color-success)" : "var(--color-danger)" }}>
                {syncStatus.serviceStatus || "unknown"}
              </b>
            </span>
            {syncStatus.lastAppliedAt && (
              <span style={{ color: "var(--color-muted)" }}>
                Последнее применение: {new Date(syncStatus.lastAppliedAt).toLocaleString("ru-RU")} · {syncStatus.appliedBy || "—"}
              </span>
            )}
            {syncStatus.backupId && (
              <span style={{ color: "var(--color-muted)" }}>
                Текущий бэкап: {syncStatus.backupId}
              </span>
            )}
            {!!syncStatus.lastError && (
              <span style={{ color: "var(--color-danger)" }}>
                Последняя ошибка: {syncStatus.lastError}
              </span>
            )}
            <button
              onClick={() => loadSyncStatus()}
              className="h-7 px-2 rounded-lg text-[11px] font-medium ml-auto"
              style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
            >
              Обновить статус
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span style={{ color: "var(--color-muted)" }}>Бэкап для отката:</span>
            <select
              value={rollbackBackupId}
              onChange={(e) => setRollbackBackupId(e.target.value)}
              className="h-8 px-2 rounded-lg text-xs outline-none"
              style={inputStyle}
            >
              {(syncStatus.backups || []).map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {tab === "settings" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Username бота (в Telegram)" value={config.bot.username} onChange={(v) => patchBot({ username: v })} />
              <Field label="Slug бота (в конфиге)" value={config.bot.slug} onChange={(v) => patchBot({ slug: v })} />
              <Field
                label="Токен бота (скрыт, хранится в env)"
                value={tokenInput}
                onChange={setTokenInput}
                placeholder={tokenExists ? tokenMasked || "••••••••••" : "Введите токен"}
              />
              <Field label="Короткое описание" value={config.bot.shortDescription} onChange={(v) => patchBot({ shortDescription: v })} />
            </div>
            <div className="mt-3">
              <Area label="Полное описание бота" value={config.bot.fullDescription} onChange={(v) => patchBot({ fullDescription: v })} />
            </div>
            <div className="mt-3">
              <Area label="Приветствие (первое сообщение кандидату)" value={config.bot.greeting} onChange={(v) => patchBot({ greeting: v })} />
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>Быстрые кнопки бота</p>
              <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                Вы задаёте подпись кнопки и действие. Порядок кнопок влияет на порядок в Telegram.
              </p>
              <div className="space-y-2">
                {sortedButtons.map((b) => {
                  const actionMeta = QUICK_ACTION_OPTIONS.find((x) => x.value === (b.action as QuickActionId));
                  const isCustomAction = !actionMeta;
                  return (
                    <div key={b.id} className="rounded-lg p-2 space-y-2" style={{ background: "var(--color-surface-2)" }}>
                      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_auto_auto_auto] gap-2 items-center">
                        <input
                          value={b.label}
                          onChange={(e) => patchBot({ quickButtons: config.bot.quickButtons.map((x) => x.id === b.id ? { ...x, label: e.target.value } : x) })}
                          className="h-8 px-2 rounded-lg text-xs outline-none"
                          style={inputStyle}
                          placeholder="Текст кнопки"
                        />
                        <select
                          value={b.action}
                          onChange={(e) => patchBot({ quickButtons: config.bot.quickButtons.map((x) => x.id === b.id ? { ...x, action: e.target.value } : x) })}
                          className="h-8 px-2 rounded-lg text-xs outline-none"
                          style={inputStyle}
                        >
                          {isCustomAction && <option value={b.action}>{`Кастом: ${b.action}`}</option>}
                          {QUICK_ACTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <button onClick={() => moveButton(config.bot.quickButtons, b.id, -1, (next) => patchBot({ quickButtons: next }))} className="w-8 h-8 rounded-lg" style={{ background: "var(--color-surface)" }}><ArrowUp className="w-3.5 h-3.5 mx-auto" /></button>
                        <button onClick={() => moveButton(config.bot.quickButtons, b.id, 1, (next) => patchBot({ quickButtons: next }))} className="w-8 h-8 rounded-lg" style={{ background: "var(--color-surface)" }}><ArrowDown className="w-3.5 h-3.5 mx-auto" /></button>
                        <button onClick={() => patchBot({ quickButtons: config.bot.quickButtons.filter((x) => x.id !== b.id) })} className="w-8 h-8 rounded-lg" style={{ background: "rgba(239,68,68,.1)", color: "#EF4444" }}><Trash2 className="w-3.5 h-3.5 mx-auto" /></button>
                      </div>
                      <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                        {actionMeta?.hint ?? "Кастомное действие"}
                      </p>
                    </div>
                  );
                })}
                <button
                  onClick={() => patchBot({ quickButtons: [...config.bot.quickButtons, { id: uid(), label: "Новая кнопка", action: "start_quiz", order: config.bot.quickButtons.length + 1 }] })}
                  className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
                >
                  <Plus className="w-3.5 h-3.5" /> Добавить кнопку
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Как это увидит кандидат</p>
            </div>
            <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--color-surface-2)" }}>
              <p className="text-xs" style={{ color: "var(--color-text)", whiteSpace: "pre-wrap" }}>
                {livePreview.greeting || "Приветствие пока не задано"}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {livePreview.buttons.length === 0 && (
                  <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>Нет быстрых кнопок</span>
                )}
                {livePreview.buttons.map((btn) => (
                  <span key={btn} className="px-2 py-1 rounded-lg text-[11px] font-medium" style={{ background: "var(--color-surface)", color: "var(--color-text)" }}>
                    {btn}
                  </span>
                ))}
              </div>
              <div className="pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                <p className="text-[11px] mb-1" style={{ color: "var(--color-muted)" }}>Первые шаги анкеты:</p>
                <div className="space-y-1">
                  {livePreview.firstSteps.length === 0 && (
                    <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>Сценарий ещё не заполнен.</p>
                  )}
                  {livePreview.firstSteps.map((s, i) => (
                    <p key={s.id} className="text-[11px]" style={{ color: "var(--color-text)" }}>
                      {i + 1}. {s.title || "Без названия"} ({s.type})
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "scenario" && (
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Draft сценарий ({config.scenario.draft.length} шагов)</p>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>Статус: {config.scenario.status}</span>
            </div>
            {scenarioWarnings.length > 0 && (
              <div className="mb-3 rounded-lg p-2" style={{ background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.28)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>Проверьте сценарий перед публикацией</p>
                <div className="mt-1 space-y-1">
                  {scenarioWarnings.map((w) => (
                    <p key={w} className="text-[11px]" style={{ color: "var(--color-muted)" }}>{w}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-3">
              <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                Шаблоны шагов: быстро добавляют типовые вопросы, которые можно сразу редактировать.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {SCENARIO_STEP_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    onClick={() => patchScenario({
                      draft: [
                        ...config.scenario.draft,
                        { id: uid(), order: config.scenario.draft.length + 1, ...tpl.step },
                      ],
                    })}
                    className="h-8 px-3 rounded-lg text-xs font-medium"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
                    title={tpl.description}
                  >
                    + {tpl.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {sortedDraft.map((s) => (
                <div
                  key={s.id}
                  draggable
                  onDragStart={() => setDragStepId(s.id)}
                  onDragEnd={() => setDragStepId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropStep(s.id)}
                  className="rounded-xl p-3 cursor-grab active:cursor-grabbing"
                  style={{
                    background: "var(--color-surface-2)",
                    border: dragStepId === s.id ? "1px dashed var(--color-brand)" : "1px solid transparent",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
                    <p className="text-[11px] font-semibold" style={{ color: "var(--color-muted)" }}>
                      Шаг #{s.order}
                    </p>
                  </div>
                  <p className="text-[11px] mb-2" style={{ color: "var(--color-muted)" }}>
                    Перетащите карточку, чтобы изменить порядок шага.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Field label="Заголовок" value={s.title} onChange={(v) => patchScenarioStep(config.scenario.draft, s.id, { title: v }, (next) => patchScenario({ draft: next }))} />
                    <div>
                      <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Тип</label>
                      <select
                        value={s.type}
                        onChange={(e) => patchScenarioStep(config.scenario.draft, s.id, { type: e.target.value as StepType }, (next) => patchScenario({ draft: next }))}
                        className="w-full h-8 px-2 rounded-lg text-xs outline-none"
                        style={inputStyle}
                      >
                        <option value="text">text</option>
                        <option value="single">single choice</option>
                        <option value="multi">multi choice</option>
                      </select>
                    </div>
                    <Field label="Условие" value={s.condition} onChange={(v) => patchScenarioStep(config.scenario.draft, s.id, { condition: v }, (next) => patchScenario({ draft: next }))} placeholder='например: graphik=="Смена"' />
                    <div>
                      <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Следующий шаг</label>
                      <select
                        value={s.nextStepId ?? ""}
                        onChange={(e) => patchScenarioStep(config.scenario.draft, s.id, { nextStepId: e.target.value || undefined }, (next) => patchScenario({ draft: next }))}
                        className="w-full h-8 px-2 rounded-lg text-xs outline-none"
                        style={inputStyle}
                      >
                        <option value="">Авто (по порядку)</option>
                        {sortedDraft.filter((x) => x.id !== s.id).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.order}. {x.title || x.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Area label="Текст шага" value={s.text} onChange={(v) => patchScenarioStep(config.scenario.draft, s.id, { text: v }, (next) => patchScenario({ draft: next }))} />
                  </div>
                  {(s.type === "single" || s.type === "multi") && (
                    <div className="mt-2">
                      <Field
                        label="Опции (через |)"
                        value={s.options.join(" | ")}
                        onChange={(v) => patchScenarioStep(config.scenario.draft, s.id, { options: v.split("|").map((x) => x.trim()).filter(Boolean) }, (next) => patchScenario({ draft: next }))}
                      />
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => moveStep(config.scenario.draft, s.id, -1, (next) => patchScenario({ draft: next }))} className="h-8 px-2 rounded-lg text-xs" style={{ background: "var(--color-surface)" }}><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveStep(config.scenario.draft, s.id, 1, (next) => patchScenario({ draft: next }))} className="h-8 px-2 rounded-lg text-xs" style={{ background: "var(--color-surface)" }}><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => patchScenario({ draft: config.scenario.draft.filter((x) => x.id !== s.id) })} className="h-8 px-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,.1)", color: "#EF4444" }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => patchScenario({ draft: [...config.scenario.draft, { id: uid(), order: config.scenario.draft.length + 1, type: "text", title: "Новый шаг", text: "", options: [], condition: "" }] })}
                className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5"
                style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}
              >
                <Plus className="w-3.5 h-3.5" /> Добавить шаг
              </button>
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>История версий</p>
            <div className="space-y-2">
              {sortedHistory.length === 0 && (
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>Пока нет сохраненных версий.</p>
              )}
              {sortedHistory.map((h) => (
                <div key={h.id} className="rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--color-text)" }}>{h.note}</p>
                  <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                    {new Date(h.at).toLocaleString("ru-RU")} · {h.actor || "—"}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => restoreScenario(h.id, "draft")}
                      className="h-7 px-2 rounded-lg text-[11px] font-medium"
                      style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
                    >
                      <RotateCcw className="w-3 h-3 inline mr-1" />
                      В черновик
                    </button>
                    <button
                      onClick={() => restoreScenario(h.id, "published")}
                      className="h-7 px-2 rounded-lg text-[11px] font-medium"
                      style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
                    >
                      В published
                    </button>
                    <button
                      onClick={() => loadHistoryDiff(h.id)}
                      className="h-7 px-2 rounded-lg text-[11px] font-medium"
                      style={{ background: "var(--color-surface)", color: "var(--color-text)" }}
                    >
                      {diffLoadingId === h.id ? "Diff..." : "Diff"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {historyDiff && (
              <div className="mt-3 rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                  Diff версии {new Date(historyDiff.historyAt).toLocaleString("ru-RU")}
                </p>
                <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                  Draft: +{historyDiff.draftDiff.added} / -{historyDiff.draftDiff.removed} / изменено {historyDiff.draftDiff.changed}
                </p>
                <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                  Published: +{historyDiff.publishedDiff.added} / -{historyDiff.publishedDiff.removed} / изменено {historyDiff.publishedDiff.changed}
                </p>
                {historyDiff.draftDiff.changedSteps.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {historyDiff.draftDiff.changedSteps.slice(0, 6).map((row) => (
                      <p key={`${row.index}-${row.title}`} className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                        Шаг {row.index} ({row.title}): {row.fields.join(", ")}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "parks" && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Bitrix string field" value={config.parks.bitrixStringField} onChange={(v) => patchParks({ bitrixStringField: v })} />
            <Field label="Bitrix enum field" value={config.parks.bitrixEnumField} onChange={(v) => patchParks({ bitrixEnumField: v })} />
          </div>
          <div className="mt-3 space-y-2">
            {config.parks.items.map((p) => (
              <div key={p.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <input value={p.metro} onChange={(e) => patchPark(config.parks.items, p.id, { metro: e.target.value }, (next) => patchParks({ items: next }))} placeholder="Метро" className="h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                <input value={p.fullAddress} onChange={(e) => patchPark(config.parks.items, p.id, { fullAddress: e.target.value }, (next) => patchParks({ items: next }))} placeholder="Полный адрес" className="h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                <input value={p.shortLabel} onChange={(e) => patchPark(config.parks.items, p.id, { shortLabel: e.target.value }, (next) => patchParks({ items: next }))} placeholder="Short label" className="h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                <input value={p.bitrixStringValue} onChange={(e) => patchPark(config.parks.items, p.id, { bitrixStringValue: e.target.value }, (next) => patchParks({ items: next }))} placeholder="Значение string" className="h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                <input value={p.bitrixEnumId ?? ""} onChange={(e) => patchPark(config.parks.items, p.id, { bitrixEnumId: e.target.value }, (next) => patchParks({ items: next }))} placeholder="ENUM ID" className="h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
                <button onClick={() => patchParks({ items: config.parks.items.filter((x) => x.id !== p.id) })} className="w-8 h-8 rounded-lg" style={{ background: "rgba(239,68,68,.1)", color: "#EF4444" }}><Trash2 className="w-3.5 h-3.5 mx-auto" /></button>
              </div>
            ))}
            <button onClick={() => patchParks({ items: [...config.parks.items, { id: uid(), metro: "", fullAddress: "", shortLabel: "", bitrixStringValue: "", bitrixEnumId: "" }] })} className="h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}><Plus className="w-3.5 h-3.5" /> Добавить парк</button>
          </div>
        </Card>
      )}

      {tab === "bitrix" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Webhook URL" value={config.bitrix.webhookUrl} onChange={(v) => patchBitrix({ webhookUrl: v })} />
              <Field label="Assigned by ID" value={config.bitrix.assignedById} onChange={(v) => patchBitrix({ assignedById: v })} />
              <Field label="Lead status ID" value={config.bitrix.leadStatusId} onChange={(v) => patchBitrix({ leadStatusId: v })} />
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Режим дублей</label>
                <select value={config.bitrix.duplicateMode} onChange={(e) => patchBitrix({ duplicateMode: e.target.value as "always_new" | "update_duplicates" })} className="w-full h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle}>
                  <option value="always_new">always_new</option>
                  <option value="update_duplicates">update_duplicates</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={testBitrix} className="h-8 px-3 rounded-lg text-xs font-medium" style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                {testState === "checking" ? "Проверяем..." : "Тест Bitrix API"}
              </button>
              {testState === "ok" && <span className="text-xs" style={{ color: "var(--color-success)" }}>{testMsg}</span>}
              {testState === "error" && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{testMsg}</span>}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>Превью payload</p>
            <pre className="text-[11px] leading-5 rounded-lg p-2 overflow-auto max-h-[260px]" style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
              {payloadPreview}
            </pre>
          </Card>
        </div>
      )}

      {tab === "logs" && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_160px_1fr_auto] gap-2 items-end">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Дата от</label>
                <input
                  type="date"
                  value={logFilters.dateFrom}
                  onChange={(e) => setLogFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full h-8 px-2 rounded-lg text-xs outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Дата до</label>
                <input
                  type="date"
                  value={logFilters.dateTo}
                  onChange={(e) => setLogFilters((p) => ({ ...p, dateTo: e.target.value }))}
                  className="w-full h-8 px-2 rounded-lg text-xs outline-none"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>Статус Bitrix</label>
                <select
                  value={logFilters.status}
                  onChange={(e) => setLogFilters((p) => ({ ...p, status: e.target.value }))}
                  className="w-full h-8 px-2 rounded-lg text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="all">Все</option>
                  <option value="sent">sent</option>
                  <option value="pending">pending</option>
                  <option value="error">error</option>
                </select>
              </div>
              <Field label="Поиск (имя/телефон/Bitrix ID)" value={logFilters.q} onChange={(v) => setLogFilters((p) => ({ ...p, q: v }))} />
              <button
                onClick={() => loadLogs()}
                className="h-8 px-3 rounded-lg text-xs font-medium"
                style={{ background: "var(--color-brand)", color: "#fff" }}
              >
                {loadingLogs ? "Загрузка..." : "Обновить"}
              </button>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
            <Card>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
                Лиды из бота ({leadLogs.length})
              </p>
              <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                {leadLogs.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>За выбранный период записей нет.</p>
                )}
                {leadLogs.map((l) => (
                  <button
                    key={l.id}
                    onClick={async () => {
                      setSelectedBitrixLeadId(l.bitrixLeadId ?? null);
                      if (l.bitrixLeadId) {
                        await loadLogs(l.bitrixLeadId);
                      } else {
                        setTimeline([]);
                      }
                    }}
                    className="w-full text-left rounded-lg p-2 transition-all"
                    style={{
                      background: selectedBitrixLeadId === l.bitrixLeadId ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                        {l.fullName || l.username || `chat:${l.chatId}`}
                      </p>
                      <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                        {new Date(l.createdAt).toLocaleString("ru-RU")}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                      {l.phone || "без телефона"} · парк: {l.park} · статус: {l.bitrixStatus}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: l.bitrixError ? "var(--color-danger)" : "var(--color-muted)" }}>
                      Bitrix lead: {l.bitrixLeadId ?? "—"} {l.bitrixError ? `· ${l.bitrixError}` : ""}
                    </p>
                    {!!l.answersPreview && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>{l.answersPreview}</p>
                    )}
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>
                Таймлайн Bitrix {selectedBitrixLeadId ? `#${selectedBitrixLeadId}` : ""}
              </p>
              {!selectedBitrixLeadId && (
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Выберите лида слева, чтобы увидеть переписку кандидата и менеджера в Bitrix.
                </p>
              )}
              {selectedBitrixLeadId && (
                <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                  {timeline.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>Комментарии не найдены.</p>
                  )}
                  {timeline.map((t) => (
                    <div key={t.id} className="rounded-lg p-2" style={{ background: "var(--color-surface-2)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
                        #{t.id} · author:{t.authorId || "?"}
                      </p>
                      <p className="text-[11px] whitespace-pre-wrap mt-1" style={{ color: "var(--color-muted)" }}>
                        {t.comment || "—"}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                        {t.created ? new Date(t.created).toLocaleString("ru-RU") : "—"} {t.hasFiles ? "· есть вложения" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>Аудит действий админки</p>
              <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                {adminAudit.length === 0 && <p className="text-xs" style={{ color: "var(--color-muted)" }}>Пока нет записей.</p>}
                {adminAudit.map((l) => (
                  <div key={l.id} className="rounded-lg p-2 text-xs" style={{ background: "var(--color-surface-2)" }}>
                    <p style={{ color: "var(--color-text)" }}>{l.action}</p>
                    <p style={{ color: "var(--color-muted)" }}>{new Date(l.time).toLocaleString("ru-RU")} {l.detail ? `· ${l.detail}` : ""}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--color-text)" }}>Хвост runtime-лога бота</p>
              <pre className="text-[11px] leading-5 rounded-lg p-2 overflow-auto max-h-[260px]" style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                {botTail.length ? botTail.join("\n") : "Файл логов не найден или пуст."}
              </pre>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-8 px-2 rounded-lg text-xs outline-none" style={inputStyle} />
    </div>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs mb-1" style={{ color: "var(--color-muted)" }}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-24 p-2 rounded-lg text-xs outline-none resize-y" style={inputStyle} />
    </div>
  );
}

const inputStyle = {
  background: "var(--color-surface-2)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
} as const;

function patchScenarioStep(
  steps: ScenarioStep[],
  id: string,
  patch: Partial<ScenarioStep>,
  set: (next: ScenarioStep[]) => void,
) {
  set(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

function moveStep(steps: ScenarioStep[], id: string, dir: -1 | 1, set: (next: ScenarioStep[]) => void) {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const a = sorted[i];
  const b = sorted[j];
  const swapped = sorted.map((s) => {
    if (s.id === a.id) return { ...s, order: b.order };
    if (s.id === b.id) return { ...s, order: a.order };
    return s;
  });
  set(swapped);
}

function patchPark(items: ParkItem[], id: string, patch: Partial<ParkItem>, set: (next: ParkItem[]) => void) {
  set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

function moveButton(
  rows: QuickButton[],
  id: string,
  dir: -1 | 1,
  set: (next: QuickButton[]) => void,
) {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const a = sorted[i];
  const b = sorted[j];
  const next = sorted.map((x) => {
    if (x.id === a.id) return { ...x, order: b.order };
    if (x.id === b.id) return { ...x, order: a.order };
    return x;
  });
  set(next);
}
