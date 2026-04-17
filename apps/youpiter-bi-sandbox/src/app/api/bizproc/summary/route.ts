import { NextResponse } from "next/server";
import { getBitrixWebhook } from "@/lib/server/bitrix-webhook";
import { isBitrixSectionEnabled } from "@/lib/server/integration-settings";

export const dynamic = "force-dynamic";

type ProcId = "invoice" | "fuel" | "cashout";

interface BizprocTask {
  ENTITY?: string;
  DOCUMENT_ID?: string;
  ID?: string;
  WORKFLOW_ID?: string;
  DOCUMENT_NAME?: string;
  NAME?: string;
  DOCUMENT_URL?: string;
}

interface WorkflowInstance {
  ID?: string;
  MODIFIED?: string;
  OWNED_UNTIL?: string | null;
}

interface BizprocResponseData {
  configured: boolean;
  enabledInSection: boolean;
  status: "ready" | "disabled" | "not_configured";
  summary: {
    totalCount: number;
    totalAmount: number;
    active: number;
    completedToday: number;
    overdue: number;
  };
  processes: Array<{
    id: ProcId;
    label: string;
    count: number;
    amount: number;
    active: number;
    completedToday: number;
    overdue: number;
  }>;
  range?: { from: string; to: string };
  message: string;
}

const BIZPROC_CACHE_TTL_MS = 45_000;
const bizprocCache = new Map<string, { ts: number; data: BizprocResponseData }>();

function methodUrl(webhook: string, method: string, qs = "") {
  return `${webhook}${method}.json${qs ? `?${qs}` : ""}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url: string) {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "YoupiterBI/1.0" },
    });
    if (res.status === 429 || res.status === 503) {
      attempt++;
      if (attempt > 5) {
        throw new Error("Too many requests");
      }
      await sleep(350 * attempt);
      continue;
    }
    return res.json();
  }
}

async function fetchInstancesByRange(
  webhook: string,
  from: string,
  to: string,
  maxPages = 80
): Promise<WorkflowInstance[]> {
  const out: WorkflowInstance[] = [];
  let start = 0;
  const fromIso = encodeURIComponent(`${from}T00:00:00+03:00`);
  const toIso = encodeURIComponent(`${to}T23:59:59+03:00`);
  for (let i = 0; i < maxPages; i++) {
    const qs = [
      `start=${start}`,
      `order%5BMODIFIED%5D=ASC`,
      `filter%5B%3E%3DMODIFIED%5D=${fromIso}`,
      `filter%5B%3C%3DMODIFIED%5D=${toIso}`,
    ].join("&");
    const json = await fetchJsonWithRetry(methodUrl(webhook, "bizproc.workflow.instances", qs));
    if (json?.error) throw new Error(`bizproc.workflow.instances: ${json.error_description ?? json.error}`);
    const batch = Array.isArray(json?.result) ? json.result as WorkflowInstance[] : [];
    out.push(...batch);
    if (!json?.next || batch.length === 0) break;
    start = Number(json.next) || 0;
    await sleep(250);
  }
  return out;
}

async function fetchTasksByWorkflowIds(
  webhook: string,
  workflowIds: string[],
  chunkSize = 25
): Promise<BizprocTask[]> {
  const out: BizprocTask[] = [];
  for (let i = 0; i < workflowIds.length; i += chunkSize) {
    const chunk = workflowIds.slice(i, i + chunkSize);
    let start = 0;
    while (true) {
      const qs = [`start=${start}`];
      chunk.forEach((id, idx) => qs.push(`filter%5BWORKFLOW_ID%5D%5B${idx}%5D=${encodeURIComponent(id)}`));
      const json = await fetchJsonWithRetry(methodUrl(webhook, "bizproc.task.list", qs.join("&")));
      if (json?.error) throw new Error(`bizproc.task.list: ${json.error_description ?? json.error}`);
      const batch = Array.isArray(json?.result)
        ? json.result as BizprocTask[]
        : Array.isArray(json?.result?.items)
        ? json.result.items as BizprocTask[]
        : [];
      out.push(...batch);
      if (!json?.next || batch.length === 0) break;
      start = Number(json.next) || 0;
      await sleep(120);
    }
    await sleep(150);
  }
  return out;
}

function pickProcess(text: string): ProcId | null {
  const t = text.toLowerCase();
  if (/(счет на оплат|сч[её]т на оплат)/.test(t)) return "invoice";
  if (/(списани[ея]\s+топлив|топлив.*тк|тк.*топлив)/.test(t)) return "fuel";
  if (/(выдач[ауы]\s+налич|выдач[ауы].*налич|наличн)/.test(t)) return "cashout";
  return null;
}

function parseAmount(text: string): number {
  const normalized = text.replace(/\u00A0/g, " ");
  const patterns = [
    /(?:в\s+сумме|на\s+сумму|сумма(?:\s+к\s+оплате)?|к\s+оплате)\s*[:\-]?\s*([0-9][0-9\s.,]*)/i,
    /([0-9][0-9\s.,]*)\s*(?:₽|руб\.?|рублей|rur)\b/i,
  ];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (!m?.[1]) continue;
    const v = Number(m[1].replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return 0;
}

function parseListRefFromUrl(url?: string | null): { iblockId: string; elementId: string } | null {
  if (!url) return null;
  const m = url.match(/list_id=(\d+).*?element_id=(\d+)/i);
  if (!m) return null;
  return { iblockId: m[1], elementId: m[2] };
}

function parsePositiveNumber(raw: unknown): number {
  if (typeof raw !== "string" && typeof raw !== "number") return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function getPropNumber(row: Record<string, unknown>, propCode: string): number {
  const prop = row[propCode];
  if (!prop || typeof prop !== "object") return 0;
  const values = Object.values(prop as Record<string, unknown>);
  for (const v of values) {
    const n = parsePositiveNumber(v);
    if (n > 0) return n;
  }
  return 0;
}

async function fetchListElementAmount(
  webhook: string,
  procId: ProcId,
  ref: { iblockId: string; elementId: string },
  cache: Map<string, number>
): Promise<number> {
  const key = `${ref.iblockId}:${ref.elementId}:${procId}`;
  const cached = cache.get(key);
  if (typeof cached === "number") return cached;

  const qs = [
    "IBLOCK_TYPE_ID=bitrix_processes",
    `IBLOCK_ID=${encodeURIComponent(ref.iblockId)}`,
    `ELEMENT_ID=${encodeURIComponent(ref.elementId)}`,
  ].join("&");
  const json = await fetchJsonWithRetry(methodUrl(webhook, "lists.element.get", qs));
  const rows = Array.isArray(json?.result) ? (json.result as Array<Record<string, unknown>>) : [];
  const row = rows[0];
  if (!row) {
    cache.set(key, 0);
    return 0;
  }

  let amount = 0;
  // For fuel compensation workflows we verified amount is in PROPERTY_168.
  if (procId === "fuel") {
    amount = getPropNumber(row, "PROPERTY_168");
  }
  if (amount <= 0) {
    // Fallback for other BP lists: try to find a reasonable positive amount in properties.
    for (const [k, v] of Object.entries(row)) {
      if (!k.startsWith("PROPERTY_")) continue;
      if (!v || typeof v !== "object") continue;
      const values = Object.values(v as Record<string, unknown>);
      for (const raw of values) {
        const n = parsePositiveNumber(raw);
        if (n > 0 && n < 1_000_000) {
          amount = n;
          break;
        }
      }
      if (amount > 0) break;
    }
  }

  cache.set(key, amount);
  return amount;
}

function startOfTodayMsk() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00+03:00`);
}

function toMskDateStart(day: string) {
  return new Date(`${day}T00:00:00+03:00`).getTime();
}

function toMskDateEnd(day: string) {
  return new Date(`${day}T23:59:59+03:00`).getTime();
}

function taskScore(task: BizprocTask) {
  const text = `${task.NAME ?? ""} ${task.DOCUMENT_NAME ?? ""}`;
  const amt = parseAmount(text);
  return (text.length || 0) + (amt > 0 ? 1000 : 0);
}

export async function GET(req: Request) {
  const webhook = getBitrixWebhook();
  const enabled = isBitrixSectionEnabled("bizproc");
  const ready = !!webhook && enabled;
  const sp = new URL(req.url).searchParams;
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = sp.get("from") ?? today;
  const to = sp.get("to") ?? from;
  const cacheKey = `${from}|${to}`;

  const processes: BizprocResponseData["processes"] = [
    { id: "invoice", label: "Счет на оплату", count: 0, amount: 0, active: 0, completedToday: 0, overdue: 0 },
    { id: "fuel", label: "Списание топлива по ТК", count: 0, amount: 0, active: 0, completedToday: 0, overdue: 0 },
    { id: "cashout", label: "Выдача наличных", count: 0, amount: 0, active: 0, completedToday: 0, overdue: 0 },
  ];

  if (!ready) {
    const data: BizprocResponseData = {
      configured: !!webhook,
      enabledInSection: enabled,
      status: ready ? "ready" : webhook ? "disabled" : "not_configured",
      summary: { totalCount: 0, totalAmount: 0, active: 0, completedToday: 0, overdue: 0 },
      processes,
      message: webhook
        ? "Вебхук есть, но раздел «Бизнес-процессы» не включен в интеграции."
        : "Сначала подключите Bitrix24 webhook.",
    };
    return NextResponse.json({
      ok: true,
      data,
    });
  }

  const cached = bizprocCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < BIZPROC_CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, data: cached.data });
  }

  try {
    const instances = await fetchInstancesByRange(webhook, from, to);
    const workflowIds = Array.from(new Set(instances.map((i) => i.ID).filter(Boolean))) as string[];
    const tasks = workflowIds.length > 0 ? await fetchTasksByWorkflowIds(webhook, workflowIds) : [];

    const byId = new Map<ProcId, (typeof processes)[number]>();
    for (const p of processes) byId.set(p.id as ProcId, p);

    const fromTs = toMskDateStart(from);
    const toTs = toMskDateEnd(to);
    const instanceById = new Map<string, WorkflowInstance>();
    for (const i of instances) if (i.ID) instanceById.set(i.ID, i);

    // One workflow can have many task records in Bitrix.
    // We keep one representative task per workflow to avoid duplicated counts/sums.
    const taskByWorkflow = new Map<string, BizprocTask>();
    for (const task of tasks) {
      const wf = task.WORKFLOW_ID;
      if (!wf) continue;
      const prev = taskByWorkflow.get(wf);
      if (!prev || taskScore(task) > taskScore(prev)) taskByWorkflow.set(wf, task);
    }

    let completedToday = 0;
    let overdue = 0;
    const startToday = startOfTodayMsk().getTime();
    const elementAmountCache = new Map<string, number>();

    for (const [wfId, inst] of instanceById.entries()) {
      const modifiedTs = inst.MODIFIED ? new Date(inst.MODIFIED).getTime() : 0;
      if (!modifiedTs || modifiedTs < fromTs || modifiedTs > toTs) continue;

      const task = taskByWorkflow.get(wfId);
      if (!task) continue;
      const text = `${task.NAME ?? ""} ${task.DOCUMENT_NAME ?? ""} ${task.DOCUMENT_URL ?? ""}`.trim();
      const procId = pickProcess(text);
      if (!procId) continue;

      const p = byId.get(procId);
      if (!p) continue;

      p.count += 1;
      let amount = parseAmount(text);
      if (amount <= 0) {
        const ref = parseListRefFromUrl(task.DOCUMENT_URL);
        if (ref) {
          amount = await fetchListElementAmount(webhook, procId, ref, elementAmountCache);
        }
      }
      p.amount += amount;

      const ownedUntilTs = inst.OWNED_UNTIL ? new Date(inst.OWNED_UNTIL).getTime() : 0;
      if (ownedUntilTs > Date.now()) {
        p.active += 1;
      } else if (ownedUntilTs > 0 && ownedUntilTs < Date.now()) {
        p.overdue += 1;
        overdue += 1;
      }

      if (modifiedTs >= startToday) {
        p.completedToday += 1;
        completedToday += 1;
      }
    }

    const summary = {
      totalCount: processes.reduce((s, p) => s + p.count, 0),
      totalAmount: processes.reduce((s, p) => s + p.amount, 0),
      active: processes.reduce((s, p) => s + p.active, 0),
      completedToday,
      overdue,
    };

    const data: BizprocResponseData = {
      configured: true,
      enabledInSection: true,
      status: "ready",
      summary,
      processes,
      range: { from, to },
      message: "Данные получены из Bitrix24 и отфильтрованы по выбранному периоду.",
    };
    bizprocCache.set(cacheKey, { ts: Date.now(), data });
    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallback = bizprocCache.get(cacheKey);
    if (fallback) {
      return NextResponse.json({
        ok: true,
        data: {
          ...fallback.data,
          message: `Данные из кэша (${Math.round((Date.now() - fallback.ts) / 1000)}с). Ошибка обновления: ${msg}`,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      data: {
        configured: true,
        enabledInSection: true,
        status: "ready",
        summary: { totalCount: 0, totalAmount: 0, active: 0, completedToday: 0, overdue: 0 },
        processes,
        range: { from, to },
        message: `Ошибка чтения БП: ${msg}`,
      },
    });
  }
}
