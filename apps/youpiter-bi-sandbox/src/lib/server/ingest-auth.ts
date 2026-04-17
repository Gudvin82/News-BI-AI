import { NextResponse } from "next/server";
import { verifyApiKey, logIngest, type ApiKey } from "@/lib/server/api-keys";

export async function requireApiKey(
  req: Request,
  requiredPermission: string
): Promise<{ key: ApiKey } | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const xApiKey = req.headers.get("x-api-key") ?? "";

  // Accept: "Authorization: Bearer yk_live_xxx" OR "X-API-Key: yk_live_xxx"
  const raw = xApiKey || authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!raw) {
    return NextResponse.json(
      { ok: false, error: "Требуется API-ключ. Укажите заголовок X-API-Key или Authorization: Bearer <key>." },
      { status: 401 }
    );
  }

  const key = await verifyApiKey(raw);
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Неверный или отозванный API-ключ." },
      { status: 401 }
    );
  }

  if (!key.permissions.includes(requiredPermission)) {
    return NextResponse.json(
      { ok: false, error: `Ключ не имеет разрешения «${requiredPermission}».` },
      { status: 403 }
    );
  }

  return { key };
}

export { logIngest };
