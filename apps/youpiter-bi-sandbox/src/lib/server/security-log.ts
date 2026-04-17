import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type SecurityEventType =
  | "login_success"
  | "login_failed"
  | "logout"
  | "settings_pin_success"
  | "settings_pin_failed";

export interface SecurityLogEntry {
  id: string;
  time: string;
  type: SecurityEventType;
  ip?: string;
  userId?: string;
  userName?: string;
  role?: string;
  sessionId?: string;
  detail?: string;
}

const FILE = "/opt/youpiter-bi/.security-log.json";
const MAX_ENTRIES = 1000;
const ACTIVE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function readAll(): SecurityLogEntry[] {
  try {
    if (!existsSync(FILE)) return [];
    return JSON.parse(readFileSync(FILE, "utf8")) as SecurityLogEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: SecurityLogEntry[]) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export function appendSecurityLog(entry: Omit<SecurityLogEntry, "id" | "time">) {
  const all = readAll();
  all.unshift({
    id: uid(),
    time: new Date().toISOString(),
    ...entry,
  });
  if (all.length > MAX_ENTRIES) all.splice(MAX_ENTRIES);
  writeAll(all);
}

export function readSecurityLog() {
  return readAll();
}

export function getActiveSessions(entries = readAll()) {
  const now = Date.now();
  const logoutIds = new Set(
    entries
      .filter((entry) => entry.type === "logout" && entry.sessionId)
      .map((entry) => entry.sessionId as string),
  );

  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.type === "login_success" && entry.sessionId)
    .filter((entry) => !logoutIds.has(entry.sessionId as string))
    .filter((entry) => now - Date.parse(entry.time) <= ACTIVE_WINDOW_MS)
    .filter((entry) => {
      const key = entry.sessionId as string;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
