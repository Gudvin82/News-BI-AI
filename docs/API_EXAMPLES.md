# API Examples (Sanitized)

Ниже примеры запросов в формате showcase.
Все URL/токены/идентификаторы — демонстрационные.

## Bot config: read

```http
GET /api/marketing/hire-bot/config
```

Response:

```json
{
  "ok": true,
  "data": {
    "config": { "bot": {}, "scenario": {}, "parks": {}, "bitrix": {} },
    "secrets": { "tokenMasked": "123456••••••7890", "tokenExists": true }
  }
}
```

## Bot config: update

```http
PUT /api/marketing/hire-bot/config
Content-Type: application/json
```

```json
{
  "config": {
    "bot": { "username": "@demo_bot", "slug": "demo_bot" },
    "scenario": { "status": "draft", "draft": [], "published": [], "history": [], "updatedAt": "2026-01-01T00:00:00.000Z" },
    "parks": { "bitrixStringField": "UF_CRM_DEMO", "bitrixEnumField": "UF_CRM_ENUM", "items": [] },
    "bitrix": { "mode": "webhook", "webhookUrl": "https://example.bitrix24.ru/rest/1/your_webhook", "assignedById": "1", "leadStatusId": "NEW", "duplicateMode": "always_new" }
  }
}
```

## Apply config to bot runtime

```http
POST /api/marketing/hire-bot/apply
```

## Rollback

```http
POST /api/marketing/hire-bot/rollback
Content-Type: application/json
```

```json
{ "backupId": "20260417-090100" }
```

