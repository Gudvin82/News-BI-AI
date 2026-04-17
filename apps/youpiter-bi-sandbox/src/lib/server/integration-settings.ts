import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = "/opt/youpiter-bi/.integration-settings.json";

export interface BitrixIntegrationSettings {
  webhook: string;
  sections: string[];
}

export interface TaxiIntegrationSettings {
  token: string;
  sections: string[];
}

export interface YandexIntegrationSettings {
  token: string;
  clientId: string;
  sections: string[];
}

interface IntegrationSettingsFile {
  bitrix?: BitrixIntegrationSettings;
  taxicrm?: TaxiIntegrationSettings;
  yandex?: YandexIntegrationSettings;
}

function readAll(): IntegrationSettingsFile {
  try {
    if (!existsSync(FILE)) return {};
    return JSON.parse(readFileSync(FILE, "utf8")) as IntegrationSettingsFile;
  } catch {
    return {};
  }
}

function writeAll(data: IntegrationSettingsFile) {
  writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function readBitrixIntegrationSettings(): BitrixIntegrationSettings {
  const all = readAll();
  return {
    webhook: all.bitrix?.webhook ?? "",
    sections: Array.isArray(all.bitrix?.sections) ? all.bitrix!.sections : ["hire", "dtp", "bizproc"],
  };
}

export function writeBitrixIntegrationSettings(data: BitrixIntegrationSettings) {
  const all = readAll();
  all.bitrix = {
    webhook: data.webhook,
    sections: data.sections,
  };
  writeAll(all);
}

export function isBitrixSectionEnabled(section: string) {
  const settings = readBitrixIntegrationSettings();
  return settings.sections.includes(section);
}

export function readTaxiIntegrationSettings(): TaxiIntegrationSettings {
  const all = readAll();
  return {
    token: all.taxicrm?.token ?? "",
    sections: Array.isArray(all.taxicrm?.sections) ? all.taxicrm!.sections : ["operations"],
  };
}

export function writeTaxiIntegrationSettings(data: TaxiIntegrationSettings) {
  const all = readAll();
  all.taxicrm = {
    token: data.token,
    sections: data.sections,
  };
  writeAll(all);
}

export function isTaxiSectionEnabled(section: string) {
  const settings = readTaxiIntegrationSettings();
  return settings.sections.includes(section);
}

export function readYandexIntegrationSettings(): YandexIntegrationSettings {
  const all = readAll();
  return {
    token: all.yandex?.token ?? "",
    clientId: all.yandex?.clientId ?? "",
    sections: Array.isArray(all.yandex?.sections) ? all.yandex!.sections : ["marketing"],
  };
}

export function writeYandexIntegrationSettings(data: YandexIntegrationSettings) {
  const all = readAll();
  all.yandex = {
    token: data.token,
    clientId: data.clientId,
    sections: data.sections,
  };
  writeAll(all);
}

export function isYandexSectionEnabled(section: string) {
  const settings = readYandexIntegrationSettings();
  return settings.sections.includes(section);
}
