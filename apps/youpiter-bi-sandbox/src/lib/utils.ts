import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prepend basePath so fetch() works behind /youpiter prefix in production */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, init);
}

export function encodeHeaderJson(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function readTaxiClientSettings() {
  const data = readLocalJson<{ token?: string; sections?: string[] }>("yb_int_taxicrm", {});
  return {
    token: data.token ?? "",
    enabled: !Array.isArray(data.sections) || data.sections.includes("operations"),
  };
}

export function readYandexClientSettings() {
  const data = readLocalJson<{ token?: string; clientId?: string; sections?: string[] }>("yb_int_yandex", {});
  return {
    token: data.token ?? "",
    clientId: data.clientId ?? "",
    enabled: !Array.isArray(data.sections) || data.sections.includes("marketing"),
  };
}

export function readSheetsDocsForSection(section: string) {
  const docs = readLocalJson<Array<{ url?: string; name?: string; sections?: string[]; mapping?: unknown }>>("yb_int_gsheets", []);
  return docs
    .filter((d) => d.url && (!d.sections || d.sections.includes(section)))
    .map((d) => ({ url: d.url!, name: d.name, mapping: d.mapping }));
}

export function formatCurrency(value: number, currency = "RUB"): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}
