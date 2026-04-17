import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readEnvFileValue, writeEnvFileValue } from "@/lib/server/env-file";

const FILE = "/opt/youpiter-bi/.hire-bot-admin.json";
const BOT_PATH = "/opt/youpiter-driver-bot";

export type HireBotStepType = "text" | "single" | "multi";

export interface HireBotQuickButton {
  id: string;
  label: string;
  action: string;
  order: number;
}

export interface HireBotScenarioStep {
  id: string;
  order: number;
  type: HireBotStepType;
  title: string;
  text: string;
  options: string[];
  condition: string;
  nextStepId?: string;
}

export interface HireBotScenarioSnapshot {
  status: "draft" | "published";
  draft: HireBotScenarioStep[];
  published: HireBotScenarioStep[];
}

export interface HireBotScenarioHistoryItem {
  id: string;
  at: string;
  actor?: string;
  note: string;
  snapshot?: HireBotScenarioSnapshot;
}

export interface HireBotParkMap {
  id: string;
  metro: string;
  fullAddress: string;
  shortLabel: string;
  bitrixStringValue: string;
  bitrixEnumId?: string;
}

export interface HireBotAdminConfig {
  bot: {
    username: string;
    slug: string;
    fullDescription: string;
    shortDescription: string;
    greeting: string;
    quickButtons: HireBotQuickButton[];
  };
  scenario: {
    status: "draft" | "published";
    draft: HireBotScenarioStep[];
    published: HireBotScenarioStep[];
    updatedAt: string;
    history: HireBotScenarioHistoryItem[];
  };
  parks: {
    bitrixStringField: string;
    bitrixEnumField: string;
    items: HireBotParkMap[];
  };
  bitrix: {
    mode: "webhook";
    webhookUrl: string;
    assignedById: string;
    leadStatusId: string;
    duplicateMode: "always_new" | "update_duplicates";
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function defaultConfig(): HireBotAdminConfig {
  return {
    bot: {
      username: "@Youpiter_quiz_bot",
      slug: "youpiter_quiz_bot",
      fullDescription: "Бот найма водителей Youpiter Taxi",
      shortDescription: "Квиз найма водителей",
      greeting: "Привет! Ответьте на несколько вопросов и мы свяжемся с вами.",
      quickButtons: [
        { id: uid(), label: "Начать анкету", action: "start_quiz", order: 1 },
        { id: uid(), label: "Связаться с менеджером", action: "contact_manager", order: 2 },
      ],
    },
    scenario: {
      status: "draft",
      draft: [],
      published: [],
      updatedAt: nowIso(),
      history: [],
    },
    parks: {
      bitrixStringField: "UF_CRM_1745483677126",
      bitrixEnumField: "UF_CRM_1741343224057",
      items: [],
    },
    bitrix: {
      mode: "webhook",
      webhookUrl: "https://example.bitrix24.ru/rest/1/your_webhook",
      assignedById: "1",
      leadStatusId: "NEW",
      duplicateMode: "always_new",
    },
  };
}

export function readHireBotConfig(): HireBotAdminConfig {
  try {
    if (!existsSync(FILE)) return defaultConfig();
    const raw = readFileSync(FILE, "utf8");
    return { ...defaultConfig(), ...JSON.parse(raw) } as HireBotAdminConfig;
  } catch {
    return defaultConfig();
  }
}

export function writeHireBotConfig(next: HireBotAdminConfig) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export function readBotToken() {
  return readEnvFileValue("TELEGRAM_BOT_TOKEN");
}

export function writeBotToken(token: string) {
  if (!token.trim()) return;
  writeEnvFileValue("TELEGRAM_BOT_TOKEN", token.trim());
}

export function maskToken(token: string) {
  if (!token) return "";
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 6)}••••••${token.slice(-4)}`;
}

export function getBotRuntimeInfo() {
  return {
    path: BOT_PATH,
    service: "youpiter-driver-bot.service",
    mode: "systemd",
  };
}
