import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProviderById } from "@/lib/ai/providers";
import { readEnvFileValue } from "@/lib/server/env-file";

const providerSchema = z.object({
  provider: z.string().optional(),
});

async function fetchJson(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? JSON.stringify((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }

  return data;
}

export async function GET(req: NextRequest) {
  try {
    const parsed = providerSchema.parse({
      provider: req.nextUrl.searchParams.get("provider") ?? undefined,
    });

    const provider = parsed.provider ?? "aitunnel";
    const providerConfig = getProviderById(provider);
    if (!providerConfig) {
      return NextResponse.json({ ok: false, error: "Неизвестный провайдер." }, { status: 400 });
    }

    const headerKey = req.headers.get("x-ai-api-key")?.trim() ?? "";
    const apiKey =
      headerKey ||
      (provider === "aitunnel" ? process.env.AITUNNEL_API_KEY : null) ||
      (provider === "deepseek" ? process.env.DEEPSEEK_API_KEY : null) ||
      (provider === "groq" ? process.env.GROQ_API_KEY : null) ||
      (provider === "openai" ? process.env.OPENAI_API_KEY : null) ||
      (provider === "aitunnel" ? readEnvFileValue("AITUNNEL_API_KEY") : null) ||
      (provider === "deepseek" ? readEnvFileValue("DEEPSEEK_API_KEY") : null) ||
      (provider === "groq" ? readEnvFileValue("GROQ_API_KEY") : null) ||
      (provider === "openai" ? readEnvFileValue("OPENAI_API_KEY") : null) ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "API-ключ не найден. Сохраните ключ в Настройки → ИИ." },
        { status: 400 }
      );
    }

    if (provider !== "aitunnel") {
      return NextResponse.json({
        ok: true,
        data: {
          provider,
          supportsLiveBilling: false,
          message: "Для этого провайдера онлайн-баланс не реализован. Доступна только локальная история использования.",
        },
      });
    }

    const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
    const [me, balance, key, summary] = await Promise.all([
      fetchJson(`${baseUrl}/aitunnel/me`, apiKey),
      fetchJson(`${baseUrl}/aitunnel/balance`, apiKey),
      fetchJson(`${baseUrl}/aitunnel/key`, apiKey),
      fetchJson(`${baseUrl}/aitunnel/stats/summary`, apiKey),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        provider,
        supportsLiveBilling: true,
        me,
        balance,
        key,
        summary,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
