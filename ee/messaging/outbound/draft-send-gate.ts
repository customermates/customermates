import type { InteractorFailure } from "@/core/validation/validation.utils";
import type { DraftSendClaim, DraftSendRecord, DraftSendStart } from "../draft-send";
import type { DraftSendRepo } from "./draft-send.repo";

import * as Sentry from "@sentry/node";

import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { decideMissingDraftSend } from "../draft-send";

type DraftSendRefusal = Exclude<DraftSendStart["status"], "claimed" | "replay">;

export type DraftSendGate = { claim: DraftSendClaim } | { replay: DraftSendRecord } | { failure: InteractorFailure };

export function refuseDraftSend(status: DraftSendRefusal): Promise<InteractorFailure> {
  switch (status) {
    case "in_progress":
      return failConflict(CustomErrorCode.draftSendInProgress);
    case "outcome_unknown":
      return failConflict(CustomErrorCode.draftSendOutcomeUnknown);
    case "already_sent":
      return failConflict(CustomErrorCode.draftAlreadySent);
    case "changed":
      return failConflict(CustomErrorCode.draftChanged);
    case "not_found":
      return failNotFound(CustomErrorCode.draftMessageNotFound);
  }
}

export async function openDraftSend(
  repo: DraftSendRepo,
  args: { draftMessageId: string; draftRevision: Date; connectedAccountId: string },
): Promise<DraftSendGate> {
  const start = await repo.beginDraftSend(args);
  if (start.status === "claimed") return { claim: start.claim };
  if (start.status === "replay") return { replay: start.record };
  return { failure: await refuseDraftSend(start.status) };
}

export async function gateMissingDraft(
  repo: DraftSendRepo,
  args: { draftMessageId: string; draftRevision: Date; connectedAccountId: string },
): Promise<{ replay: DraftSendRecord } | { failure: InteractorFailure }> {
  const record = await repo.findDraftSend({ draftMessageId: args.draftMessageId });
  if (record && record.connectedAccountId !== args.connectedAccountId)
    return { failure: await failConflict(CustomErrorCode.draftTargetMismatch) };
  const decision = decideMissingDraftSend(record, args.draftRevision);
  if (decision === "replay" && record) return { replay: record };
  return { failure: await refuseDraftSend(decision === "replay" ? "not_found" : decision) };
}

export async function settleDraftSendQuietly(
  repo: DraftSendRepo,
  args: {
    claim: DraftSendClaim;
    state: "sent" | "unknown";
    unipileMessageId?: string | null;
    providerMessageId?: string | null;
  },
) {
  try {
    await repo.settleDraftSend(args);
  } catch (err) {
    Sentry.captureException(err, { tags: { kind: "draft-send-settle-failure" } });
  }
}

export async function releaseDraftSendQuietly(repo: DraftSendRepo, claim: DraftSendClaim) {
  try {
    await repo.releaseDraftSend({ claim });
  } catch (err) {
    Sentry.captureException(err, { tags: { kind: "draft-send-release-failure" } });
  }
}

export async function recordDraftSendQuietly(
  repo: DraftSendRepo,
  claim: DraftSendClaim,
  message: { id: string; messagingThreadId: string },
) {
  try {
    await repo.recordDraftSendResult({ claim, sentMessageId: message.id, sentThreadId: message.messagingThreadId });
  } catch (err) {
    Sentry.captureException(err, { tags: { kind: "draft-send-record-failure" } });
  }
}

export async function completeDraftSendQuietly(
  repo: DraftSendRepo,
  args: {
    claim: DraftSendClaim;
    draftMessageId: string;
    unipileMessageId: string | null;
    providerMessageId: string | null;
  },
) {
  try {
    await repo.completeDraftSendRemovingDraft(args);
  } catch (err) {
    Sentry.captureException(err, { tags: { kind: "draft-send-completion-failure" } });
    await settleDraftSendQuietly(repo, {
      claim: args.claim,
      state: "sent",
      unipileMessageId: args.unipileMessageId,
      providerMessageId: args.providerMessageId,
    });
  }
}
