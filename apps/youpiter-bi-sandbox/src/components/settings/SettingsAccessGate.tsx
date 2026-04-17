"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/utils";
import { grantSettingsAccess, hasSettingsAccess, revokeSettingsAccess } from "@/lib/settings-client";

export function SettingsAccessGate({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAllowed(hasSettingsAccess());
  }, []);

  async function unlock() {
    if (!pin.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/settings/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Неверный PIN-код.");
        return;
      }
      grantSettingsAccess();
      setAllowed(true);
      setPin("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось проверить PIN.");
    } finally {
      setLoading(false);
    }
  }

  function lockAgain() {
    revokeSettingsAccess();
    setAllowed(false);
    setPin("");
  }

  if (!allowed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl p-6 space-y-5"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <div className="text-center space-y-2">
            <div
              className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--color-brand-soft)", color: "var(--color-brand)" }}
            >
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>Защищённые настройки</h1>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Для доступа к разделу `Настройки` введите отдельный PIN-код.
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Введите PIN-код"
              className="w-full h-11 px-4 rounded-xl text-sm outline-none"
              style={{
                background: "var(--color-surface-2)",
                border: `1px solid ${error ? "#EF4444" : "var(--color-border)"}`,
                color: "var(--color-text)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
            />
            {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}
          </div>

          <Button onClick={unlock} loading={loading} disabled={!pin.trim()}>
            Войти в настройки
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Доступ к настройкам открыт</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            Опасные действия дополнительно потребуют повторного ввода PIN-кода.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={lockAgain}>Закрыть доступ</Button>
      </div>
      {children}
    </div>
  );
}
