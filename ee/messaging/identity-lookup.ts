import type { MessagingProvider } from "@/generated/prisma";
import { normalizeChannelValue } from "@/features/contacts/channel-value";

export function identityLookupValue(provider: MessagingProvider, identifier: string | null): string | null {
  if (!identifier?.trim()) return null;
  return normalizeChannelValue(provider, identifier) ?? identifier.trim();
}
