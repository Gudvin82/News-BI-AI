import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type ServerAuditCategory =
  | "settings"
  | "integration"
  | "security"
  | "ai"
  | "logs"
  | "user";

export interface ServerAuditEntry {
  id: string;
  time: string;
  category: ServerAuditCategory;
  action: string;
  detail?: string;
  actorId?: string;
  actorRole?: string;
}

const FILE = "/opt/youpiter-bi/.server-audit-log.json";
const MAX_ENTRIES = 500;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function readAll(): ServerAuditEntry[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf8")) as ServerAuditEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: ServerAuditEntry[]) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export function readServerAudit() {
  return readAll();
}

export function appendServerAudit(
  entry: Omit<ServerAuditEntry, "id" | "time">,
) {
  const all = readAll();
  all.unshift({
    id: uid(),
    time: new Date().toISOString(),
    ...entry,
  });
  if (all.length > MAX_ENTRIES) all.splice(MAX_ENTRIES);
  writeAll(all);
}
