import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { appendServerAudit, readServerAudit, type ServerAuditCategory } from "@/lib/server/audit-log";

const postSchema = z.object({
  category: z.enum(["settings", "integration", "security", "ai", "logs", "user"]),
  action: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(1000).optional(),
});

export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }
    return NextResponse.json({ ok: true, data: readServerAudit() });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionContext();
    const body = postSchema.parse(await req.json());
    appendServerAudit({
      category: body.category as ServerAuditCategory,
      action: body.action,
      detail: body.detail,
      actorId: session.userId,
      actorRole: session.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.errors[0]?.message ?? "Ошибка валидации." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
