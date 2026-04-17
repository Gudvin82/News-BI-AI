# Architecture (Showcase)

## 1) Web Application Layer

`apps/youpiter-bi-sandbox`

- Next.js App Router
- Domain pages: Dashboard, Hire, Marketing, Finance, Bizproc, Settings
- API routes for integrations and derived metrics
- UI: modular cards, filters, drill-down modals, export flows

## 2) Bot Layer

`apps/driver-bot-sandbox`

- Telegram bot (driver hiring funnel)
- Config-driven behavior:
  - greetings
  - quick buttons
  - scenario steps
  - park mapping
- Bidirectional flow with CRM in production model (sanitized here)

## 3) Integration Layer

- Bitrix24 webhook interface (sanitized endpoints)
- Google Sheets ingestion (preview + mapping model)
- Yandex Direct reporting connector (token-based auth model)

## 4) Security Layer (Showcase-safe)

- Environment-based secrets (no real keys in repo)
- Session/PIN gates (demo values only)
- Audit/security logs excluded from public package
- Pre-publish leak scan script

## 5) Operational Flow

1. Admin updates config in BI UI
2. Config is validated and stored
3. Runtime apply/rollback workflow for bot
4. Metrics and logs exposed via API routes for UI

## 6) What is intentionally hidden

- Production infra credentials
- Full private business logic and operational automations
- Real data and personal information

