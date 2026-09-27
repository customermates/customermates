import type { MessagingProvider } from "@/generated/prisma";

import { z } from "zod";

import { normalizeChannelValue } from "@/features/contacts/channel-value";

export type DraftThreadTarget = {
  id: string;
  messagingThreadId: string;
  connectedAccountId: string;
  unipileThreadId: string;
  recipientIdentifiers: string[];
  updatedAt: Date;
};

export type DraftDeleteResult =
  | { status: "deleted"; messagingThreadId: string }
  | { status: "not_found" }
  | { status: "revision_mismatch" };

export const DraftRevisionSchema = z.iso
  .datetime({ offset: true, precision: 3 })
  .describe("Opaque revision returned with the saved draft; required whenever draftMessageId is provided");

export function toDraftRevision(updatedAt: Date): string {
  return updatedAt.toISOString();
}

export function draftRevisionMatches(updatedAt: Date, revision: string): boolean {
  return updatedAt.getTime() === new Date(revision).getTime();
}

export function draftUpdatedAtFromRevision(revision: string): Date {
  return new Date(revision);
}

export function hasCompleteDraftBinding(input: { draftMessageId?: string; draftRevision?: string }): boolean {
  return Boolean(input.draftMessageId) === Boolean(input.draftRevision);
}

export function normalizeDraftThreadRecipients(
  provider: MessagingProvider,
  recipients: readonly string[],
): string[] | null {
  const normalizedRecipients: string[] = [];
  for (const recipient of recipients) {
    const normalized = normalizeChannelValue(provider, recipient);
    if (!normalized) return null;
    if (!normalizedRecipients.includes(normalized)) normalizedRecipients.push(normalized);
  }
  return normalizedRecipients;
}

export function draftThreadRecipientSetsMatch(
  provider: MessagingProvider,
  left: readonly string[],
  right: readonly string[],
): boolean {
  const normalizedLeft = normalizeDraftThreadRecipients(provider, left);
  const normalizedRight = normalizeDraftThreadRecipients(provider, right);
  if (!normalizedLeft || !normalizedRight || normalizedLeft.length !== normalizedRight.length) return false;

  const canonicalLeft = [...normalizedLeft].sort();
  const canonicalRight = [...normalizedRight].sort();
  return canonicalLeft.every((recipient, index) => recipient === canonicalRight[index]);
}
