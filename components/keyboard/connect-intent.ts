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

type ConnectedAccountLike = {
  provider: string;
  isOwner: boolean;
  status?: string;
  linkedinProducts?: readonly string[];
};

const CHANNEL_PROVIDER: Record<(typeof CONNECT_INTENT_CHANNELS)[number], string> = {
  google: "google",
  outlook: "outlook",
  imap: "mail",
  whatsapp: "whatsapp",
  linkedin: "linkedin",
  linkedin_sales_navigator: "linkedin",
  linkedin_recruiter: "linkedin",
  instagram: "instagram",
  telegram: "telegram",
};

const CHANNEL_PRODUCT: Partial<Record<(typeof CONNECT_INTENT_CHANNELS)[number], string>> = {
  linkedin_sales_navigator: "sales_navigator",
  linkedin_recruiter: "recruiter",
};

export function connectedChannels(accounts: readonly ConnectedAccountLike[]): Set<string> {
  const own = accounts.filter((account) => account.isOwner);
  return new Set(
    CONNECT_INTENT_CHANNELS.filter((channel) =>
      own.some((account) => {
        if (account.provider !== CHANNEL_PROVIDER[channel]) return false;
        const product = CHANNEL_PRODUCT[channel];
        return !product || (account.linkedinProducts ?? []).includes(product);
      }),
    ),
  );
}
