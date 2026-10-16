import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import type { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { DraftSendClaim } from "../draft-send";
import type { DraftThreadTarget } from "../draft-thread";
import type { DraftSendGate } from "./draft-send-gate";
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
import { providerSendOutcome } from "../draft-send";
import { chatSendContentHash } from "../draft-send-copy";
import { retryAfterPhrase } from "../retry-after.server";
import { EMPTY_ATTENDEE } from "../unipile.mappers";
import { SendAttachmentSchema } from "./send-email.interactor";
import { SentMessageResultSchema, toSentMessageResult, type SentMessageResult } from "./sent-message.schema";
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
    private draftSends: DraftSendGate,
  ) {
    super();
  }

  @Write({
    input: SendChatMessageSchema,
    output: SentMessageResultSchema,
    tx: false,
    precheck: (self, data, ctx) =>
      data.draftMessageId ? undefined : self.validator.invoke([{ ids: data.threadId, path: ["threadId"] }], ctx),
  })
  async invoke(data: SendChatMessageData): Validated<SentMessageResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const contentHash = data.draftMessageId
      ? chatSendContentHash({ text: data.text, attachments: data.attachments })
      : "";
    const found = data.draftMessageId
      ? await this.repo.findThreadById(data.threadId)
      : await this.repo.findThreadByIdOrThrow(data.threadId);
    if (!found && data.draftMessageId && data.draftRevision) {
      const settled = await this.settledDraftConversation(data.draftMessageId, data.draftRevision, contentHash);
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
        const missing = await this.draftSends.openMissing({
          draftMessageId: data.draftMessageId,
          draftRevision: revision,
          connectedAccountId: account.id,
          contentHash,
        });
        return "replay" in missing
          ? this.draftSends.replay(missing.replay, { connectedAccountId: account.id, threadId: thread.id })
          : missing.failure;
      }
      const conflict = draftBindingConflict({
        provider: account.provider,
        draft,
        connectedAccountId: account.id,
        draftRevision: data.draftRevision,
        replyThreadId: thread.id,
        to: [],
      });
      if (conflict) return this.draftSends.refuseBinding(conflict);
    }

    let claim: DraftSendClaim | null = null;
    if (draft && data.draftRevision) {
      const gate = await this.draftSends.open({
        draftMessageId: draft.id,
        draftRevision: draftUpdatedAtFromRevision(data.draftRevision),
        connectedAccountId: account.id,
        contentHash,
      });
      if ("replay" in gate)
        return this.draftSends.replay(gate.replay, { connectedAccountId: account.id, threadId: thread.id });
      if ("failure" in gate) return gate.failure;
      claim = gate.claim;
    }

    if (
      data.text.trim() &&
      (await this.draftSends.releaseOnFailure(claim, () =>
        this.repo.findRecentOutboundDuplicate({
          messagingThreadId: thread.id,
          bodyText: data.text,
          windowMs: DUPLICATE_OUTBOUND_WINDOW_MS,
        }),
      ))
    ) {
      if (claim) await this.draftSends.release(claim);
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
      if (claim) await this.draftSends.settle({ claim, state: "unknown" });
      throw err;
    }

    let providerMessageId: string | null = null;
    if (res.ok) providerMessageId = res.data.messageId ?? null;
    else if (providerSendOutcome(res.error) !== "accepted") {
      if (claim) {
        if (providerSendOutcome(res.error) === "unknown") await this.draftSends.settle({ claim, state: "unknown" });
        else await this.draftSends.release(claim);
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
        recorded = await this.draftSends.completeReply({
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
        if (claim) await this.draftSends.record(claim, recorded);
      }
    } catch (err) {
      Sentry.captureException(err, { tags: { kind: "sent-message-not-recorded" } });
      if (claim) await this.draftSends.settle({ claim, state: "sent", unipileMessageId });
    }
    if (draft) {
      try {
        await this.repo.restoreDraftSummaryIfPresent({ messageId: draft.id });
      } catch (err) {
        Sentry.captureException(err, { tags: { kind: "draft-summary-refresh-failure" } });
      }
    }

    return { ok: true as const, data: toSentMessageResult({ message: recorded, threadId: thread.id }) };
  }

  private async startDraftChat(thread: MessagingThread, data: SendChatMessageData): Validated<SentMessageResult> {
    if (!data.draftMessageId || !data.draftRevision) return fail(CustomErrorCode.draftThreadNotSent, ["threadId"]);
    const draft = await this.repo.findDraftById({ messageId: data.draftMessageId });
    if (draft && draft.messagingThreadId !== thread.id) return this.draftSends.refuseBinding("target");

    return this.startChat.invoke({
      connectedAccountId: thread.connectedAccountId,
      attendeeIdentifiers: thread.participants
        .filter((participant) => !participant.isSelf && participant.identifier)
        .map((participant) => participant.identifier),
      text: data.text,
      attachments: data.attachments,
      draftMessageId: data.draftMessageId,
      draftRevision: data.draftRevision,
    });
  }

  private async settledDraftConversation(
    draftMessageId: string,
    draftRevision: string,
    contentHash: string,
  ): Promise<Awaited<Validated<SentMessageResult>> | null> {
    const record = await this.draftSends.findSettled(draftMessageId);
    if (!record) return null;
    const missing = await this.draftSends.openMissing({
      draftMessageId,
      draftRevision: draftUpdatedAtFromRevision(draftRevision),
      connectedAccountId: record.connectedAccountId,
      contentHash,
    });
    return "replay" in missing
      ? this.draftSends.replay(missing.replay, { connectedAccountId: record.connectedAccountId, threadId: null })
      : missing.failure;
  }
}
