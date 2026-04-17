"use client";

import { useState, useEffect } from "react";
import { Sun, Moon, Menu, LogOut } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const [isDark, setIsDark] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Taxi Park";

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("yb_theme");
    const dark = saved === "dark";
    setIsDark(dark);
    applyTheme(dark);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTheme(dark: boolean) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    // Tailwind dark: classes require the "dark" class on <html>
    document.documentElement.classList.toggle("dark", dark);
  }

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    applyTheme(next);
    localStorage.setItem("yb_theme", next ? "dark" : "light");
  }

  async function handleLogout() {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    await fetch(`${base}/api/auth/logout`, { method: "POST" });
    window.location.href = `${base}/pin`;
  }

  const dateStr = now
    ? format(now, "d MMMM yyyy, HH:mm", { locale: ru })
    : "";

  return (
    <header
      className="flex items-center justify-between px-4 py-3 mb-4 rounded-xl"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)"
      }}
    >
      {/* Left: mobile menu + company */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
          style={{ color: "var(--color-muted)" }}
          aria-label="Открыть меню"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{companyName}</p>
          {dateStr && (
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>{dateStr}</p>
          )}
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-2"
          style={{ color: "var(--color-muted)" }}
          aria-label="Переключить тему"
          title={isDark ? "Светлая тема" : "Тёмная тема"}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
          style={{ color: "var(--color-muted)" }}
          aria-label="Выйти"
          title="Выйти"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
