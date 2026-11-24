import type { AiClientLogoProvider } from "@/components/ai-connection/ai-client-logo";
import type { AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";

import { AI_CONNECTION_PROVIDERS } from "@/components/ai-connection/ai-connection.store";

const CLIENT_MATCHERS: readonly [RegExp, AiClientLogoProvider][] = [
  [/codex/i, "codex"],
  [/chatgpt|openai/i, "chatgpt"],
  [/claude|anthropic/i, "claude"],
  [/cursor/i, "cursor"],
  [/gemini/i, "gemini"],
  [/grok/i, "grok"],
  [/langdock/i, "langdock"],
];

export function aiAppLogoProvider(name: string): AiClientLogoProvider | null {
  return CLIENT_MATCHERS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

function connectionProviderOf(logo: AiClientLogoProvider | null): AiConnectionProvider | null {
  if (logo === "chatgpt" || logo === "codex" || logo === "openai") return "openai";
  if (logo === "claude" || logo === "cursor" || logo === "gemini" || logo === "grok" || logo === "langdock")
    return logo;
  return null;
}

export function aiAppsNotYetConnected(connectedNames: readonly string[]): AiConnectionProvider[] {
  const connected = new Set(connectedNames.map((name) => connectionProviderOf(aiAppLogoProvider(name))));
  return AI_CONNECTION_PROVIDERS.filter((provider) => !connected.has(provider));
}
