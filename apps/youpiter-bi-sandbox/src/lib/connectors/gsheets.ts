/**
 * Google Sheets connector.
 * Supports:
 * - direct CSV export URLs
 * - published TSV URLs
 * - regular /edit share links converted to CSV export
 * No external CSV library — pure split logic that handles quoted fields.
 */

import { SHEET_COLUMNS, INCOME_LABELS, EXPENSE_LABELS, type EntryType } from "@/lib/config/finance";
import type { SheetMapping } from "@/lib/types/sheets";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SheetEntry {
  date: string;
  category: string;
  amount: number;
  park: string;
  type: EntryType;
  comment: string;
  _sourceName?: string;
}

export interface FinanceMetrics {
  dateFrom: string;
  dateTo: string;
  totalIncome: number;
  totalExpense: number;
  profit: number;
  entries: SheetEntry[];
  byCategory: Record<string, { income: number; expense: number }>;
  byPark: Record<string, { income: number; expense: number }>;
  dailyCashflow: Array<{ date: string; income: number; expense: number; balance: number }>;
}

// ── URL helpers ─────────────────────────────────────────────────────────────

/** Convert a Google Sheets share / edit URL to a direct export URL */
export function toExportUrl(sheetUrl: string): string {
  if (sheetUrl.includes("export?format=csv")) return sheetUrl;
  if (sheetUrl.includes("output=tsv")) return sheetUrl;
  if (sheetUrl.includes("output=csv")) return sheetUrl;
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error(`Не удалось извлечь ID таблицы из: ${sheetUrl}`);
  const id = match[1];
  const gidMatch = sheetUrl.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// ── CSV parser ───────────────────────────────────────────────────────────────

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

function parseTsvRow(line: string): string[] {
  return line.split("\t").map((cell) => cell.trim());
}

function findCol(headers: string[], candidates: readonly string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function normaliseDate(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dm = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2]}-${dm[1]}`;
  const dm2 = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dm2) return `${dm2[3]}-${String(dm2[2]).padStart(2, "0")}-${String(dm2[1]).padStart(2, "0")}`;
  return "";
}

function normaliseAmount(raw: string): number {
  const s = String(raw ?? "")
    .replace(/[₽$€£]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const negByParens = /^\(.*\)$/.test(s);
  const clean = s.replace(/[()]/g, "");
  const n = parseFloat(clean);
  if (!Number.isFinite(n)) return 0;
  return negByParens ? -Math.abs(n) : n;
}

export function parseCsv(csv: string, sourceName?: string, mapping?: SheetMapping): SheetEntry[] {
  const lines = csv.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rowParser = lines[0].includes("\t") ? parseTsvRow : parseCsvRow;

  let iDate: number, iCategory: number, iAmount: number, iPark: number, iType: number, iComment: number;
  let dataStartLine: number;

  if (mapping) {
    // Use pre-configured mapping: column indices are known, skip header-detection
    const cm = mapping.columnMap;
    iDate     = cm.date     ?? -1;
    iCategory = cm.category ?? -1;
    iAmount   = cm.amount   ?? -1;
    iPark     = cm.park     ?? -1;
    iType     = cm.type     ?? -1;
    iComment  = cm.comment  ?? -1;
    dataStartLine = mapping.dataStartRow; // 0-based index into lines[]
  } else {
    const headers = rowParser(lines[0]);
    iDate     = findCol(headers, SHEET_COLUMNS.date);
    iCategory = findCol(headers, SHEET_COLUMNS.category);
    iAmount   = findCol(headers, SHEET_COLUMNS.amount);
    iPark     = findCol(headers, SHEET_COLUMNS.park);
    iType     = findCol(headers, SHEET_COLUMNS.type);
    iComment  = findCol(headers, SHEET_COLUMNS.comment);
    dataStartLine = 1;
  }

  // When mapping is user-configured, null columns mean "not in this sheet" — tolerate missing type/park
  // When auto-detecting (no mapping), throw if required columns are absent
  if (!mapping && [iDate, iCategory, iAmount, iPark, iType].some((idx) => idx === -1)) {
    throw new Error(
      `Таблица "${sourceName ?? "Google Sheets"}" не подходит по структуре. ` +
      `Нужны колонки: дата, категория, сумма, парк, тип` +
      (iComment === -1 ? ", комментарий — опционально." : ".")
    );
  }
  // With mapping: must have at least date and amount
  if (mapping && (iDate === -1 || iAmount === -1)) {
    throw new Error(
      `Маппинг таблицы "${sourceName ?? "Google Sheets"}" неполный: не указаны обязательные колонки дата и сумма.`
    );
  }

  return lines.slice(dataStartLine).map((line): SheetEntry => {
    const cols = rowParser(line);
    const dateCell = iDate !== -1 ? (cols[iDate] ?? "") : "";
    const categoryCell = iCategory !== -1 ? (cols[iCategory] ?? "") : "";
    const commentCell = iComment !== -1 ? (cols[iComment] ?? "") : "";

    // Skip summary rows: rows where all non-empty cells are numeric (totals)
    if (mapping?.skipSummaryRows) {
      const nonEmpty = cols.filter((c) => c.trim().length > 0);
      if (nonEmpty.length > 0 && nonEmpty.every((c) => !isNaN(Number(c.replace(/[\s,.₽%]/g, ""))))) {
        return null as unknown as SheetEntry;
      }
      const marker = `${dateCell} ${categoryCell} ${commentCell}`.toLowerCase();
      if (
        marker.includes("итого") ||
        marker.includes("итог") ||
        marker.includes("свод") ||
        marker.includes("total") ||
        marker.includes("баланс")
      ) {
        return null as unknown as SheetEntry;
      }
    }

    const rawAmount = iAmount !== -1 ? (cols[iAmount] ?? "0") : "0";
    const amount = normaliseAmount(rawAmount);
    const rawType = iType !== -1 ? (cols[iType] ?? "").toLowerCase().trim() : "";
    let type: EntryType = INCOME_LABELS.has(rawType) ? "income"
      : EXPENSE_LABELS.has(rawType) ? "expense"
      : "unknown";
    // If type column is missing/empty, infer by amount sign to avoid "all expenses" distortion.
    if (type === "unknown") {
      if (amount < 0) type = "expense";
      else if (amount > 0) type = "income";
    }

    const normalizedDate = normaliseDate(dateCell);
    return {
      date: normalizedDate,
      category: iCategory !== -1 ? (cols[iCategory] ?? "") : "",
      amount,
      park:     iPark     !== -1 ? (cols[iPark]     ?? "") : "",
      type,
      comment:  iComment  !== -1 ? (cols[iComment]  ?? "") : "",
      _sourceName: sourceName,
    };
  }).filter((e): e is SheetEntry => {
    if (!e) return false;
    if (mapping?.skipEmptyRows && !e.date && !e.amount) return false;
    // Always require valid date in normalised YYYY-MM-DD format.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
    return e.amount !== 0;
  });
}

// ── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchSheet(url: string, name?: string, mapping?: SheetMapping): Promise<SheetEntry[]> {
  // If mapping specifies a gid, use it (overrides whatever gid is in the url)
  let exportUrl: string;
  if (mapping?.sheetGid) {
    const idMatch = url.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      exportUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${mapping.sheetGid}`;
    } else {
      exportUrl = toExportUrl(url);
    }
  } else {
    exportUrl = toExportUrl(url);
  }
  const res = await fetch(exportUrl, { headers: { "User-Agent": "YoupiterBI/1.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${url.slice(0, 80)}`);
  return parseCsv(await res.text(), name, mapping);
}

export async function fetchAllSheets(
  docs: Array<{ url: string; name?: string; mapping?: SheetMapping }>
): Promise<SheetEntry[]> {
  const results = await Promise.allSettled(docs.map((d) => fetchSheet(d.url, d.name, d.mapping)));
  const all: SheetEntry[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  if (all.length === 0 && errors.length > 0) {
    throw new Error(errors[0]);
  }
  return all;
}

// ── Compute ─────────────────────────────────────────────────────────────────

export function computeFinanceMetrics(
  entries: SheetEntry[], from: string, to: string
): FinanceMetrics {
  const inRange = entries.filter((e) => e.date >= from && e.date <= to);

  let totalIncome = 0, totalExpense = 0;
  const byCategory: FinanceMetrics["byCategory"] = {};
  const byPark:     FinanceMetrics["byPark"]     = {};
  const dailyMap:   Record<string, { income: number; expense: number }> = {};

  for (const e of inRange) {
    const amt = Math.abs(e.amount);
    const isIn = e.type === "income";

    if (isIn) totalIncome  += amt; else totalExpense += amt;

    if (!byCategory[e.category]) byCategory[e.category] = { income: 0, expense: 0 };
    if (isIn) byCategory[e.category].income  += amt; else byCategory[e.category].expense += amt;

    const park = e.park || "Общее";
    if (!byPark[park]) byPark[park] = { income: 0, expense: 0 };
    if (isIn) byPark[park].income  += amt; else byPark[park].expense += amt;

    if (!dailyMap[e.date]) dailyMap[e.date] = { income: 0, expense: 0 };
    if (isIn) dailyMap[e.date].income  += amt; else dailyMap[e.date].expense += amt;
  }

  let balance = 0;
  const dailyCashflow = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { income, expense }]) => {
      balance += income - expense;
      return { date, income, expense, balance };
    });

  return {
    dateFrom: from, dateTo: to,
    totalIncome, totalExpense, profit: totalIncome - totalExpense,
    entries: inRange, byCategory, byPark, dailyCashflow,
  };
}
