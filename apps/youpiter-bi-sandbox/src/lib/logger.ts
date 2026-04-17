// Simple client-side audit logger → localStorage "yb_audit_log"
// Max 150 entries, FIFO rotation.

export type LogType = "auth" | "settings" | "integration" | "report" | "user" | "system";

export interface LogEntry {
  id: string;
  time: string;       // ISO
  type: LogType;
  text: string;
  detail?: string;
}

const KEY     = "yb_audit_log";
const MAX_LOG = 150;
const EVENT_NAME = "yb_audit_log_updated";

function now() { return new Date().toISOString(); }
function uid() { return Math.random().toString(36).slice(2, 9); }

export function readLogs(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function writeLog(type: LogType, text: string, detail?: string) {
  if (typeof window === "undefined") return;
  const entry: LogEntry = { id: uid(), time: now(), type, text, ...(detail ? { detail } : {}) };
  try {
    const logs = readLogs();
    logs.unshift(entry);
    if (logs.length > MAX_LOG) logs.splice(MAX_LOG);
    localStorage.setItem(KEY, JSON.stringify(logs));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch { /* ignore */ }
}

export function clearLogs() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function replaceLogs(entries: LogEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_LOG)));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function exportLogsJson() {
  if (typeof window === "undefined") return "[]";
  return JSON.stringify(readLogs(), null, 2);
}

export function subscribeLogs(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
