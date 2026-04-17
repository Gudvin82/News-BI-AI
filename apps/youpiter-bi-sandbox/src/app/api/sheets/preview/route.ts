import { NextRequest, NextResponse } from "next/server";
import type { SheetInfo, SheetPreviewData, SheetsPreviewResponse, ColumnMap } from "@/lib/types/sheets";

export const dynamic = "force-dynamic";

// ── URL helpers ───────────────────────────────────────────────────────────────

const SPREADSHEET_ID_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const PUB_ID_RE          = /\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/;
const GID_RE             = /[#&?]gid=(\d+)/;

/** True for published CSV/TSV URLs: /spreadsheets/d/e/PUBID/pub */
function isPubUrl(url: string): boolean {
  return /\/spreadsheets\/d\/e\//.test(url);
}

function extractId(url: string): string | null {
  if (isPubUrl(url)) return url.match(PUB_ID_RE)?.[1] ?? null;
  return url.match(SPREADSHEET_ID_RE)?.[1] ?? null;
}

function extractGid(url: string): string {
  return url.match(GID_RE)?.[1] ?? "0";
}

/** Build CSV export URL. For pub URLs, return the URL as-is (already serves CSV). */
function toCsvExportUrl(id: string, gid: string, rawUrl?: string): string {
  if (rawUrl && isPubUrl(rawUrl)) return rawUrl;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// ── CSV row parser ────────────────────────────────────────────────────────────

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseRow(line: string): string[] {
  return line.includes("\t")
    ? line.split("\t").map((c) => c.trim())
    : parseCsvRow(line);
}

// ── Sheet list discovery ──────────────────────────────────────────────────────

/**
 * Try to extract list of sheets from the htmlview page.
 * Google embeds sheet metadata in the HTML — we try two known patterns.
 * Returns empty array if nothing found (caller falls back gracefully).
 */
async function fetchSheetsList(id: string): Promise<SheetInfo[]> {
  try {
    const res = await fetch(
      `https://docs.google.com/spreadsheets/d/${id}/htmlview`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; YoupiterBI/1.0)" },
        cache:  "no-store",
        signal: AbortSignal.timeout(12000),
      }
    );
    if (!res.ok) return [];

    const html = await res.text();
    const sheets: SheetInfo[] = [];
    const seen = new Set<string>();

    // Pattern A: aria-label on sheet buttons
    // <li id="sheet-button-0" ... aria-label="Sheet1">
    const patA = /id="sheet-button-(\d+)"[^>]*aria-label="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = patA.exec(html)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); sheets.push({ gid: m[1], name: m[2] }); }
    }
    if (sheets.length > 0) return sheets;

    // Pattern B: JSON blob  "sheetId":123,"title":"Name"
    const patB = /"sheetId"\s*:\s*(\d+)[^}]{0,200}?"title"\s*:\s*"([^"]+)"/g;
    while ((m = patB.exec(html)) !== null) {
      if (!seen.has(m[1])) { seen.add(m[1]); sheets.push({ gid: m[1], name: m[2] }); }
    }
    if (sheets.length > 0) return sheets;

    // Pattern C: data-sheet-id attribute
    const patC = /data-sheet-id="(\d+)"[^>]*>([^<]{1,60})</g;
    while ((m = patC.exec(html)) !== null) {
      const name = m[2].trim();
      if (name && !seen.has(m[1])) { seen.add(m[1]); sheets.push({ gid: m[1], name }); }
    }
    return sheets;
  } catch {
    return [];
  }
}

// ── Raw row fetcher ───────────────────────────────────────────────────────────

interface RawRows { rows: string[][]; totalRows: number }

async function fetchRawRows(id: string, gid: string, maxRows = 25, rawUrl?: string): Promise<RawRows> {
  const url = toCsvExportUrl(id, gid, rawUrl);
  const res = await fetch(url, {
    headers: { "User-Agent": "YoupiterBI/1.0" },
    cache:   "no-store",
    signal:  AbortSignal.timeout(20000),
  });

  // Google redirects to login page for private sheets
  if (res.status === 302 || (res.status >= 200 && res.status < 400 && res.url.includes("accounts.google.com"))) {
    throw new Error("Таблица закрыта. Откройте доступ: Файл → Поделиться → Все, у кого есть ссылка → Готово.");
  }
  if (res.status === 404) {
    throw new Error("Таблица не найдена. Проверьте ссылку — возможно она удалена или ID неверный.");
  }
  if (!res.ok) {
    throw new Error(`Google Sheets вернул ошибку ${res.status}. Попробуйте позже.`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      "Таблица требует авторизации Google. Откройте доступ: Файл → Поделиться → " +
      "Все, у кого есть ссылка → Роль Читатель → Готово."
    );
  }

  const text  = await res.text();
  const lines = text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim().length > 0);
  const totalRows = lines.length;
  const rows  = lines.slice(0, maxRows).map((l) => parseRow(l));
  return { rows, totalRows };
}

// ── Auto-detection helpers ────────────────────────────────────────────────────

/** Heuristic: which row index looks like a header (non-numeric majority, near top) */
function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    const row     = rows[i].filter((c) => c.trim().length > 0);
    if (row.length === 0) continue;
    const textual = row.filter((c) => isNaN(Number(c.replace(/[\s,.₽%]/g, "")))).length;
    if (textual / row.length >= 0.5) return i;
  }
  return 0;
}

const CANDIDATES: Record<keyof ColumnMap, string[]> = {
  date:     ["дата", "date", "день", "период", "period", "dt"],
  category: ["категория", "category", "статья", "вид", "тип расхода", "наименование"],
  amount:   ["сумма", "amount", "sum", "итого", "руб", "₽", "деньги", "стоимость"],
  park:     ["парк", "park", "объект", "подразделение", "филиал", "точка"],
  type:     ["тип", "type", "вид", "in/out", "приход/расход", "расход/приход", "направление"],
  comment:  ["комментарий", "comment", "примечание", "описание", "note", "заметка"],
};

function detectColumnMap(headers: string[]): Partial<Record<keyof ColumnMap, number | null>> {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const result: Partial<Record<keyof ColumnMap, number | null>> = {};

  for (const [field, candidates] of Object.entries(CANDIDATES) as [keyof ColumnMap, string[]][]) {
    // Exact match first
    let idx = candidates.reduce<number>((found, c) => found !== -1 ? found : lower.indexOf(c), -1);
    // Partial match fallback
    if (idx === -1) {
      idx = candidates.reduce<number>((found, c) => found !== -1 ? found : lower.findIndex((h) => h.includes(c)), -1);
    }
    result[field] = idx === -1 ? null : idx;
  }
  return result;
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET /api/sheets/preview
 *
 * Query params:
 *   url      — any Google Sheets URL (required)
 *   action   — "sheets" (default) | "preview"
 *   gid      — sheet gid for preview action (default from url)
 *   headerRow — 0-based header row index for preview action (default: auto)
 */
export async function GET(req: NextRequest) {
  const sp        = new URL(req.url).searchParams;
  const rawUrl    = (sp.get("url") ?? "").trim();
  const action    = sp.get("action") ?? "sheets";
  const gidParam  = sp.get("gid");
  const hrParam   = sp.get("headerRow");

  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "Параметр url обязателен." }, { status: 400 });
  }

  // Validate URL format
  const id = extractId(rawUrl);
  if (!id) {
    return NextResponse.json({
      ok:    false,
      error: "Не удалось распознать ссылку. Убедитесь, что это ссылка на Google Sheets вида https://docs.google.com/spreadsheets/d/…",
    }, { status: 400 });
  }

  const urlGid = extractGid(rawUrl);

  try {
    // ── action=sheets: discover sheet list + quick preview of url gid ─────────
    if (action === "sheets") {
      const isPub = isPubUrl(rawUrl);
      const [sheetsResult, rowsResult] = await Promise.allSettled([
        isPub ? Promise.resolve([]) : fetchSheetsList(id),
        fetchRawRows(id, urlGid, 20, rawUrl),
      ]);

      // If we can't load any data at all — return the error
      if (rowsResult.status === "rejected") {
        const msg = rowsResult.reason instanceof Error ? rowsResult.reason.message : String(rowsResult.reason);
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }

      const { rows, totalRows } = rowsResult.value;
      const detectedHeaderRow   = detectHeaderRow(rows);
      const headers             = rows[detectedHeaderRow] ?? [];
      const detectedMapping     = detectColumnMap(headers);

      // For pub URLs, sheet discovery is not possible — use a single entry
      // For regular URLs, fall back to single entry if discovery failed
      let sheets: SheetInfo[] = (!isPub && sheetsResult.status === "fulfilled") ? sheetsResult.value : [];
      if (sheets.length === 0) {
        sheets = [{ gid: urlGid, name: "Лист 1" }];
      }

      const preview: SheetPreviewData = { gid: urlGid, rows: rows.slice(0, 5), totalRows, headers };

      const payload: SheetsPreviewResponse = {
        spreadsheetId: id,
        urlGid,
        sheets,
        preview,
        detectedHeaderRow,
        detectedMapping,
      };

      return NextResponse.json({ ok: true, data: payload });
    }

    // ── action=preview: load selected gid with given headerRow ────────────────
    if (action === "preview") {
      const gid = gidParam ?? urlGid;
      const { rows, totalRows } = await fetchRawRows(id, gid, 25, rawUrl);

      const detectedHeaderRow = detectHeaderRow(rows);
      const headerRow         = hrParam !== null ? parseInt(hrParam, 10) : detectedHeaderRow;
      const headers           = rows[headerRow] ?? [];
      const detectedMapping   = detectColumnMap(headers);

      // Sample parsed data rows using current mapping
      const dataRows = rows.slice(headerRow + 1, headerRow + 11);

      const preview: SheetPreviewData = { gid, rows, totalRows, headers };

      return NextResponse.json({
        ok:   true,
        data: { gid, preview, detectedHeaderRow, headerRow, headers, detectedMapping, dataRows },
      });
    }

    return NextResponse.json({ ok: false, error: `Неизвестное действие: ${action}` }, { status: 400 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
