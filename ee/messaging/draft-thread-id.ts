import type { MessagingProvider } from "@/generated/prisma";

import { createHash } from "node:crypto";

import { DRAFT_THREAD_PREFIX, isEmailProvider } from "./provider";
import { normalizeDraftThreadRecipients } from "./draft-thread";

function providerIdFromNormalizedRecipients(provider: MessagingProvider, recipients: readonly string[]): string {
  const identity = JSON.stringify([provider, [...recipients].sort()]);
  return `${DRAFT_THREAD_PREFIX}${createHash("sha256").update(identity).digest("hex")}`;
}

export function draftThreadProviderId(
  provider: MessagingProvider,
  recipients: readonly string[],
  secondary?: { cc?: readonly string[]; bcc?: readonly string[] },
): string {
  const normalizedRecipients = normalizeDraftThreadRecipients(provider, recipients);
  if (!normalizedRecipients) throw new Error("Cannot create a draft-thread ID from an invalid recipient");
  if (isEmailProvider(provider) && normalizedRecipients.length === 0 && secondary) {
    const cc = normalizeDraftThreadRecipients(provider, secondary.cc ?? []);
    const bcc = normalizeDraftThreadRecipients(provider, secondary.bcc ?? []);
    if (!cc || !bcc) throw new Error("Cannot create a draft-thread ID from an invalid recipient");
    const identity = JSON.stringify([provider, [], { cc: cc.sort(), bcc: bcc.sort() }]);
    return `${DRAFT_THREAD_PREFIX}${createHash("sha256").update(identity).digest("hex")}`;
  }
  return providerIdFromNormalizedRecipients(provider, normalizedRecipients);
}
