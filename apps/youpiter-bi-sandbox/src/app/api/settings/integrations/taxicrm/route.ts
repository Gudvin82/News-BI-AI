import { NextRequest, NextResponse } from "next/server";
import { readTaxiIntegrationSettings, writeTaxiIntegrationSettings } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = readTaxiIntegrationSettings();
  return NextResponse.json({ ok: true, data: settings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const sections = Array.isArray(body?.sections)
      ? body.sections.map((v: unknown) => String(v)).filter(Boolean)
      : ["operations"];

    writeTaxiIntegrationSettings({ token, sections });
    return NextResponse.json({ ok: true, data: { token, sections } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить TaxiCRM." },
      { status: 500 }
    );
  }
}
