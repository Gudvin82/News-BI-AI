"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { Eye, EyeOff, Save, Zap, CheckCircle, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { writeLog } from "@/lib/logger";
import { appendAiUsageLog } from "@/lib/ai/client-usage";
import { PinDialog } from "@/components/settings/PinDialog";
import { writeServerAudit } from "@/lib/audit-client";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 6) + "••••••••" + key.slice(-4);
}

export default function AISettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState<string>(AI_PROVIDERS[0].id);
  const [apiKey, setApiKey]       = useState("");
  const [savedKey, setSavedKey]   = useState("");   // masked display of stored key
  const [showKey, setShowKey]     = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(AI_PROVIDERS[0].models[0]);
  const [testPrompt, setTestPrompt] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testOk, setTestOk]         = useState<boolean | null>(null);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // System prompt
  const [systemPrompt, setSystemPrompt]   = useState("");
  const [promptSaved, setPromptSaved]     = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const provider = localStorage.getItem("yb_ai_provider");
    const model    = localStorage.getItem("yb_ai_model");
    const key      = localStorage.getItem("yb_ai_key") ?? "";
    const prompt   = localStorage.getItem("yb_ai_system_prompt") ?? "";

    if (provider) {
      setSelectedProvider(provider);
      const p = AI_PROVIDERS.find((x) => x.id === provider);
      if (p) setSelectedModel((model && p.models.includes(model as never)) ? model : p.models[0] as string);
    }
    if (key)    setSavedKey(key);
    if (prompt) setSystemPrompt(prompt);
  }, []);

  function handleProviderChange(id: string) {
    setSelectedProvider(id);
    const p = AI_PROVIDERS.find((x) => x.id === id);
    if (p) setSelectedModel(p.models[0] as string);
  }

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      localStorage.setItem("yb_ai_provider", selectedProvider);
      localStorage.setItem("yb_ai_model", selectedModel);
      localStorage.setItem("yb_ai_key", apiKey);
      setSavedKey(apiKey);
      writeLog("settings", `AI-ключ сохранён: ${AI_PROVIDERS.find((p) => p.id === selectedProvider)?.name ?? selectedProvider}`);
      void writeServerAudit("ai", "Сохранён AI-ключ", `${selectedProvider} · ${selectedModel}`);
      await apiFetch("/api/ai/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedProvider, apiKey, model: selectedModel }),
      });
      setApiKey("");
    } finally {
      setSaving(false);
    }
  }

  function handleRemoveKey() {
    localStorage.removeItem("yb_ai_key");
    setSavedKey("");
    setApiKey("");
    writeLog("settings", "AI-ключ удалён");
    void writeServerAudit("ai", "Удалён AI-ключ", selectedProvider);
  }

  function handleSavePrompt() {
    localStorage.setItem("yb_ai_system_prompt", systemPrompt);
    setPromptSaved(true);
    writeLog("settings", "Системный промт обновлён");
    void writeServerAudit("ai", "Обновлён системный промт ИИ", selectedProvider);
    setTimeout(() => setPromptSaved(false), 2000);
  }

  async function handleTest() {
    if (!testPrompt.trim()) return;
    const key = savedKey || localStorage.getItem("yb_ai_key") || "";
    setTesting(true);
    setTestResult("");
    setTestOk(null);
    try {
      const res = await apiFetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: testPrompt,
          provider: selectedProvider,
          model: selectedModel,
          apiKey: key,
          systemPrompt: systemPrompt || undefined,
        }),
      });
      const data = await res.json();
      setTestOk(data.ok);
      setTestResult(data.data?.response ?? data.error ?? "Нет ответа");
      if (data.ok) {
        appendAiUsageLog(selectedProvider, data.data?.model ?? selectedModel, data.data?.usage);
      }
    } finally {
      setTesting(false);
    }
  }

  const provider = AI_PROVIDERS.find((p) => p.id === selectedProvider) ?? AI_PROVIDERS[0];
  const hasKey   = !!savedKey;

  return (
    <div className="space-y-6" style={{ maxWidth: "860px" }}>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text)" }}>ИИ и API-ключи</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Настройка AI-провайдера для аналитики и подсказок
        </p>
      </div>

      <div className="flex gap-5 items-start">
        {/* ── Left: key settings ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Provider */}
          <Card>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Провайдер</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AI_PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => handleProviderChange(p.id)}
                  className="flex items-start gap-3 p-3 rounded-xl text-left transition-all"
                  style={{
                    background: selectedProvider === p.id ? "var(--color-brand-soft)" : "var(--color-surface-2)",
                    border: selectedProvider === p.id ? "1.5px solid var(--color-brand)" : "1.5px solid transparent",
                    color: "var(--color-text)",
                  }}>
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: selectedProvider === p.id ? "var(--color-brand)" : "var(--color-border)" }} />
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{p.baseUrl}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* API Key */}
          <Card>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>API-ключ</h2>

            {/* Active key badge */}
            {hasKey && (
              <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#10B981" }} />
                  <span className="text-xs font-medium" style={{ color: "#10B981" }}>Активный ключ:</span>
                  <span className="text-xs font-mono" style={{ color: "var(--color-text)" }}>{maskKey(savedKey)}</span>
                </div>
                <button onClick={() => setConfirmDeleteOpen(true)}
                  className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors"
                  style={{ color: "var(--color-muted)" }} title="Удалить ключ">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasKey ? "Введите новый ключ для замены" : `Ключ для ${provider.name}`}
                  className="w-full h-9 px-3 pr-10 rounded-lg text-sm outline-none transition-all"
                  style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                />
                <button type="button" onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--color-muted)" }}>
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={handleSave} loading={saving} disabled={!apiKey.trim()} size="sm">
                <Save className="w-3.5 h-3.5" />
                {hasKey ? "Заменить" : "Сохранить"}
              </Button>
            </div>
          </Card>

          {/* Model */}
          <Card>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Модель</h2>
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full h-9 px-3 rounded-lg text-sm outline-none"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              {(provider.models as readonly string[]).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Card>

          {/* Test */}
          <Card>
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text)" }}>Тест подключения</h2>
            {!hasKey && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}>
                Сохраните API-ключ выше чтобы протестировать подключение
              </div>
            )}
            <textarea value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="Напишите тестовый запрос, например: 'Привет! Как дела?'"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none mb-2"
              style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            <Button onClick={handleTest} loading={testing} disabled={!testPrompt.trim() || !hasKey} variant="secondary" size="sm">
              <Zap className="w-3.5 h-3.5" />
              Проверить ключ
            </Button>
            {testResult && (
              <div className="mt-3 p-3 rounded-lg text-sm"
                style={{
                  background: testOk ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${testOk ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                  color: "var(--color-text)",
                }}>
                {testResult}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right: system prompt ── */}
        <div className="w-64 flex-shrink-0 space-y-2">
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Системный промт</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>
                Инструкция для ИИ — как он должен отвечать, в каком стиле и контексте работает.
              </p>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              placeholder={"Ты аналитик таксопарка. Отвечай кратко и по делу. Используй данные из контекста. Если данных нет — честно говори об этом."}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                lineHeight: "1.6",
              }}
            />
            <Button size="sm" onClick={handleSavePrompt}
              style={promptSaved ? { background: "#10B981", color: "#fff" } : {}}>
              {promptSaved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {promptSaved ? "Сохранено" : "Сохранить промт"}
            </Button>
            <p className="text-xs leading-relaxed" style={{ color: "var(--color-muted)", opacity: 0.7 }}>
              Промт применяется ко всем AI-запросам в дашборде. Оставьте пустым для базового поведения.
            </p>
          </div>
        </div>
      </div>
      <PinDialog
        open={confirmDeleteOpen}
        title="Удалить AI-ключ"
        description="Удаление API-ключа ИИ требует подтверждения PIN-кодом настроек."
        confirmLabel="Удалить ключ"
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirmed={async () => { handleRemoveKey(); }}
      />
    </div>
  );
}
