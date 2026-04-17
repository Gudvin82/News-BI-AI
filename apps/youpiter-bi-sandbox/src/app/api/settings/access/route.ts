import { NextResponse } from "next/server";
import { z } from "zod";
import { appendServerAudit } from "@/lib/server/audit-log";
import { getSessionContext } from "@/lib/auth/session";
import { appendSecurityLog } from "@/lib/server/security-log";

const bodySchema = z.object({
  pin: z.string().trim().min(1).max(32),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const expectedPin = process.env.SETTINGS_PIN ?? "1111";
    const ok = body.pin === expectedPin;
    const session = await getSessionContext().catch(() => null);

    appendServerAudit({
      category: "security",
      action: ok ? "Подтверждён доступ к настройкам" : "Неудачная попытка доступа к настройкам",
      detail: ok ? "PIN настроек подтверждён" : "Введён неверный PIN для настроек",
      actorId: session?.userId,
      actorRole: session?.role,
    });

    appendSecurityLog({
      type: ok ? "settings_pin_success" : "settings_pin_failed",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      userId: session?.userId,
      userName: session?.displayName,
      role: session?.role,
      sessionId: session?.sessionId,
      detail: ok ? "PIN настроек подтверждён" : "Неверный PIN настроек",
    });

    if (!ok) {
      return NextResponse.json({ ok: false, error: "Неверный PIN-код для настроек." }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
  }
}
