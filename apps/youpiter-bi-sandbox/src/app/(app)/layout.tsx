"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AiWidget } from "@/components/ai/AiWidget";
import { apiFetch } from "@/lib/utils";

interface SessionInfo {
  role: "owner" | "member";
  visibleSections: string[];
  displayName: string | null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("yb_theme") ?? "light";
    document.documentElement.setAttribute("data-theme", saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  useEffect(() => {
    apiFetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setSession(j.data); })
      .catch(() => {});
  }, []);

  const sidebarProps = session
    ? { role: session.role, visibleSections: session.visibleSections }
    : { role: "owner" as const, visibleSections: [] };

  return (
    <div className="min-h-dvh md:flex premium-shell">
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:flex" {...sidebarProps} />

      {/* Mobile sidebar overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        >
          <div className="h-dvh w-fit" onClick={(e) => e.stopPropagation()}>
            <Sidebar
              className="flex h-dvh shadow-2xl"
              onNavigate={() => setMobileNavOpen(false)}
              {...sidebarProps}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="page-enter relative min-w-0 flex-1 overflow-x-hidden px-3 pb-20 pt-4 sm:px-4 md:pb-4 lg:p-6">
        <div className="premium-orb premium-orb-a" />
        <div className="premium-orb premium-orb-b" />
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <div className="premium-stage">{children}</div>
      </main>
      <AiWidget />
    </div>
  );
}
