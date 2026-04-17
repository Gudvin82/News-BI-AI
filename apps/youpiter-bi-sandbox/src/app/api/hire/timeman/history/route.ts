import { NextRequest, NextResponse } from "next/server";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";

export const dynamic = "force-dynamic";

/**
 * GET /api/hire/timeman/history?userId=ID&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns work history for a manager via timeman.historystatus.list Bitrix API.
 */
export async function GET(req: NextRequest) {
  const webhook = getBitrixWebhook();
  if (!webhook) {
    return NextResponse.json({ ok: false, error: "Webhook не настроен" }, { status: 503 });
  }

  const sp = new URL(req.url).searchParams;
  const userId = sp.get("userId");
  const from = sp.get("from");
  const to = sp.get("to");

  if (!userId || !from || !to) {
    return NextResponse.json({ ok: false, error: "userId, from, to required" }, { status: 400 });
  }

  try {
    const params = new URLSearchParams({
      USER_ID: userId,
      DATE_FROM: from,
      DATE_TO: to,
    });
    const url = `${webhook}timeman.historystatus.list.json?${params}`;
    const res = await fetch(url, { headers: { "User-Agent": "YoupiterBI/1.0" }, cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Bitrix ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const items: Array<{ DATE: string; STATUS: string; TIME_START: string; TIME_FINISH?: string }> =
      data?.result ?? [];

    const fmt = (ts: string) => ts.substring(11, 16); // "HH:MM"

    const days = items.map((item) => ({
      date: item.DATE?.substring(0, 10) ?? item.TIME_START?.substring(0, 10) ?? "",
      start: item.TIME_START ? fmt(item.TIME_START) : null,
      end: item.STATUS === "CLOSED" && item.TIME_FINISH ? fmt(item.TIME_FINISH) : null,
      status: item.STATUS,
    }));

    return NextResponse.json({ ok: true, data: days });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
