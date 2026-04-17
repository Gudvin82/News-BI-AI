import { NextRequest, NextResponse } from "next/server";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { writeEnvFileValue } from "@/lib/server/env-file";
import { readBitrixIntegrationSettings, writeBitrixIntegrationSettings } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

function normalizeWebhook(url: string) {
  const value = url.trim();
  if (!value) return "";
  return value.endsWith("/") ? value : `${value}/`;
}

export async function GET() {
  const settings = readBitrixIntegrationSettings();
  return NextResponse.json({
    ok: true,
    data: {
      webhook: settings.webhook || getBitrixWebhook(),
      sections: settings.sections,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const webhook = normalizeWebhook(String(body?.webhook ?? ""));
    const sections = Array.isArray(body?.sections)
      ? body.sections.map((v: unknown) => String(v)).filter(Boolean)
      : ["hire", "dtp", "bizproc"];

    if (!webhook.startsWith("https://") || !/\/rest\/\d+\/[^/]+\/$/.test(webhook)) {
      return NextResponse.json(
        { ok: false, error: "Некорректный webhook URL Bitrix24." },
        { status: 400 }
      );
    }

    writeEnvFileValue("BITRIX_WEBHOOK", webhook);
    writeBitrixIntegrationSettings({ webhook, sections });
    return NextResponse.json({ ok: true, data: { webhook, sections } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить webhook." },
      { status: 500 }
    );
  }
}
