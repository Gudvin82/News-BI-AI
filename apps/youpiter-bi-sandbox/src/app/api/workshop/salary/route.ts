import { NextResponse } from "next/server";
import { listSheets, fetchSheetGrid, SheetGrid, SheetCell } from "@/lib/google/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.SALARY_SPREADSHEET_ID ?? "";

// ── Month helpers ─────────────────────────────────────────────────────────────

const RU_MONTHS: Record<string, string> = {
  "январ": "01", "феврал": "02", "март": "03", "апрел": "04",
  "май": "05", "мая": "05", "июн": "06", "июл": "07", "август": "08",
  "сентябр": "09", "октябр": "10", "ноябр": "11", "декабр": "12",
};

/**
 * Extract "MM.YYYY" from a sheet title like "МЕХ. Апрель 2026 г." → "04.2026"
 * Returns null if the title doesn't contain a recognizable month+year.
 */
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

// ── Pay rules ────────────────────────────────────────────────────────────────

type Section = "mechanic" | "driver";

const PARK_NAMES = new Set([
  "дунайская", "купчино", "ладожская", "лесная",
  "старая деревня", "мурино", "парнас", "автово", "девяткино",
]);

function isWeekday(dayPrefix: string): boolean {
  return !["сб", "вс"].includes(dayPrefix.toLowerCase().slice(0, 2));
}

/**
 * Parse "dd.MM.yyyy" from a dateLabel like "ср 01.04.2026" → Date object (UTC noon)
 */
function parseDateLabel(label: string): Date | null {
  // label format: "ср 01.04.2026"
  const m = label.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12));
}

// Today's date at UTC noon (stable comparison)
function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
}

/**
 * Classify a cell by its text value, background color, and date.
 *
 * Rules:
 * - Colored background (green or yellow) = worked, always count.
 * - "РАБ." / park name (uncolored) = count ONLY if the date is ≤ today.
 *   Future uncolored РАБ. = planned, not yet fact.
 * - Special statuses (ОТПУСК, СТАЖ, БОЛЬ, УВОЛ, 0.5) always use text logic.
 */
function classifyCell(
  cell: SheetCell,
  section: Section,
  dayPrefix: string,
  dateLabel?: string,
): { pay: number; shifts: number } {
  const s = cell.value.trim().toLowerCase();

  // Colored background (green OR yellow) = worked shift regardless of date
  if (cell.color) {
    const { red, green, blue } = cell.color;
    const isGreen = green > red + 0.1 && green > blue + 0.1;
    const isYellow = red > 0.8 && green > 0.7 && blue < 0.5;
    if (isGreen || isYellow) {
      return { pay: section === "mechanic" ? 3500 : 3000, shifts: 1 };
    }
  }

  // Text-based classification
  if (!s || s === "?" || s.startsWith("увол")) return { pay: 0, shifts: 0 };
  if (s === "вых." || s === "вых") return { pay: 0, shifts: 0 };
  if (s === "боль") return { pay: 0, shifts: 0 };

  if (s === "гл.мех" || s === "гл мех") {
    if (section === "driver") return { pay: 0, shifts: 0 };
    return { pay: 3500, shifts: 1 };
  }

  if (s === "механик") {
    if (section === "driver") return { pay: 6000, shifts: 1 };
    return { pay: 3500, shifts: 1 };
  }

  if (s === "отпуск") {
    if (!isWeekday(dayPrefix)) return { pay: 0, shifts: 0 };
    return { pay: section === "mechanic" ? 3000 : 2500, shifts: 0 };
  }

  if (s === "стаж") return { pay: section === "mechanic" ? 3500 : 3000, shifts: 1 };
  if (s.includes("0.5")) return { pay: section === "mechanic" ? 1750 : 1500, shifts: 0.5 };

  // РАБ. or park name (uncolored) — only count if date ≤ today
  const isPastOrToday = !dateLabel || (() => {
    const d = parseDateLabel(dateLabel);
    return d ? d <= todayUtc() : true;
  })();

  if (s.startsWith("раб")) {
    if (!isPastOrToday) return { pay: 0, shifts: 0 };
    return { pay: section === "mechanic" ? 3500 : 3000, shifts: 1 };
  }

  for (const p of PARK_NAMES) {
    if (s.includes(p)) {
      if (!isPastOrToday) return { pay: 0, shifts: 0 };
      return { pay: section === "mechanic" ? 3500 : 3000, shifts: 1 };
    }
  }

  return { pay: 0, shifts: 0 };
}

// ── Grid parser ───────────────────────────────────────────────────────────────

interface WorkerResult {
  name: string;
  park: string;
  section: Section;
  shifts: number;
  pay: number;
  days: Record<string, { raw: string; pay: number; shifts: number; colored: boolean }>;
}

interface ParkResult {
  park: string;
  section: Section;
  totalShifts: number;
  totalPay: number;
  workers: WorkerResult[];
}

function val(cell: SheetCell | undefined): string {
  return cell?.value.trim() ?? "";
}

const SKIP_PREFIXES = [
  "топлив", "итого", "сумма", "в т.ч", "всего", "начальник",
  "примечани", "ф.и.о", "расход", "строка",
];
function isServiceRow(name: string): boolean {
  const lc = name.toLowerCase();
  return SKIP_PREFIXES.some((p) => lc.startsWith(p));
}

function extractParkName(raw: string): string {
  return raw
    .replace(/^перегонщики\s+атп\s*/i, "")
    .replace(/^атп\s*/i, "")
    .replace(/\s*перегонщики.*/i, "")
    .replace(/"/g, "")
    .replace(/\s+с \d{1,2}:\d{2}.*$/i, "")
    .trim();
}

/**
 * Parse a "МЕХ." sheet grid.
 * Format:
 *   Row N:   [park/section header, ...]
 *   Row N+1: [ФИО, дата1, дата2, ...]
 *   Row N+2+: [worker name, status1, status2, ...]
 */
function parseSheetGrid(grid: SheetGrid, filterMonth?: string): ParkResult[] {
  const results: ParkResult[] = [];

  let currentPark = "";
  let currentSection: Section = "mechanic";
  let dates: string[] = [];      // day prefix "пн","вт", "" if filtered
  let dateLabels: string[] = []; // "пн 01.04.2026", "" if filtered
  let colOffset = 1;             // where dates start in each worker row

  for (const row of grid) {
    const first = val(row[0]);
    if (!first) continue;

    const firstLc = first.toLowerCase();

    // ── Park / section header ─────────────────────────────────────────────
    // Formats:
    //   Old: "АТП ЛАДОЖСКАЯ" | plan | "ГРАФИК" | date1 | date2 | ...  (dates embedded)
    //   New: "АТП "Ладожская"" | ...  (separate ФИО row follows)
    //   Pereg: "Главный механик\Перегонщики" or "Главный механик"
    const isAtpRow = firstLc.includes("атп") || firstLc.startsWith("перегонщики");
    const isGlMech = firstLc.includes("главный механик") || firstLc === "главный механик\\перегонщики";

    if (isAtpRow || isGlMech) {
      if (isGlMech) {
        // Chief mechanic / drivers section — keep currentPark, switch section
        currentSection = firstLc.includes("перегон") ? "driver" : "mechanic";
      } else {
        currentPark = extractParkName(first);
        currentSection = firstLc.includes("перегон") ? "driver" : "mechanic";
      }

      if (currentPark && !results.find((r) => r.park === currentPark && r.section === currentSection)) {
        results.push({ park: currentPark, section: currentSection, totalShifts: 0, totalPay: 0, workers: [] });
      }

      // Old format: dates are embedded in this same row starting at col[3]
      if (val(row[2]) === "ГРАФИК") {
        colOffset = 3;
        dates = [];
        dateLabels = [];
        for (let i = 3; i < row.length; i++) {
          const d = val(row[i]);
          if (d && /^[а-яё]{2}\s+\d{2}\.\d{2}/.test(d)) {
            const datePart = d.slice(3);
            const monthYear = datePart.slice(3);
            if (filterMonth && monthYear !== filterMonth) {
              dates.push(""); dateLabels.push("");
            } else {
              dates.push(d.slice(0, 2).toLowerCase());
              dateLabels.push(d);
            }
          } else {
            dates.push(""); dateLabels.push("");
          }
        }
      } else {
        // New format: dates will come from the ФИО row below
        dates = [];
        dateLabels = [];
      }
      continue;
    }

    // ── Date header row: "ФИО" in col[0] (new format only) ───────────────
    if (first === "ФИО") {
      colOffset = 1;
      dates = [];
      dateLabels = [];
      for (let i = 1; i < row.length; i++) {
        const d = val(row[i]);
        if (d && /^[а-яё]{2}\s+\d{2}\.\d{2}/.test(d)) {
          const datePart = d.slice(3);
          const monthYear = datePart.slice(3);
          if (filterMonth && monthYear !== filterMonth) {
            dates.push(""); dateLabels.push("");
          } else {
            dates.push(d.slice(0, 2).toLowerCase());
            dateLabels.push(d);
          }
        } else {
          dates.push(""); dateLabels.push("");
        }
      }
      continue;
    }

    // ── Worker row ────────────────────────────────────────────────────────
    if (!dates.length || !currentPark) continue;
    if (isServiceRow(first)) continue;

    let totalPay = 0;
    let totalShifts = 0;
    const days: WorkerResult["days"] = {};

    for (let i = 0; i < dates.length; i++) {
      const colIdx = i + colOffset;
      const cell = row[colIdx] as SheetCell | undefined;
      if (!cell) continue;
      const dayPrefix = dates[i];
      if (!dayPrefix) continue;

      const { pay, shifts } = classifyCell(cell, currentSection, dayPrefix, dateLabels[i]);
      totalPay += pay;
      totalShifts += shifts;

      if (cell.value || cell.color) {
        days[dateLabels[i]] = {
          raw: cell.value,
          pay,
          shifts,
          colored: cell.color !== null,
        };
      }
    }

    const parkEntry = results.find((r) => r.park === currentPark && r.section === currentSection);
    if (!parkEntry) continue;

    const existing = parkEntry.workers.find((w) => w.name === first);
    if (existing) {
      existing.pay += totalPay;
      existing.shifts += totalShifts;
      Object.assign(existing.days, days);
    } else {
      parkEntry.workers.push({
        name: first, park: currentPark, section: currentSection,
        shifts: totalShifts, pay: totalPay, days,
      });
    }

    parkEntry.totalShifts += totalShifts;
    parkEntry.totalPay += totalPay;
  }

  return results.filter((r) => r.workers.length > 0);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!SPREADSHEET_ID) {
    return NextResponse.json(
      { ok: false, error: "SALARY_SPREADSHEET_ID не задан в .env.local" },
      { status: 503 }
    );
  }

  const sp = new URL(req.url).searchParams;
  const filterMonth = sp.get("month") ?? undefined; // "MM.YYYY"

  try {
    // Get all sheets, filter those starting with "МЕХ."
    const allSheets = await listSheets(SPREADSHEET_ID);
    const mechSheets = allSheets.filter((s) => s.title.toUpperCase().startsWith("МЕХ."));

    if (!mechSheets.length) {
      return NextResponse.json({ ok: false, error: "Вкладки МЕХ. не найдены в таблице." }, { status: 404 });
    }

    // If filterMonth given, only load sheets whose title matches that month
    const sheetsToLoad = filterMonth
      ? mechSheets.filter((s) => sheetTitleToMonthYear(s.title) === filterMonth)
      : mechSheets;

    // Fetch and parse each relevant sheet
    const allParks: ParkResult[] = [];

    await Promise.all(
      sheetsToLoad.map(async (sheet) => {
        const grid = await fetchSheetGrid(SPREADSHEET_ID, sheet.title);
        const parks = parseSheetGrid(grid, filterMonth);

        // Merge parks across sheets (same park may appear in multiple sheets)
        for (const p of parks) {
          const existing = allParks.find(
            (r) => r.park === p.park && r.section === p.section
          );
          if (existing) {
            existing.totalShifts += p.totalShifts;
            existing.totalPay += p.totalPay;
            for (const w of p.workers) {
              const ew = existing.workers.find((x) => x.name === w.name);
              if (ew) {
                ew.shifts += w.shifts;
                ew.pay += w.pay;
                Object.assign(ew.days, w.days);
              } else {
                existing.workers.push(w);
              }
            }
          } else {
            allParks.push(p);
          }
        }
      })
    );

    const totalPay = allParks.reduce((s, p) => s + p.totalPay, 0);
    const totalShifts = allParks.reduce((s, p) => s + p.totalShifts, 0);

    return NextResponse.json({ ok: true, data: { parks: allParks, totalPay, totalShifts } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
