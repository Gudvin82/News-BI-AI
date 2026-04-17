"use client";

import { redirect } from "next/navigation";
import { useState, useEffect } from "react";
import { writeLog } from "@/lib/logger";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function PinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const isError = searchParams.get("error") === "invalid";

  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(isError ? "Неверный PIN-код" : "");

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Taxi BI";
  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Taxi Park";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError("");

    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const res = await fetch(`${base}/api/auth/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (data.ok) {
        writeLog("auth", "Успешный вход в систему", `Роль: ${data.role ?? "—"}`);
        router.push(nextPath.startsWith("/") ? nextPath : "/dashboard");
      } else {
        writeLog("auth", "Неудачная попытка входа", "Неверный PIN-код");
        setError(data.error ?? "Неверный PIN-код");
        setPin("");
      }
    } catch {
      setError("Ошибка сети. Повторите попытку.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #0D1117 0%, #0F1623 50%, #161B27 100%)" }}>
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="m16 8 4 4-4 4" />
              <path d="M19 12H9" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{appName}</h1>
          <p className="text-sm" style={{ color: "#94A3B8" }}>{companyName}</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ background: "#161B27", border: "1px solid #1E2D3D" }}>
          <h2 className="text-lg font-semibold text-white mb-2">Вход</h2>
          <p className="text-sm mb-6" style={{ color: "#94A3B8" }}>Введите PIN-код для доступа</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN-код"
                maxLength={32}
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-white text-center text-xl font-mono tracking-widest outline-none transition-all"
                style={{
                  background: "#0F1623",
                  border: error ? "1px solid #EF4444" : "1px solid #1E2D3D",
                  caretColor: "#F59E0B"
                }}
                onFocus={(e) => {
                  if (!error) {
                    e.target.style.borderColor = "#F59E0B";
                    e.target.style.boxShadow = "0 0 0 3px rgba(245, 158, 11, 0.15)";
                  }
                }}
                onBlur={(e) => {
                  if (!error) {
                    e.target.style.borderColor = "#1E2D3D";
                    e.target.style.boxShadow = "none";
                  }
                }}
              />
              {error && (
                <p className="mt-2 text-sm text-center" style={{ color: "#EF4444" }}>{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !pin.trim()}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                boxShadow: "0 4px 16px rgba(245, 158, 11, 0.3)"
              }}
            >
              {loading ? "Проверка..." : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function PinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-dvh flex items-center justify-center"
        style={{ background: "#0D1117" }}>
        <div className="text-white opacity-50">Загрузка...</div>
      </div>
    }>
      <PinForm />
    </Suspense>
  );
}
