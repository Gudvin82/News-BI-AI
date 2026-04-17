"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/utils";
import { appendAiUsageLog } from "@/lib/ai/client-usage";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function AiWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: "Привет! Я ИИ-ассистент вашего дашборда. Задайте вопрос о данных или попросите помочь с анализом."
      }]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const apiKey    = localStorage.getItem("yb_ai_key") ?? "";
      const provider  = localStorage.getItem("yb_ai_provider") ?? "aitunnel";
      const model     = localStorage.getItem("yb_ai_model") ?? "";

      const res  = await apiFetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          provider,
          model: model || undefined,
          apiKey: apiKey || undefined,
          systemPrompt: "Ты — ИИ-аналитик для таксопарка. Отвечай кратко и по делу на русском языке. Помогай с анализом бизнес-метрик, найма водителей, финансов и операционки.",
        }),
      });
      const data = await res.json();
      const reply = data.data?.response ?? data.error ?? "Нет ответа";
      if (data.ok) {
        appendAiUsageLog(provider, data.data?.model ?? model ?? "default", data.data?.usage);
      }
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Ошибка соединения. Проверьте API-ключ в Настройках → ИИ." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: "min(380px, calc(100vw - 32px))",
            height: "min(520px, calc(100dvh - 120px))",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ background: "var(--color-sidebar)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">ИИ-ассистент</p>
                <p className="text-xs text-slate-400">
                  {localStorage.getItem("yb_ai_provider") ?? "aitunnel"} ·{" "}
                  {localStorage.getItem("yb_ai_model") || "default"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? { background: "var(--color-brand)", color: "white", borderBottomRightRadius: "4px" }
                      : { background: "var(--color-surface-2)", color: "var(--color-text)", borderBottomLeftRadius: "4px" }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-3 py-2 flex items-center gap-1.5"
                  style={{ background: "var(--color-surface-2)", borderBottomLeftRadius: "4px" }}
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--color-brand)" }} />
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>Думаю…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="flex-shrink-0 p-3"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Спросить ИИ… (Enter — отправить)"
                rows={1}
                className="flex-1 resize-none px-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  maxHeight: "96px",
                  overflow: "auto",
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-all disabled:opacity-40"
                style={{ background: "var(--color-brand)" }}
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 flex items-center justify-center rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95"
        style={{ background: open ? "var(--color-sidebar)" : "linear-gradient(135deg, #F59E0B, #D97706)" }}
        aria-label="ИИ-ассистент"
      >
        {open ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-6 h-6 text-white" />
        )}
      </button>
    </>
  );
}
