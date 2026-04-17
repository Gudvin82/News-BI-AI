"use client";

export type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";
export type DataFreshnessSection = "finance" | "hire" | "dtp" | "bizproc" | "workshop";

export interface GeneralSettingsData {
  timezone: string;
  currency: string;
  dateFormat: string;
  weekStartsOn: "monday" | "sunday";
  companyName: string;
  projectShortName: string;
  logoUrl: string;
  weekendDays: number[];
  holidayDates: string[];
  defaultDatePreset: DatePreset;
  payrollCutoffDay: number;
}

export interface FreshnessMap {
  finance?: string;
  hire?: string;
  dtp?: string;
  bizproc?: string;
  workshop?: string;
}

export interface NotificationChannelConfig {
  enabled: boolean;
  destination: string;
  frequency: "daily" | "weekly" | "monthly";
  time: string;
  reports: string[];
  token?: string;
  sender?: string;
  webhook?: string;
}

export interface NotificationSettingsData {
  bitrix: NotificationChannelConfig;
  telegram: NotificationChannelConfig;
  email: NotificationChannelConfig;
}

const SETTINGS_ACCESS_KEY = "yb_settings_access";
const SETTINGS_GENERAL_KEY = "yb_settings_general";
const FRESHNESS_KEY = "yb_settings_freshness";
const NOTIFICATIONS_KEY = "yb_settings_notifications";
const LOGS_BACKUP_KEY = "yb_audit_log_backup";
const SETTINGS_PIN_TTL_MS = 1000 * 60 * 60 * 12;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function defaultGeneralSettings(): GeneralSettingsData {
  return {
    timezone: "Europe/Moscow",
    currency: "RUB",
    dateFormat: "DD.MM.YYYY",
    weekStartsOn: "monday",
    companyName: "YouPiter Taxi",
    projectShortName: "YouPiter BI",
    logoUrl: "",
    weekendDays: [0, 6],
    holidayDates: [],
    defaultDatePreset: "month",
    payrollCutoffDay: 25,
  };
}

export function readGeneralSettings() {
  return {
    ...defaultGeneralSettings(),
    ...readJson<Partial<GeneralSettingsData>>(SETTINGS_GENERAL_KEY, {}),
  };
}

export function saveGeneralSettings(data: GeneralSettingsData) {
  writeJson(SETTINGS_GENERAL_KEY, data);
}

export function hasSettingsAccess() {
  const grantedAt = readJson<number | null>(SETTINGS_ACCESS_KEY, null);
  return typeof grantedAt === "number" && Date.now() - grantedAt < SETTINGS_PIN_TTL_MS;
}

export function grantSettingsAccess() {
  writeJson(SETTINGS_ACCESS_KEY, Date.now());
}

export function revokeSettingsAccess() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SETTINGS_ACCESS_KEY);
}

export function markDataFreshness(section: DataFreshnessSection) {
  const current = readJson<FreshnessMap>(FRESHNESS_KEY, {});
  current[section] = new Date().toISOString();
  writeJson(FRESHNESS_KEY, current);
}

export function readDataFreshness() {
  return readJson<FreshnessMap>(FRESHNESS_KEY, {});
}

export function defaultNotificationsSettings(): NotificationSettingsData {
  const emptyChannel: NotificationChannelConfig = {
    enabled: false,
    destination: "",
    frequency: "daily",
    time: "09:00",
    reports: [],
  };
  return {
    bitrix: { ...emptyChannel, destination: "Чат Bitrix" },
    telegram: { ...emptyChannel, destination: "@username" },
    email: { ...emptyChannel, destination: "owner@example.com" },
  };
}

export function readNotificationsSettings() {
  return {
    ...defaultNotificationsSettings(),
    ...readJson<Partial<NotificationSettingsData>>(NOTIFICATIONS_KEY, {}),
  };
}

export function saveNotificationsSettings(data: NotificationSettingsData) {
  writeJson(NOTIFICATIONS_KEY, data);
}

export function saveLogsBackup(data: unknown) {
  writeJson(LOGS_BACKUP_KEY, data);
}

export function readLogsBackup<T = unknown>() {
  return readJson<T | null>(LOGS_BACKUP_KEY, null);
}

export function clearLogsBackup() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOGS_BACKUP_KEY);
}
