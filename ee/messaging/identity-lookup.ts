import { normalizeChannelValue } from "@/features/records/channel-value";
import type { MessagingProvider } from "@/generated/prisma";

export function identityLookupValue(provider: MessagingProvider, identifier: string | null): string | null {
  if (!identifier?.trim()) return null;
  return normalizeChannelValue(provider, identifier) ?? identifier.trim();
}
