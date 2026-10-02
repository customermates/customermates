import { randomUUID } from "node:crypto";

import { channelClass, isDeterministicProvider } from "@/ee/messaging/provider";
import { normalizeChannelValue } from "@/features/records/channel-value";
import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import { RecordWriteError } from "./record-write-error";
import { CustomErrorCode } from "@/core/validation/validation.types";

export function identityKeys(
  identifier: Pick<RecordIdentityInput, "value" | "messagingId"> & {
    aliases?: string[];
  },
): string[] {
  return [
    ...new Set([
      identifier.value,
      ...(identifier.messagingId ? [identifier.messagingId] : []),
      ...(identifier.aliases ?? []),
    ]),
  ];
}

export function normalizedIdentity(input: RecordIdentityInput): RecordIdentityInput | null {
  const value = normalizeChannelValue(input.provider, input.value);
  return value
    ? {
        ...input,
        value,
        messagingId: isDeterministicProvider(input.provider) ? null : (input.messagingId ?? null),
      }
    : null;
}

export function normalizedIdentityAssociation(
  input: RecordIdentityInput,
  known: RecordIdentity[],
): RecordIdentityInput | null {
  const normalized = normalizedIdentity(input);
  if (normalized) return normalized;
  const kind = channelClass(input.provider);
  if (!known.some((row) => row.channelClass === kind && identityKeys(row).includes(input.value.trim()))) return null;
  const identity = identityAssociations([{ ...input, value: input.value.trim() }], known)[0];
  return identity
    ? {
        provider: identity.provider,
        value: identity.value,
        messagingId: identity.messagingId,
        displayName: identity.displayName,
        profileUrl: identity.profileUrl,
      }
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

export function identifierKey(provider: RecordIdentityInput["provider"], value: string): string {
  return `${channelClass(provider)}:${value}`;
}

export function identityAssociations(inputs: RecordIdentityInput[], known: RecordIdentity[]): RecordIdentity[] {
  const candidates = [...known];
  const result = new Map<string, RecordIdentity>();
  for (const input of inputs) {
    const keys = new Set(identityKeys(input));
    const kind = channelClass(input.provider);
    const matches = candidates.filter(
      (row) => row.channelClass === kind && identityKeys(row).some((value) => keys.has(value)),
    );
    if (new Set(matches.map((row) => row.id)).size > 1)
      throw new RecordWriteError(CustomErrorCode.channelAlreadyLinked, "conflict", ["identities"]);
    const identity = matches[0] ?? updatedIdentities([], [input])[0];
    if (!identity) throw new Error("An identity input must create a channel");
    if (!matches.length) candidates.push(identity);
    result.set(identity.id, identity);
  }
  return [...result.values()];
}
