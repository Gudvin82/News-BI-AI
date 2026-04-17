"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ScrollText, Shield, LogIn, Settings, Users, FileText, Link2, Trash2, RefreshCw, Download } from "lucide-react";
import { readLogs, clearLogs, exportLogsJson, subscribeLogs, writeLog, replaceLogs, type LogEntry, type LogType } from "@/lib/logger";
import { PinDialog } from "@/components/settings/PinDialog";
import { clearLogsBackup, readLogsBackup, saveLogsBackup } from "@/lib/settings-client";
import { writeServerAudit } from "@/lib/audit-client";
import { apiFetch } from "@/lib/utils";

type AuditCategory = "settings" | "integration" | "security" | "ai" | "logs" | "user";
interface AuditEntry {
  id: string;
  time: string;
  category: AuditCategory;
  action: string;
  detail?: string;
  actorId?: string;
  actorRole?: string;
}

const TYPE_META: Record<LogType, { icon: React.ReactNode; color: string; label: string }> = {
  auth:        { icon: <LogIn    className="w-3.5 h-3.5" />, color: "#10B981", label: "Вход"         },
  settings:    { icon: <Settings className="w-3.5 h-3.5" />, color: "#F59E0B", label: "Настройки"    },
  integration: { icon: <Link2    className="w-3.5 h-3.5" />, color: "#3B82F6", label: "Интеграции"   },
  report:      { icon: <FileText className="w-3.5 h-3.5" />, color: "#8B5CF6", label: "Отчёты"       },
  user:        { icon: <Users    className="w-3.5 h-3.5" />, color: "#EC4899", label: "Пользователи" },
  system:      { icon: <Shield   className="w-3.5 h-3.5" />, color: "#6B7280", label: "Система"      },
};

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  settings: "Настройки",
  integration: "Интеграции",
  security: "Безопасность",
  ai: "ИИ",
  logs: "Логи",
  user: "Пользователи",
};

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
}

export default function LogsPage() {
  const [logs, setLogs]           = useState<LogEntry[]>([]);
  const [filter, setFilter]       = useState<LogType | "all">("all");
  const [view, setView]           = useState<"local" | "audit" | "security">("local");
  const [exported, setExported]   = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState<AuditCategory | "all">("all");
  const [auditError, setAuditError] = useState("");
  const [loginHistory, setLoginHistory] = useState<Array<{ id: string; time: string; type: string; userName: string; role: string; ip: string; detail: string }>>([]);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const load = useCallback(() => setLogs(readLogs()), []);
  const loadLoginHistory = useCallback(async () => {
    setLoginLoading(true); setLoginError("");
    try {
      const res = await apiFetch("/api/settings/security/sessions", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Не удалось загрузить историю входов");
      setLoginHistory(data.data?.loginHistory ?? []);
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoginLoading(false);
    }
  }, []);
  const loadAudit = useCallback(async () => {
    setAuditError("");
    try {
      const res = await apiFetch("/api/settings/audit", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Не удалось загрузить аудит");
      setAuditEntries(data.data ?? []);
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : "Не удалось загрузить аудит");
    }
  }, []);
  useEffect(() => {
    const existing = readLogs();
    if (existing.length === 0) {
      writeLog("system", "Инициализация журнала", "Локальный аудит включён в этом браузере");
    }
    load();
    void loadAudit();
    void loadLoginHistory();
    setCanRestore(Boolean(readLogsBackup()));
    return subscribeLogs(load);
  }, [load, loadAudit, loadLoginHistory]);

  const filtered = filter === "all" ? logs : logs.filter((l) => l.type === filter);
  const filteredAudit = useMemo(
    () => auditFilter === "all" ? auditEntries : auditEntries.filter((entry) => entry.category === auditFilter),
    [auditEntries, auditFilter],
  );

  function handleClear() {
    saveLogsBackup(readLogs());
    clearLogs();
    setLogs([]);
    setCanRestore(true);
    writeLog("system", "Логи очищены", "Локальный журнал очищен вручную");
    void writeServerAudit("logs", "Очищены локальные логи", "Журнал очищен с подтверждением PIN");
  }

  function handleRestore() {
    const backup = readLogsBackup<LogEntry[]>();
    if (!backup?.length) return;
    replaceLogs(backup);
    clearLogsBackup();
    setCanRestore(false);
    writeLog("system", "Логи восстановлены", `Восстановлено записей: ${backup.length}`);
    void writeServerAudit("logs", "Восстановлены локальные логи", `Восстановлено записей: ${backup.length}`);
  }

  async function handleExport() {
    await navigator.clipboard.writeText(exportLogsJson());
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Логи и аудит</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            В одном месте: локальные логи браузера и серверный аудит критичных действий.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl p-1" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
            <button
              onClick={() => setView("local")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: view === "local" ? "var(--color-brand-soft)" : "transparent", color: view === "local" ? "var(--color-brand)" : "var(--color-muted)" }}
            >
              Локальные логи
            </button>
            <button
              onClick={() => setView("audit")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: view === "audit" ? "var(--color-brand-soft)" : "transparent", color: view === "audit" ? "var(--color-brand)" : "var(--color-muted)" }}
            >
              Серверный аудит
            </button>
            <button
              onClick={() => { setView("security"); void loadLoginHistory(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: view === "security" ? "var(--color-brand-soft)" : "transparent", color: view === "security" ? "var(--color-brand)" : "var(--color-muted)" }}
            >
              Входы / IP
            </button>
          </div>
        </div>
      </div>
      {view === "local" ? (
        <>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {(["all", ...Object.keys(TYPE_META)] as (LogType | "all")[]).map((t) => {
                const active = filter === t;
                const meta = t !== "all" ? TYPE_META[t] : null;
                const count = t === "all" ? logs.length : logs.filter((l) => l.type === t).length;
                return (
                  <button
                    key={t}
                    onClick={() => setFilter(t)}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: active ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                      border: `1.5px solid ${active ? "var(--color-brand)" : "transparent"}`,
                      color: active ? "var(--color-brand)" : "var(--color-muted)",
                    }}
                  >
                    {meta && <span style={{ color: active ? "var(--color-brand)" : meta.color }}>{meta.icon}</span>}
                    {t === "all" ? "Все" : meta!.label}
                    {count > 0 && (
                      <span className="px-1 rounded text-[10px]"
                        style={{ background: active ? "var(--color-brand)" : "var(--color-border)", color: active ? "#fff" : "var(--color-muted)" }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleExport}>
                <Download className="w-3.5 h-3.5" />
                {exported ? "Скопировано JSON" : "Экспорт"}
              </Button>
              {canRestore && (
                <Button size="sm" variant="secondary" onClick={handleRestore}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Восстановить очистку
                </Button>
              )}
              <button
                onClick={load}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
                title="Обновить"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <Button size="sm" variant="secondary" onClick={() => setClearOpen(true)}
                style={{ color: "#EF4444", borderColor: "#EF4444" }}>
                <Trash2 className="w-3.5 h-3.5" />
                Очистить
              </Button>
            </div>
          </div>

          <Card className="p-0 overflow-hidden">
            {filtered.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--color-surface-2)" }}>
                  <ScrollText className="w-6 h-6" style={{ color: "var(--color-muted)", opacity: 0.4 }} />
                </div>
                <p className="font-medium text-sm" style={{ color: "var(--color-text)" }}>
                  {filter === "all" ? "Журнал пуст" : "Нет событий этого типа"}
                </p>
                <p className="text-xs text-center max-w-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  {filter === "all"
                    ? "События появляются автоматически после входа, сохранения настроек, интеграций, пользователей и отчётов"
                    : "Попробуйте выбрать другой фильтр"}
                </p>
              </div>
            ) : (
              <div>
                <div className="grid px-4 py-2 text-xs font-medium" style={{ gridTemplateColumns: "1fr 2fr 1fr", borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
                  <span>Время</span>
                  <span>Событие</span>
                  <span>Тип</span>
                </div>
                {filtered.map((entry, i) => {
                  const meta = TYPE_META[entry.type];
                  return (
                    <div
                      key={entry.id}
                      className="grid px-4 py-3 text-xs items-start gap-2"
                      style={{
                        gridTemplateColumns: "1fr 2fr 1fr",
                        borderBottom: i < filtered.length - 1 ? "1px solid var(--color-border)" : "none",
                        background: i % 2 === 0 ? "transparent" : "var(--color-surface-2)",
                      }}
                    >
                      <span className="font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>{fmtTime(entry.time)}</span>
                      <div>
                        <p style={{ color: "var(--color-text)" }}>{entry.text}</p>
                        {entry.detail && <p className="mt-0.5" style={{ color: "var(--color-muted)" }}>{entry.detail}</p>}
                      </div>
                      <div className="flex items-center gap-1.5" style={{ color: meta.color }}>
                        {meta.icon}
                        <span style={{ color: "var(--color-muted)" }}>{meta.label}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)", borderTop: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                  Показано: {filtered.length} из {logs.length} · Локально в браузере · Автообновление включено
                </div>
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {(["all", "settings", "integration", "security", "ai", "logs", "user"] as const).map((item) => {
                const active = auditFilter === item;
                return (
                  <button
                    key={item}
                    onClick={() => setAuditFilter(item)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    style={{
                      background: active ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                      border: `1px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`,
                      color: active ? "var(--color-brand)" : "var(--color-muted)",
                    }}
                  >
                    {item === "all" ? "Все" : CATEGORY_LABELS[item]}
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="secondary" onClick={() => void loadAudit()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Обновить
            </Button>
          </div>

          <Card className="space-y-3">
            {auditError ? (
              <p className="text-sm" style={{ color: "#EF4444" }}>{auditError}</p>
            ) : filteredAudit.length === 0 ? (
              <div className="py-12 text-center">
                <Shield className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--color-muted)" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Пока нет записей аудита</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  Записи появятся после сохранения настроек, интеграций, удаления ключей и других критичных действий.
                </p>
              </div>
            ) : (
              filteredAudit.map((entry) => (
                <div key={entry.id} className="rounded-xl px-4 py-3 flex items-start justify-between gap-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-1 rounded-lg text-[11px]" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                        {CATEGORY_LABELS[entry.category]}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                        {new Date(entry.time).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{entry.action}</p>
                    {entry.detail && <p className="text-xs" style={{ color: "var(--color-muted)" }}>{entry.detail}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>{entry.actorRole ?? "owner"}</p>
                    <p className="text-[11px]" style={{ color: "var(--color-muted)", opacity: 0.7 }}>{entry.actorId ?? "system"}</p>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
      {view === "security" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              История входов с сервера — IP-адрес, пользователь, роль, результат.
            </p>
            <Button size="sm" variant="secondary" onClick={() => void loadLoginHistory()} loading={loginLoading}>
              <RefreshCw className="w-3.5 h-3.5" />
              Обновить
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            {loginError ? (
              <div className="px-5 py-4 text-sm" style={{ color: "#EF4444" }}>{loginError}</div>
            ) : loginLoading ? (
              <div className="px-5 py-8 text-sm text-center" style={{ color: "var(--color-muted)" }}>Загрузка...</div>
            ) : loginHistory.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <LogIn className="w-8 h-8" style={{ color: "var(--color-muted)", opacity: 0.4 }} />
                <p className="font-medium text-sm" style={{ color: "var(--color-text)" }}>История входов пуста</p>
                <p className="text-xs text-center max-w-xs" style={{ color: "var(--color-muted)" }}>
                  Записи появятся после первого входа в портал
                </p>
              </div>
            ) : (
              <div>
                <div className="grid px-4 py-2 text-xs font-medium" style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr", borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)", background: "var(--color-surface-2)" }}>
                  <span>Время</span>
                  <span>Пользователь</span>
                  <span>IP-адрес</span>
                  <span>Результат</span>
                </div>
                {loginHistory.map((entry, i) => (
                  <div key={entry.id} className="grid px-4 py-3 text-xs items-center gap-2"
                    style={{ gridTemplateColumns: "1.4fr 1fr 1fr 1fr", borderBottom: i < loginHistory.length - 1 ? "1px solid var(--color-border)" : "none", background: i % 2 === 0 ? "transparent" : "var(--color-surface-2)" }}>
                    <span className="font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>{fmtTime(entry.time)}</span>
                    <div>
                      <p style={{ color: "var(--color-text)" }}>{entry.userName}</p>
                      <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>{entry.role}</p>
                    </div>
                    <span className="font-mono" style={{ color: "var(--color-text)" }}>{entry.ip}</span>
                    <span style={{ color: entry.type === "login_success" ? "#10B981" : entry.type === "login_failed" ? "#EF4444" : "var(--color-muted)" }}>
                      {entry.type === "login_success" ? "Успешный вход" : entry.type === "login_failed" ? "Ошибка входа" : "Выход"}
                      {entry.detail && <span className="block text-[11px]" style={{ color: "var(--color-muted)" }}>{entry.detail}</span>}
                    </span>
                  </div>
                ))}
                <div className="px-4 py-2 text-xs" style={{ color: "var(--color-muted)", borderTop: "1px solid var(--color-border)", background: "var(--color-surface-2)" }}>
                  Показано: {loginHistory.length} последних событий · Данные с сервера
                </div>
              </div>
            )}
          </Card>
        </>
      )}
      <PinDialog
        open={clearOpen}
        title="Очистить журнал логов"
        description="Очистка локальных логов требует подтверждения отдельным PIN-кодом настроек. После очистки можно будет выполнить одно восстановление."
        confirmLabel="Очистить логи"
        onClose={() => setClearOpen(false)}
        onConfirmed={async () => { handleClear(); }}
      />
    </div>
  );
}
