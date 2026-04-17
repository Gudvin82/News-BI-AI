import { NextResponse } from "next/server";

type ProbeBody =
  | { provider: "onec"; url?: string; login?: string; password?: string }
  | { provider: "amocrm"; domain?: string; apiKey?: string };

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  let body: ProbeBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный JSON.");
  }

  if (body.provider === "onec") {
    const rawUrl = String(body.url ?? "").trim();
    if (!rawUrl) return jsonError("Введите URL веб-сервиса.");

    const headers: HeadersInit = {};
    if (body.login) {
      const token = Buffer.from(`${body.login}:${body.password ?? ""}`).toString("base64");
      headers.Authorization = `Basic ${token}`;
    }

    try {
      const res = await fetch(rawUrl, {
        method: "GET",
        headers,
        cache: "no-store",
        redirect: "follow",
      });

      if (!res.ok) {
        return jsonError(`1С вернул HTTP ${res.status}.`, 502);
      }

      return NextResponse.json({
        ok: true,
        data: { message: `OK · HTTP ${res.status}` },
      });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Не удалось подключиться к 1С.", 502);
    }
  }

  if (body.provider === "amocrm") {
    const domain = String(body.domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const apiKey = String(body.apiKey ?? "").trim();
    if (!domain) return jsonError("Введите домен amoCRM.");
    if (!apiKey) return jsonError("Введите API-токен amoCRM.");

    try {
      const res = await fetch(`https://${domain}/api/v4/account`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        return jsonError(`amoCRM вернул HTTP ${res.status}.`, 502);
      }

      const data = await res.json().catch(() => null);
      return NextResponse.json({
        ok: true,
        data: {
          message: `OK · ${data?.name ?? domain}`,
        },
      });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Не удалось подключиться к amoCRM.", 502);
    }
  }

  return jsonError("Неизвестный тип интеграции.");
}
