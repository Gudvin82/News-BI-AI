# supabase/migrations — CLAUDE.md

## Правила
1. Только новые файлы: 002_*.sql, 003_*.sql и т.д.
2. НЕЛЬЗЯ редактировать существующие миграции
3. Каждая миграция идемпотентна: IF NOT EXISTS, ON CONFLICT DO NOTHING
4. Откат: каждая миграция должна иметь комментарий как откатить

## Применение
npm run db:migrate
# или вручную: psql $DATABASE_URL -f supabase/migrations/001_initial_schema.sql

## Схема
Основные таблицы: parks, cars, drivers, shifts, cash_movements, hire_leads, workshop_events
Агрегаты: daily_park_stats
Техн: ai_keys, audit_log, stg_bitrix_leads, sync_log, tenant_settings
