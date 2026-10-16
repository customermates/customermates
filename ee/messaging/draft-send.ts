import type { DraftBindingConflict } from "./draft-thread";

import { CustomErrorCode } from "@/core/validation/validation.types";

export const DRAFT_SEND_STALE_AFTER_MS = 5 * 60_000;

export type DraftSendState = "sending" | "sent" | "unknown";

export type DraftSendRecord = {
  id: string;
  draftMessageId: string;
  draftRevision: Date;
  connectedAccountId: string;
  state: DraftSendState;
  unipileMessageId: string | null;
  providerMessageId: string | null;
  sentMessageId: string | null;
  sentThreadId: string | null;
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
  record: Pick<DraftSendRecord, "state" | "updatedAt">,
  now: Date = new Date(),
): DraftSendState {
  if (record.state !== "sending") return record.state;
  return now.getTime() - record.updatedAt.getTime() > DRAFT_SEND_STALE_AFTER_MS ? "unknown" : "sending";
}

export function decideDraftSend(
  record: DraftSendRecord | null,
  revision: Date,
  now: Date = new Date(),
): DraftSendDecision {
  if (!record) return "claim";
  const state = effectiveDraftSendState(record, now);
  if (state === "sending") return "in_progress";
  if (record.draftRevision.getTime() !== revision.getTime()) return state === "sent" ? "already_sent" : "take_over";
  return state === "sent" ? "replay" : "outcome_unknown";
}

export function decideMissingDraftSend(
  record: DraftSendRecord | null,
  revision: Date,
  now: Date = new Date(),
): MissingDraftSendDecision {
  if (!record) return "not_found";
  const state = effectiveDraftSendState(record, now);
  if (state === "sending") return "in_progress";
  if (record.draftRevision.getTime() !== revision.getTime()) return state === "sent" ? "already_sent" : "not_found";
  return state === "sent" ? "replay" : "outcome_unknown";
}

export function providerSendOutcome(code: CustomErrorCode): ProviderSendOutcome {
  if (code === CustomErrorCode.unipileSendUnconfirmed) return "accepted";
  if (code === CustomErrorCode.unipileSendOutcomeUnknown || code === CustomErrorCode.unipileRequestTimeout)
    return "unknown";
  return "rejected";
}

export const DRAFT_CONFLICT_CODES: Record<DraftBindingConflict, CustomErrorCode> = {
  target: CustomErrorCode.draftTargetMismatch,
  revision: CustomErrorCode.draftChanged,
  recipients: CustomErrorCode.draftRecipientsChanged,
};
