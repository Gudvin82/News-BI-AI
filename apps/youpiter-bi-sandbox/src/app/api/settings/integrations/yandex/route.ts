import { NextRequest, NextResponse } from "next/server";
import { readYandexIntegrationSettings, writeYandexIntegrationSettings } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = readYandexIntegrationSettings();
  return NextResponse.json({ ok: true, data: settings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const clientId = String(body?.clientId ?? "").trim();
    const sections = Array.isArray(body?.sections)
      ? body.sections.map((v: unknown) => String(v)).filter(Boolean)
      : ["marketing"];

    writeYandexIntegrationSettings({ token, clientId, sections });
    return NextResponse.json({ ok: true, data: { token, clientId, sections } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить Яндекс Директ." },
      { status: 500 }
    );
  }
}
