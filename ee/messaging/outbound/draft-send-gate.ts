import type { InteractorFailure, Validated } from "@/core/validation/validation.utils";
import type { MessagingMessage } from "../messaging.schema";
import type { DraftSendClaim, DraftSendRecord, DraftSendStart } from "../draft-send";
import type { DraftBindingConflict } from "../draft-thread";
import type { CompleteReplyDraftSendArgs, DraftSendRepo } from "./draft-send.repo";

import * as ErrorReporter from "@/core/observability/server";

import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { decideMissingDraftSend } from "../draft-send";
import { toSentMessageResult, type SentMessageResult } from "./sent-message.schema";

type DraftSendRefusal = Exclude<DraftSendStart["status"], "claimed" | "replay">;

export type DraftSendOpening = { claim: DraftSendClaim } | { replay: DraftSendRecord } | { failure: InteractorFailure };

type DraftSendTarget = {
  draftMessageId: string;
  draftRevision: Date;
  connectedAccountId: string;
  contentHash: string;
  matchHashes?: string[];
};

export class DraftSendGate {
  constructor(private readonly repo: DraftSendRepo) {}

  async open(target: DraftSendTarget): Promise<DraftSendOpening> {
    const start = await this.repo.beginDraftSend(target);
    if (start.status === "claimed") return { claim: start.claim };
    if (start.status === "replay") return { replay: start.record };
    return { failure: await this.refuse(start.status) };
  }

  async openMissing(target: DraftSendTarget): Promise<{ replay: DraftSendRecord } | { failure: InteractorFailure }> {
    const record = await this.repo.reconcileDraftSend({ draftMessageId: target.draftMessageId });
    if (record && record.connectedAccountId !== target.connectedAccountId)
      return { failure: await this.refuseBinding("target") };
    const decision = decideMissingDraftSend(record, target.draftRevision, target.contentHash);
    if (decision === "replay" && record) return { replay: record };
    return { failure: await this.refuse(decision === "replay" ? "not_found" : decision) };
  }

  findSettled(draftMessageId: string): Promise<DraftSendRecord | null> {
    return this.repo.findDraftSend({ draftMessageId });
  }

  async confirmedBySyncedCopy(claim: DraftSendClaim, draftMessageId: string): Promise<DraftSendRecord | null> {
    let record: DraftSendRecord | null = null;
    try {
      record = await this.repo.reconcileDraftSend({ draftMessageId });
    } catch (err) {
      ErrorReporter.captureException(err, { tags: { kind: "draft-send-reconcile-failure" } });
    }
    if (record?.state !== "sent" || record.draftRevision.getTime() !== claim.draftRevision.getTime()) return null;
    return record;
  }

  async replay(
    record: DraftSendRecord,
    args: { connectedAccountId: string; threadId: string | null; repeated?: boolean },
  ): Validated<SentMessageResult> {
    const message = await this.repo.findDraftSendMessage({ record, connectedAccountId: args.connectedAccountId });
    return {
      ok: true as const,
      data: toSentMessageResult({
        message,
        messageId: record.sentMessageId,
        threadId: record.sentThreadId ?? args.threadId,
        providerMessageId: record.providerMessageId,
        repeated: args.repeated ?? true,
      }),
    };
  }

  async settle(args: {
    claim: DraftSendClaim;
    state: "sent" | "unknown";
    unipileMessageId?: string | null;
    providerMessageId?: string | null;
  }) {
    try {
      await this.repo.settleDraftSend(args);
    } catch (err) {
      ErrorReporter.captureException(err, { tags: { kind: "draft-send-settle-failure" } });
    }
  }

  async release(claim: DraftSendClaim) {
    try {
      await this.repo.releaseDraftSend({ claim });
    } catch (err) {
      ErrorReporter.captureException(err, { tags: { kind: "draft-send-release-failure" } });
    }
  }

  async releaseOnFailure<T>(claim: DraftSendClaim | null, step: () => Promise<T>): Promise<T> {
    try {
      return await step();
    } catch (err) {
      if (claim) await this.release(claim);
      throw err;
    }
  }

  async record(claim: DraftSendClaim, message: { id: string; messagingThreadId: string }) {
    try {
      await this.repo.recordDraftSendResult({
        claim,
        sentMessageId: message.id,
        sentThreadId: message.messagingThreadId,
      });
    } catch (err) {
      ErrorReporter.captureException(err, { tags: { kind: "draft-send-record-failure" } });
    }
  }

  async completeRemovingDraft(args: {
    claim: DraftSendClaim;
    draftMessageId: string;
    unipileMessageId: string | null;
    providerMessageId: string | null;
  }) {
    try {
      await this.repo.completeDraftSendRemovingDraft(args);
    } catch (err) {
      ErrorReporter.captureException(err, { tags: { kind: "draft-send-completion-failure" } });
      await this.settle({
        claim: args.claim,
        state: "sent",
        unipileMessageId: args.unipileMessageId,
        providerMessageId: args.providerMessageId,
      });
    }
  }

  async completeReply(args: CompleteReplyDraftSendArgs): Promise<MessagingMessage | null> {
    try {
      return await this.repo.completeReplyDraftSend(args);
    } catch (err) {
      ErrorReporter.captureException(err, { tags: { kind: "draft-send-completion-failure" } });
      await this.settle({
        claim: args.claim,
        state: "sent",
        unipileMessageId: args.unipileMessageId,
        providerMessageId: args.providerMessageId,
      });
      return null;
    }
  }

  refuseBinding(conflict: DraftBindingConflict, recipientsField = "to"): Promise<InteractorFailure> {
    if (conflict === "target") return failConflict(CustomErrorCode.draftTargetMismatch, ["draftMessageId"]);
    if (conflict === "revision") return failConflict(CustomErrorCode.draftChanged, ["draftRevision"]);
    return failConflict(CustomErrorCode.draftRecipientsChanged, [recipientsField]);
  }

  private refuse(status: DraftSendRefusal): Promise<InteractorFailure> {
    switch (status) {
      case "in_progress":
        return failConflict(CustomErrorCode.draftSendInProgress, ["draftMessageId"]);
      case "outcome_unknown":
        return failConflict(CustomErrorCode.draftSendOutcomeUnknown, ["draftMessageId"]);
      case "already_sent":
        return failConflict(CustomErrorCode.draftAlreadySent, ["draftMessageId"]);
      case "changed":
        return failConflict(CustomErrorCode.draftChanged, ["draftRevision"]);
      case "not_found":
        return failNotFound(CustomErrorCode.draftMessageNotFound);
    }
  }
}
