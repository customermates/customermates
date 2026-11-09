import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";
import type { AiConnectionProvider } from "@/components/ai-connection/ai-connection.store";

export const CONNECT_INTENT_PARAM = "connect";

export const CONNECT_INTENT_CHANNELS = [
  "google",
  "outlook",
  "imap",
  "whatsapp",
  "linkedin",
  "linkedin_sales_navigator",
  "linkedin_recruiter",
  "instagram",
  "telegram",
] as const satisfies readonly ConnectChannel[];

export const CONNECT_INTENT_AI_CLIENTS = [
  "claude",
  "openai",
  "cursor",
  "gemini",
] as const satisfies readonly AiConnectionProvider[];

export function connectIntentHref(path: string, target: string) {
  return `${path}?${CONNECT_INTENT_PARAM}=${encodeURIComponent(target)}`;
}

export function readConnectIntent<T extends string>(search: string, allowed: readonly T[]): T | null {
  const value = new URLSearchParams(search).get(CONNECT_INTENT_PARAM);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
