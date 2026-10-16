import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import type { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { DraftSendClaim, DraftSendRecord } from "../draft-send";
import type { DraftThreadTarget } from "../draft-thread";
import type { StartChatInteractor } from "./start-chat.interactor";

import { z } from "zod";
import * as Sentry from "@sentry/node";
import { randomUUID } from "node:crypto";

import { Resource, MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { isDraftThreadId, isEmailProvider } from "../provider";
import { accountNeedsReconnect } from "../account-health";
import {
  DraftRevisionSchema,
  draftBindingConflict,
  draftUpdatedAtFromRevision,
  hasCompleteDraftBinding,
} from "../draft-thread";
import { DRAFT_CONFLICT_CODES, providerSendOutcome } from "../draft-send";
import { retryAfterPhrase } from "../retry-after.server";
import { EMPTY_ATTENDEE } from "../unipile.mappers";
import { SendAttachmentSchema } from "./send-email.interactor";
import { sentMessageResult, type SentMessageResult } from "./sent-message-result";
import {
  gateMissingDraft,
  openDraftSend,
  recordDraftSendQuietly,
  releaseDraftSendQuietly,
  settleDraftSendQuietly,
} from "./draft-send-gate";
import type { SendChatMessageRepo } from "./send-chat-message.repo";

export const DUPLICATE_OUTBOUND_WINDOW_MS = 60_000;

export const BaseSendChatMessageSchema = z.object({
  threadId: z.uuid(),
  text: z.string().max(20_000),
  attachments: z.array(SendAttachmentSchema).max(20).optional(),
  draftMessageId: z
    .uuid()
    .optional()
    .describe(
      "Saved draft to send. Each draft revision is sent at most once: repeating the call returns the first result",
    ),
  draftRevision: DraftRevisionSchema.optional().describe(
    "Opaque revision returned with the saved draft; required whenever draftMessageId is provided",
  ),
});

export const SendChatMessageSchema = BaseSendChatMessageSchema.superRefine((d, ctx) => {
  if (!hasCompleteDraftBinding(d)) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.draftMessageNotFound },
      path: [d.draftMessageId ? "draftRevision" : "draftMessageId"],
    });
  }
  if (!d.text.trim() && !d.attachments?.length) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.messageContentRequired },
      path: ["text"],
    });
  }
});
export type SendChatMessageData = Data<typeof SendChatMessageSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "create" })
export class SendChatMessageInteractor extends AuthenticatedInteractor<SendChatMessageData, SentMessageResult> {
  constructor(
    private repo: SendChatMessageRepo,
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private validator: ValidateThreadIdsInteractor,
    private entitlements: EntitlementService,
    private startChat: Pick<StartChatInteractor, "invoke">,
  ) {
    super();
  }

  @Write({
    input: SendChatMessageSchema,
    tx: false,
    precheck: (self, data, ctx) =>
      data.draftMessageId ? undefined : self.validator.invoke([{ ids: data.threadId, path: ["threadId"] }], ctx),
  })
  async invoke(data: SendChatMessageData): Validated<SentMessageResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const found = data.draftMessageId
      ? await this.repo.findThreadById(data.threadId)
      : await this.repo.findThreadByIdOrThrow(data.threadId);
    if (!found && data.draftMessageId && data.draftRevision) {
      const settled = await this.settledDraftConversation(data.draftMessageId, data.draftRevision);
      if (settled) return settled;
      return failNotFound(CustomErrorCode.threadNotFound, ["threadId"]);
    }
    const thread = found ?? (await this.repo.findThreadByIdOrThrow(data.threadId));
    if (isEmailProvider(thread.provider)) return fail(CustomErrorCode.chatThreadRequired, ["threadId"]);
    if (isDraftThreadId(thread.unipileThreadId)) return this.startDraftChat(thread, data);

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
    if (accountNeedsReconnect(account)) return fail(CustomErrorCode.unipileDisconnectedAccount, []);

    let draft: DraftThreadTarget | null = null;
    if (data.draftMessageId && data.draftRevision) {
      const revision = draftUpdatedAtFromRevision(data.draftRevision);
      draft = await this.repo.findDraftById({ messageId: data.draftMessageId });
      if (!draft) {
        const missing = await gateMissingDraft(this.repo, {
          draftMessageId: data.draftMessageId,
          draftRevision: revision,
          connectedAccountId: account.id,
        });
        return "replay" in missing ? this.replay(missing.replay, account.id, thread.id) : missing.failure;
      }
      const conflict = draftBindingConflict({
        provider: account.provider,
        draft,
        connectedAccountId: account.id,
        draftRevision: data.draftRevision,
        replyThreadId: thread.id,
        to: [],
      });
      if (conflict) return failConflict(DRAFT_CONFLICT_CODES[conflict]);
    }

    let claim: DraftSendClaim | null = null;
    if (draft && data.draftRevision) {
      const gate = await openDraftSend(this.repo, {
        draftMessageId: draft.id,
        draftRevision: draftUpdatedAtFromRevision(data.draftRevision),
        connectedAccountId: account.id,
      });
      if ("replay" in gate) return this.replay(gate.replay, account.id, thread.id);
      if ("failure" in gate) return gate.failure;
      claim = gate.claim;
    }

    if (
      data.text.trim() &&
      (await this.repo.findRecentOutboundDuplicate({
        messagingThreadId: thread.id,
        bodyText: data.text,
        windowMs: DUPLICATE_OUTBOUND_WINDOW_MS,
      }))
    ) {
      if (claim) await releaseDraftSendQuietly(this.repo, claim);
      return failConflict(CustomErrorCode.duplicateOutboundSuppressed);
    }

    const sentAt = new Date();
    let res: Awaited<ReturnType<MessagingService["sendChatMessage"]>>;
    try {
      res = await this.messagingService.sendChatMessage({
        accountId: account.unipileAccountId,
        chatId: thread.unipileThreadId,
        text: data.text,
        attachments: data.attachments,
      });
    } catch (err) {
      if (claim) await settleDraftSendQuietly(this.repo, { claim, state: "unknown" });
      throw err;
    }

    let providerMessageId: string | null = null;
    if (res.ok) providerMessageId = res.data.messageId ?? null;
    else if (providerSendOutcome(res.error) !== "accepted") {
      if (claim) {
        if (providerSendOutcome(res.error) === "unknown")
          await settleDraftSendQuietly(this.repo, { claim, state: "unknown" });
        else await releaseDraftSendQuietly(this.repo, claim);
      }
      return fail(res.error, [], { retryAfter: await retryAfterPhrase(res.retryAfterSeconds) });
    }

    const unipileMessageId = providerMessageId ?? `sent_${randomUUID()}`;
    const recipients: { to: MessagingAttendee[]; cc: MessagingAttendee[]; bcc: MessagingAttendee[] } = {
      to: [],
      cc: [],
      bcc: [],
    };
    let recorded: MessagingMessage | null = null;
    try {
      const sender = (await this.repo.findSelfAttendeeForThread(thread.id)) ?? { ...EMPTY_ATTENDEE, isSelf: true };

      if (claim && draft) {
        try {
          recorded = await this.repo.completeReplyDraftSend({
            claim,
            messageId: draft.id,
            unipileMessageId,
            providerMessageId: null,
            sender,
            recipients,
            subject: null,
            bodyText: data.text,
            bodyHtml: null,
            attachmentsMeta: [],
            sentAt,
          });
        } catch (err) {
          Sentry.captureException(err, { tags: { kind: "draft-send-completion-failure" } });
          await settleDraftSendQuietly(this.repo, { claim, state: "sent", unipileMessageId });
        }
      }

      if (!recorded) {
        recorded = await this.repo.persistOutboundMessageOrThrow({
          connectedAccountId: thread.connectedAccountId,
          message: {
            unipileMessageId,
            providerMessageId: null,
            provider: thread.provider,
            direction: MessagingMessageDirection.outbound,
            origin: MessagingMessageOrigin.unipile,
            sender,
            recipients,
            subject: null,
            bodyText: data.text,
            bodyHtml: null,
            attachmentsMeta: [],
            isEvent: false,
            isDeleted: false,
            isHidden: false,
            sentAt,
            reactions: [],
            unipileThreadId: thread.unipileThreadId,
            threadType: thread.type,
          },
        });
        if (claim) await recordDraftSendQuietly(this.repo, claim, recorded);
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { kind: "sent-message-not-recorded" } });
      if (claim) await settleDraftSendQuietly(this.repo, { claim, state: "sent", unipileMessageId });
    }
    if (draft) {
      try {
        await this.repo.restoreDraftSummaryIfPresent({ messageId: draft.id });
      } catch (err) {
        Sentry.captureException(err, { tags: { kind: "draft-summary-refresh-failure" } });
      }
    }

    return { ok: true as const, data: sentMessageResult({ message: recorded, threadId: thread.id }) };
  }

  private async startDraftChat(thread: MessagingThread, data: SendChatMessageData): Validated<SentMessageResult> {
    if (!data.draftMessageId || !data.draftRevision) return fail(CustomErrorCode.draftThreadNotSent, ["threadId"]);
    const draft = await this.repo.findDraftById({ messageId: data.draftMessageId });
    if (draft && draft.messagingThreadId !== thread.id) return failConflict(CustomErrorCode.draftTargetMismatch);

    const started = await this.startChat.invoke({
      connectedAccountId: thread.connectedAccountId,
      attendeeIdentifiers: thread.participants
        .filter((participant) => !participant.isSelf && participant.identifier)
        .map((participant) => participant.identifier),
      text: data.text,
      attachments: data.attachments,
      draftMessageId: data.draftMessageId,
      draftRevision: data.draftRevision,
    });
    if (!started.ok) return started;

    return {
      ok: true as const,
      data: sentMessageResult({
        message: null,
        messageId: started.data.messageId,
        threadId: started.data.threadId,
        repeated: started.data.repeated,
      }),
    };
  }

  private async settledDraftConversation(
    draftMessageId: string,
    draftRevision: string,
  ): Promise<Awaited<Validated<SentMessageResult>> | null> {
    const record = await this.repo.findDraftSend({ draftMessageId });
    if (!record) return null;
    const missing = await gateMissingDraft(this.repo, {
      draftMessageId,
      draftRevision: draftUpdatedAtFromRevision(draftRevision),
      connectedAccountId: record.connectedAccountId,
    });
    if ("failure" in missing) return missing.failure;
    const message = await this.repo.findDraftSendMessage({
      record: missing.replay,
      connectedAccountId: record.connectedAccountId,
    });
    return {
      ok: true as const,
      data: sentMessageResult({
        message,
        messageId: missing.replay.sentMessageId,
        threadId: missing.replay.sentThreadId,
        repeated: true,
      }),
    };
  }

  private async replay(
    record: DraftSendRecord,
    connectedAccountId: string,
    threadId: string,
  ): Validated<SentMessageResult> {
    const message = await this.repo.findDraftSendMessage({ record, connectedAccountId });
    return {
      ok: true as const,
      data: sentMessageResult({
        message,
        messageId: record.sentMessageId,
        threadId: record.sentThreadId ?? threadId,
        repeated: true,
      }),
    };
  }
}
