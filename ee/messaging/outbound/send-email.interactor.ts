import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type {
  AttachmentMeta,
  MessagingAttendee,
  MessagingMessage,
  MessagingThread,
  IngestMessage,
} from "../messaging.schema";
import type { MessagingMessageDto } from "../inbox/inbox.schema";
import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { getLocale } from "next-intl/server";
import * as Sentry from "@sentry/node";

import { Resource, Action, MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { formatRetryAfter } from "../retry-after";
import { isUnipileResourceNotFound, isUnipileTimeout } from "../messaging.service";
import { isDraftThreadId } from "../provider";
import {
  DraftRevisionSchema,
  draftRevisionMatches,
  draftThreadRecipientSetsMatch,
  draftUpdatedAtFromRevision,
  hasCompleteDraftBinding,
  type DraftThreadTarget,
} from "../draft-thread";
import { composeEmailBodies } from "./email-signature";
import { parseSignatureFields } from "../signature-fields";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox/inbox.schema";
import { EMPTY_ATTENDEE, buildEmailMessage, toAttachmentsMeta } from "../unipile.mappers";
import { UnipileEmailSchema } from "../unipile.schema";

const DUPLICATE_OUTBOUND_WINDOW_MS = 60_000;
const ADOPT_EMAIL_TIMEOUT_MS = 5_000;

const AttendeeSchema = z.object({
  identifier: z.email(),
  display_name: z.string().optional(),
});

export const SendAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.string().min(1).max(255),
  content: z.string().min(1).max(34_000_000),
});
export type SendAttachment = Data<typeof SendAttachmentSchema>;

export const SendEmailSchema = z
  .object({
    threadId: z.uuid().optional(),
    connectedAccountId: z.uuid().optional(),
    to: z.array(AttendeeSchema).min(1).max(100),
    cc: z.array(z.email()).max(100).optional(),
    bcc: z.array(z.email()).max(100).optional(),
    subject: z.string().max(998),
    body: z.string().max(100_000),
    bodyFormat: z
      .enum(["plain_text", "html"])
      .optional()
      .describe("How to interpret body. Omit for backwards-compatible automatic detection"),
    attachments: z.array(SendAttachmentSchema).max(20).optional(),
    draftMessageId: z
      .uuid()
      .optional()
      .describe("Saved draft to convert or discard after this exact delivery succeeds"),
    draftRevision: DraftRevisionSchema.optional().describe(
      "Opaque revision returned with the saved draft; required whenever draftMessageId is provided",
    ),
  })
  .superRefine((d, ctx) => {
    if (!hasCompleteDraftBinding(d)) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.draftMessageNotFound },
        path: [d.draftMessageId ? "draftRevision" : "draftMessageId"],
      });
    }
    if (!d.threadId && !d.connectedAccountId) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.sendEmailTargetRequired },
        path: ["threadId"],
      });
    }
    if (!d.subject.trim()) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.subjectRequired },
        path: ["subject"],
      });
    }
    if (!d.body.trim() && !d.attachments?.length) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.messageContentRequired },
        path: ["body"],
      });
    }
  });
export type SendEmailData = Data<typeof SendEmailSchema>;

export abstract class SendEmailRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findLatestEmailReplyReferenceForThread(threadId: string): Promise<string | null>;
  abstract findDraftById(args: { messageId: string }): Promise<DraftThreadTarget | null>;
  abstract discardDraftAfterSend(args: { messageId: string; expectedUpdatedAt: Date }): Promise<void>;
  abstract restoreDraftSummaryIfPresent(args: { messageId: string }): Promise<void>;
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
    expectedUpdatedAt: Date;
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

function emailRecipient(email: string, displayName?: string | null): MessagingAttendee {
  return { ...EMPTY_ATTENDEE, attendeeId: email, identifier: email.toLowerCase(), displayName: displayName ?? null };
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SendEmailInteractor extends AuthenticatedInteractor<SendEmailData, MessagingMessageDto | null> {
  constructor(
    private repo: SendEmailRepo,
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(SendEmailSchema)
  @ValidateOutput(z.union([MessagingMessageDtoSchema, z.null()]))
  async invoke(data: SendEmailData): Validated<MessagingMessageDto | null> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    let account: ConnectedAccount;
    let thread: MessagingThread | null = null;
    let inReplyTo: string | undefined;

    if (data.threadId) {
      thread = await this.repo.findThreadByIdOrThrow(data.threadId);
      if (isDraftThreadId(thread.unipileThreadId)) return fail(CustomErrorCode.draftThreadNotSent, ["threadId"]);

      account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
      inReplyTo = (await this.repo.findLatestEmailReplyReferenceForThread(thread.id)) ?? undefined;
    } else {
      if (!data.connectedAccountId) {
        throw new Error(
          "send-email reached with neither threadId nor connectedAccountId; schema validation should prevent this",
        );
      }
      account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    }

    const draft = data.draftMessageId ? await this.repo.findDraftById({ messageId: data.draftMessageId }) : null;
    if (data.draftMessageId && !draft) return failNotFound(CustomErrorCode.draftMessageNotFound);
    if (draft && (!data.draftRevision || !draftRevisionMatches(draft.updatedAt, data.draftRevision)))
      return failNotFound(CustomErrorCode.draftMessageNotFound);
    if (
      draft &&
      (draft.connectedAccountId !== account.id ||
        (thread
          ? draft.messagingThreadId !== thread.id
          : !isDraftThreadId(draft.unipileThreadId) ||
            !draftThreadRecipientSetsMatch(
              account.provider,
              draft.recipientIdentifiers,
              data.to.map((recipient) => recipient.identifier),
            )))
    )
      return failNotFound(CustomErrorCode.draftMessageNotFound);

    const { plainText: outgoingBody, html: outgoingHtml } = composeEmailBodies(
      data.body,
      account.signature,
      parseSignatureFields(account.signatureFields),
      data.bodyFormat ?? "auto",
    );

    if (
      thread &&
      outgoingBody.trim() &&
      (await this.repo.findRecentOutboundDuplicate({
        messagingThreadId: thread.id,
        bodyText: outgoingBody,
        windowMs: DUPLICATE_OUTBOUND_WINDOW_MS,
      }))
    )
      return failConflict(CustomErrorCode.duplicateOutboundSuppressed);

    const sentAt = new Date();
    const res = await this.messagingService.sendEmail({
      accountId: account.unipileAccountId,
      from: account.emailAddress
        ? { email: account.emailAddress, display_name: account.displayName ?? undefined }
        : undefined,
      to: data.to.map((attendee) => ({ email: attendee.identifier, display_name: attendee.display_name })),
      cc: data.cc?.map((email) => ({ email })),
      bcc: data.bcc?.map((email) => ({ email })),
      subject: data.subject,
      body: outgoingHtml,
      plainText: outgoingBody,
      inReplyTo,
      attachments: data.attachments,
    });

    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    if (!thread) {
      const adopted = await this.adoptSentEmail(account, res.data.id);
      if (draft && data.draftRevision)
        await this.discardDraftSafely(draft.id, draftUpdatedAtFromRevision(data.draftRevision));
      return adopted;
    }

    let attachmentsMeta: AttachmentMeta[] = [];
    if (data.attachments?.length) {
      const sent = await this.messagingService.getEmailAttachments({
        accountId: account.unipileAccountId,
        emailId: res.data.id,
      });
      if (sent.ok) attachmentsMeta = toAttachmentsMeta(sent.data);
    }

    const sender: MessagingAttendee = {
      ...EMPTY_ATTENDEE,
      attendeeId: account.emailAddress ?? "",
      identifier: (account.emailAddress ?? "").toLowerCase(),
      displayName: account.displayName,
      isSelf: true,
    };
    const markSelf = (attendee: MessagingAttendee): MessagingAttendee =>
      attendee.identifier === sender.identifier ? { ...attendee, isSelf: true } : attendee;
    const recipients = {
      to: data.to.map((attendee) => markSelf(emailRecipient(attendee.identifier, attendee.display_name))),
      cc: (data.cc ?? []).map((email) => markSelf(emailRecipient(email))),
      bcc: (data.bcc ?? []).map((email) => markSelf(emailRecipient(email))),
    };

    if (draft && data.draftRevision) {
      const converted = await this.repo.convertDraftToSent({
        messageId: draft.id,
        expectedUpdatedAt: draftUpdatedAtFromRevision(data.draftRevision),
        unipileMessageId: res.data.id,
        providerMessageId: res.data.messageId,
        sender,
        recipients,
        subject: data.subject,
        bodyText: outgoingBody,
        bodyHtml: outgoingHtml,
        attachmentsMeta,
        sentAt,
      });

      if (converted) {
        await this.restoreDraftSummarySafely(draft.id);
        return { ok: true as const, data: toMessagingMessageDto(converted) };
      }
    }

    const persisted = await this.repo.persistOutboundMessageOrThrow({
      connectedAccountId: account.id,
      message: {
        unipileMessageId: res.data.id,
        providerMessageId: res.data.messageId,
        provider: thread.provider,
        direction: MessagingMessageDirection.outbound,
        origin: MessagingMessageOrigin.unipile,
        sender,
        recipients,
        subject: data.subject,
        bodyText: outgoingBody,
        bodyHtml: outgoingHtml,
        attachmentsMeta,
        isEvent: false,
        isDeleted: false,
        isHidden: false,
        sentAt,
        reactions: [],
        unipileThreadId: thread.unipileThreadId,
        threadType: thread.type,
      },
    });
    if (draft) await this.restoreDraftSummarySafely(draft.id);

    return { ok: true as const, data: toMessagingMessageDto(persisted) };
  }

  private async adoptSentEmail(account: ConnectedAccount, emailId: string): Validated<MessagingMessageDto | null> {
    try {
      const raw = await this.fetchSentEmail(account.unipileAccountId, emailId);
      const parsed = UnipileEmailSchema.safeParse(raw);
      if (!parsed.success) return { ok: true as const, data: null };

      const message = buildEmailMessage(parsed.data, {
        provider: account.provider,
        emailAddress: account.emailAddress,
        sentFolderIds: account.sentFolderIds,
      });
      if (!message) return { ok: true as const, data: null };

      const persisted = await this.repo.persistOutboundMessageOrThrow({ connectedAccountId: account.id, message });

      return { ok: true as const, data: toMessagingMessageDto(persisted) };
    } catch (err) {
      if (!isUnipileResourceNotFound(err) && !isUnipileTimeout(err)) Sentry.captureException(err);
      return { ok: true as const, data: null };
    }
  }

  private async fetchSentEmail(accountId: string, emailId: string): Promise<unknown> {
    try {
      return await this.messagingService.getEmail({ accountId, emailId, timeoutMs: ADOPT_EMAIL_TIMEOUT_MS });
    } catch (err) {
      if (!isUnipileResourceNotFound(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.messagingService.getEmail({ accountId, emailId, timeoutMs: ADOPT_EMAIL_TIMEOUT_MS });
    }
  }

  private async discardDraftSafely(messageId: string, expectedUpdatedAt: Date): Promise<void> {
    try {
      await this.repo.discardDraftAfterSend({ messageId, expectedUpdatedAt });
    } catch (err) {
      Sentry.captureException(err);
    }
  }

  private async restoreDraftSummarySafely(messageId: string): Promise<void> {
    try {
      await this.repo.restoreDraftSummaryIfPresent({ messageId });
    } catch (err) {
      Sentry.captureException(err);
    }
  }
}
