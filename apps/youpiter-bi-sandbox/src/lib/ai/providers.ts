// Supported AI providers (Russian-server compatible first)
export const AI_PROVIDERS = [
  {
    id: "aitunnel",
    name: "AI Tunnel (aitunnel.ru) \uD83C\uDDF7\uD83C\uDDFA",
    baseUrl: "https://api.aitunnel.ru/v1",
    models: ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id: "groq",
    name: "Groq (fast)",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"]
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"]
  }
] as const;

export type AIProviderId = (typeof AI_PROVIDERS)[number]["id"];

export function getProviderById(id: string) {
  return AI_PROVIDERS.find((p) => p.id === id) ?? null;
}

export function getDefaultProvider() {
  const envProvider = process.env.AITUNNEL_API_KEY ? "aitunnel" : process.env.OPENAI_API_KEY ? "openai" : null;
  if (envProvider) {
    return AI_PROVIDERS.find((p) => p.id === envProvider) ?? AI_PROVIDERS[0];
  }
  return AI_PROVIDERS[0];
}
