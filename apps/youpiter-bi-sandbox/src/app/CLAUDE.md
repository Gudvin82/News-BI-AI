# src/app — CLAUDE.md

Next.js 15 App Router. Все страницы server components по умолчанию, "use client" только когда нужно.

## Структура
(app)/ — защищённые страницы (middleware проверяет сессию)
api/   — API routes
pin/   — страница авторизации (публичная)

## Соглашения
- page.tsx — страница
- layout.tsx — лейаут
- loading.tsx — skeleton (добавлять по мере готовности)
- error.tsx — обработка ошибок

## API routes
Всегда возвращают { ok: boolean, data?: any, error?: string }
Всегда проверяют сессию через getSessionContext() из @/lib/auth/session
Rate limit через src/lib/security/rate-limit.ts (если внешние вызовы)

## Разделы
/dashboard    — owner dashboard (сводный)
/finance      — финансы
/operations   — операционка таксопарка
/hire         — найм водителей
/cash         — касса
/workshop     — СТО
/reports      — отчёты
/settings     — настройки (ai, integrations, users)
