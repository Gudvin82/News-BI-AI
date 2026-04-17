"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Banknote,
  Car,
  Users,
  Wallet,
  Wrench,
  FileText,
  Settings,
  ChevronDown,
  ChevronRight,
  Megaphone,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavChild {
  label: string;
  href: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Главная",
    href: "/dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />
  },
  {
    label: "Финансы",
    href: "/finance",
    icon: <Banknote className="w-4 h-4" />,
    children: [
      { label: "Обзор", href: "/finance" },
      { label: "ПланФакт", href: "/finance/planfact" },
      { label: "Cashflow", href: "/finance/cashflow" },
      { label: "Долги", href: "/finance/debts" },
      { label: "Бюджет", href: "/finance/budget" }
    ]
  },
  {
    label: "Операции",
    href: "/operations",
    icon: <Car className="w-4 h-4" />,
    children: [
      { label: "Автопарк", href: "/operations/cars" },
      { label: "Водители", href: "/operations/drivers" },
      { label: "Смены", href: "/operations/shifts" },
      { label: "Выручка", href: "/operations/revenue" }
    ]
  },
  {
    label: "Найм",
    href: "/hire",
    icon: <Users className="w-4 h-4" />,
    children: [
      { label: "Сводка",             href: "/hire/funnel"   },
      { label: "Менеджеры и парки",  href: "/hire/managers" },
      { label: "Доставка",           href: "/hire/dostavka" },
      { label: "Раскат",             href: "/hire/raskat"   },
      { label: "Обучение",            href: "/hire/damir"    },
      { label: "Отчет",              href: "/hire/report"   },
    ]
  },
  {
    label: "Маркетинг",
    href: "/marketing",
    icon: <Megaphone className="w-4 h-4" />,
    children: [
      { label: "Обзор", href: "/marketing" },
      { label: "Яндекс Директ", href: "/marketing/yandex" },
      { label: "Аналитика", href: "/marketing/analytics" },
      { label: "Рейтинги", href: "/marketing/ratings" },
      { label: "ТГ Бот Найма", href: "/marketing/hire-bot" },
    ]
  },
  {
    label: "Касса",
    href: "/cash",
    icon: <Wallet className="w-4 h-4" />,
    children: [
      { label: "Дневная касса", href: "/cash/daily" },
      { label: "Реестр", href: "/cash/registry" }
    ]
  },
  {
    label: "СТО",
    href: "/workshop",
    icon: <Wrench className="w-4 h-4" />,
    children: [
      { label: "Обзор", href: "/workshop" },
      { label: "Машины", href: "/workshop/cars" },
      { label: "Расписание", href: "/workshop/schedule" },
      { label: "Затраты", href: "/workshop/costs" },
      { label: "ЗП", href: "/workshop/salary" }
    ]
  },
  {
    label: "ДТП",
    href: "/dtp",
    icon: <ShieldAlert className="w-4 h-4" />,
    children: [
      { label: "Обзор",     href: "/dtp"       },
      { label: "Все дела",  href: "/dtp/list"  },
    ]
  },
  {
    label: "Бизнес-процессы",
    href: "/bizproc",
    icon: <Workflow className="w-4 h-4" />,
  },
  {
    label: "Отчёты",
    href: "/reports",
    icon: <FileText className="w-4 h-4" />
  },
  {
    label: "Настройки",
    href: "/settings",
    icon: <Settings className="w-4 h-4" />,
    children: [
      { label: "Общие", href: "/settings/general" },
      { label: "ИИ", href: "/settings/ai" },
      { label: "Биллинг", href: "/settings/billing" },
      { label: "Интеграции", href: "/settings/integrations" },
      { label: "Уведомления", href: "/settings/notifications" },
      { label: "Пользователи и доступ", href: "/settings/users" },
      { label: "Логи и аудит", href: "/settings/logs" },
      { label: "API-ключи", href: "/settings/api-keys" },
    ]
  }
];

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
  role?: "owner" | "member";
  visibleSections?: string[];
}

/** Check if a href (/workshop/cars) is allowed by the visibleSections list */
function isAllowed(href: string, visibleSections: string[]): boolean {
  // Strip leading slash, e.g. "/workshop/cars" → "workshop/cars"
  const sectionId = href.replace(/^\//, "");
  if (!sectionId || sectionId === "dashboard") return true;
  return visibleSections.some(
    (s) => s === sectionId || sectionId.startsWith(`${s}/`) || s.startsWith(`${sectionId}/`) || sectionId === s.split("/")[0]
  );
}

export function Sidebar({ className, onNavigate, role = "owner", visibleSections = [] }: SidebarProps) {
  const pathname = usePathname();
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Taxi BI";
  const logoUrl = process.env.NEXT_PUBLIC_LOGO_URL ?? "/logo.svg";

  // For owners: show everything. For members: filter by visibleSections.
  const isOwner = role === "owner";

  function canSeeItem(item: NavItem): boolean {
    if (isOwner) return true;
    // Always show dashboard
    if (item.href === "/dashboard") return true;
    // Hide settings from members entirely
    if (item.href === "/settings") return false;
    // Show section if at least one child is visible, or the section itself is allowed
    if (item.children) {
      return item.children.some((c) => isAllowed(c.href, visibleSections));
    }
    return isAllowed(item.href, visibleSections);
  }

  function canSeeChild(child: NavChild): boolean {
    if (isOwner) return true;
    return isAllowed(child.href, visibleSections);
  }

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Auto-expand section that contains current path
    const initial: Record<string, boolean> = {};
    NAV_ITEMS.forEach((item) => {
      if (item.children) {
        const isActive = item.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
        if (isActive) initial[item.href] = true;
      }
    });
    return initial;
  });

  function toggleSection(href: string) {
    setExpanded((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  function isItemActive(href: string) {
    return pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  }

  function isChildActive(parentHref: string, childHref: string) {
    // For section overview entry (same as parent), activate only on exact page.
    if (childHref === parentHref) return pathname === childHref;
    return isItemActive(childHref);
  }

  return (
    <aside
      className={cn("sidebar", className)}
      style={{ background: "var(--color-sidebar)" }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3" onClick={onNavigate}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
          >
            <Car className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm truncate">{appName}</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_ITEMS.filter(canSeeItem).map((item) => {
          const visibleChildren = item.children?.filter(canSeeChild);
          const hasChildren = visibleChildren && visibleChildren.length > 0;
          const isOpen = expanded[item.href] ?? false;
          const isParentActive = isItemActive(item.href);
          const anyChildActive = visibleChildren?.some((c) => isItemActive(c.href)) ?? false;
          const isActive = isParentActive || anyChildActive;

          return (
            <div key={item.href} className="mb-0.5">
              {hasChildren ? (
                <>
                  <button
                    onClick={() => toggleSection(item.href)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive
                        ? "text-amber-400 bg-white/5"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    )}
                    style={isActive ? { borderLeft: "2px solid #F59E0B", marginLeft: "-2px", paddingLeft: "14px" } : {}}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="ml-3 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                      {visibleChildren!.map((child) => {
                        const childActive = isChildActive(item.href, child.href);
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavigate}
                            className={cn(
                              "block px-3 py-2 rounded-lg text-xs font-medium transition-all",
                              childActive
                                ? "text-amber-400 bg-amber-500/10"
                                : "text-slate-500 hover:text-white hover:bg-white/5"
                            )}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "text-amber-400 bg-white/5"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                  style={isActive ? { borderLeft: "2px solid #F59E0B", marginLeft: "-2px", paddingLeft: "14px" } : {}}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5">
        <p className="text-xs text-slate-600 text-center">v0.1.0</p>
      </div>
    </aside>
  );
}
