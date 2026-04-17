# Sanitization Report (2026-04-17)

Подготовка выполнена из локального private-source mirror.

## Удалено/исключено из showcase

- `apps/youpiter-bi-sandbox/.env.local`
- `apps/youpiter-bi-sandbox/.security-log.json`
- `apps/youpiter-bi-sandbox/.server-audit-log.json`
- `apps/youpiter-bi-sandbox/.integration-settings.json`
- `apps/youpiter-bi-sandbox/youpiter-bi-c31560bd63b4.json`
- `apps/driver-bot-sandbox/config/.env`
- `apps/driver-bot-sandbox/logs/*`
- `apps/driver-bot-sandbox/data/*`

## Редакция значений

- Bitrix production webhook заменен на placeholder
- Telegram bot token заменен на `0000000000:replace_me`
- `.env.example` приведен к безопасным demo-значениям

## Автоматическая проверка

Leak scanner:
- script: `work/tools/scan_leaks.sh`
- result: `PASSED` (последний прогон 2026-04-17)

## Остаточные риски

- В репозитории остаются имена переменных секретов (`*_TOKEN`, `*_KEY`) как часть исходного кода и документации — это нормально.
- Перед публикацией обязательно повторно запустить:
  - `work/tools/redact_showcase.sh`
  - `work/tools/scan_leaks.sh`

