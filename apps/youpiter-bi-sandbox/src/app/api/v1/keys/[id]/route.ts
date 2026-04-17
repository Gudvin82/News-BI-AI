import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { revokeApiKey, deleteApiKey } from "@/lib/server/api-keys";

export const dynamic = "force-dynamic";

// PATCH /api/v1/keys/[id] — revoke (soft delete)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Нет доступа." }, { status: 403 });
    }
    const { id } = await params;
    await revokeApiKey(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}

// DELETE /api/v1/keys/[id] — permanently delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Нет доступа." }, { status: 403 });
    }
    const { id } = await params;
    await deleteApiKey(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
