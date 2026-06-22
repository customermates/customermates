import type { z } from "zod";
import type { MessagingProvider } from "@/generated/prisma";
import type { IdentifierInput } from "@/features/contacts/contact.schema";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { channelClass, isDeterministicProvider } from "@/ee/messaging/provider";
import { normalizeChannelValue } from "@/features/contacts/channel-value";

export type ContactIdentifiers = {
  selfContactId: string | undefined;
  identifiers: IdentifierInput[] | null | undefined;
};

export function identifierKey(provider: MessagingProvider, value: string): string {
  return `${channelClass(provider)}:${value}`;
}

export function channelStrings(identifier: { value: string; messagingId?: string | null }): string[] {
  return identifier.messagingId && identifier.messagingId !== identifier.value
    ? [identifier.value, identifier.messagingId]
    : [identifier.value];
}

export function validateIdentifiers(
  identifiers: IdentifierInput[] | null | undefined,
  ctx: z.RefinementCtx,
  basePath: (string | number)[],
): void {
  if (!identifiers) return;

  identifiers.forEach((identifier, i) => {
    const normalized = normalizeChannelValue(identifier.provider, identifier.value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.invalidChannelValue },
        path: [...basePath, i, "value"],
      });
      return;
    }

    identifier.value = normalized;
    if (identifier.messagingId && isDeterministicProvider(identifier.provider)) identifier.messagingId = undefined;
  });
}

export function collectIdentifierPairs(
  contacts: ContactIdentifiers[],
): { provider: MessagingProvider; value: string }[] {
  return contacts.flatMap(({ identifiers }) =>
    (identifiers ?? []).flatMap((identifier) =>
      channelStrings(identifier).map((value) => ({ provider: identifier.provider, value })),
    ),
  );
}

export function validateIdentifierConflicts(
  contacts: ContactIdentifiers[],
  owners: Map<string, string>,
  ctx: z.RefinementCtx,
  basePathFor: (index: number) => (string | number)[],
): void {
  const claimedBy = new Map<string, string | undefined>(owners);

  contacts.forEach(({ selfContactId, identifiers }, index) => {
    (identifiers ?? []).forEach((identifier, i) => {
      const keys = channelStrings(identifier).map((value) => identifierKey(identifier.provider, value));

      if (keys.some((key) => claimedBy.has(key) && claimedBy.get(key) !== selfContactId)) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.channelAlreadyLinked },
          path: [...basePathFor(index), i, "value"],
        });
        return;
      }

      for (const key of keys) claimedBy.set(key, selfContactId);
    });
  });
}
