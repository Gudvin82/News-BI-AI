import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { HireBotAdminConfig, HireBotScenarioStep } from "@/lib/server/hire-bot-config";

const BOT_ROOT = "/opt/youpiter-driver-bot";
const BOT_ENV_FILE = join(BOT_ROOT, "config/.env");
const BOT_BOTS_FILE = join(BOT_ROOT, "config/bots.json");
const BOT_SCENARIOS_DIR = join(BOT_ROOT, "config/scenarios");
const BOT_RUNTIME_OVERRIDES_FILE = join(BOT_ROOT, "config/runtime-overrides.json");

const BI_STATE_FILE = "/opt/youpiter-bi/.hire-bot-sync-state.json";
const BACKUPS_DIR = "/opt/youpiter-bi/.hire-bot-backups";
const MANAGED_SCENARIO_SLUG = "driver_hiring_managed";

export interface HireBotSyncStatus {
  lastAppliedAt?: string;
  appliedBy?: string;
  backupId?: string;
  serviceActive?: boolean;
  serviceStatus?: string;
  lastError?: string;
  backups: string[];
}

function safeRead(file: string) {
  try {
    if (!existsSync(file)) return "";
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function ensureDir(fileOrDir: string) {
  mkdirSync(fileOrDir, { recursive: true });
}

function nowBackupId() {
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${ts}_${suffix}`;
}

function readState(): HireBotSyncStatus {
  try {
    const raw = safeRead(BI_STATE_FILE);
    if (!raw) return { backups: [] };
    const parsed = JSON.parse(raw) as HireBotSyncStatus;
    parsed.backups = Array.isArray(parsed.backups) ? parsed.backups : [];
    return parsed;
  } catch {
    return { backups: [] };
  }
}

function writeState(next: HireBotSyncStatus) {
  ensureDir(dirname(BI_STATE_FILE));
  writeFileSync(BI_STATE_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

function readEnvFile(file: string) {
  const text = safeRead(file);
  const out = new Map<string, string>();
  text.split(/\r?\n/).forEach((row) => {
    const line = row.trim();
    if (!line || line.startsWith("#")) return;
    const i = line.indexOf("=");
    if (i <= 0) return;
    out.set(line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, ""));
  });
  return out;
}

function writeEnvFile(file: string, patch: Record<string, string>) {
  const map = readEnvFile(file);
  Object.entries(patch).forEach(([k, v]) => map.set(k, v.trim()));
  const lines = [...map.entries()].map(([k, v]) => `${k}=${v}`);
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function sanitizeKey(input: string, fallback: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) return fallback;
  return normalized.length > 48 ? normalized.slice(0, 48) : normalized;
}

function cleanMetroLabel(label: string) {
  return label.replace("Ⓜ️", "").trim();
}

function mapStepType(type: HireBotScenarioStep["type"]) {
  if (type === "single") return "single_choice";
  if (type === "multi") return "multi_choice";
  return "text";
}

function buildScenarioFromAdmin(cfg: HireBotAdminConfig) {
  const source =
    cfg.scenario.status === "published" && cfg.scenario.published.length > 0
      ? cfg.scenario.published
      : cfg.scenario.draft;
  const ordered = [...source].sort((a, b) => a.order - b.order);

  const questions = ordered.map((s, idx) => {
    const key = sanitizeKey(s.title || s.id || `step_${idx + 1}`, `step_${idx + 1}`);
    const answerType = mapStepType(s.type);
    const row: {
      key: string;
      text: string;
      answer_type: string;
      options?: Array<{ key: string; text: string; order: number }>;
    } = {
      key,
      text: (s.text || s.title || `Шаг ${idx + 1}`).trim(),
      answer_type: answerType,
    };
    if ((s.type === "single" || s.type === "multi") && Array.isArray(s.options)) {
      row.options = s.options
        .map((o, i) => ({ key: sanitizeKey(o, `opt_${i + 1}`), text: o.trim(), order: i + 1 }))
        .filter((o) => o.text);
    }
    return row;
  });

  const greetParts = cfg.bot.greeting
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5);
  const welcomeMessages = (greetParts.length ? greetParts : ["Здравствуйте! Вы в Youpiter Taxi 🚕"]).map((text, i) => ({
    delay_seconds: i * 2,
    text,
  }));

  return {
    slug: MANAGED_SCENARIO_SLUG,
    title: cfg.bot.fullDescription?.slice(0, 90) || "Найм водителей",
    welcome_messages: welcomeMessages,
    questions,
    contact_form: {
      ask_name_text: "Как к вам обращаться? (имя обязательно)",
      ask_phone_text: "Оставьте ваш телефон (обязательно):",
      ask_email_text: "Email для связи (необязательно, можно написать 'пропустить'):",
      after_submit_text: "Спасибо! Заявка отправлена с пометкой Бот ТГ ✅ Мы свяжемся с вами до 15 минут.",
    },
  };
}

function buildBotsJson(cfg: HireBotAdminConfig, tokenValue: string) {
  const username = cfg.bot.username.replace(/^@/, "").trim();
  return {
    bots: [
      {
        slug: cfg.bot.slug.trim() || "youpiter_quiz_bot",
        token: tokenValue || "",
        display_name: cfg.bot.fullDescription?.slice(0, 60) || "Youpiter Driver Hiring",
        username,
        short_description: cfg.bot.shortDescription || "Квиз найма водителей",
        full_description: cfg.bot.fullDescription || "Бот найма водителей Youpiter Taxi",
        scenario_slug: MANAGED_SCENARIO_SLUG,
      },
    ],
  };
}

function buildRuntimeOverrides(cfg: HireBotAdminConfig) {
  const parkEnumMap: Record<string, string> = {};
  const parkStringMap: Record<string, string> = {};

  cfg.parks.items.forEach((p) => {
    const keys = [p.metro, p.shortLabel, p.fullAddress]
      .map((x) => cleanMetroLabel(String(x || "").toLowerCase()))
      .filter(Boolean);
    keys.forEach((k) => {
      if (p.bitrixEnumId) parkEnumMap[k] = String(p.bitrixEnumId).trim();
      if (p.bitrixStringValue) parkStringMap[k] = String(p.bitrixStringValue).trim();
    });
  });

  return {
    lead_status_id: cfg.bitrix.leadStatusId || "14",
    duplicate_mode: cfg.bitrix.duplicateMode || "always_new",
    park_string_field: cfg.parks.bitrixStringField || "UF_CRM_1745483677126",
    park_enum_field: cfg.parks.bitrixEnumField || "UF_CRM_1741343224057",
    park_enum_map: parkEnumMap,
    park_string_map: parkStringMap,
    source_description: `Бот ТГ @${cfg.bot.username.replace(/^@/, "") || "Youpiter_quiz_bot"}`,
  };
}

function serviceStatusText() {
  try {
    return execFileSync("systemctl", ["is-active", "youpiter-driver-bot.service"], {
      encoding: "utf8",
      timeout: 7000,
    }).trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `error:${msg.slice(0, 120)}`;
  }
}

function serviceRestart() {
  execFileSync("systemctl", ["restart", "youpiter-driver-bot.service"], {
    encoding: "utf8",
    timeout: 20_000,
  });
}

function writeBackupFiles(backupRoot: string) {
  ensureDir(backupRoot);
  ensureDir(join(backupRoot, "config/scenarios"));
  writeFileSync(join(backupRoot, "config/.env"), safeRead(BOT_ENV_FILE), "utf8");
  writeFileSync(join(backupRoot, "config/bots.json"), safeRead(BOT_BOTS_FILE), "utf8");
  writeFileSync(
    join(backupRoot, `config/scenarios/${MANAGED_SCENARIO_SLUG}.json`),
    safeRead(join(BOT_SCENARIOS_DIR, `${MANAGED_SCENARIO_SLUG}.json`)),
    "utf8",
  );
  writeFileSync(
    join(backupRoot, "config/runtime-overrides.json"),
    safeRead(BOT_RUNTIME_OVERRIDES_FILE),
    "utf8",
  );
}

export function readHireBotSyncStatus(): HireBotSyncStatus {
  const state = readState();
  let backups: string[] = [];
  try {
    if (existsSync(BACKUPS_DIR)) {
      backups = readdirSync(BACKUPS_DIR)
        .filter((x) => !x.startsWith("."))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 20);
    }
  } catch {
    backups = [];
  }
  const serviceStatus = serviceStatusText();
  return {
    ...state,
    backups,
    serviceStatus,
    serviceActive: serviceStatus === "active",
  };
}

export function applyConfigToRuntime(cfg: HireBotAdminConfig, token: string, actor: string) {
  ensureDir(BACKUPS_DIR);
  ensureDir(BOT_SCENARIOS_DIR);

  const backupId = nowBackupId();
  const backupRoot = join(BACKUPS_DIR, backupId);
  writeBackupFiles(backupRoot);

  const scenario = buildScenarioFromAdmin(cfg);
  const botsJson = buildBotsJson(cfg, token);
  const runtimeOverrides = buildRuntimeOverrides(cfg);

  writeFileSync(join(BOT_SCENARIOS_DIR, `${MANAGED_SCENARIO_SLUG}.json`), `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
  writeFileSync(BOT_BOTS_FILE, `${JSON.stringify(botsJson, null, 2)}\n`, "utf8");
  writeFileSync(BOT_RUNTIME_OVERRIDES_FILE, `${JSON.stringify(runtimeOverrides, null, 2)}\n`, "utf8");

  writeEnvFile(BOT_ENV_FILE, {
    BOT_SLUG: botsJson.bots[0].slug,
    TELEGRAM_BOT_TOKEN: token,
    BITRIX_MODE: "webhook",
    BITRIX_WEBHOOK_URL: cfg.bitrix.webhookUrl.trim().replace(/\/+$/, ""),
    BITRIX_ASSIGNED_BY_ID: String(cfg.bitrix.assignedById || "1"),
  });

  serviceRestart();
  const status = serviceStatusText();
  if (status !== "active") {
    throw new Error(`Сервис youpiter-driver-bot после рестарта не active: ${status}`);
  }

  const prev = readState();
  writeState({
    ...prev,
    lastAppliedAt: new Date().toISOString(),
    appliedBy: actor,
    backupId,
    lastError: "",
    backups: [backupId, ...(prev.backups ?? [])].slice(0, 20),
    serviceStatus: status,
    serviceActive: true,
  });
  return { backupId, serviceStatus: status, scenarioSlug: MANAGED_SCENARIO_SLUG };
}

export function rollbackRuntimeConfig(backupId: string, actor: string) {
  const backupRoot = join(BACKUPS_DIR, basename(backupId));
  if (!existsSync(backupRoot)) {
    throw new Error("Бэкап не найден.");
  }
  const srcEnv = join(backupRoot, "config/.env");
  const srcBots = join(backupRoot, "config/bots.json");
  const srcScenario = join(backupRoot, `config/scenarios/${MANAGED_SCENARIO_SLUG}.json`);
  const srcRuntime = join(backupRoot, "config/runtime-overrides.json");

  writeFileSync(BOT_ENV_FILE, safeRead(srcEnv), "utf8");
  writeFileSync(BOT_BOTS_FILE, safeRead(srcBots), "utf8");
  writeFileSync(join(BOT_SCENARIOS_DIR, `${MANAGED_SCENARIO_SLUG}.json`), safeRead(srcScenario), "utf8");
  writeFileSync(BOT_RUNTIME_OVERRIDES_FILE, safeRead(srcRuntime), "utf8");

  serviceRestart();
  const status = serviceStatusText();
  if (status !== "active") {
    throw new Error(`Сервис после rollback не active: ${status}`);
  }

  const prev = readState();
  writeState({
    ...prev,
    lastAppliedAt: new Date().toISOString(),
    appliedBy: actor,
    backupId,
    lastError: "",
    serviceStatus: status,
    serviceActive: true,
  });
  return { rollbackId: backupId, serviceStatus: status };
}

export function setSyncError(message: string) {
  const prev = readState();
  const serviceStatus = serviceStatusText();
  writeState({
    ...prev,
    lastError: message.slice(0, 500),
    serviceStatus,
    serviceActive: serviceStatus === "active",
  });
}
