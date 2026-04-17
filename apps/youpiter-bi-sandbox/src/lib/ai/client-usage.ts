"use client";

const KEY = "yb_ai_usage_log";
const MAX_ENTRIES = 150;

export interface AiUsageEntry {
  id: string;
  time: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costRub: number;
  balance?: number | null;
}

interface UsageShape {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost_rub?: number;
  balance?: number;
}

export function readAiUsageLog(): AiUsageEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function appendAiUsageLog(provider: string, model: string, usage?: UsageShape | null) {
  if (!usage || typeof window === "undefined") return;

  const entry: AiUsageEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
    provider,
    model,
    promptTokens: Number(usage.prompt_tokens) || 0,
    completionTokens: Number(usage.completion_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || 0,
    costRub: Number(usage.cost_rub) || 0,
    balance: typeof usage.balance === "number" ? usage.balance : null,
  };

  const next = [entry, ...readAiUsageLog()].slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(next));
}

