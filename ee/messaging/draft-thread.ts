import type { MessagingProvider } from "@/generated/prisma";

import { z } from "zod";

import { normalizeChannelValue } from "@/features/records/channel-value";
import { isDraftThreadId } from "./provider";

export type DraftThreadTarget = {
  id: string;
  messagingThreadId: string;
  connectedAccountId: string;
  unipileThreadId: string;
  recipientIdentifiers: string[];
  ccIdentifiers?: string[];
  bccIdentifiers?: string[];
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

export type DraftBindingConflict = "target" | "revision" | "recipients";

function revealsHiddenRecipient(
  provider: MessagingProvider,
  draft: DraftThreadTarget,
  visible: readonly string[],
): boolean {
  const normalize = (value: string) => normalizeChannelValue(provider, value);
  const shown = new Set([...draft.recipientIdentifiers, ...(draft.ccIdentifiers ?? [])].map(normalize));
  const hidden = new Set((draft.bccIdentifiers ?? []).map(normalize).filter((value) => value && !shown.has(value)));
  return visible.some((value) => hidden.has(normalize(value)));
}

export function draftBindingConflict(args: {
  provider: MessagingProvider;
  draft: DraftThreadTarget;
  connectedAccountId: string;
  draftRevision: string;
  replyThreadId: string | null;
  to: readonly string[];
  cc?: readonly string[];
}): DraftBindingConflict | null {
  if (args.draft.connectedAccountId !== args.connectedAccountId) return "target";
  if (
    args.replyThreadId
      ? args.draft.messagingThreadId !== args.replyThreadId
      : !isDraftThreadId(args.draft.unipileThreadId)
  )
    return "target";
  if (!draftRevisionMatches(args.draft.updatedAt, args.draftRevision)) return "revision";
  if (args.replyThreadId) return null;
  if (!draftThreadRecipientSetsMatch(args.provider, args.draft.recipientIdentifiers, args.to)) return "recipients";
  if (revealsHiddenRecipient(args.provider, args.draft, [...args.to, ...(args.cc ?? [])])) return "recipients";
  return null;
}

export function canManageThreadDrafts(thread: { isOwner: boolean; accountShared: boolean } | null): boolean {
  return Boolean(thread && (thread.isOwner || thread.accountShared));
}
