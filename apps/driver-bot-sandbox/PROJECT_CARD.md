# Youpiter Driver Bot — Карточка проекта

## Назначение
Telegram-бот для найма водителей в Youpiter Taxi (СПб) с передачей анкет в Bitrix24 и двухсторонней связью менеджер ↔ кандидат.

## Прод-среда
- Сервер: `188.225.39.156`
- Путь проекта: `/opt/youpiter-driver-bot`
- Сервис: `youpiter-driver-bot.service`
- Запуск: `systemd` + `python` (`/opt/youpiter-driver-bot/.venv/bin/python main.py`)

## Бот
- Username: `@Youpiter_quiz_bot`
- Сценарий: `driver_hiring_default`
- Язык: русский

## Основной функционал
- пошаговая анкета кандидата (кнопки + текст)
- быстрые кнопки меню: старт анкеты, условия, адреса, сайт, звонок, текущая заявка, поторопить менеджера
- антиспам: не создает новую заявку, если есть активная
- сохранение последней заявки пользователя
- уведомление кандидату при закрытии заявки в Bitrix
- фото от кандидата прикрепляются в лид Bitrix
- сообщения кандидата уходят в таймлайн лида
- сообщения/вложения менеджера из таймлайна приходят кандидату в Telegram

## Интеграция с Bitrix24
- Режим: inbound webhook
- Базовые методы: `crm.lead.add`, `crm.lead.get`, `crm.lead.update`, `crm.timeline.comment.add`, `crm.timeline.comment.list`, `crm.duplicate.findbycomm`
- Маркер источника: Бот ТГ
- Название лида: `Бот ТГ | Кандидат. <Парк>` (если парк распознан)

## Данные и хранение
- SQLite: `/opt/youpiter-driver-bot/data/leads.sqlite3`
- Основные таблицы:
  - `leads` — отправленные анкеты
  - `users` — согласие, последний лид, счетчик повторных обращений
  - `bridge_state` — курсор сообщений таймлайна и статусные флаги

## Конфиг
- Файл окружения: `/opt/youpiter-driver-bot/config/.env`
- Ключевые переменные:
  - `BOT_SLUG`
  - `TELEGRAM_BOT_TOKEN`
  - `BITRIX_MODE`
  - `BITRIX_WEBHOOK_URL`
  - `BITRIX_ASSIGNED_BY_ID`

## Операционные команды
```bash
# статус
systemctl status youpiter-driver-bot.service

# перезапуск
systemctl restart youpiter-driver-bot.service

# логи
journalctl -u youpiter-driver-bot.service -n 200 --no-pager
```

## Безопасность (текущее состояние)
- доступ к `.env` и SQLite ограничен правами `600`
- в репозитории токены не хранятся (бот берет токен из `.env`)

## Рекомендованные следующие шаги
1. Перевести сервис с `root` на отдельного системного пользователя (например `youpiterbot`).
2. Добавить webhook-подпись/проверку для входящих команд от менеджеров (если будет внешний endpoint).
3. Добавить мониторинг ошибок (Sentry/alerting) и health-check.
4. Ввести rate-limit на входящие сообщения кандидата (anti-flood).
