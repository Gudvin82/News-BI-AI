import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUMMARY_URL =
  process.env.WORKSHOP_SUMMARY_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT4NZQw8N_qHhL2dgHdP0GKzDIAUJy4LCZGJW-9l_Ty3aM6q9l0vURECdsD_JR0-DXZb1yOZEGCMcA5/pub?output=csv";

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
    } else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

export interface WorkshopCarsData {
  headers:   string[];
  rows:      string[][];   // data rows (section headers excluded)
  sections:  string[];     // parallel to rows: section name per row
  updatedAt: string;
}

export async function GET() {
  try {
    const res = await fetch(SUMMARY_URL, {
      headers: { "User-Agent": "YoupiterBI/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();

    // ── split into logical lines ───────────────────────────────────────────────
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

    // ── take from row 23 (0-indexed: 22) ──────────────────────────────────────
    const tableLines = rawLines.slice(22);

    // ── find header row: first row where col A === "№" ────────────────────────
    let headerIdx = -1;
    for (let i = 0; i < tableLines.length; i++) {
      const cols = parseCsvRow(tableLines[i]);
      if (cols[0]?.trim() === "№") { headerIdx = i; break; }
    }

    if (headerIdx === -1) {
      // fallback: treat first line as header
      headerIdx = 0;
    }

    // Read headers — take all columns up to last non-empty header (max 16)
    const rawHeaderCols = parseCsvRow(tableLines[headerIdx]);
    let colCount = 0;
    for (let i = rawHeaderCols.length - 1; i >= 0; i--) {
      if (rawHeaderCols[i]?.trim()) { colCount = i + 1; break; }
    }
    colCount = Math.min(Math.max(colCount, 12), 16);
    const headers = rawHeaderCols.slice(0, colCount).map((h) => h.trim());

    // ── parse data rows ────────────────────────────────────────────────────────
    const rows:     string[][] = [];
    const sections: string[]   = [];

    // Capture any section header that sits BEFORE the "№" header row
    // (e.g. "СТО ЛИТОВСКАЯ 10Б" is at row 23, while "№" is a few rows lower)
    let currentSection = "";
    for (let i = 0; i < headerIdx; i++) {
      const cols = parseCsvRow(tableLines[i]).slice(0, colCount);
      const colA = cols[0]?.trim() ?? "";
      const nonEmptyCount = cols.filter((c) => c.trim()).length;
      if (colA && isNaN(Number(colA)) && nonEmptyCount <= 2) {
        currentSection = colA;
      }
    }

    for (const line of tableLines.slice(headerIdx + 1)) {
      const cols = parseCsvRow(line).slice(0, colCount);
      while (cols.length < colCount) cols.push("");

      const colA = cols[0]?.trim() ?? "";

      // Skip fully empty rows
      if (cols.every((c) => !c)) continue;

      // Skip repeated header rows (each section repeats "№" header)
      if (colA === "№") continue;

      // Section header detection: colA is non-numeric text AND row has ≤ 2 non-empty cells
      // (section rows like "СТО ЯКОРНАЯ", "МАКСУСЫ" etc. have just the name and nothing else)
      const nonEmptyCount = cols.filter((c) => c.trim()).length;
      if (colA && isNaN(Number(colA)) && nonEmptyCount <= 2) {
        currentSection = colA;
        continue;
      }

      // Skip rows where colA is non-numeric and looks like a stray label (not a real car row)
      // Real car rows have a number in colA
      if (colA && isNaN(Number(colA))) continue;

      rows.push(cols);
      sections.push(currentSection);
    }

    return NextResponse.json({
      ok: true,
      data: { headers, rows, sections, updatedAt: new Date().toISOString() } satisfies WorkshopCarsData,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 }
    );
  }
}
