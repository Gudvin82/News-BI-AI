import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const BOT_DB_FILE = "/opt/youpiter-driver-bot/data/leads.sqlite3";
const BOT_LOG_FILE = "/opt/youpiter-driver-bot/logs/bot.log";

export interface HireBotLeadLog {
  id: number;
  createdAt: string;
  chatId: number;
  username: string;
  fullName: string;
  phone: string;
  email: string;
  scenarioSlug: string;
  bitrixLeadId: number | null;
  bitrixStatus: string;
  bitrixError: string;
  park: string;
  answersPreview: string;
}

export interface HireBotRuntimeFilters {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  q?: string;
  limit?: number;
}

export interface HireBotTimelineComment {
  id: number;
  created: string;
  authorId: string;
  comment: string;
  hasFiles: boolean;
}

type PythonLeadRow = {
  id: number;
  created_at: string;
  chat_id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string;
  scenario_slug: string;
  bitrix_lead_id: number | null;
  bitrix_status: string;
  bitrix_error: string;
  park: string;
  answers_preview: string;
};

const PY_READ_LEADS = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
filters = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
date_from = (filters.get("dateFrom") or "").strip()
date_to = (filters.get("dateTo") or "").strip()
status = (filters.get("status") or "").strip().lower()
query = (filters.get("q") or "").strip().lower()
limit = int(filters.get("limit") or 200)
if limit <= 0:
    limit = 200
if limit > 500:
    limit = 500

def find_park(value):
    if isinstance(value, dict):
        for k, v in value.items():
            key = str(k).lower()
            if ("park" in key) or ("парк" in key) or ("метро" in key) or ("metro" in key):
                if isinstance(v, (str, int, float)) and str(v).strip():
                    return str(v).strip()
            nested = find_park(v)
            if nested:
                return nested
    elif isinstance(value, list):
        for item in value:
            nested = find_park(item)
            if nested:
                return nested
    return ""

def preview_answers(value):
    if not isinstance(value, dict):
        return ""
    out = []
    for k, v in value.items():
        if isinstance(v, (dict, list)):
            continue
        vs = str(v).strip()
        if not vs:
            continue
        out.append(f"{k}: {vs}")
        if len(out) >= 4:
            break
    return " · ".join(out)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    where = []
    params = []
    if date_from:
      where.append("date(created_at) >= date(?)")
      params.append(date_from)
    if date_to:
      where.append("date(created_at) <= date(?)")
      params.append(date_to)
    if status and status != "all":
      where.append("lower(bitrix_status) = ?")
      params.append(status)
    if query:
      where.append("(lower(coalesce(full_name,'')) like ? or lower(coalesce(username,'')) like ? or lower(coalesce(phone,'')) like ? or cast(coalesce(bitrix_lead_id,'') as text) like ?)")
      q = "%" + query + "%"
      params.extend([q, q, q, q])

    sql = "select id, created_at, chat_id, username, full_name, phone, email, scenario_slug, bitrix_lead_id, bitrix_status, bitrix_error, answers_json from leads"
    if where:
      sql += " where " + " and ".join(where)
    sql += " order by id desc limit ?"
    params.append(limit)

    rows = conn.execute(sql, params).fetchall()
    data = []
    for row in rows:
      answers = {}
      raw_answers = row["answers_json"] or "{}"
      try:
        answers = json.loads(raw_answers)
      except Exception:
        answers = {}
      data.append({
        "id": int(row["id"]),
        "created_at": str(row["created_at"] or ""),
        "chat_id": int(row["chat_id"] or 0),
        "username": str(row["username"] or ""),
        "full_name": str(row["full_name"] or ""),
        "phone": str(row["phone"] or ""),
        "email": str(row["email"] or ""),
        "scenario_slug": str(row["scenario_slug"] or ""),
        "bitrix_lead_id": int(row["bitrix_lead_id"]) if row["bitrix_lead_id"] is not None else None,
        "bitrix_status": str(row["bitrix_status"] or ""),
        "bitrix_error": str(row["bitrix_error"] or ""),
        "park": find_park(answers),
        "answers_preview": preview_answers(answers),
      })
    print(json.dumps({"ok": True, "rows": data}, ensure_ascii=False))
finally:
    conn.close()
`;

function toIso(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function readHireBotLeads(filters: HireBotRuntimeFilters = {}): HireBotLeadLog[] {
  if (!existsSync(BOT_DB_FILE)) return [];
  try {
    const out = execFileSync(
      "python3",
      ["-c", PY_READ_LEADS, BOT_DB_FILE, JSON.stringify(filters)],
      { encoding: "utf8", timeout: 10_000, maxBuffer: 3 * 1024 * 1024 },
    );
    const parsed = JSON.parse(out) as { ok: boolean; rows: PythonLeadRow[] };
    if (!parsed.ok || !Array.isArray(parsed.rows)) return [];
    return parsed.rows.map((row) => ({
      id: row.id,
      createdAt: toIso(row.created_at),
      chatId: row.chat_id,
      username: row.username,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      scenarioSlug: row.scenario_slug,
      bitrixLeadId: row.bitrix_lead_id,
      bitrixStatus: row.bitrix_status || "pending",
      bitrixError: row.bitrix_error || "",
      park: row.park || "—",
      answersPreview: row.answers_preview || "",
    }));
  } catch {
    return [];
  }
}

export function readHireBotLogTail(lines = 120): string[] {
  if (!existsSync(BOT_LOG_FILE)) return [];
  try {
    const content = readFileSync(BOT_LOG_FILE, "utf8");
    const rows = content.split(/\r?\n/).filter(Boolean);
    return rows.slice(-Math.max(10, Math.min(lines, 500)));
  } catch {
    return [];
  }
}

export async function fetchBitrixLeadTimeline(
  webhookUrl: string,
  leadId: number,
  limit = 50,
): Promise<HireBotTimelineComment[]> {
  const webhook = webhookUrl.trim().replace(/\/+$/, "");
  if (!webhook || !Number.isFinite(leadId) || leadId <= 0) return [];
  const url = `${webhook}/crm.timeline.comment.list.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "YoupiterBI/1.0",
    },
    body: JSON.stringify({
      filter: {
        ENTITY_TYPE: "lead",
        ENTITY_ID: Math.trunc(leadId),
      },
      order: { ID: "DESC" },
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) return [];
  const listRaw = Array.isArray(body?.result)
    ? body.result
    : (Array.isArray(body?.result?.items) ? body.result.items : []);
  const list = listRaw.slice(0, Math.max(1, Math.min(limit, 200)));
  return list.map((row: Record<string, unknown>) => ({
    id: Number(row.ID ?? 0),
    created: String(row.CREATED ?? ""),
    authorId: String(row.AUTHOR_ID ?? ""),
    comment: String(row.COMMENT ?? ""),
    hasFiles: Array.isArray(row.FILES) ? row.FILES.length > 0 : false,
  }));
}

