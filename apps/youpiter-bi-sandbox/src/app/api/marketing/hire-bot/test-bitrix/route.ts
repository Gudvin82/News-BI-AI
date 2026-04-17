import { NextRequest, NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canEditSection } from "@/lib/auth/section-access";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionContext();
    if (!canEditSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет прав на изменение раздела Маркетинг." }, { status: 403 });
    }
    const body = await req.json() as { webhookUrl?: string };
    const webhook = (body.webhookUrl ?? "").trim().replace(/\/+$/, "");
    if (!webhook) {
      return NextResponse.json({ ok: false, error: "Укажите webhook URL" }, { status: 400 });
    }
    const url = `${webhook}/profile.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "YoupiterBI/1.0" },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Bitrix test ${res.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, data: { profile: text.slice(0, 400) } });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
