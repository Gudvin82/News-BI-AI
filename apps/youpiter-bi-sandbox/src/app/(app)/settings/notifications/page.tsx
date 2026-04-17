"use client";

import { BellRing, Clock3, Mail, MessageCircle, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/utils";
import { defaultNotificationsSettings, readNotificationsSettings, saveNotificationsSettings, type NotificationChannelConfig, type NotificationSettingsData } from "@/lib/settings-client";
import { writeLog } from "@/lib/logger";
import { writeServerAudit } from "@/lib/audit-client";

const REPORT_OPTIONS = [
  "Ежедневная сводка собственника",
  "Финансы и cashflow",
  "Найм и первая смена",
  "ДТП и юристы",
  "СТО и затраты",
  "Алерты и ошибки интеграций",
];

const CHANNELS: Array<{ id: keyof NotificationSettingsData; title: string; icon: React.ReactNode; hint: string }> = [
  { id: "bitrix", title: "Bitrix чат", icon: <MessageCircle className="w-4 h-4" />, hint: "Например: чат руководителей или оперативный канал." },
  { id: "telegram", title: "Telegram", icon: <Send className="w-4 h-4" />, hint: "Например: @username, chat_id или бот-канал." },
  { id: "email", title: "Email", icon: <Mail className="w-4 h-4" />, hint: "Например: owner@company.ru или группа рассылки." },
];

export default function NotificationsPage() {
  const [settings, setSettings] = useState<NotificationSettingsData>(defaultNotificationsSettings());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<keyof NotificationSettingsData | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  useEffect(() => {
    setSettings(readNotificationsSettings());
  }, []);

  function updateChannel(channel: keyof NotificationSettingsData, patch: Partial<NotificationChannelConfig>) {
    setSettings((prev) => ({ ...prev, [channel]: { ...prev[channel], ...patch } }));
  }

  function saveAll() {
    saveNotificationsSettings(settings);
    writeLog("settings", "Настройки уведомлений сохранены");
    void writeServerAudit("settings", "Сохранены настройки уведомлений");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testChannel(channel: keyof NotificationSettingsData) {
    setTesting(channel);
    setTestResults((prev) => ({ ...prev, [channel]: { ok: false, text: "" } }));
    try {
      const res = await apiFetch("/api/settings/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, config: settings[channel] }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Ошибка отправки");
      setTestResults((prev) => ({ ...prev, [channel]: { ok: true, text: data.message ?? "Тест отправлен" } }));
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [channel]: { ok: false, text: e instanceof Error ? e.message : "Ошибка отправки" } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Уведомления</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Настройка каналов доставки, времени отправки и состава отчётов.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={saveAll}>
            <BellRing className="w-3.5 h-3.5" />
            Сохранить
          </Button>
          {saved && <span className="text-xs font-medium" style={{ color: "#10B981" }}>Сохранено</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {CHANNELS.map((channel) => {
          const current = settings[channel.id];
          return (
            <Card key={channel.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--color-brand)" }}>{channel.icon}</span>
                    <p className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>{channel.title}</p>
                  </div>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>{channel.hint}</p>
                </div>
                <button
                  onClick={() => updateChannel(channel.id, { enabled: !current.enabled })}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{
                    background: current.enabled ? "#DCFCE7" : "var(--color-surface-2)",
                    border: `1px solid ${current.enabled ? "#86EFAC" : "var(--color-border)"}`,
                    color: current.enabled ? "#166534" : "var(--color-muted)",
                  }}
                >
                  {current.enabled ? "Включено" : "Выключено"}
                </button>
              </div>

              <label className="space-y-1.5 block">
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>Куда слать</span>
                <input value={current.destination} onChange={(e) => updateChannel(channel.id, { destination: e.target.value })} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>Периодичность</span>
                  <select value={current.frequency} onChange={(e) => updateChannel(channel.id, { frequency: e.target.value as NotificationChannelConfig["frequency"] })} className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                    <option value="daily">Ежедневно</option>
                    <option value="weekly">Еженедельно</option>
                    <option value="monthly">Ежемесячно</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>Время отправки</span>
                  <div className="relative">
                    <Clock3 className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-muted)" }} />
                    <input type="time" value={current.time} onChange={(e) => updateChannel(channel.id, { time: e.target.value })} className="w-full h-9 pl-8 pr-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                  </div>
                </label>
              </div>

              {channel.id === "bitrix" && (
                <label className="space-y-1.5 block">
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>Webhook Bitrix24</span>
                  <input value={current.webhook ?? ""} onChange={(e) => updateChannel(channel.id, { webhook: e.target.value })} placeholder="Можно оставить пустым — возьмётся из интеграции Bitrix24" className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                </label>
              )}

              {channel.id === "telegram" && (
                <label className="space-y-1.5 block">
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>Telegram Bot Token</span>
                  <input value={current.token ?? ""} onChange={(e) => updateChannel(channel.id, { token: e.target.value })} placeholder="1234567890:AAF..." type="password" className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                </label>
              )}

              {channel.id === "email" && (
                <div className="grid grid-cols-1 gap-3">
                  <label className="space-y-1.5 block">
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>Email API key</span>
                    <input value={current.token ?? ""} onChange={(e) => updateChannel(channel.id, { token: e.target.value })} placeholder="Например, Resend API key" type="password" className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                  </label>
                  <label className="space-y-1.5 block">
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>Email отправителя</span>
                    <input value={current.sender ?? ""} onChange={(e) => updateChannel(channel.id, { sender: e.target.value })} placeholder="reports@your-domain.ru" className="w-full h-9 px-3 rounded-lg text-sm outline-none" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }} />
                  </label>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>Какие отчёты отправлять</span>
                <div className="flex flex-wrap gap-2">
                  {REPORT_OPTIONS.map((report) => {
                    const active = current.reports.includes(report);
                    return (
                      <button
                        key={report}
                        onClick={() => updateChannel(channel.id, {
                          reports: active
                            ? current.reports.filter((r) => r !== report)
                            : [...current.reports, report],
                        })}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                          background: active ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                          border: `1px solid ${active ? "var(--color-brand)" : "var(--color-border)"}`,
                          color: active ? "var(--color-brand)" : "var(--color-muted)",
                        }}
                      >
                        {report}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap pt-2" style={{ borderTop: "1px solid var(--color-border)" }}>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Канал уже живой: можно отправить тестовое сообщение прямо сейчас.
                </p>
                <Button size="sm" variant="secondary" onClick={() => void testChannel(channel.id)} loading={testing === channel.id}>
                  <Send className="w-3.5 h-3.5" />
                  Тест отправки
                </Button>
              </div>
              {testResults[channel.id]?.text && (
                <p className="text-xs" style={{ color: testResults[channel.id]?.ok ? "#10B981" : "#EF4444" }}>
                  {testResults[channel.id]?.text}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
