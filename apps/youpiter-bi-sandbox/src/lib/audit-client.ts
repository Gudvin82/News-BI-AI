"use client";

import { apiFetch } from "@/lib/utils";

export async function writeServerAudit(
  category: "settings" | "integration" | "security" | "ai" | "logs" | "user",
  action: string,
  detail?: string,
) {
  try {
    await apiFetch("/api/settings/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, action, detail }),
    });
  } catch {
    // ignore audit write failures on client
  }
}
