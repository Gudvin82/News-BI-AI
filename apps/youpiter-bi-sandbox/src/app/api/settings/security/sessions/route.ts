import { NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { getActiveSessions, readSecurityLog } from "@/lib/server/security-log";

export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }

    const entries = readSecurityLog();
    const activeSessions = getActiveSessions(entries).map((entry) => ({
      sessionId: entry.sessionId,
      userName: entry.userName ?? "Неизвестный пользователь",
      role: entry.role ?? "member",
      ip: entry.ip ?? "unknown",
      startedAt: entry.time,
      current: entry.sessionId === session.sessionId,
      detail: entry.detail,
    }));

    const loginHistory = entries
      .filter((entry) => entry.type === "login_success" || entry.type === "login_failed" || entry.type === "logout")
      .slice(0, 50)
      .map((entry) => ({
        id: entry.id,
        time: entry.time,
        type: entry.type,
        userName: entry.userName ?? (entry.type === "login_failed" ? "Неизвестно" : "Владелец"),
        role: entry.role ?? "—",
        ip: entry.ip ?? "unknown",
        detail: entry.detail ?? "",
      }));

    return NextResponse.json({
      ok: true,
      data: {
        activeSessions,
        loginHistory,
        stats: {
          activeCount: activeSessions.length,
          failedCount24h: loginHistory.filter((entry) => entry.type === "login_failed" && Date.now() - Date.parse(entry.time) < 24 * 60 * 60 * 1000).length,
          successCount24h: loginHistory.filter((entry) => entry.type === "login_success" && Date.now() - Date.parse(entry.time) < 24 * 60 * 60 * 1000).length,
        },
      },
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    console.error("[security sessions GET]", e);
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
