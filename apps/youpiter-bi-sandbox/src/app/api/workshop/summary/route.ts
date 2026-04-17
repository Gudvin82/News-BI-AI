import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUMMARY_URL =
  process.env.WORKSHOP_SUMMARY_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT4NZQw8N_qHhL2dgHdP0GKzDIAUJy4LCZGJW-9l_Ty3aM6q9l0vURECdsD_JR0-DXZb1yOZEGCMcA5/pub?output=csv";

// Parse a CSV line respecting quoted fields (handles multiline-quoted cells as one token)
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export interface SummaryItem { name: string; count: number }
export interface SummaryGroup { category: string; items: SummaryItem[]; total: number }
export interface WorkshopSummaryData {
  groups:     SummaryGroup[];
  grandTotal: number;
  extras:     SummaryItem[];   // МАКСУСЫ, ожидание и т.п.
  updatedAt:  string;
}

export async function GET() {
  try {
    const res = await fetch(SUMMARY_URL, {
      headers: { "User-Agent": "YoupiterBI/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text  = await res.text();
    // Split into logical lines (quoted newlines are inside cells, join them back)
    const rawLines: string[] = [];
    let buf = "", open = 0;
    for (const ch of text) {
      if (ch === '"') { open = open === 0 ? 1 : 0; buf += ch; }
      else if ((ch === "\n" || ch === "\r") && open === 0) {
        if (buf.replace(/\r/, "").trim() !== "") rawLines.push(buf.replace(/\r$/, ""));
        buf = "";
      } else { buf += ch; }
    }
    if (buf.trim()) rawLines.push(buf);

    // Take rows 1-20 (1-indexed → indices 0-19)
    const slice = rawLines.slice(0, 20);

    const groups:  SummaryGroup[] = [];
    const extras:  SummaryItem[]  = [];
    let grandTotal = 0;
    let currentGroup: SummaryGroup | null = null;
    let inExtras = false; // after "Итого статус РЕМОНТ"

    for (const line of slice) {
      const cols = parseCsvRow(line);
      // Pad to 8 cols
      while (cols.length < 8) cols.push("");

      const colB = cols[1]?.trim() ?? ""; // category header
      const colE = cols[4]?.trim() ?? ""; // item name
      const colH = cols[7]?.trim() ?? ""; // count

      const count = parseInt(colH.replace(/\s/g, ""), 10);
      const hasCount = !isNaN(count) && count > 0;

      // New category group (col B non-empty, not a total row)
      if (colB && !colB.toUpperCase().includes("ИТОГ")) {
        currentGroup = { category: colB, items: [], total: 0 };
        groups.push(currentGroup);
        inExtras = false;
      }

      if (!colE) continue;

      const nameUpper = colE.toUpperCase();

      // Grand total row
      if (nameUpper.includes("ИТОГО") && nameUpper.includes("РЕМОНТ") && !nameUpper.includes("СЛЕС") && !nameUpper.includes("КУЗОВ")) {
        if (hasCount) grandTotal = count;
        inExtras = true;
        continue;
      }

      // Group total row (ИТОГО Слесарный / Кузовной)
      if (nameUpper.includes("ИТОГО") || nameUpper.includes("ИТОГ")) {
        if (hasCount && currentGroup) currentGroup.total = count;
        continue;
      }

      // Extras after grand total
      if (inExtras) {
        if (hasCount) extras.push({ name: colE, count });
        continue;
      }

      // Regular item row
      if (currentGroup && hasCount) {
        currentGroup.items.push({ name: colE, count });
      }
    }

    const data: WorkshopSummaryData = {
      groups,
      grandTotal,
      extras,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка загрузки сводки СТО" },
      { status: 500 }
    );
  }
}
