import { NextRequest, NextResponse } from "next/server";
import { fetchAllSheets, computeFinanceMetrics } from "@/lib/connectors/gsheets";
import type { SheetMapping } from "@/lib/types/sheets";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "Параметры from и to обязательны." }, { status: 400 });
  }

  const docsHeader = req.headers.get("x-gsheets-docs");
  let docs: Array<{ url: string; name?: string; mapping?: SheetMapping }> = [];

  try {
    if (docsHeader) {
      try {
        docs = JSON.parse(docsHeader);
      } catch {
        docs = JSON.parse(decodeURIComponent(docsHeader));
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный заголовок x-gsheets-docs." }, { status: 400 });
  }

  if (!docs.length) {
    return NextResponse.json({ ok: false, error: "Нет таблиц для СТО." }, { status: 503 });
  }

  try {
    const entries  = await fetchAllSheets(docs);
    const metrics  = computeFinanceMetrics(entries, from, to);
    return NextResponse.json({ ok: true, data: metrics });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка получения данных." },
      { status: 500 }
    );
  }
}
