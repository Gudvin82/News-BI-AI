import { NextRequest, NextResponse } from "next/server";
import { fetchAllSheets, computeFinanceMetrics } from "@/lib/connectors/gsheets";
import type { SheetMapping } from "@/lib/types/sheets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const docsHeader = req.headers.get("x-gsheets-docs") ?? "[]";
  let docs: Array<{ url: string; name?: string; mapping?: SheetMapping }> = [];
  try {
    docs = JSON.parse(docsHeader);
  } catch {
    try { docs = JSON.parse(decodeURIComponent(docsHeader)); } catch { /* */ }
  }

  if (docs.length === 0) {
    return NextResponse.json({ ok: false, error: "Нет таблиц кассы" }, { status: 503 });
  }

  const sp   = new URL(req.url).searchParams;
  const from = sp.get("from") ?? new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const to   = sp.get("to")   ?? from;

  try {
    const entries = await fetchAllSheets(docs);
    const data    = computeFinanceMetrics(entries, from, to);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
