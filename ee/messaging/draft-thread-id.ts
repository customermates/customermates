import type { MessagingProvider } from "@/generated/prisma";

import { createHash } from "node:crypto";

import { DRAFT_THREAD_PREFIX } from "./provider";
import { normalizeDraftThreadRecipients } from "./draft-thread";

function providerIdFromNormalizedRecipients(provider: MessagingProvider, recipients: readonly string[]): string {
  const identity = JSON.stringify([provider, [...recipients].sort()]);
  return `${DRAFT_THREAD_PREFIX}${createHash("sha256").update(identity).digest("hex")}`;
}

export function draftThreadProviderId(provider: MessagingProvider, recipients: readonly string[]): string {
  const normalizedRecipients = normalizeDraftThreadRecipients(provider, recipients);
  if (!normalizedRecipients) throw new Error("Cannot create a draft-thread ID from an invalid recipient");
  return providerIdFromNormalizedRecipients(provider, normalizedRecipients);
}
