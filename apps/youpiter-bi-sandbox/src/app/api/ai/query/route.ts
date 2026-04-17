import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProviderById } from "@/lib/ai/providers";
import { readEnvFileValue } from "@/lib/server/env-file";

const querySchema = z.object({
  prompt: z.string().min(1).max(4000),
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  systemPrompt: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = querySchema.parse(await req.json());

    const providerId = body.provider ?? "aitunnel";
    const providerConfig = getProviderById(providerId);
    if (!providerConfig) {
      return NextResponse.json({ ok: false, error: "Неизвестный провайдер" }, { status: 400 });
    }

    // Resolve API key: from request body, then env vars
    const apiKey =
      body.apiKey?.trim() ||
      (providerId === "aitunnel" ? process.env.AITUNNEL_API_KEY : null) ||
      (providerId === "deepseek" ? process.env.DEEPSEEK_API_KEY : null) ||
      (providerId === "groq" ? process.env.GROQ_API_KEY : null) ||
      (providerId === "openai" ? process.env.OPENAI_API_KEY : null) ||
      (providerId === "aitunnel" ? readEnvFileValue("AITUNNEL_API_KEY") : null) ||
      (providerId === "deepseek" ? readEnvFileValue("DEEPSEEK_API_KEY") : null) ||
      (providerId === "groq" ? readEnvFileValue("GROQ_API_KEY") : null) ||
      (providerId === "openai" ? readEnvFileValue("OPENAI_API_KEY") : null) ||
      "";

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        error: "API-ключ не настроен. Добавьте ключ в Настройки → ИИ."
      }, { status: 400 });
    }

    const model = body.model ?? providerConfig.models[0];
    const messages = [];
    if (body.systemPrompt) {
      messages.push({ role: "system", content: body.systemPrompt });
    }
    messages.push({ role: "user", content: body.prompt });

    const aiRes = await fetch(`${providerConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 1500, temperature: 0.7 }),
      cache: "no-store",
    });

    if (!aiRes.ok) {
      let errBody = "";
      try { errBody = await aiRes.text(); } catch { /* ignore */ }
      return NextResponse.json({
        ok: false,
        error: `Ошибка провайдера ${aiRes.status}: ${errBody.slice(0, 200)}`
      }, { status: 502 });
    }

    const aiData = await aiRes.json();
    const response = aiData.choices?.[0]?.message?.content ?? "Нет ответа";
    const usage = aiData.usage ?? null;

    return NextResponse.json({ ok: true, data: { provider: providerId, model, response, usage } });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
