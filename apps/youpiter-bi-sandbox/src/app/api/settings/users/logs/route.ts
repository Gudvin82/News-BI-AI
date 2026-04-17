import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { readSecurityLog } from "@/lib/server/security-log";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }

    const userId = new URL(req.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId обязателен." }, { status: 400 });
    }

    const all = readSecurityLog();
    const entries = all
      .filter((e) => e.userId === userId)
      .slice(0, 100)
      .map((e) => ({
        id: e.id,
        time: e.time,
        type: e.type,
        ip: e.ip ?? "—",
        detail: e.detail ?? "",
        sessionId: e.sessionId,
      }));

    return NextResponse.json({ ok: true, data: entries });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
