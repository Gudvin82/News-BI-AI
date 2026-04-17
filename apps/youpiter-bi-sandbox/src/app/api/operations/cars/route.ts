import { NextRequest, NextResponse } from "next/server";
import { fetchCars } from "@/lib/connectors/taxicrm";
import { isTaxiSectionEnabled } from "@/lib/server/integration-settings";

export async function GET(req: NextRequest) {
  if (!isTaxiSectionEnabled("operations")) {
    return NextResponse.json({ ok: false, error: "Интеграция taxicrm.ru отключена для раздела Операции." }, { status: 503 });
  }
  const token = req.headers.get("x-taxi-token") ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "No token" }, { status: 503 });
  try {
    const data = await fetchCars(token);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
