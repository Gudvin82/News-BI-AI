import { NextRequest, NextResponse } from "next/server";

const FLEET_BASE = "https://fleet-api.taxi.yandex.net";

/**
 * Server-side proxy to test Yandex Fleet credentials.
 * Fleet API does not support CORS, so we call it from the server.
 * GET /api/fleet/test
 * Headers: x-fleet-park-id, x-fleet-client-id, x-fleet-api-key
 */
export async function GET(req: NextRequest) {
  const parkId   = req.headers.get("x-fleet-park-id");
  const clientId = req.headers.get("x-fleet-client-id");
  const apiKey   = req.headers.get("x-fleet-api-key");

  if (!parkId || !clientId || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "Укажите Park ID, Client ID и API-ключ." },
      { status: 400 }
    );
  }

  try {
    const r = await fetch(`${FLEET_BASE}/v2/parks`, {
      method: "GET",
      headers: {
        "X-Park-ID":   parkId,
        "X-Client-ID": clientId,
        "X-API-Key":   apiKey,
        "Accept-Language": "ru",
      },
      cache: "no-store",
    });

    const body = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg = body?.message ?? body?.error?.message ?? `HTTP ${r.status}`;
      return NextResponse.json({ ok: false, error: msg }, { status: r.status });
    }

    // v2/parks returns { parks: [{ id, name, ... }] }
    const parkName = body?.parks?.[0]?.name ?? "Парк подключён";
    return NextResponse.json({ ok: true, data: { name: parkName, total: body?.parks?.length ?? 0 } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка соединения" },
      { status: 502 }
    );
  }
}
