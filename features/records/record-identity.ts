import { unwindFailure } from "@/core/validation/failure-unwind";
import { randomUUID } from "node:crypto";

import { channelClass, isDeterministicProvider } from "@/ee/messaging/provider";
import { normalizeChannelValue } from "@/features/records/channel-value";
import type { RecordIdentity, RecordIdentityInput } from "./record-identity.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";

type IdentityKeySource = Pick<RecordIdentityInput, "value" | "messagingId"> & {
  provider?: RecordIdentityInput["provider"];
  profileUrl?: string | null;
  aliases?: string[];
};

const LINKEDIN_MEMBER_ID = /^AC[A-Za-z0-9_-]{20,}$/;

export function isLinkedinMemberId(value: string): boolean {
  return LINKEDIN_MEMBER_ID.test(value);
}

export function linkedinProfileKey(raw: string | null | undefined): string | null {
  const handle = raw ? normalizeChannelValue("linkedin", raw) : null;
  if (!handle) return null;
  return isLinkedinMemberId(handle) ? handle : handle.normalize("NFC").toLowerCase();
}

function storedKeys(identifier: IdentityKeySource): string[] {
  return [
    ...new Set([
      identifier.value,
      ...(identifier.messagingId ? [identifier.messagingId] : []),
      ...(identifier.aliases ?? []),
    ]),
  ];
}

function canonicalKeys(identifier: IdentityKeySource): string[] {
  if (!identifier.provider || channelClass(identifier.provider) !== "linkedin") return [];
  return [identifier.value, identifier.messagingId, identifier.profileUrl].flatMap((raw) => {
    const key = linkedinProfileKey(raw);
    return key ? [key] : [];
  });
}

export function identityKeys(identifier: IdentityKeySource): string[] {
  return [...new Set([...storedKeys(identifier), ...canonicalKeys(identifier)])];
}

export function normalizedIdentity(input: RecordIdentityInput, region?: string | null): RecordIdentityInput | null {
  const value = normalizeChannelValue(input.provider, input.value, region);
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
  region?: string | null,
): RecordIdentityInput | null {
  const normalized = normalizedIdentity(input, region);
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

function overlapping(
  rows: RecordIdentity[],
  input: IdentityKeySource,
  keysOf: (identifier: IdentityKeySource) => string[],
): RecordIdentity[] {
  const keys = new Set(keysOf(input));
  return rows.filter((row) => keysOf(row).some((value) => keys.has(value)));
}

function withCanonicalAliases(identity: RecordIdentity): RecordIdentity {
  const keys = identityKeys(identity);
  return keys.length > storedKeys(identity).length ? { ...identity, aliases: keys } : identity;
}

function mergedLinkedinIdentity(row: RecordIdentity, input: RecordIdentityInput, others: RecordIdentity[]) {
  if (row.channelClass !== "linkedin") return row;
  const held = new Set(others.filter((other) => other.id !== row.id).flatMap(storedKeys));
  const messagingId = row.messagingId ?? (input.messagingId && !held.has(input.messagingId) ? input.messagingId : null);
  const fields = { messagingId, profileUrl: row.profileUrl ?? input.profileUrl ?? null };
  const current = storedKeys(row);
  const added = [...new Set([...identityKeys({ ...row, ...fields }), ...identityKeys(input)])].filter(
    (value) => !current.includes(value) && !held.has(value),
  );
  const unchanged =
    !added.length && Object.entries(fields).every(([key, value]) => row[key as keyof RecordIdentity] === value);
  if (unchanged) return row;
  return {
    ...row,
    ...fields,
    aliases: [...new Set([...(row.aliases ?? current), ...added])],
    updatedAt: new Date().toISOString(),
  };
}

export function identityAssociations(inputs: RecordIdentityInput[], known: RecordIdentity[]): RecordIdentity[] {
  const candidates = [...known];
  const result = new Map<string, RecordIdentity>();
  for (const input of inputs) {
    const kind = channelClass(input.provider);
    const sameClass = candidates.filter((row) => row.channelClass === kind);
    const direct = overlapping(sameClass, input, storedKeys);
    const matches = direct.length ? direct : overlapping(sameClass, input, identityKeys);
    if (new Set(matches.map((row) => row.id)).size > 1)
      throw unwindFailure(CustomErrorCode.channelAlreadyLinked, "conflict", ["identities"]);
    const match = matches[0];
    if (!match) {
      const created = updatedIdentities([], [input])[0];
      if (!created) throw new Error("An identity input must create a channel");
      const identity = withCanonicalAliases(created);
      candidates.push(identity);
      result.set(identity.id, identity);
      continue;
    }
    const identity = mergedLinkedinIdentity(match, input, sameClass);
    if (identity !== match) candidates.splice(candidates.indexOf(match), 1, identity);
    result.set(identity.id, identity);
  }
  return [...result.values()];
}
