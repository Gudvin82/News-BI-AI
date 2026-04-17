"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, Pencil, X, Check, Eye, EyeOff, ShieldCheck, User, Users, KeyRound, Clock3, AlertTriangle, ScrollText, LogIn, LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { writeLog } from "@/lib/logger";
import { writeServerAudit } from "@/lib/audit-client";
import { PinDialog } from "@/components/settings/PinDialog";

// ── Section / subsection tree ─────────────────────────────────────────────────
const SECTION_TREE: { id: string; label: string; sub?: { id: string; label: string }[] }[] = [
  { id: "dashboard",  label: "Главная" },
  { id: "finance",    label: "Финансы",    sub: [
    { id: "finance/cashflow", label: "Cashflow" },
    { id: "finance/debts",    label: "Долги" },
    { id: "finance/budget",   label: "Бюджет" },
  ]},
  { id: "operations", label: "Операции",  sub: [
    { id: "operations/cars",    label: "Автопарк" },
    { id: "operations/drivers", label: "Водители" },
    { id: "operations/shifts",  label: "Смены" },
    { id: "operations/revenue", label: "Выручка" },
  ]},
  { id: "hire",       label: "Найм",       sub: [
    { id: "hire/funnel",      label: "Воронка" },
    { id: "hire/managers",    label: "Менеджеры" },
    { id: "hire/parks",       label: "Парки" },
    { id: "hire/first-shift", label: "1-я смена" },
    { id: "hire/sources",     label: "Источники" },
    { id: "hire/dostavka",    label: "Доставка" },
    { id: "hire/raskat",      label: "Раскат" },
    { id: "hire/damir",       label: "Дамир" },
  ]},
  { id: "dtp",        label: "ДТП",        sub: [
    { id: "dtp/overview", label: "Обзор" },
    { id: "dtp/list",     label: "Все дела" },
  ]},
  { id: "bizproc",    label: "Бизнес-процессы" },
  { id: "cash",       label: "Касса",     sub: [
    { id: "cash/daily",    label: "Дневная касса" },
    { id: "cash/registry", label: "Реестр" },
  ]},
  { id: "workshop",   label: "СТО",       sub: [
    { id: "workshop/cars",     label: "Машины" },
    { id: "workshop/schedule", label: "Расписание" },
    { id: "workshop/costs",    label: "Затраты" },
  ]},
  { id: "marketing",  label: "Маркетинг", sub: [
    { id: "marketing/yandex",    label: "Яндекс Директ" },
    { id: "marketing/analytics", label: "Аналитика" },
  ]},
  { id: "reports",    label: "Отчёты" },
];

function allSectionIds(): string[] {
  const ids: string[] = [];
  for (const s of SECTION_TREE) {
    ids.push(s.id);
    s.sub?.forEach((c) => ids.push(c.id));
  }
  return ids;
}

// ── Combined access picker (visible + editable in one table) ─────────────────
function SectionAccessPicker({
  visible, editable,
  onChangeVisible, onChangeEditable,
}: {
  visible: string[];
  editable: string[];
  onChangeVisible: (v: string[]) => void;
  onChangeEditable: (v: string[]) => void;
}) {
  const all = allSectionIds();

  function toggleVisible(id: string, childIds: string[] = []) {
    const ids = [id, ...childIds];
    const allOn = ids.every((i) => visible.includes(i));
    const newVisible = allOn
      ? visible.filter((s) => !ids.includes(s))
      : [...visible, ...ids.filter((i) => !visible.includes(i))];
    // Remove from editable if no longer visible
    onChangeEditable(editable.filter((s) => newVisible.includes(s)));
    onChangeVisible(newVisible);
  }

  function toggleEditable(id: string, childIds: string[] = []) {
    const ids = [id, ...childIds].filter((i) => visible.includes(i));
    if (!ids.length) return;
    const allOn = ids.every((i) => editable.includes(i));
    if (allOn) {
      onChangeEditable(editable.filter((s) => !ids.includes(s)));
    } else {
      onChangeEditable([...editable, ...ids.filter((i) => !editable.includes(i))]);
    }
  }

  function Cb({ checked, indeterminate, onClick }: { checked: boolean; indeterminate?: boolean; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background: checked ? "var(--color-brand)" : indeterminate ? "rgba(245,158,11,0.3)" : "var(--color-border)",
          border: checked || indeterminate ? "none" : "1.5px solid var(--color-border)",
        }}
      >
        {(checked || indeterminate) && <Check className="w-2.5 h-2.5 text-white" />}
      </button>
    );
  }

  const allVisibleOn = all.every((i) => visible.includes(i));
  const allEditableOn = all.every((i) => editable.includes(i));

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
      {/* Header */}
      <div className="grid items-center px-3 py-2 text-[11px] font-semibold"
        style={{ gridTemplateColumns: "1fr 56px 64px", background: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
        <span>Раздел</span>
        <button type="button" onClick={() => {
          const newV = allVisibleOn ? [] : all;
          onChangeVisible(newV);
          onChangeEditable(editable.filter((s) => newV.includes(s)));
        }} className="text-center hover:opacity-80">Видит</button>
        <button type="button" onClick={() => {
          if (allEditableOn) { onChangeEditable([]); }
          else { onChangeEditable(visible.filter((s) => all.includes(s))); }
        }} className="text-center hover:opacity-80">Правки</button>
      </div>

      {/* Rows */}
      <div>
        {SECTION_TREE.map((sec, si) => {
          const subIds = sec.sub?.map((s) => s.id) ?? [];
          const vOn = visible.includes(sec.id);
          const vAny = subIds.some((i) => visible.includes(i));
          const vAll = subIds.length === 0 ? vOn : subIds.every((i) => visible.includes(i)) && vOn;
          const eOn = editable.includes(sec.id);
          const eAny = subIds.some((i) => editable.includes(i));
          const eAll = subIds.length === 0 ? eOn : subIds.every((i) => editable.includes(i)) && eOn;

          return (
            <div key={sec.id}>
              {/* Parent row */}
              <div
                className="grid items-center px-3 py-2"
                style={{
                  gridTemplateColumns: "1fr 56px 64px",
                  background: si % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <span className="text-xs font-medium" style={{ color: vOn || vAny ? "var(--color-text)" : "var(--color-muted)" }}>
                  {sec.label}
                  {sec.sub && <span className="ml-1 text-[10px] opacity-50">({sec.sub.length})</span>}
                </span>
                <div className="flex justify-center">
                  <Cb
                    checked={sec.sub ? vAll : vOn}
                    indeterminate={sec.sub ? (!vAll && vAny) : false}
                    onClick={() => toggleVisible(sec.id, subIds)}
                  />
                </div>
                <div className="flex justify-center">
                  <Cb
                    checked={sec.sub ? eAll : eOn}
                    indeterminate={sec.sub ? (!eAll && eAny) : false}
                    onClick={() => toggleEditable(sec.id, subIds)}
                  />
                </div>
              </div>

              {/* Child rows — always visible */}
              {sec.sub?.map((child) => {
                const cvOn = visible.includes(child.id);
                const ceOn = editable.includes(child.id);
                return (
                  <div
                    key={child.id}
                    className="grid items-center px-3 py-1.5"
                    style={{
                      gridTemplateColumns: "1fr 56px 64px",
                      background: "var(--color-surface-2)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <span className="text-[11px] pl-3" style={{ color: cvOn ? "var(--color-text)" : "var(--color-muted)", opacity: 0.85 }}>
                      └ {child.label}
                    </span>
                    <div className="flex justify-center">
                      <Cb checked={cvOn} onClick={() => {
                        const newV = cvOn ? visible.filter((s) => s !== child.id) : [...visible, child.id];
                        onChangeEditable(editable.filter((s) => newV.includes(s)));
                        onChangeVisible(newV);
                      }} />
                    </div>
                    <div className="flex justify-center">
                      <Cb
                        checked={ceOn}
                        onClick={() => {
                          if (!cvOn) return;
                          onChangeEditable(ceOn ? editable.filter((s) => s !== child.id) : [...editable, child.id]);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-2 flex items-center justify-between text-[11px]"
        style={{ background: "var(--color-surface-2)", color: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
        <span>Видит: <b style={{ color: "var(--color-text)" }}>{visible.length}</b> из {all.length}</span>
        <span>Правки: <b style={{ color: "var(--color-text)" }}>{editable.length}</b> из {all.length}</span>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PortalUser {
  id: string;
  name: string;
  role: string;
  allowed_sections: string[];
  visible_sections?: string[];
  editable_sections?: string[];
  is_active: boolean;
  created_at: string;
}

interface SessionRow {
  sessionId?: string;
  userName: string;
  role: string;
  ip: string;
  startedAt: string;
  current: boolean;
  detail?: string;
}

interface HistoryRow {
  id: string;
  time: string;
  type: "login_success" | "login_failed" | "logout";
  userName: string;
  role: string;
  ip: string;
  detail: string;
}

interface UserForm {
  name: string;
  pin: string;
  visible_sections: string[];
  editable_sections: string[];
}

function emptyForm(): UserForm {
  return { name: "", pin: "", visible_sections: [], editable_sections: [] };
}

const ROLE_PRESETS: Array<{ label: string; visible: string[]; editable: string[]; hint: string }> = [
  { label: "Собственник", visible: allSectionIds(), editable: allSectionIds(), hint: "Полный доступ к просмотру и правкам" },
  { label: "Финансы", visible: ["dashboard", "finance", "finance/cashflow", "finance/debts", "finance/budget", "cash", "cash/daily", "cash/registry", "reports"], editable: ["finance", "finance/cashflow", "finance/debts", "finance/budget", "cash", "cash/daily", "cash/registry"], hint: "Видит финансы и редактирует денежные разделы" },
  { label: "Операции", visible: ["dashboard", "operations", "operations/cars", "operations/drivers", "operations/shifts", "operations/revenue", "workshop", "workshop/cars", "workshop/schedule", "workshop/costs"], editable: ["operations", "operations/cars", "operations/drivers", "operations/shifts", "operations/revenue", "workshop", "workshop/cars", "workshop/schedule", "workshop/costs"], hint: "Операции и СТО с правом редактирования" },
  { label: "Найм", visible: ["dashboard", "hire", "hire/funnel", "hire/managers", "hire/parks", "hire/first-shift", "hire/sources", "hire/dostavka", "hire/raskat", "hire/damir", "marketing", "marketing/yandex", "marketing/analytics", "reports"], editable: ["hire", "hire/funnel", "hire/managers", "hire/parks", "hire/first-shift", "hire/sources", "hire/dostavka", "hire/raskat", "hire/damir", "marketing", "marketing/yandex", "marketing/analytics"], hint: "Найм и маркетинг" },
  { label: "Юристы", visible: ["dashboard", "reports"], editable: ["reports"], hint: "Юридическая аналитика и отчёты" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsersSettingsPage() {
  const [users, setUsers]         = useState<PortalUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<SessionRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [securityStats, setSecurityStats] = useState({ activeCount: 0, failedCount24h: 0, successCount24h: 0 });

  // create / edit modal
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState<UserForm>(emptyForm);
  const [showPin, setShowPin]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // per-user logs
  const [logsUserId, setLogsUserId]   = useState<string | null>(null);
  const [userLogs, setUserLogs]       = useState<{ id: string; time: string; type: string; ip: string; detail: string }[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  async function toggleUserLogs(userId: string) {
    if (logsUserId === userId) { setLogsUserId(null); return; }
    setLogsUserId(userId);
    setLogsLoading(true);
    setUserLogs([]);
    try {
      const res  = await apiFetch(`/api/settings/users/logs?userId=${userId}`);
      const json = await res.json();
      setUserLogs(json.data ?? []);
    } catch { /* ignore */ } finally {
      setLogsLoading(false);
    }
  }

  function fmtLogTime(iso: string) {
    try { return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [usersRes, securityRes] = await Promise.all([
        apiFetch("/api/settings/users", { cache: "no-store" }).then((r) => r.json()),
        apiFetch("/api/settings/security/sessions", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (!usersRes.ok) throw new Error(usersRes.error ?? "Ошибка загрузки пользователей");
      if (!securityRes.ok) throw new Error(securityRes.error ?? "Ошибка загрузки безопасности");
      setUsers(usersRes.data ?? []);
      setActiveSessions(securityRes.data?.activeSessions ?? []);
      setHistory(securityRes.data?.loginHistory ?? []);
      setSecurityStats(securityRes.data?.stats ?? { activeCount: 0, failedCount24h: 0, successCount24h: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null); setForm(emptyForm()); setFormError(null); setShowPin(false); setShowForm(true);
  }

  function openEdit(u: PortalUser) {
    setEditId(u.id);
    const visible = u.visible_sections?.length ? u.visible_sections : (u.allowed_sections ?? []);
    const editable = u.editable_sections?.length ? u.editable_sections : visible;
    setForm({ name: u.name, pin: "", visible_sections: visible, editable_sections: editable });
    setFormError(null); setShowPin(false); setShowForm(true);
  }

  async function saveUser() {
    setFormError(null);
    if (!form.name.trim()) { setFormError("Введите имя"); return; }
    if (!editId && form.pin.length < 4) { setFormError("PIN должен быть не менее 4 символов"); return; }
    setSaving(true);
    try {
      const method = editId ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        visible_sections: form.visible_sections,
        editable_sections: form.editable_sections.filter((id) => form.visible_sections.includes(id)),
        allowed_sections: form.visible_sections,
      };
      if (!editId || form.pin) body.pin = form.pin;
      if (editId) body.id = editId;

      const r = await apiFetch("/api/settings/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Ошибка сохранения");
      writeLog("user", editId ? "Обновлён пользователь" : "Создан пользователь", form.name.trim());
      void writeServerAudit("user", editId ? "Обновлён пользователь" : "Создан пользователь", form.name.trim());
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: PortalUser) {
    try {
      await apiFetch("/api/settings/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
      });
      writeLog("user", !u.is_active ? "Пользователь активирован" : "Пользователь деактивирован", u.name);
      void writeServerAudit("user", !u.is_active ? "Пользователь активирован" : "Пользователь деактивирован", u.name);
      await load();
    } catch { /* ignore */ }
  }

  async function deleteUser(id: string) {
    try {
      const doomed = users.find((u) => u.id === id);
      await apiFetch("/api/settings/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (doomed) writeLog("user", "Пользователь удалён", doomed.name);
      if (doomed) void writeServerAudit("user", "Пользователь удалён", doomed.name);
      setDeletingId(null);
      await load();
    } catch { /* ignore */ }
  }

  function sectionLabel(ids: string[]) {
    if (ids.length === 0) return "Нет доступа";
    const all = allSectionIds();
    if (ids.length >= all.length) return "Все разделы";
    const parents = ids.filter((id) => !id.includes("/"));
    return parents.slice(0, 3).map((id) => {
      const sec = SECTION_TREE.find((s) => s.id === id);
      return sec?.label ?? id;
    }).join(", ") + (parents.length > 3 ? ` +${parents.length - 3}` : "");
  }

  function editLabel(ids: string[]) {
    if (ids.length === 0) return "Только просмотр";
    const all = allSectionIds();
    if (ids.length >= all.length) return "Право редактировать всё";
    const parents = ids.filter((id) => !id.includes("/"));
    return parents.slice(0, 2).map((id) => {
      const sec = SECTION_TREE.find((s) => s.id === id);
      return sec?.label ?? id;
    }).join(", ") + (parents.length > 2 ? ` +${parents.length - 2}` : "");
  }

  function summarize(ids: string[]) {
    if (ids.length === 0) return "Нет прав";
    const parents = ids.filter((id) => !id.includes("/"));
    return parents.slice(0, 3).map((id) => {
      const sec = SECTION_TREE.find((s) => s.id === id);
      return sec?.label ?? id;
    }).join(", ") + (parents.length > 3 ? ` +${parents.length - 3}` : "");
  }

  const activeUsers = users.filter((user) => user.is_active);
  const withEditRights = users.filter((user) => (user.editable_sections?.length ?? user.allowed_sections.length) > 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Пользователи и доступ</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Сотрудники портала, матрица прав `видит / редактирует`, история входов и активные сессии.
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-3.5 h-3.5" />
          Добавить
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Всего сотрудников</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "var(--color-text)" }}>{users.length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>пользователей портала</p>
        </Card>
        <Card>
          <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Активных</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "#10B981" }}>{users.filter((u) => u.is_active).length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>могут входить сейчас</p>
        </Card>
        <Card>
          <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Отключённых</p>
          <p className="text-2xl font-bold mt-1" style={{ color: "#F59E0B" }}>{users.filter((u) => !u.is_active).length}</p>
          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>доступ временно закрыт</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>PIN для настроек</p>
          </div>
          <p className="text-sm" style={{ color: "var(--color-text)" }}>Активен отдельный контур защиты</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Весь раздел `Настройки` защищён отдельным PIN-кодом, а опасные действия требуют повторного подтверждения.
          </p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Активные сотрудники</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{activeUsers.length}</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>могут войти в портал сейчас</p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>С правом редактирования</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{withEditRights.length}</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>пользователей с рабочими правками</p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock3 className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Сессии и входы</p>
          </div>
          <p className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>{securityStats.activeCount}</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            активных сессий · ошибок входа за 24ч: {securityStats.failedCount24h}
          </p>
        </Card>
      </div>

      {/* Owner notice */}
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--color-brand)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Владелец</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              Вход по переменной <code className="px-1 rounded text-xs" style={{ background: "var(--color-surface-2)" }}>PORTAL_PIN</code> в .env.
              Владелец имеет доступ ко всем разделам и может управлять сотрудниками.
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <div className="text-sm px-4 py-3 rounded-xl"
          style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          {error}
        </div>
      )}

      {/* Users list */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
        </div>
      ) : users.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center py-10 gap-3 text-center">
            <User className="w-8 h-8" style={{ color: "var(--color-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Нет сотрудников</p>
            <p className="text-xs max-w-xs" style={{ color: "var(--color-muted)" }}>
              Добавьте сотрудников, чтобы дать им ограниченный доступ к разделам портала.
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" /> Добавить сотрудника
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          {users.map((u, i) => (
            <div key={u.id}>
            <div
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ borderBottom: logsUserId !== u.id && i < users.length - 1 ? "1px solid var(--color-border)" : logsUserId === u.id ? "1px solid var(--color-border)" : undefined }}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: "rgba(245,158,11,0.12)", color: "var(--color-brand)" }}
              >
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: u.is_active ? "var(--color-text)" : "var(--color-muted)" }}>
                    {u.name}
                  </p>
                  <Badge variant={u.is_active ? "default" : "warning"}>
                    {u.is_active ? "Активен" : "Отключён"}
                  </Badge>
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>
                  Видит: {sectionLabel(u.visible_sections?.length ? u.visible_sections : u.allowed_sections)}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--color-muted)", opacity: 0.75 }}>
                  Редактирует: {editLabel(u.editable_sections?.length ? u.editable_sections : (u.visible_sections?.length ? u.visible_sections : u.allowed_sections))}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--color-muted)", opacity: 0.75 }}>
                  Создан: {new Date(u.created_at).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive(u)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-2/50"
                  title={u.is_active ? "Отключить" : "Включить"}
                  style={{ color: "var(--color-muted)" }}
                >
                  {u.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => openEdit(u)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  title="Изменить"
                  style={{ color: "var(--color-muted)" }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => toggleUserLogs(u.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                  title="Логи входов"
                  style={{
                    color: logsUserId === u.id ? "var(--color-brand)" : "var(--color-muted)",
                    background: logsUserId === u.id ? "rgba(245,158,11,0.1)" : "transparent",
                  }}
                >
                  <ScrollText className="w-3.5 h-3.5" />
                </button>
                {deletingId === u.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="h-6 px-2 rounded text-xs font-medium"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}
                    >
                      Удалить
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="w-6 h-6 flex items-center justify-center rounded"
                      style={{ color: "var(--color-muted)" }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(u.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
                    title="Удалить"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Per-user logs panel */}
            {logsUserId === u.id && (
              <div className="px-5 py-3" style={{ background: "var(--color-surface-2)", borderBottom: i < users.length - 1 ? "1px solid var(--color-border)" : undefined }}>
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--color-muted)" }}>
                  <ScrollText className="w-3.5 h-3.5" /> История входов — {u.name}
                </p>
                {logsLoading ? (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Загрузка...</p>
                ) : userLogs.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>Входов не найдено</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                    {userLogs.map((log) => {
                      const isSuccess = log.type === "login_success";
                      const isLogout  = log.type === "logout";
                      const color = isSuccess ? "#10b981" : isLogout ? "#6b7280" : "#ef4444";
                      const label = isSuccess ? "Успешный вход" : isLogout ? "Выход из системы" : "Неверный PIN";
                      const bg    = isSuccess ? "rgba(16,185,129,0.06)" : isLogout ? "rgba(107,114,128,0.06)" : "rgba(239,68,68,0.06)";
                      const border = isSuccess ? "rgba(16,185,129,0.2)" : isLogout ? "rgba(107,114,128,0.15)" : "rgba(239,68,68,0.2)";
                      return (
                        <div key={log.id} className="rounded-lg px-3 py-2.5"
                          style={{ background: bg, border: `1px solid ${border}` }}>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <span style={{ color }}>
                                {isSuccess ? <LogIn className="w-3.5 h-3.5" /> : isLogout ? <LogOut className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                              </span>
                              <span className="text-xs font-semibold" style={{ color }}>{label}</span>
                            </div>
                            <span className="text-[11px]" style={{ color: "var(--color-muted)" }}>{fmtLogTime(log.time)}</span>
                          </div>
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: "var(--color-surface)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>
                              {log.ip}
                            </span>
                            {log.detail && (
                              <span className="text-[11px] leading-relaxed" style={{ color: "var(--color-muted)" }}>
                                {log.detail}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
            <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Матрица доступа</p>
          </div>
          <div className="space-y-2">
            {users.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>Пользователи пока не загружены.</p>
            ) : (
              users.map((user) => {
                const visible = user.visible_sections?.length ? user.visible_sections : user.allowed_sections;
                const editable = user.editable_sections?.length ? user.editable_sections : visible;
                return (
                  <div key={`matrix-${user.id}`} className="rounded-xl px-4 py-3 flex items-start justify-between gap-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{user.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {user.role} · {user.is_active ? "активен" : "отключён"}
                      </p>
                      <div className="flex flex-wrap gap-3 mt-2 text-[11px]" style={{ color: "var(--color-muted)" }}>
                        <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Видит: {summarize(visible)}</span>
                        <span className="inline-flex items-center gap-1"><Pencil className="w-3 h-3" /> Редактирует: {summarize(editable)}</span>
                      </div>
                    </div>
                    <div className="text-right text-[11px]" style={{ color: "var(--color-muted)" }}>
                      {visible.length} видит
                      <br />
                      {editable.length} редактирует
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock3 className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
              <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Активные сессии</p>
            </div>
            {activeSessions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>Сейчас нет активных сессий кроме возможного владельца.</p>
            ) : (
              <div className="space-y-2">
                {activeSessions.map((entry) => (
                  <div key={entry.sessionId ?? entry.startedAt} className="rounded-xl px-4 py-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                          {entry.userName} {entry.current ? "· текущая" : ""}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                          {entry.role} · IP: {entry.ip}
                        </p>
                      </div>
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                        {new Date(entry.startedAt).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    {entry.detail && <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>{entry.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: "var(--color-brand)" }} />
              <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Последние входы и выходы</p>
            </div>
            {history.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>История входов пока пустая.</p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-xl px-4 py-3" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                          {entry.type === "login_success" ? "Успешный вход" : entry.type === "login_failed" ? "Ошибка входа" : "Выход"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                          {entry.userName} · {entry.role} · IP: {entry.ip}
                        </p>
                      </div>
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                        {new Date(entry.time).toLocaleString("ru-RU")}
                      </p>
                    </div>
                    {entry.detail && <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>{entry.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Create / Edit modal — rendered via portal to avoid transform/filter containing-block issues */}
      {showForm && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <h2 className="text-base font-bold" style={{ color: "var(--color-text)" }}>
                {editId ? "Изменить сотрудника" : "Добавить сотрудника"}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: "var(--color-muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
                  Имя сотрудника
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Иван Петров"
                  className="w-full h-9 px-3 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                />
              </div>

              {/* PIN */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--color-muted)" }}>
                  {editId ? "Новый PIN (оставьте пустым, чтобы не менять)" : "PIN-код (мин. 4 символа)"}
                </label>
                <div className="relative">
                  <input
                    type={showPin ? "text" : "password"}
                    value={form.pin}
                    onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                    placeholder={editId ? "••••" : "Например: 1234"}
                    className="w-full h-9 px-3 pr-9 rounded-lg text-sm outline-none"
                    style={{
                      background: "var(--color-surface-2)",
                      border: "1px solid var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Section access picker */}
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Доступ к разделам</p>
                <SectionAccessPicker
                  visible={form.visible_sections}
                  editable={form.editable_sections}
                  onChangeVisible={(v) => setForm((f) => ({
                    ...f,
                    visible_sections: v,
                    editable_sections: f.editable_sections.filter((id) => v.includes(id)),
                  }))}
                  onChangeEditable={(v) => setForm((f) => ({ ...f, editable_sections: v }))}
                />
              </div>

              {formError && (
                <p className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>
                  {formError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--color-border)" }}>
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Отмена</Button>
              <Button size="sm" loading={saving} onClick={saveUser}>
                {editId ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <PinDialog
        open={deleteConfirmOpen}
        title="Удалить пользователя"
        description="Удаление пользователя требует подтверждения отдельным PIN-кодом настроек."
        confirmLabel="Удалить пользователя"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirmed={async () => {
          if (deletingId) await deleteUser(deletingId);
        }}
      />
    </div>
  );
}
