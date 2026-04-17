import { NextRequest, NextResponse } from "next/server";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";

export const dynamic = "force-dynamic";

/**
 * GET /api/hire/timeman?userId=ID
 * Returns today's work start/end time for a manager via timeman.status Bitrix API.
 */
export async function GET(req: NextRequest) {
  const webhook = getBitrixWebhook();
  if (!webhook) {
    return NextResponse.json({ ok: false, error: "Webhook не настроен" }, { status: 503 });
  }

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  try {
    const url = `${webhook}timeman.status.json?USER_ID=${encodeURIComponent(userId)}`;
    const res = await fetch(url, { headers: { "User-Agent": "YoupiterBI/1.0" }, cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Bitrix ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const r = data?.result;
    if (!r || !r.TIME_START) {
      return NextResponse.json({ ok: true, data: null });
    }

    const fmt = (ts: string) => ts.substring(11, 16); // "HH:MM"
    const startDate = r.TIME_START.substring(0, 10);
    const startTime = fmt(r.TIME_START);
    const endTime = r.STATUS === "CLOSED" && r.TIME_FINISH ? fmt(r.TIME_FINISH) : null;

    return NextResponse.json({
      ok: true,
      data: { startDate, start: startTime, end: endTime, status: r.STATUS },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
