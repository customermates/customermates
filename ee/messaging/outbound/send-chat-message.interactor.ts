import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import type { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type {
  MessagingAttendee,
  MessagingMessage,
  MessagingThread,
  IngestMessage,
  AttachmentMeta,
} from "../messaging.schema";
import type { MessagingMessageDto } from "../inbox/inbox.schema";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getLocale } from "next-intl/server";

import { Resource, Action, MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { isDraftThreadId } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { toMessagingMessageDto } from "../inbox/inbox.schema";
import { EMPTY_ATTENDEE } from "../unipile.mappers";
import { SendAttachmentSchema } from "./send-email.interactor";

export const DUPLICATE_OUTBOUND_WINDOW_MS = 60_000;

export const BaseSendChatMessageSchema = z.object({
  threadId: z.uuid(),
  text: z.string().max(20_000),
  attachments: z.array(SendAttachmentSchema).max(20).optional(),
  draftMessageId: z.uuid().optional(),
});

export const SendChatMessageSchema = BaseSendChatMessageSchema.superRefine((d, ctx) => {
  if (!d.text.trim() && !d.attachments?.length) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.messageContentRequired },
      path: ["text"],
    });
  }
});
export type SendChatMessageData = Data<typeof SendChatMessageSchema>;

export abstract class SendChatMessageRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findSelfAttendeeForThread(threadId: string): Promise<MessagingAttendee | null>;
  abstract findDraftById(args: { messageId: string }): Promise<{ id: string } | null>;
  abstract findRecentOutboundDuplicate(args: {
    messagingThreadId: string;
    bodyText: string;
    windowMs: number;
  }): Promise<string | null>;
  abstract persistOutboundMessageOrThrow(args: {
    connectedAccountId: string;
    message: IngestMessage;
  }): Promise<MessagingMessage>;
  abstract convertDraftToSent(args: {
    messageId: string;
    unipileMessageId: string;
    providerMessageId: string | null;
    sender: MessagingAttendee;
    recipients: { to: MessagingAttendee[]; cc: MessagingAttendee[]; bcc: MessagingAttendee[] };
    subject: string | null;
    bodyText: string | null;
    bodyHtml: string | null;
    attachmentsMeta: AttachmentMeta[];
    sentAt: Date;
  }): Promise<MessagingMessage | null>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SendChatMessageInteractor extends AuthenticatedInteractor<SendChatMessageData, MessagingMessageDto> {
  constructor(
    private repo: SendChatMessageRepo,
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private validator: ValidateThreadIdsInteractor,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: SendChatMessageSchema,
    tx: false,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.threadId, path: ["threadId"] }], ctx),
  })
  async invoke(data: SendChatMessageData): Validated<MessagingMessageDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const thread = await this.repo.findThreadByIdOrThrow(data.threadId);
    if (isDraftThreadId(thread.unipileThreadId)) return fail(CustomErrorCode.draftThreadNotSent, ["threadId"]);

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);

    if (data.draftMessageId && !(await this.repo.findDraftById({ messageId: data.draftMessageId })))
      return failNotFound(CustomErrorCode.draftMessageNotFound);

    if (
      data.text.trim() &&
      (await this.repo.findRecentOutboundDuplicate({
        messagingThreadId: thread.id,
        bodyText: data.text,
        windowMs: DUPLICATE_OUTBOUND_WINDOW_MS,
      }))
    )
      return failConflict(CustomErrorCode.duplicateOutboundSuppressed);

    const res = await this.messagingService.sendChatMessage({
      accountId: account.unipileAccountId,
      chatId: thread.unipileThreadId,
      text: data.text,
      attachments: data.attachments,
    });

    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    const sentAt = new Date();
    const sender = (await this.repo.findSelfAttendeeForThread(thread.id)) ?? { ...EMPTY_ATTENDEE, isSelf: true };
    const recipients: { to: MessagingAttendee[]; cc: MessagingAttendee[]; bcc: MessagingAttendee[] } = {
      to: [],
      cc: [],
      bcc: [],
    };
    const unipileMessageId = res.data.messageId ?? `sent_${randomUUID()}`;

    if (data.draftMessageId) {
      const converted = await this.repo.convertDraftToSent({
        messageId: data.draftMessageId,
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

      if (converted) return { ok: true as const, data: toMessagingMessageDto(converted) };
    }

    const persisted = await this.repo.persistOutboundMessageOrThrow({
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

    return { ok: true as const, data: toMessagingMessageDto(persisted) };
  }
}
