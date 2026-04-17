import { NextResponse } from "next/server";
import { getSessionContext, SessionRequiredError } from "@/lib/auth/session";
import { canViewSection } from "@/lib/auth/section-access";
import { readHireBotSyncStatus } from "@/lib/server/hire-bot-sync";

export const dynamic = "force-dynamic";
const SECTION_KEY = "marketing";

export async function GET() {
  try {
    const session = await getSessionContext();
    if (!canViewSection(session, SECTION_KEY)) {
      return NextResponse.json({ ok: false, error: "Нет доступа к разделу Маркетинг." }, { status: 403 });
    }
    const status = readHireBotSyncStatus();
    return NextResponse.json({ ok: true, data: status });
  } catch (e) {
    if (e instanceof SessionRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
