import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRNGzLxT4v4gN6B-5C92y6xhhf3nenvK1AEU5wc2viS5D8-V51_KY0xC1Sr23ddKwpw0i1kAqPdASC1/pub?output=csv";

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

// Parse Russian date formats: "DD.MM.YYYY" or "YYYY-MM-DD"
function parseDateToISO(raw: string): string | null {
  if (!raw) return null;
  const ddmm = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (iso) return iso[1];
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const gid = searchParams.get("gid") ?? "0";
    const dateFrom = searchParams.get("dateFrom") ?? null;
    const dateTo   = searchParams.get("dateTo")   ?? null;

    const url = gid === "0" ? BASE_URL : `${BASE_URL}&gid=${gid}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "YoupiterBI/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();

    // Split into logical lines
    const rawLines: string[] = [];
    let buf = "", open = 0;
    for (const ch of text) {
      if (ch === '"') { open = open === 0 ? 1 : 0; buf += ch; }
      else if ((ch === "\n" || ch === "\r") && open === 0) {
        const trimmed = buf.replace(/\r$/, "").trim();
        if (trimmed) rawLines.push(buf.replace(/\r$/, ""));
        buf = "";
      } else { buf += ch; }
    }
    if (buf.trim()) rawLines.push(buf);

    if (!rawLines.length) throw new Error("Пустой ответ от таблицы");

    // First row is always header
    const headers = parseCsvRow(rawLines[0]).map((h) => h.trim());

    // Find "Дата обучения" column index for date filtering
    const dateTrainIdx = headers.findIndex((h) => h.toLowerCase().includes("дата обучения"));
    // Find АТП (park) column — driver rows always have a park, summary rows don't
    const atpIdx = headers.findIndex((h) => h.toLowerCase().includes("атп") || h.toLowerCase().includes("парк"));

    const rows: string[][] = [];
    for (const line of rawLines.slice(1)) {
      const cols = parseCsvRow(line);
      // Normalize cell count
      while (cols.length < headers.length) cols.push("");
      // Skip rows that are entirely empty
      if (cols.every((c) => !c.trim())) continue;
      // Skip rows where col 0 (ФИО) is empty
      if (!cols[0]?.trim()) continue;

      // Skip summary/stat rows: real driver rows always have a park in col АТП.
      // Summary rows like "Мин. накат до обучения:" have no park value.
      const parkVal = (atpIdx >= 0 ? cols[atpIdx] : cols[2])?.trim() ?? "";
      if (!parkVal || parkVal === "—" || parkVal === "-") continue;

      // Date filter on "Дата обучения" if requested
      if (dateFrom && dateTo && dateTrainIdx >= 0) {
        const trainDate = parseDateToISO(cols[dateTrainIdx]?.trim() ?? "");
        if (!trainDate || trainDate < dateFrom || trainDate > dateTo) continue;
      }

      rows.push(cols.slice(0, headers.length));
    }

    return NextResponse.json({ ok: true, data: { headers, rows, updatedAt: new Date().toISOString() } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}
