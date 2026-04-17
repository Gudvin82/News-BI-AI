import { readEnvFileValue } from "@/lib/server/env-file";
import { readBitrixIntegrationSettings } from "@/lib/server/integration-settings";

export function getBitrixWebhook() {
  const settings = readBitrixIntegrationSettings();
  return settings.webhook || process.env.BITRIX_WEBHOOK || readEnvFileValue("BITRIX_WEBHOOK") || "";
}
