import { normalizeChannelValue } from "@/features/records/channel-value";
import type { RecordIdentityProvider } from "@/generated/prisma";

export function identityLookupValue(provider: RecordIdentityProvider, identifier: string | null): string | null {
  if (!identifier?.trim()) return null;
  return normalizeChannelValue(provider, identifier) ?? identifier.trim();
}
