# YouPiter BI — CLAUDE.md

## Продукт
Вертикальный self-hosted BI-дашборд для таксопарка.
Белая метка: имя, логотип, цвета — только через конфиг/env, никогда хардкодом.
Текущий клиент: YouPiter Taxi (СПБ, 450 авто, 6 парков).

**Сервер:** 188.225.39.156, порт 3001, PM2 процесс `youpiter-bi`
**Деплой:** /opt/youpiter-bi, запуск: npm start
**DB:** Postgres (своя схема), Supabase-клиент или pg напрямую
**Redis:** порт 6379 (shared с GudWin BI, разные ключи)
**GudWin BI (донор):** /opt/gudwin-bi (порт 3000) — смотреть паттерны, не ломать

## Стек
Next.js 15, App Router, TypeScript, Tailwind 3, Zod, recharts, lucide-react, date-fns, pg, Redis

## Источники данных
| Источник | Назначение | Статус |
|----------|-----------|--------|
| Bitrix24 | Найм водителей (лиды, воронка) | Legacy: iframe bitrix-jupiter |
| taxicrm.ru | Смены, выручка, машины, водители | Планируется |
| 1С | Касса, бухгалтерия, платежи | Планируется |
| Google Sheets | Планы, ручные финансы | Планируется |

## Ключевые сущности (DB)
parks, cars, drivers, shifts, cash_movements, hire_leads, workshop_events, daily_park_stats, ai_keys, audit_log

## Разделы и маршруты
/ → /dashboard (redirect)
/dashboard — сводный дашборд собственника
/finance — финансы (cashflow, debts, budget)
/operations — операционка (cars, drivers, shifts, revenue)
/hire — найм водителей (funnel, managers, first-shift) — этап 1: iframe bitrix-jupiter
/cash — кассовые операции (daily, registry)
/workshop — СТО (cars, schedule, costs)
/reports — отчёты
/settings — настройки (ai, integrations, users)
/pin — авторизация

## Роли (Phase 1: упрощённые)
owner — полный доступ
member — базовый доступ
(RBAC по ролям планируется: finance, hire, operations, cashier, sto)

## Дизайн-токены
Цвета в CSS-переменных, Tailwind extends. Главный цвет: --color-brand: #F59E0B (amber).
Тёмная тема: data-theme="dark" на <html>. Сайдбар всегда тёмный.
Шрифт: Inter.
Замена темы клиента: только через CSS-переменные + NEXT_PUBLIC_PRIMARY_COLOR.

## Белая метка (white-label правила)
НЕЛЬЗЯ в коде: строки "YouPiter", "Юпитер", конкретные имена менеджеров, адреса парков.
МОЖНО: tenantConfig из src/lib/config/tenant.ts, env vars NEXT_PUBLIC_*.
Парки, менеджеры — только в БД (таблица parks) или .env.
При клонировании для нового клиента: поменять .env + seed в БД.

## Auth
PIN-вход. Env: YB_PORTAL_PIN_ENABLED=true/false. Cookie: yb_session.
Логика в src/lib/auth/session-cookie.ts + src/middleware.ts.
По умолчанию PIN выключен (YB_PORTAL_PIN_ENABLED=false).

## AI
Провайдеры: aitunnel (приоритет для РФ-серверов), deepseek, groq, openai.
Ключи хранятся в таблице ai_keys (зашифровано).
Логика: src/lib/ai/providers.ts + src/app/api/ai/.

## Найм — этапы интеграции
Этап 1 (сейчас): iframe с bitrix-jupiter в /hire, URL из NEXT_PUBLIC_TENANT_HIRE_LEGACY_URL
Этап 2: нативный модуль /hire/funnel, /hire/managers параллельно с iframe
Этап 3: отключить iframe после 2 недель стабильной работы нативного модуля

## Команды
npm run dev          # dev сервер порт 3001
npm run build        # сборка
npm run start        # production
npm run db:migrate   # миграции
npm run typecheck    # ts проверка

Деплой:
scp -r . root@188.225.39.156:/opt/youpiter-bi/
ssh root@188.225.39.156 'cd /opt/youpiter-bi && npm install && npm run build && pm2 restart youpiter-bi'

## Как работать с Claude

### Формулируй задачу так:
"В файле src/app/(app)/finance/page.tsx добавь..."
"В src/lib/db/client.ts напиши запрос для..."
"Прочитай src/components/ui/MetricCard.tsx и добавь prop..."

### Порядок работы с новой фичей:
1. Схема данных (Zod + SQL миграция)
2. API route в src/app/api/
3. UI компонент
4. Страница

### НЕ трогать без явного запроса:
src/middleware.ts (auth)
src/lib/auth/ (сессии)
supabase/migrations/ (только новые файлы, не редактировать существующие)
.env (секреты)

### GudWin BI как донор:
Можно смотреть /Users/macbook/Documents/New project/gudwin-bi/ для паттернов.
Нельзя импортировать оттуда напрямую — проекты независимы.
