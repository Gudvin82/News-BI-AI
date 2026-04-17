import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { Brain, Link2, Users, CreditCard, ScrollText, SlidersHorizontal, BellRing } from "lucide-react";

const SETTINGS_SECTIONS = [
  {
    href: "/settings/general",
    icon: <SlidersHorizontal className="w-5 h-5" />,
    title: "Общие настройки",
    description: "Тема оформления, сброс данных и интеграций"
  },
  {
    href: "/settings/ai",
    icon: <Brain className="w-5 h-5" />,
    title: "ИИ и API-ключи",
    description: "Настройка AI-провайдеров для аналитики и подсказок"
  },
  {
    href: "/settings/billing",
    icon: <CreditCard className="w-5 h-5" />,
    title: "Биллинг",
    description: "Баланс API-ключа и история расходов"
  },
  {
    href: "/settings/integrations",
    icon: <Link2 className="w-5 h-5" />,
    title: "Интеграции",
    description: "Bitrix24, taxicrm.ru, Google Sheets, 1С, банк, VK"
  },
  {
    href: "/settings/notifications",
    icon: <BellRing className="w-5 h-5" />,
    title: "Уведомления",
    description: "Bitrix чат, Telegram, email, время отправки и состав отчётов"
  },
  {
    href: "/settings/users",
    icon: <Users className="w-5 h-5" />,
    title: "Пользователи и доступ",
    description: "Сотрудники, роли, матрица прав, активные сессии и история входов"
  },
  {
    href: "/settings/logs",
    icon: <ScrollText className="w-5 h-5" />,
    title: "Логи и аудит",
    description: "Локальные логи браузера и серверный аудит критичных действий"
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>Настройки</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>Конфигурация системы</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-mono" style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          color: "var(--color-muted)"
        }}>
          v1.2
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SETTINGS_SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--color-brand-soft)", color: "var(--color-brand)" }}
                >
                  {s.icon}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "var(--color-text)" }}>{s.title}</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>{s.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
