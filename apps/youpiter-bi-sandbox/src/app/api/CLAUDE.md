# src/app/api — CLAUDE.md

## Формат ответов
Всегда JSON: { ok: boolean, data?: unknown, error?: string }
Ошибки: 400 (bad request), 401 (auth), 403 (forbidden), 500 (server error)

## Auth в каждом route
import { getSessionContext } from '@/lib/auth/session'
const session = await getSessionContext() // throws SessionRequiredError if not auth

## Структура route файла
export async function GET(req: NextRequest) { ... }
export async function POST(req: NextRequest) { ... }

## Текущие routes
/api/auth/pin       — POST: PIN login
/api/auth/logout    — POST/GET: logout
/api/ai/keys        — GET/POST/DELETE: AI ключи
/api/ai/query       — POST: AI запрос
/api/health         — GET: health check

## Внешние API
Никогда не вызывать из клиентских компонентов.
Все внешние вызовы — только из API routes или server components.
Rate limit обязателен для Bitrix24 (2 req/s), taxicrm.ru (10 req/min).
