# Youpiter Driver Hiring Bot

Telegram-бот для найма водителей с настраиваемым сценарием квиза.

## Что реализовано

- управление списком ботов через `config/bots.json` (slug, token, описание, выбранный сценарий)
- выбор сценария для каждого бота (`scenario_slug`)
- цепочка приветственных сообщений с задержкой в секундах
- вопросы трех типов:
  - произвольный текст
  - выбор одного варианта
  - выбор нескольких вариантов + кнопка `Далее`
- сортировка вариантов ответов через поле `order`
- контактная анкета лида:
  - имя
  - телефон
  - email
- текст после отправки анкеты
- сохранение лидов в SQLite (`data/leads.sqlite3`)
- интеграция с Bitrix24:
  - через inbound webhook
  - дедупликация по телефону/email и обновление существующего лида
- лиды создаются/обновляются с пометкой `Бот ТГ`
- напоминание кандидату через 30 минут, если анкета не завершена
- настройка описания/команд бота (`scripts/setup_bot_profile.py`)

## Важно по аватарке

Telegram Bot API не позволяет менять аватар бота напрямую.
Аватар задается через `@BotFather` командой `/setuserpic`.

## Локальный запуск

```bash
cd /Users/macbook/Documents/New\ project/youpiter-driver-bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp config/.env.example config/.env
python scripts/setup_bot_profile.py
python main.py
```

## Настройка сценария

- Основной сценарий: `config/scenarios/driver_hiring_default.json`
- Привязка сценария к боту: поле `scenario_slug` в `config/bots.json`

## Деплой (systemd)

Пример сервиса: `youpiter-driver-bot.service`.

```bash
sudo cp youpiter-driver-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable youpiter-driver-bot
sudo systemctl restart youpiter-driver-bot
sudo systemctl status youpiter-driver-bot
```
