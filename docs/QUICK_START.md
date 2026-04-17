# Quick Start (Sandbox Demo)

## 1) BI sandbox (Next.js)

Папка:
- `apps/youpiter-bi-sandbox`

Шаги:
1. `cd apps/youpiter-bi-sandbox`
2. `cp .env.example .env.local`
3. Заполните `.env.local` demo-значениями (без production секретов)
4. `npm install`
5. `npm run dev`

Примечания:
- Это showcase-режим, часть интеграций может быть mock/disabled.
- Для презентации достаточно базовых страниц и UI-флоу.

## 2) Driver bot sandbox (Python)

Папка:
- `apps/driver-bot-sandbox`

Шаги:
1. `cd apps/driver-bot-sandbox`
2. `cp config/.env.example config/.env`
3. Вставьте demo токен/URL (не production)
4. `python3 -m venv .venv && source .venv/bin/activate`
5. `pip install -r requirements.txt`
6. `python3 main.py`

Примечания:
- В showcase важнее показать конфигурируемость сценария/кнопок, чем работу на реальных данных.

## 3) Safety check перед публикацией

Из корня рабочего пакета:

```bash
/Users/macbook/Documents/New\ project/youpiter_showcase_prep/work/tools/redact_showcase.sh
/Users/macbook/Documents/New\ project/youpiter_showcase_prep/work/tools/scan_leaks.sh
```

