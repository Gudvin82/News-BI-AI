import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db/client";
import { appendServerAudit } from "@/lib/server/audit-log";
import { ensurePortalUsersAccessColumns } from "@/lib/server/portal-users";

// ── PIN hashing (pbkdf2, salt:hash) ──────────────────────────────────────────

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pin, salt, 10_000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
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

// ── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:              z.string().trim().min(1).max(100),
  pin:               z.string().trim().min(4).max(12),
  allowed_sections:  z.array(z.string()).default([]),
  visible_sections:  z.array(z.string()).default([]),
  editable_sections: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  id:                z.string().uuid(),
  name:              z.string().trim().min(1).max(100).optional(),
  pin:               z.string().trim().min(4).max(12).optional(),
  allowed_sections:  z.array(z.string()).optional(),
  visible_sections:  z.array(z.string()).optional(),
  editable_sections: z.array(z.string()).optional(),
  is_active:         z.boolean().optional(),
});

interface PortalUser {
  id: string;
  name: string;
  role: string;
  allowed_sections: string[];
  visible_sections?: string[];
  editable_sections?: string[];
  is_active: boolean;
  created_at: string;
}

function normalizePermissions(input: {
  allowed_sections?: string[];
  visible_sections?: string[];
  editable_sections?: string[];
}) {
  const visible = Array.from(new Set(
    (input.visible_sections?.length ? input.visible_sections : input.allowed_sections) ?? []
  ));
  const editableRaw = Array.from(new Set(
    (input.editable_sections?.length ? input.editable_sections : visible)
  ));
  const editable = editableRaw.filter((id) => visible.includes(id));
  return {
    allowed_sections: visible,
    visible_sections: visible,
    editable_sections: editable,
  };
}

// ── GET — list users ─────────────────────────────────────────────────────────

export async function GET() {
  try {
    await ensurePortalUsersAccessColumns();
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }
    const users = await query<PortalUser>(
      `SELECT id, name, role, allowed_sections, visible_sections, editable_sections, is_active, created_at
       FROM portal_users WHERE workspace_id = $1 ORDER BY created_at`,
      [session.workspaceId]
    );
    return NextResponse.json({
      ok: true,
      data: users.map((user) => ({
        ...user,
        visible_sections: user.visible_sections?.length ? user.visible_sections : user.allowed_sections,
        editable_sections: user.editable_sections?.length ? user.editable_sections : (user.visible_sections?.length ? user.visible_sections : user.allowed_sections),
      })),
    });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    console.error("[users GET]", e);
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}

// ── POST — create user ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await ensurePortalUsersAccessColumns();
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }
    const body = createSchema.parse(await req.json());
    const permissions = normalizePermissions(body);
    const pin_hash = hashPin(body.pin);

    const user = await queryOne<PortalUser>(
      `INSERT INTO portal_users (workspace_id, name, pin_hash, allowed_sections, visible_sections, editable_sections)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, role, allowed_sections, visible_sections, editable_sections, is_active, created_at`,
      [session.workspaceId, body.name, pin_hash, permissions.allowed_sections, permissions.visible_sections, permissions.editable_sections]
    );
    appendServerAudit({
      category: "user",
      action: "Создан пользователь",
      detail: `${body.name} · видит: ${permissions.visible_sections.length}, редактирует: ${permissions.editable_sections.length}`,
      actorId: session.userId,
      actorRole: session.role,
    });
    return NextResponse.json({ ok: true, data: user }, { status: 201 });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.errors[0]?.message ?? "Ошибка валидации." }, { status: 400 });
    }
    console.error("[users POST]", e);
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}

// ── PATCH — update user ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    await ensurePortalUsersAccessColumns();
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }
    const body = updateSchema.parse(await req.json());
    const nextPerms = (body.allowed_sections !== undefined || body.visible_sections !== undefined || body.editable_sections !== undefined)
      ? normalizePermissions(body)
      : null;

    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [session.workspaceId, body.id];
    let idx = 3;

    if (body.name !== undefined)             { sets.push(`name = $${idx++}`);             params.push(body.name); }
    if (body.pin !== undefined)              { sets.push(`pin_hash = $${idx++}`);          params.push(hashPin(body.pin)); }
    if (nextPerms) {
      sets.push(`allowed_sections = $${idx++}`); params.push(nextPerms.allowed_sections);
      sets.push(`visible_sections = $${idx++}`); params.push(nextPerms.visible_sections);
      sets.push(`editable_sections = $${idx++}`); params.push(nextPerms.editable_sections);
    }
    if (body.is_active !== undefined)        { sets.push(`is_active = $${idx++}`);         params.push(body.is_active); }

    if (sets.length === 1) {
      return NextResponse.json({ ok: false, error: "Нет данных для обновления." }, { status: 400 });
    }

    const user = await queryOne<PortalUser>(
      `UPDATE portal_users SET ${sets.join(", ")}
       WHERE workspace_id = $1 AND id = $2
       RETURNING id, name, role, allowed_sections, visible_sections, editable_sections, is_active, created_at`,
      params
    );
    if (!user) {
      return NextResponse.json({ ok: false, error: "Пользователь не найден." }, { status: 404 });
    }
    appendServerAudit({
      category: "user",
      action: "Обновлён пользователь",
      detail: `${user.name} · активен: ${user.is_active} · видит: ${(user.visible_sections?.length ?? user.allowed_sections.length)}, редактирует: ${(user.editable_sections?.length ?? user.allowed_sections.length)}`,
      actorId: session.userId,
      actorRole: session.role,
    });
    return NextResponse.json({ ok: true, data: user });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.errors[0]?.message ?? "Ошибка валидации." }, { status: 400 });
    }
    console.error("[users PATCH]", e);
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}

// ── DELETE — remove user ─────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }
    const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
    const target = await queryOne<{ name: string }>(
      `SELECT name FROM portal_users WHERE workspace_id = $1 AND id = $2`,
      [session.workspaceId, id]
    );
    await query(`DELETE FROM portal_users WHERE workspace_id = $1 AND id = $2`, [session.workspaceId, id]);
    appendServerAudit({
      category: "user",
      action: "Удалён пользователь",
      detail: target?.name ?? id,
      actorId: session.userId,
      actorRole: session.role,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
    }
    console.error("[users DELETE]", e);
    return NextResponse.json({ ok: false, error: "Ошибка сервера." }, { status: 500 });
  }
}
