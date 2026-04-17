import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQi2ttyNsntCXSmCcmg_9bOvjL-XUgW8SaWzmFiQ5cE1U55EkT9nOhdzfbPg9kCZw/pub?output=csv";

const SHEETS = {
  cashflow: "2115356419",   // Кэш-фло факт
  expenses: "585196201",    // ПланФакт — Расходы
  income:   "219401437",    // ПланФакт — Доходы
};

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

async function fetchCsv(gid: string): Promise<string[][]> {
  const url = `${BASE}&gid=${gid}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "YoupiterBI/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for gid=${gid}`);
  const text = await res.text();

  // Split lines respecting quoted newlines
  const lines: string[] = [];
  let buf = "", open = 0;
  for (const ch of text) {
    if (ch === '"') { open = open ? 0 : 1; buf += ch; }
    else if ((ch === "\n" || ch === "\r") && !open) {
      const t = buf.replace(/\r$/, "").trim();
      if (t) lines.push(buf.replace(/\r$/, ""));
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) lines.push(buf);
  return lines.map(parseCsvRow);
}

// ── Number cleaner ────────────────────────────────────────────────────────────
function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, "").replace(",", ".");
  if (s === "#DIV/0!" || s === "-" || s === "—") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Months in order ───────────────────────────────────────────────────────────
// Кэш-фло fact columns: [0]=Отдел [1]=Источник [2]=янв.26 [3]=фев.26 [4]=мар.26...
const CASHFLOW_MONTHS = ["янв.26", "фев.26", "мар.26", "апр.26", "май.26", "июн.26",
                         "июл.26", "авг.26", "сент.26", "окт.26", "ноя.26", "дек.26"];
// ПланФакт columns: [0]=ОТДЕЛ [1]=ДОЛЖНОСТЬ [2]=Январь [3]=Февраль...
const PF_MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
                   "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

// ── Parse Кэш-фло факт ────────────────────────────────────────────────────────
export interface ParkMonth {
  cars: number | null;
  activeCars: number | null;
  utilPct: number | null;       // % выхода as 0–100
  revenue: number | null;       // Итого Прямые доходы
  revenuePerCar: number | null;
  expenses: number | null;      // Итого расходы по отделу
  profit: number | null;        // Прибыль по отделу
  profitPerCar: number | null;
}

export interface ParkData {
  park: string;
  months: Record<string, ParkMonth>; // key = "янв.26" etc.
}

export interface TotalMonth {
  revenue: number | null;
  expenses: number | null;
  profit: number | null;
  cashflow: number | null;  // Операционный денежный поток за месяц
  cars: number | null;
  activeCars: number | null;
  utilPct: number | null;
}

function parseCashflow(rows: string[][]): { parks: ParkData[]; totals: Record<string, TotalMonth> } {
  // header row: Отдел, Источник, янв.26 ...
  const header = rows[0];
  const mStart = 2; // month columns start at index 2

  const parksMap: Record<string, Record<string, Partial<ParkMonth>>> = {};
  const totals: Record<string, Partial<TotalMonth>> = {};

  let curPark = "";

  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    const dept = r[0]?.trim() ?? "";
    const src  = r[1]?.trim() ?? "";
    if (!dept && !src) continue;

    const isTotal = dept === "Все Парки" || dept === "Все парки";

    if (dept && !isTotal) curPark = dept;
    const park = isTotal ? "__total__" : (dept || curPark);

    // helper: value for month index mi (0=янв)
    const v = (mi: number) => num(r[mStart + mi]);

    const ensurePark = (p: string) => {
      if (!parksMap[p]) parksMap[p] = {};
      return parksMap[p];
    };

    const ensureMonth = (p: string, mi: number) => {
      const key = CASHFLOW_MONTHS[mi];
      const pm = ensurePark(p);
      if (!pm[key]) pm[key] = {};
      return pm[key];
    };

    if (isTotal) {
      for (let mi = 0; mi < CASHFLOW_MONTHS.length; mi++) {
        const key = CASHFLOW_MONTHS[mi];
        if (!totals[key]) totals[key] = {};
        const val = v(mi);
        const sl = src.toLowerCase();
        if (sl.includes("итого доход") && !sl.includes("на 1") && !sl.includes("прямые")) totals[key].revenue = val;
        if (sl.includes("итого расход") && !sl.includes("на 1") && !sl.includes("прямые")) totals[key].expenses = val;
        if (sl.includes("итого прибыль") && !sl.includes("на 1") && !sl.includes("учред")) totals[key].profit = val;
        if (sl.includes("операционный денежный поток за месяц")) totals[key].cashflow = val;
        if (sl.includes("кол-во а/м всего")) totals[key].cars = val;
        if (sl.includes("кол-во активных") && sl.includes("парк")) totals[key].activeCars = val;
        if (sl.includes("средний % выхода")) totals[key].utilPct = val !== null ? val * 100 : null;
      }
      continue;
    }

    for (let mi = 0; mi < CASHFLOW_MONTHS.length; mi++) {
      const m = ensureMonth(park, mi);
      const val = v(mi);
      const sl = src.toLowerCase();
      if (sl === "кол-во а/м") m.cars = val;
      else if (sl === "кол-во активных  а/м") m.activeCars = val;
      else if (sl === "%выхода") m.utilPct = val !== null ? val * 100 : null;
      else if (sl.includes("итого прямые доходы отдела")) m.revenue = val;
      else if (sl.includes("прямые доходы отдела на 1а/м")) m.revenuePerCar = val;
      else if (sl.includes("итого расходы по отделу") && !sl.includes("на 1")) m.expenses = val;
      else if (sl.includes("прибыль по отделу") && !sl.includes("на 1") && !sl.includes("накопит")) m.profit = val;
      else if (sl.includes("прибыль по отделу на 1 а/м")) m.profitPerCar = val;
    }
  }

  // Convert maps to arrays
  const parks: ParkData[] = Object.entries(parksMap)
    .filter(([k]) => k !== "__total__")
    .map(([park, months]) => ({
      park,
      months: Object.fromEntries(
        Object.entries(months).map(([k, v]) => [k, v as ParkMonth])
      ),
    }));

  return {
    parks,
    totals: Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, v as TotalMonth])
    ),
  };
}

// ── Parse ПланФакт Расходы ────────────────────────────────────────────────────
export interface ExpenseRow {
  park: string;
  category: string;
  months: Record<string, number | null>;
  yearTotal: number | null;
}

function parsePfExpenses(rows: string[][]): { rows: ExpenseRow[]; months: string[] } {
  // Find header row (contains "Январь")
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some(c => c.trim() === "Январь")) { headerIdx = i; break; }
  }
  const header = rows[headerIdx];
  const monthCols: number[] = [];
  const monthNames: string[] = [];
  header.forEach((h, i) => {
    if (PF_MONTHS.includes(h.trim())) { monthCols.push(i); monthNames.push(h.trim()); }
  });
  // ИТОГО ЗА ГОД col
  const totalColIdx = header.findIndex(h => h.includes("ИТОГО ЗА ГОД"));

  const result: ExpenseRow[] = [];
  let curPark = "";

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const r = rows[ri];
    const col0 = r[0]?.trim() ?? "";
    const col1 = r[1]?.trim() ?? "";
    if (!col0 && !col1) continue;
    if (col0) curPark = col0;

    const category = col1;
    if (!category) continue;
    // Skip summary rows like "Итог:" or "Итог" or empty category
    if (category.toLowerCase().startsWith("итог")) continue;
    // Skip rows like %% выхода, Кол-во авто
    if (category.startsWith("%%") || category.toLowerCase().startsWith("кол-во") || category.startsWith("%")) continue;

    const months: Record<string, number | null> = {};
    for (let ci = 0; ci < monthCols.length; ci++) {
      months[monthNames[ci]] = num(r[monthCols[ci]]);
    }
    const yearTotal = totalColIdx >= 0 ? num(r[totalColIdx]) : null;

    result.push({ park: curPark || "Общие", category, months, yearTotal });
  }

  return { rows: result, months: monthNames };
}

// ── Parse ПланФакт Доходы ─────────────────────────────────────────────────────
export interface IncomeRow {
  park: string;
  source: string;
  months: Record<string, number | null>;
  yearTotal: number | null;
}

function parsePfIncome(rows: string[][]): { rows: IncomeRow[]; months: string[] } {
  // Same structure as expenses
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].some(c => c.trim() === "Январь")) { headerIdx = i; break; }
  }
  const header = rows[headerIdx];
  const monthCols: number[] = [];
  const monthNames: string[] = [];
  header.forEach((h, i) => {
    if (PF_MONTHS.includes(h.trim())) { monthCols.push(i); monthNames.push(h.trim()); }
  });
  const totalColIdx = header.findIndex(h => h.includes("ИТОГО ЗА ГОД"));

  const result: IncomeRow[] = [];
  let curPark = "";

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const r = rows[ri];
    const col0 = r[0]?.trim() ?? "";
    const col1 = r[1]?.trim() ?? "";
    if (!col0 && !col1) continue;
    if (col0) curPark = col0;
    const source = col1;
    if (!source) continue;
    if (source.toLowerCase().startsWith("итог")) continue;

    const months: Record<string, number | null> = {};
    for (let ci = 0; ci < monthCols.length; ci++) {
      months[monthNames[ci]] = num(r[monthCols[ci]]);
    }
    const yearTotal = totalColIdx >= 0 ? num(r[totalColIdx]) : null;

    result.push({ park: curPark || "Общие", source, months, yearTotal });
  }

  return { rows: result, months: monthNames };
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "all";

  try {
    const results: Record<string, unknown> = {};

    if (tab === "all" || tab === "cashflow") {
      const rows = await fetchCsv(SHEETS.cashflow);
      results.cashflow = parseCashflow(rows);
      results.cashflowMonths = CASHFLOW_MONTHS;
    }
    if (tab === "all" || tab === "expenses") {
      const rows = await fetchCsv(SHEETS.expenses);
      results.expenses = parsePfExpenses(rows);
    }
    if (tab === "all" || tab === "income") {
      const rows = await fetchCsv(SHEETS.income);
      results.income = parsePfIncome(rows);
    }

    return NextResponse.json({ ok: true, data: results, updatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}
