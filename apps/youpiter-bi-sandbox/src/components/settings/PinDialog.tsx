"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/utils";

interface PinDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
}

export function PinDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  onClose,
  onConfirmed,
}: PinDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleConfirm() {
    if (!pin.trim()) {
      setError("Введите PIN-код.");
      return;
    }
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
      await onConfirmed();
      setPin("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка проверки PIN-кода.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-5 space-y-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>{title}</h3>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>{description}</p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium" style={{ color: "var(--color-muted)" }}>
            PIN-код настроек
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Введите PIN-код"
            className="w-full h-10 px-3 rounded-lg text-sm outline-none"
            style={{
              background: "var(--color-surface-2)",
              border: `1px solid ${error ? "#EF4444" : "var(--color-border)"}`,
              color: "var(--color-text)",
            }}
          />
          {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
