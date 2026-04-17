import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { SESSION_COOKIE_NAME, getSessionCookieOptions, signSession } from "@/lib/auth/session-cookie";
import { queryOne } from "@/lib/db/client";
import { appendSecurityLog } from "@/lib/server/security-log";
import { ensurePortalUsersAccessColumns } from "@/lib/server/portal-users";

const bodySchema = z.object({
  pin: z.string().trim().min(1).max(32)
});

const pinAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = pinAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    pinAttempts.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

function clearAttempts(ip: string) {
  pinAttempts.delete(ip);
}

function verifyPortalPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const computed = crypto.pbkdf2Sync(pin, salt, 10_000, 32, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

interface PortalUserRow {
  id: string;
  allowed_sections: string[];
  visible_sections?: string[];
  editable_sections?: string[];
  is_active: boolean;
  name?: string;
}

function createSessionId() {
  return crypto.randomBytes(8).toString("hex");
}

const SECTION_LABELS: Record<string, string> = {
  dashboard: "Главная", finance: "Финансы", operations: "Операции",
  hire: "Найм", dtp: "ДТП", bizproc: "Бизнес-процессы",
  cash: "Касса", workshop: "СТО", marketing: "Маркетинг", reports: "Отчёты",
};

function formatSections(ids: string[]): string {
  const parents = ids.filter((id) => !id.includes("/"));
  const names = parents.map((id) => SECTION_LABELS[id] ?? id);
  if (names.length === 0) return "нет";
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

function parseUA(ua: string | null): string {
  if (!ua) return "";
  const browser = ua.includes("Firefox") ? "Firefox"
    : ua.includes("Edg/") ? "Edge"
    : ua.includes("Chrome") ? "Chrome"
    : ua.includes("Safari") ? "Safari"
    : "Браузер";
  const os = ua.includes("Windows") ? "Windows"
    : ua.includes("Macintosh") ? "macOS"
    : ua.includes("iPhone") ? "iPhone"
    : ua.includes("Android") ? "Android"
    : ua.includes("Linux") ? "Linux"
    : "";
  return os ? `${browser} / ${os}` : browser;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const device = parseUA(req.headers.get("user-agent"));

  if (!checkRateLimit(ip)) {
    appendSecurityLog({ type: "login_failed", ip, detail: "Rate limit exceeded" });
    return NextResponse.json(
      { ok: false, error: "Слишком много попыток. Попробуйте через 10 минут." },
      { status: 429 }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
  }

  const defaultWorkspaceId = process.env.DEFAULT_WORKSPACE_ID ?? "00000000-0000-0000-0000-000000000001";
  const defaultUserId      = process.env.DEFAULT_USER_ID      ?? "00000000-0000-0000-0000-000000000001";

  // ── 1. Try owner PIN ───────────────────────────────────────────────────────
  const ownerPin = process.env.PORTAL_PIN;
  if (!ownerPin) {
    return NextResponse.json({ ok: false, error: "PIN-аутентификация не настроена." }, { status: 500 });
  }

  if (body.pin === ownerPin) {
    clearAttempts(ip);
    const sessionId = createSessionId();
    const sessionValue = signSession({
      userId: defaultUserId,
      workspaceId: defaultWorkspaceId,
      role: "owner",
      issuedAt: Date.now(),
      sessionId,
      displayName: "Владелец",
    });
    if (!sessionValue) {
      return NextResponse.json({ ok: false, error: "Ошибка конфигурации сессии." }, { status: 500 });
    }
    const res = NextResponse.json({ ok: true, role: "owner" });
    res.cookies.set(SESSION_COOKIE_NAME, sessionValue, getSessionCookieOptions());
    appendSecurityLog({
      type: "login_success",
      ip,
      userId: defaultUserId,
      userName: "Владелец",
      role: "owner",
      sessionId,
      detail: device ? `Полный доступ · ${device}` : "Полный доступ",
    });
    return res;
  }

  // ── 2. Try employee PINs ───────────────────────────────────────────────────
  // Fetch all active members for this workspace and check PIN hashes
  try {
    await ensurePortalUsersAccessColumns();
    const rows = await queryOne<{ users: string }>(
      `SELECT json_agg(json_build_object('id', id, 'name', name, 'pin_hash', pin_hash, 'allowed_sections', allowed_sections, 'visible_sections', visible_sections, 'editable_sections', editable_sections, 'is_active', is_active)) AS users
       FROM portal_users WHERE workspace_id = $1 AND is_active = true`,
      [defaultWorkspaceId]
    );

    const rawUsers = rows?.users;
    const users: Array<{ id: string; name?: string; pin_hash: string; allowed_sections: string[]; visible_sections?: string[]; editable_sections?: string[]; is_active: boolean }> =
      !rawUsers ? [] : Array.isArray(rawUsers) ? (rawUsers as unknown as typeof users) : JSON.parse(rawUsers);

    for (const u of users) {
      if (verifyPortalPin(body.pin, u.pin_hash)) {
        clearAttempts(ip);
        const visibleSections = u.visible_sections?.length ? u.visible_sections : (u.allowed_sections ?? []);
        const editableSections = u.editable_sections?.length ? u.editable_sections : visibleSections;
        const sessionId = createSessionId();
        const sessionValue = signSession({
          userId: u.id,
          workspaceId: defaultWorkspaceId,
          role: "member",
          issuedAt: Date.now(),
          allowedSections: visibleSections,
          visibleSections,
          editableSections,
          sessionId,
          displayName: u.name,
        });
        if (!sessionValue) {
          return NextResponse.json({ ok: false, error: "Ошибка конфигурации сессии." }, { status: 500 });
        }
        const res = NextResponse.json({ ok: true, role: "member" });
        res.cookies.set(SESSION_COOKIE_NAME, sessionValue, getSessionCookieOptions());
        const sectionsSummary = formatSections(visibleSections);
        const editSummary = formatSections(editableSections);
        const sameAccess = visibleSections.length === editableSections.length &&
          visibleSections.every((s) => editableSections.includes(s));
        const detailParts = [
          `Видит: ${sectionsSummary}`,
          sameAccess ? null : `Правки: ${editSummary}`,
          device || null,
        ].filter(Boolean).join(" · ");
        appendSecurityLog({
          type: "login_success",
          ip,
          userId: u.id,
          userName: u.name,
          role: "member",
          sessionId,
          detail: detailParts,
        });
        return res;
      }
    }
  } catch {
    // DB not available — fall through to wrong PIN response
  }

  appendSecurityLog({ type: "login_failed", ip, detail: "Неверный PIN-код" });
  return NextResponse.json({ ok: false, error: "Неверный PIN-код." }, { status: 401 });
}
