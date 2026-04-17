"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/lib/utils";
import {
  Key, Plus, Copy, Trash2, ShieldOff, CheckCircle2,
  AlertTriangle, ExternalLink, RefreshCw, BarChart2,
  ChevronDown, ChevronUp, Activity, Clock, Database, Zap,
} from "lucide-react";

const DOCS_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api-docs`;

const ALL_PERMISSIONS = [
  // Базовые
  { id: "ingest:shifts",              label: "Смены",                desc: "POST /api/v1/ingest/shifts" },
  { id: "ingest:revenue",             label: "Выручка",              desc: "POST /api/v1/ingest/revenue" },
  { id: "ingest:cars",                label: "Машины",               desc: "POST /api/v1/ingest/cars" },
  { id: "ingest:drivers",             label: "Водители",             desc: "POST /api/v1/ingest/drivers" },
  { id: "ingest:events",              label: "События",              desc: "POST /api/v1/ingest/events" },
  // Расширенные
  { id: "ingest:trips",               label: "Поездки",              desc: "POST /api/v1/ingest/trips" },
  { id: "ingest:driver-balance",      label: "Баланс водителя",      desc: "POST /api/v1/ingest/driver-balance" },
  { id: "ingest:driver-transactions", label: "Транзакции водителей", desc: "POST /api/v1/ingest/driver-transactions" },
  { id: "ingest:car-transactions",    label: "Транзакции авто",      desc: "POST /api/v1/ingest/car-transactions" },
  { id: "ingest:payouts",             label: "Выплаты водителям",    desc: "POST /api/v1/ingest/payouts" },
  { id: "ingest:penalties",           label: "Штрафы",               desc: "POST /api/v1/ingest/penalties" },
  { id: "ingest:rentals",             label: "Аренда авто",          desc: "POST /api/v1/ingest/rentals" },
  { id: "ingest:shift-details",       label: "Детали смен",          desc: "POST /api/v1/ingest/shift-details" },
  { id: "ingest:hire-funnel",         label: "Воронка найма",        desc: "POST /api/v1/ingest/hire-funnel" },
  { id: "ingest:references",          label: "Справочники",          desc: "cabinets · transaction-types · payout-settings" },
];

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  note: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

interface KeyStats {
  totals: {
    total_calls: number;
    total_records: number;
    total_errors: number;
    calls_24h: number;
    calls_7d: number;
    first_call: string | null;
    last_call: string | null;
  };
  endpoints: {
    endpoint: string;
    calls: number;
    records: number;
    errors: number;
    last_call: string | null;
  }[];
  recent: {
    endpoint: string;
    records_in: number;
    status: string;
    error_msg: string | null;
    created_at: string;
  }[];
  dailyTrend: { day: string; calls: number }[];
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtShort(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function permLabel(id: string) {
  return ALL_PERMISSIONS.find((p) => p.id === id)?.label ?? id;
}

function fmtEndpoint(ep: string) {
  return ep.replace(/^ingest\//, "");
}

// ── Stats panel ───────────────────────────────────────────────────────────────
function KeyStatsPanel({ keyId, permissions }: { keyId: string; permissions: string[] }) {
  const [stats, setStats] = useState<KeyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const res = await apiFetch(`/api/v1/keys/${keyId}/stats`);
      const j = await res.json();
      if (!j.ok) throw new Error();
      setStats(j.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [keyId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <div className="px-4 pb-4 animate-pulse space-y-2">
      <div className="h-16 rounded-xl skeleton" />
      <div className="h-24 rounded-xl skeleton" />
    </div>
  );

  if (error || !stats) return (
    <div className="px-4 pb-4">
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>Не удалось загрузить статистику.</p>
    </div>
  );

  const { totals, endpoints, recent } = stats;
  const neverUsed = totals.total_calls === 0;
  const successRate = totals.total_calls > 0
    ? Math.round(((totals.total_calls - totals.total_errors) / totals.total_calls) * 100)
    : null;

  // Unused endpoints (have permission but zero calls)
  const usedEndpoints = new Set(endpoints.map((e) => e.endpoint));
  const unusedPerms = permissions
    .filter((p) => p.startsWith("ingest:"))
    .filter((p) => !usedEndpoints.has(`ingest/${p.replace("ingest:", "")}`));

  return (
    <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid var(--color-border)" }}>

      {neverUsed ? (
        <div className="flex items-center gap-3 py-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(245,158,11,0.1)" }}>
            <Zap className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Ещё не использовался</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              Передайте ключ партнёру — первый запрос появится здесь
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-3">
            {[
              { icon: <Activity className="w-3.5 h-3.5" />, label: "Всего запросов", value: totals.total_calls.toLocaleString("ru-RU") },
              { icon: <Clock className="w-3.5 h-3.5" />, label: "За 24 часа", value: totals.calls_24h.toLocaleString("ru-RU") },
              { icon: <Database className="w-3.5 h-3.5" />, label: "Записей принято", value: totals.total_records.toLocaleString("ru-RU") },
              {
                icon: <CheckCircle2 className="w-3.5 h-3.5" />,
                label: "Успешных",
                value: successRate !== null ? `${successRate}%` : "—",
                color: successRate !== null ? (successRate >= 90 ? "#10B981" : successRate >= 70 ? "#F59E0B" : "#EF4444") : undefined,
              },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-2.5"
                style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                <div className="flex items-center gap-1.5 mb-1" style={{ color: "var(--color-muted)" }}>
                  {s.icon}
                  <span className="text-[10px] font-medium uppercase tracking-wide">{s.label}</span>
                </div>
                <p className="text-lg font-bold" style={{ color: s.color ?? "var(--color-text)" }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* First / last call */}
          <div className="flex gap-4 text-[11px]" style={{ color: "var(--color-muted)" }}>
            <span>Первый запрос: <strong style={{ color: "var(--color-text)" }}>{fmtDate(totals.first_call)}</strong></span>
            <span>·</span>
            <span>Последний: <strong style={{ color: "var(--color-text)" }}>{fmtDate(totals.last_call)}</strong></span>
            <span>·</span>
            <span>За 7 дней: <strong style={{ color: "var(--color-text)" }}>{totals.calls_7d}</strong></span>
          </div>

          {/* Endpoint breakdown */}
          {endpoints.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--color-muted)" }}>
                Активные эндпоинты
              </p>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--color-surface-2)" }}>
                      {["Эндпоинт", "Запросов", "Записей", "Ошибок", "Последний запрос"].map((h) => (
                        <th key={h} className="text-left px-3 py-2"
                          style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map((ep, i) => {
                      const maxCalls = Math.max(...endpoints.map((e) => e.calls));
                      const pct = Math.round((ep.calls / maxCalls) * 100);
                      return (
                        <tr key={ep.endpoint} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : undefined }}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-brand)" }} />
                              </div>
                              <code className="text-xs font-mono" style={{ color: "var(--color-text)" }}>
                                /ingest/{fmtEndpoint(ep.endpoint)}
                              </code>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: "var(--color-text)" }}>
                            {ep.calls.toLocaleString("ru-RU")}
                          </td>
                          <td className="px-3 py-2.5 text-xs" style={{ color: "var(--color-muted)" }}>
                            {ep.records.toLocaleString("ru-RU")}
                          </td>
                          <td className="px-3 py-2.5">
                            {ep.errors > 0
                              ? <span className="text-xs font-medium" style={{ color: "#EF4444" }}>{ep.errors}</span>
                              : <span className="text-xs" style={{ color: "#10B981" }}>—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--color-muted)" }}>
                            {fmtShort(ep.last_call)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unused permissions */}
          {unusedPerms.length > 0 && (
            <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#F59E0B" }}>
                Разрешены, но ни разу не вызывались
              </p>
              <div className="flex flex-wrap gap-1">
                {unusedPerms.map((p) => (
                  <span key={p} className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
                    {permLabel(p)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent log */}
          {recent.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--color-muted)" }}>
                Последние запросы
              </p>
              <div className="rounded-xl overflow-hidden max-h-52 overflow-y-auto" style={{ border: "1px solid var(--color-border)" }}>
                {recent.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2"
                    style={{ borderBottom: i < recent.length - 1 ? "1px solid var(--color-border)" : undefined, background: i % 2 === 0 ? "transparent" : "var(--color-surface-2)" }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: r.status === "ok" ? "#10B981" : "#EF4444" }} />
                    <code className="text-[11px] font-mono flex-1 truncate" style={{ color: "var(--color-text)" }}>
                      /ingest/{fmtEndpoint(r.endpoint)}
                    </code>
                    <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                      {r.records_in} зап.
                    </span>
                    {r.error_msg && (
                      <span className="text-[11px] truncate max-w-[160px]" style={{ color: "#EF4444" }} title={r.error_msg}>
                        {r.error_msg}
                      </span>
                    )}
                    <span className="text-[11px] flex-shrink-0" style={{ color: "var(--color-muted)" }}>
                      {fmtShort(r.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ApiKeysPage() {
  const [keys, setKeys]       = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newNote, setNewNote]       = useState("");
  const [newPerms, setNewPerms]     = useState<string[]>(ALL_PERMISSIONS.map((p) => p.id));
  const [creating, setCreating]     = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/v1/keys");
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Ошибка загрузки");
      setKeys(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), permissions: newPerms, note: newNote.trim() || undefined }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Ошибка создания");
      setCreatedKey(j.data.raw_key);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Отозвать ключ? Все запросы с этим ключом перестанут работать.")) return;
    await apiFetch(`/api/v1/keys/${id}`, { method: "PATCH" });
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить ключ безвозвратно?")) return;
    await apiFetch(`/api/v1/keys/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    await load();
  }

  function copyKey(k: string) {
    navigator.clipboard.writeText(k).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function resetCreateModal() {
    setShowCreate(false); setNewName(""); setNewNote("");
    setNewPerms(ALL_PERMISSIONS.map((p) => p.id));
    setCreatedKey(null); setCopied(false);
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(245,158,11,0.12)" }}>
            <Key className="w-5 h-5" style={{ color: "var(--color-brand)" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>API-ключи</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
              Ключи для партнёрских интеграций — приём данных через API
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={DOCS_URL} target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
            style={{ background: "var(--color-surface-2)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
            <ExternalLink className="w-3.5 h-3.5" />
            Документация API
          </a>
          <button onClick={() => { resetCreateModal(); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "var(--color-brand)" }}>
            <Plus className="w-4 h-4" />
            Создать ключ
          </button>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>

            {!createdKey ? (
              <>
                <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>Новый API-ключ</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>Название ключа *</label>
                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="Например: taxicrm.ru"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>Примечание (необязательно)</label>
                    <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Для чего ключ, кто использует..."
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-2 block" style={{ color: "var(--color-muted)" }}>Разрешения</label>
                    <div className="space-y-1.5">
                      {ALL_PERMISSIONS.map((p) => (
                        <label key={p.id} className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={newPerms.includes(p.id)}
                            onChange={(e) => setNewPerms((prev) => e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id))}
                            className="w-4 h-4 rounded" style={{ accentColor: "var(--color-brand)" }} />
                          <div className="min-w-0">
                            <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{p.label}</span>
                            <span className="text-xs ml-2 font-mono" style={{ color: "var(--color-muted)" }}>{p.desc}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={resetCreateModal} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                    Отмена
                  </button>
                  <button onClick={handleCreate} disabled={creating || !newName.trim() || !newPerms.length}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--color-brand)" }}>
                    {creating ? "Создание…" : "Создать"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-5 h-5" style={{ color: "#10B981" }} />
                  <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>Ключ создан</h2>
                </div>
                <div className="rounded-xl p-4 space-y-3"
                  style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <p className="text-xs font-semibold" style={{ color: "#F59E0B" }}>
                    ⚠ Сохраните ключ — он показывается только один раз
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono break-all rounded-lg px-3 py-2"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-text)" }}>
                      {createdKey}
                    </code>
                    <button onClick={() => copyKey(createdKey)}
                      className="p-2 rounded-lg flex-shrink-0 transition-colors"
                      style={{ background: copied ? "rgba(16,185,129,0.15)" : "var(--color-surface-2)", color: copied ? "#10B981" : "var(--color-muted)" }}>
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    Передайте ключ партнёру вместе с{" "}
                    <a href={DOCS_URL} target="_blank" style={{ color: "var(--color-brand)" }}>документацией API</a>
                  </p>
                </div>
                <button onClick={resetCreateModal} className="w-full px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--color-brand)", color: "#fff" }}>
                  Готово
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(2)].map((_, i) => <div key={i} className="h-20 rounded-xl skeleton" />)}
        </div>
      ) : error ? (
        <Card>
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5" style={{ color: "var(--color-danger)" }} />
            <p style={{ color: "var(--color-text)" }}>{error}</p>
            <button onClick={load} className="ml-auto">
              <RefreshCw className="w-4 h-4" style={{ color: "var(--color-muted)" }} />
            </button>
          </div>
        </Card>
      ) : keys.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <Key className="w-8 h-8 mx-auto mb-3 opacity-30" style={{ color: "var(--color-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Нет API-ключей</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
              Создайте ключ и передайте его партнёру для настройки интеграции
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => {
            const isExpanded = expandedId === k.id;
            return (
              <Card key={k.id} className="p-0 overflow-hidden">
                {/* Key header row */}
                <div className="flex items-start justify-between gap-3 flex-wrap p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{k.name}</span>
                      <Badge variant={k.revoked ? "warning" : "success"}>
                        {k.revoked ? "Отозван" : "Активен"}
                      </Badge>
                      {k.last_used_at && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}>
                          подключён
                        </span>
                      )}
                    </div>
                    <code className="text-xs font-mono" style={{ color: "var(--color-muted)" }}>
                      {k.key_prefix}••••••••••••••••••••
                    </code>
                    {k.note && <p className="text-xs" style={{ color: "var(--color-muted)" }}>{k.note}</p>}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {k.permissions.map((p) => (
                        <span key={p} className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: "rgba(245,158,11,0.1)", color: "var(--color-brand)" }}>
                          {permLabel(p)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0 text-right">
                    <div className="flex items-center gap-1">
                      {/* Stats toggle */}
                      <button onClick={() => setExpandedId(isExpanded ? null : k.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{
                          background: isExpanded ? "rgba(245,158,11,0.12)" : "var(--color-surface-2)",
                          color: isExpanded ? "var(--color-brand)" : "var(--color-muted)",
                          border: `1px solid ${isExpanded ? "rgba(245,158,11,0.3)" : "var(--color-border)"}`,
                        }}>
                        <BarChart2 className="w-3.5 h-3.5" />
                        Статистика
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {!k.revoked && (
                        <button onClick={() => handleRevoke(k.id)} title="Отозвать"
                          className="p-1.5 rounded-lg transition-colors hover:bg-amber-500/10"
                          style={{ color: "#F59E0B" }}>
                          <ShieldOff className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(k.id)} title="Удалить"
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                        style={{ color: "#EF4444" }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                      Создан: {fmtDate(k.created_at)}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                      Последний запрос: {fmtDate(k.last_used_at)}
                    </p>
                  </div>
                </div>

                {/* Stats panel */}
                {isExpanded && <KeyStatsPanel keyId={k.id} permissions={k.permissions} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
