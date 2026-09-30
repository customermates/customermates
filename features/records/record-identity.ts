import { randomUUID } from "node:crypto";

import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import { channelClass, isDeterministicProvider } from "@/ee/messaging/provider";
import { normalizeChannelValue } from "@/features/contacts/channel-value";

export function identityKeys(identifier: Pick<RecordIdentityInput, "value" | "messagingId">): string[] {
  return [...new Set([identifier.value, ...(identifier.messagingId ? [identifier.messagingId] : [])])];
}

export function normalizedIdentity(input: RecordIdentityInput): RecordIdentityInput | null {
  const value = normalizeChannelValue(input.provider, input.value);
  return value
    ? { ...input, value, messagingId: isDeterministicProvider(input.provider) ? null : (input.messagingId ?? null) }
    : null;
}

export function updatedIdentities(previous: RecordIdentity[], inputs: RecordIdentityInput[]): RecordIdentity[] {
  const now = new Date().toISOString();
  return inputs.map((input) => {
    const kind = channelClass(input.provider);
    const old = previous.find((row) => row.channelClass === kind && row.value === input.value);
    const fields = {
      provider: input.provider,
      channelClass: kind,
      value: input.value,
      messagingId: input.messagingId ?? null,
      displayName: input.displayName ?? null,
      profileUrl: input.profileUrl ?? null,
    };
    const unchanged = old && Object.entries(fields).every(([key, value]) => old[key as keyof RecordIdentity] === value);
    return {
      ...fields,
      id: old?.id ?? randomUUID(),
      createdAt: old?.createdAt ?? now,
      updatedAt: unchanged ? old.updatedAt : now,
    };
  });
}
