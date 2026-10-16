import type { MessagingDraftSendState } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";

export const DRAFT_SEND_STALE_AFTER_MS = 5 * 60_000;

export const DRAFT_SEND_RETENTION_DAYS = 30;

export const DRAFT_SEND_PRUNE_BATCH_LIMIT = 500;

export const DRAFT_SEND_PRUNE_MAX_BATCHES = 10;

export const DRAFT_SEND_COPY_EARLIEST_MS = 2 * 60_000;

export const DRAFT_SEND_COPY_LATEST_MS = 60 * 60_000;

export const DRAFT_SEND_COPY_CANDIDATE_LIMIT = 100;

export type DraftSendRecord = {
  id: string;
  draftMessageId: string;
  draftRevision: Date;
  connectedAccountId: string;
  state: MessagingDraftSendState;
  unipileMessageId: string | null;
  providerMessageId: string | null;
  sentMessageId: string | null;
  sentThreadId: string | null;
  contentHash: string;
  matchHashes: string[];
  claimedAt: Date;
  updatedAt: Date;
};

export type DraftSendClaim = { id: string; draftRevision: Date };

export type DraftSendStart =
  | { status: "claimed"; claim: DraftSendClaim }
  | { status: "replay"; record: DraftSendRecord }
  | { status: "in_progress" }
  | { status: "outcome_unknown" }
  | { status: "already_sent" }
  | { status: "changed" }
  | { status: "not_found" };

export type DraftSendDecision = "claim" | "take_over" | "replay" | "in_progress" | "outcome_unknown" | "already_sent";

export type MissingDraftSendDecision = "replay" | "in_progress" | "outcome_unknown" | "already_sent" | "not_found";

export type ProviderSendOutcome = "accepted" | "unknown" | "rejected";

export function effectiveDraftSendState(
  record: Pick<DraftSendRecord, "state" | "claimedAt">,
  now: Date = new Date(),
): MessagingDraftSendState {
  if (record.state !== "sending") return record.state;
  return now.getTime() - record.claimedAt.getTime() > DRAFT_SEND_STALE_AFTER_MS ? "unknown" : "sending";
}

function sameDraftContent(record: Pick<DraftSendRecord, "contentHash">, contentHash: string): boolean {
  return record.contentHash === "" || record.contentHash === contentHash;
}

export function hasDraftSendReference(
  record: Pick<DraftSendRecord, "sentMessageId" | "unipileMessageId" | "providerMessageId">,
): boolean {
  return Boolean(record.sentMessageId || record.unipileMessageId || record.providerMessageId);
}

export function canReconcileDraftSend(
  record: Pick<
    DraftSendRecord,
    "state" | "claimedAt" | "matchHashes" | "sentMessageId" | "unipileMessageId" | "providerMessageId"
  >,
  now: Date = new Date(),
): boolean {
  if (record.matchHashes.length === 0) return false;
  const state = effectiveDraftSendState(record, now);
  return state === "unknown" || (state === "sent" && !hasDraftSendReference(record));
}

export function draftSendCopyWindow(claimedAt: Date): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(claimedAt.getTime() - DRAFT_SEND_COPY_EARLIEST_MS),
    latest: new Date(claimedAt.getTime() + DRAFT_SEND_COPY_LATEST_MS),
  };
}

export function draftSendClaimWindow(copy: { sentAt: Date; createdAt: Date }): { earliest: Date; latest: Date } {
  return {
    earliest: new Date(copy.sentAt.getTime() - DRAFT_SEND_COPY_LATEST_MS),
    latest: new Date(Math.min(copy.sentAt.getTime() + DRAFT_SEND_COPY_EARLIEST_MS, copy.createdAt.getTime())),
  };
}

export function decideDraftSend(
  record: DraftSendRecord | null,
  revision: Date,
  contentHash: string,
  now: Date = new Date(),
): DraftSendDecision {
  if (!record) return "claim";
  const state = effectiveDraftSendState(record, now);
  if (state === "sending") return "in_progress";
  const sameContent = sameDraftContent(record, contentHash);
  if (record.draftRevision.getTime() !== revision.getTime()) {
    if (state === "sent") return "already_sent";
    return sameContent ? "outcome_unknown" : "take_over";
  }
  if (state === "sent") return sameContent ? "replay" : "already_sent";
  return "outcome_unknown";
}

export function decideMissingDraftSend(
  record: DraftSendRecord | null,
  revision: Date,
  contentHash: string,
  now: Date = new Date(),
): MissingDraftSendDecision {
  if (!record) return "not_found";
  const state = effectiveDraftSendState(record, now);
  if (state === "sending") return "in_progress";
  if (record.draftRevision.getTime() !== revision.getTime()) return state === "sent" ? "already_sent" : "not_found";
  if (state === "sent") return sameDraftContent(record, contentHash) ? "replay" : "already_sent";
  return "outcome_unknown";
}

export function providerSendOutcome(code: CustomErrorCode): ProviderSendOutcome {
  if (code === CustomErrorCode.unipileSendUnconfirmed) return "accepted";
  if (code === CustomErrorCode.unipileSendOutcomeUnknown || code === CustomErrorCode.unipileRequestTimeout)
    return "unknown";
  return "rejected";
}
