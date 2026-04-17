import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import {
  createApiKey,
  listApiKeys,
  ALL_PERMISSIONS,
} from "@/lib/server/api-keys";

export const dynamic = "force-dynamic";

// GET /api/v1/keys — list all keys (owner only)
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Нет доступа." }, { status: 403 });
    }
    const keys = await listApiKeys();
    return NextResponse.json({ ok: true, data: keys });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}

// POST /api/v1/keys — create a new key
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Нет доступа." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Укажите название ключа." }, { status: 400 });
    }

    const permissions: string[] = Array.isArray(body?.permissions)
      ? body.permissions
          .map((p: unknown) => String(p))
          .filter((p: string) => (ALL_PERMISSIONS as readonly string[]).includes(p))
      : [...ALL_PERMISSIONS];

    if (!permissions.length) {
      return NextResponse.json({ ok: false, error: "Выберите хотя бы одно разрешение." }, { status: 400 });
    }

    const note = body?.note ? String(body.note).trim() : undefined;
    const { rawKey, record } = await createApiKey(name, permissions, note);

    return NextResponse.json({
      ok: true,
      data: {
        ...record,
        raw_key: rawKey, // shown ONCE — client must save it
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
