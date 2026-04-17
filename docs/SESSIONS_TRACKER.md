# Sessions Tracker

## Сессия 1 — Перенос с сервера на Mac
Задачи:
- Снять исходники с сервера без build-мусора (`node_modules`, `.next`).
- Развернуть локальную private-копию.
- Не публиковать ничего до санитизации.

Статус: `done`

Сделано:
- Исходники `youpiter-bi` и `youpiter-driver-bot` скопированы на Mac.
- Рабочая private-зона создана: `work/private-source`.

## Сессия 2 — Санитизация и контроль утечек
Задачи:
- Удалить/заменить секреты, ключи, webhook/token, runtime-логи.
- Подготовить автоматические скрипты redaction + leak scan.

Статус: `done`

Сделано:
- Скрипт санитизации: `work/tools/redact_showcase.sh`.
- Скрипт проверки утечек: `work/tools/scan_leaks.sh`.
- Прогон leak-сканера завершен успешно (`PASSED`).

## Сессия 3 — Сборка showcase-репозитория
Задачи:
- Подготовить публичную структуру репозитория.
- README, архитектура, API-примеры, legal.
- Сформировать publish-checklist.

Статус: `done`

Сделано:
- Создан `showcase-repo`.
- Добавлены: `README.md`, `LICENSE`, `docs/ARCHITECTURE.md`, `docs/API_EXAMPLES.md`, `docs/LEGAL.md`, `docs/PUBLISH_CHECKLIST.md`, `docs/SANITIZATION_REPORT.md`.
- Добавлены: `docs/QUICK_START.md` и `mock-data/*` (безопасные демо-данные).

## Сессия 4 — GitHub публикация showcase
Задачи:
- Инициализировать git в `showcase-repo`.
- Первый clean commit.
- Публикация в публичный GitHub (только showcase).
- Проверка, что full-source остается приватным.

Статус: `done`

Сделано:
- Инициализирован git в `showcase-repo`.
- Выполнен clean initial commit.
- Выполнен push в публичный репозиторий `Gudvin82/News-BI-AI`.
- Проверен состав корня репозитория (только showcase-структура).

## Сессия 5 — Финальная упаковка для работодателя/партнера
Задачи:
- Скриншоты и narrative-подача.
- Краткое value-презентейшн в README.
- Проверка “клонируется и запускается” в demo-режиме.

Статус: `done (без скриншотов)`

Сделано:
- Усилен README блоком “Для быстрого просмотра (5 минут)”.
- Подготовлен готовый текст для отправки партнёру/работодателю: `docs/SHARE_TEXT.md`.
- Showcase структура и quick-start готовы для передачи.
