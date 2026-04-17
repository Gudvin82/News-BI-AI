import { NextRequest, NextResponse } from "next/server";
import { fetchAllSheets, computeFinanceMetrics } from "@/lib/connectors/gsheets";
import type { SheetMapping } from "@/lib/types/sheets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.headers.get("x-gsheets-docs") ?? "";
  let docs: Array<{ url: string; name?: string; mapping?: SheetMapping }> = [];

  try {
    if (raw) {
      try {
        docs = JSON.parse(raw);
      } catch {
        docs = JSON.parse(decodeURIComponent(raw));
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Неверный формат x-gsheets-docs." }, { status: 400 });
  }

  const validDocs = docs.filter((d) => d.url?.trim());
  if (validDocs.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Google Sheets не настроен. Добавьте таблицу в Настройки → Интеграции." },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;
  const nowMsk = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to   = sp.get("to")   ?? nowMsk;

  try {
    const entries = await fetchAllSheets(validDocs);
    const metrics = computeFinanceMetrics(entries, from, to);
    return NextResponse.json({ ok: true, data: metrics });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
