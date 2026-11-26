import type { AiConnectionOpenAiMethod, AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";

export function agentLaunchUrl(
  provider: AiConnectionProvider | null,
  openAiMethod: AiConnectionOpenAiMethod | null,
  prompt: string,
): string | null {
  const query = encodeURIComponent(prompt);
  if (provider === "claude") return `https://claude.ai/new?q=${query}`;
  if (provider === "openai" && openAiMethod !== "codex") return `https://chatgpt.com/?q=${query}`;
  return null;
}
