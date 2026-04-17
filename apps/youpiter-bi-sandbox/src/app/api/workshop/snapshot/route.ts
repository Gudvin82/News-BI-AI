import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db/client";
import type { WorkshopSummaryData } from "@/app/api/workshop/summary/route";

export const dynamic = "force-dynamic";

const SUMMARY_URL =
  process.env.WORKSHOP_SUMMARY_URL ??
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vT4NZQw8N_qHhL2dgHdP0GKzDIAUJy4LCZGJW-9l_Ty3aM6q9l0vURECdsD_JR0-DXZb1yOZEGCMcA5/pub?output=csv";

export type SnapshotType = "morning" | "evening" | "adhoc";

// Returns Moscow date string YYYY-MM-DD for a given UTC Date
function mskDateStr(d: Date = new Date()): string {
  const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return msk.toISOString().slice(0, 10);
}

// Fetch live summary data
async function fetchLiveSummary(): Promise<WorkshopSummaryData> {
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

  const res = await fetch(SUMMARY_URL, {
    headers: { "User-Agent": "YoupiterBI/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();
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

  const slice = rawLines.slice(0, 20);
  const groups: WorkshopSummaryData["groups"] = [];
  const extras: WorkshopSummaryData["extras"] = [];
  let grandTotal = 0;
  let currentGroup: WorkshopSummaryData["groups"][0] | null = null;
  let inExtras = false;

  for (const line of slice) {
    const cols = parseCsvRow(line);
    while (cols.length < 8) cols.push("");
    const colB = cols[1]?.trim() ?? "";
    const colE = cols[4]?.trim() ?? "";
    const colH = cols[7]?.trim() ?? "";
    const count = parseInt(colH.replace(/\s/g, ""), 10);
    const hasCount = !isNaN(count) && count > 0;

    if (colB && !colB.toUpperCase().includes("ИТОГ")) {
      currentGroup = { category: colB, items: [], total: 0 };
      groups.push(currentGroup);
      inExtras = false;
    }
    if (!colE) continue;
    const nameUpper = colE.toUpperCase();
    if (nameUpper.includes("ИТОГО") && nameUpper.includes("РЕМОНТ") && !nameUpper.includes("СЛЕС") && !nameUpper.includes("КУЗОВ")) {
      if (hasCount) grandTotal = count;
      inExtras = true;
      continue;
    }
    if (nameUpper.includes("ИТОГО") || nameUpper.includes("ИТОГ")) {
      if (hasCount && currentGroup) currentGroup.total = count;
      continue;
    }
    if (inExtras) {
      if (hasCount) extras.push({ name: colE, count });
      continue;
    }
    if (currentGroup && hasCount) {
      currentGroup.items.push({ name: colE, count });
    }
  }

  return { groups, grandTotal, extras, updatedAt: new Date().toISOString() };
}

// POST /api/workshop/snapshot
// Body: { date?: "YYYY-MM-DD", type?: "morning" | "evening" | "adhoc" }
export async function POST(req: Request) {
  try {
    let targetDate = mskDateStr();
    let snapshotType: SnapshotType = "evening";

    try {
      const body = await req.json() as { date?: string; type?: string } | null;
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) targetDate = body.date;
      if (body?.type === "morning" || body?.type === "adhoc") snapshotType = body.type;
    } catch { /* body not json or empty */ }

    const liveData = await fetchLiveSummary();

    await query(
      `INSERT INTO workshop_daily_snapshots (snapshot_date, snapshot_type, grand_total, groups, extras, captured_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
       ON CONFLICT (snapshot_date, snapshot_type) DO UPDATE
         SET grand_total  = EXCLUDED.grand_total,
             groups       = EXCLUDED.groups,
             extras       = EXCLUDED.extras,
             captured_at  = NOW()`,
      [targetDate, snapshotType, liveData.grandTotal, JSON.stringify(liveData.groups), JSON.stringify(liveData.extras)]
    );

    return NextResponse.json({ ok: true, date: targetDate, type: snapshotType, grandTotal: liveData.grandTotal });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка сохранения снапшота" },
      { status: 500 }
    );
  }
}

// GET /api/workshop/snapshot?date=YYYY-MM-DD&type=morning|evening|adhoc
export async function GET(req: Request) {
  try {
    const url  = new URL(req.url);
    const date = url.searchParams.get("date") ?? mskDateStr();
    const type = (url.searchParams.get("type") ?? "evening") as SnapshotType;

    const row = await queryOne<{
      snapshot_date: string;
      snapshot_type: string;
      grand_total: number;
      groups: WorkshopSummaryData["groups"];
      extras: WorkshopSummaryData["extras"];
      captured_at: string;
    }>(
      `SELECT snapshot_date::text, snapshot_type, grand_total, groups, extras, captured_at
       FROM workshop_daily_snapshots
       WHERE snapshot_date = $1 AND snapshot_type = $2`,
      [date, type]
    );

    if (!row) return NextResponse.json({ ok: true, data: null, date, type });

    return NextResponse.json({
      ok: true,
      data: {
        groups:       row.groups,
        grandTotal:   row.grand_total,
        extras:       row.extras,
        updatedAt:    row.captured_at,
        snapshotDate: row.snapshot_date,
        snapshotType: row.snapshot_type,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Ошибка загрузки снапшота" },
      { status: 500 }
    );
  }
}
