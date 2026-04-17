import { NextResponse } from "next/server";
import { listSheets } from "@/lib/google/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.SALARY_SPREADSHEET_ID ?? "";

const RU_MONTHS: Record<string, string> = {
  "январ": "01", "феврал": "02", "март": "03", "апрел": "04",
  "май": "05", "мая": "05", "июн": "06", "июл": "07", "август": "08",
  "сентябр": "09", "октябр": "10", "ноябр": "11", "декабр": "12",
};

function sheetTitleToMonthYear(title: string): string | null {
  const lc = title.toLowerCase();
  const yearMatch = lc.match(/\d{4}/);
  if (!yearMatch) return null;
  const year = yearMatch[0];
  for (const [prefix, num] of Object.entries(RU_MONTHS)) {
    if (lc.includes(prefix)) return `${num}.${year}`;
  }
  return null;
}

/** Returns sorted list of available months: ["03.2025", "04.2026", ...] */
export async function GET() {
  if (!SPREADSHEET_ID) {
    return NextResponse.json({ ok: false, error: "SALARY_SPREADSHEET_ID не задан." }, { status: 503 });
  }

  try {
    const allSheets = await listSheets(SPREADSHEET_ID);
    const months = allSheets
      .filter((s) => s.title.toUpperCase().startsWith("МЕХ."))
      .map((s) => sheetTitleToMonthYear(s.title))
      .filter((m): m is string => m !== null);

    // Deduplicate and sort ascending
    const unique = [...new Set(months)].sort((a, b) => {
      const [am, ay] = a.split(".");
      const [bm, by] = b.split(".");
      return Number(ay) !== Number(by)
        ? Number(ay) - Number(by)
        : Number(am) - Number(bm);
    });

    return NextResponse.json({ ok: true, data: unique });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
