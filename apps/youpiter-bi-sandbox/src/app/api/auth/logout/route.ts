import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getSessionCookieOptions, verifySession } from "@/lib/auth/session-cookie";
import { appendSecurityLog } from "@/lib/server/security-log";

function clearCookie(res: NextResponse) {
  const options = getSessionCookieOptions();
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    ...options,
    maxAge: 0,
  });
  return res;
}

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(`${SESSION_COOKIE_NAME}=`.length);
  const session = verifySession(value);
  if (session) {
    appendSecurityLog({
      type: "logout",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      userId: session.userId,
      userName: session.displayName,
      role: session.role,
      sessionId: session.sessionId,
      detail: "Выход из системы",
    });
  }
  const res = NextResponse.json({ ok: true });
  return clearCookie(res);
}

export async function GET(req: Request) {
  return POST(req);
}
