import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { appendServerAudit } from "@/lib/server/audit-log";

const bodySchema = z.object({
  channel: z.enum(["bitrix", "telegram", "email"]),
  config: z.object({
    destination: z.string().trim().default(""),
    token: z.string().trim().optional(),
    sender: z.string().trim().optional(),
    webhook: z.string().trim().optional(),
  }),
});

async function sendBitrix(destination: string, webhookOverride?: string) {
  const webhook = webhookOverride || getBitrixWebhook();
  if (!webhook) throw new Error("Не найден webhook Bitrix24.");
  if (!destination) throw new Error("Укажите ID чата или DIALOG_ID для Bitrix.");

  const base = webhook.endsWith("/") ? webhook : `${webhook}/`;
  const body = new URLSearchParams({
    DIALOG_ID: destination,
    MESSAGE: `Тест уведомлений YouPiter BI\n${new Date().toLocaleString("ru-RU")}`,
  });

  const res = await fetch(`${base}im.message.add.json`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `Bitrix24 ${res.status}`);
  }
}

async function sendTelegram(destination: string, token?: string) {
  if (!token) throw new Error("Укажите Telegram Bot Token.");
  if (!destination) throw new Error("Укажите chat_id Telegram.");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: destination,
      text: `Тест уведомлений YouPiter BI\n${new Date().toLocaleString("ru-RU")}`,
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `Telegram ${res.status}`);
  }
}

async function sendEmail(destination: string, token?: string, sender?: string) {
  if (!token) throw new Error("Укажите API-ключ для email-канала.");
  if (!sender) throw new Error("Укажите email отправителя.");
  if (!destination) throw new Error("Укажите email получателя.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      from: sender,
      to: [destination],
      subject: "Тест уведомлений YouPiter BI",
      text: `Тест уведомлений YouPiter BI\n${new Date().toLocaleString("ru-RU")}`,
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const message = typeof data.error === "string" ? data.error : data.message;
    throw new Error(message || `Email ${res.status}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (session.role !== "owner") {
      return NextResponse.json({ ok: false, error: "Доступ запрещён." }, { status: 403 });
    }

    const body = bodySchema.parse(await req.json());

    if (body.channel === "bitrix") {
      await sendBitrix(body.config.destination, body.config.webhook);
    } else if (body.channel === "telegram") {
      await sendTelegram(body.config.destination, body.config.token);
    } else {
      await sendEmail(body.config.destination, body.config.token, body.config.sender);
    }

    appendServerAudit({
      category: "settings",
      action: "Тест уведомлений отправлен",
      detail: `${body.channel} → ${body.config.destination}`,
      actorId: session.userId,
      actorRole: session.role,
    });

    return NextResponse.json({ ok: true, message: "Тестовое уведомление отправлено." });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: e.errors[0]?.message ?? "Некорректный запрос." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Ошибка отправки уведомления." }, { status: 500 });
  }
}
