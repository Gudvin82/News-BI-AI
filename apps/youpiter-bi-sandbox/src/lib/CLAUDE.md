# src/lib — CLAUDE.md

## Структура
auth/         — сессии, PIN-верификация
ai/           — провайдеры AI, вызовы API
config/       — tenant конфиг (белая метка)
db/           — Postgres клиент, запросы
utils.ts      — cn() и мелкие утилиты

## Ключевые файлы
config/tenant.ts    — ВСЕ клиентские настройки здесь, не хардкодить
auth/session-cookie.ts — session sign/verify
db/client.ts        — pg Pool
ai/providers.ts     — список провайдеров

## Правила
- Нет бизнес-логики в компонентах — только в lib/ и api/
- Tenant-специфичные данные (имена, цвета) — только через tenantConfig
- Секреты — только через process.env, никогда в коде
