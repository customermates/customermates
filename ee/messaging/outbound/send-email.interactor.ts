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
import { getLocale, getTranslations } from "next-intl/server";
import * as Sentry from "@sentry/node";

import { Resource, Action, MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { assertInvariant } from "@/core/errors/assert-invariant";
import { formatRetryAfter } from "../retry-after";
import { isUnipileResourceNotFound, isUnipileTimeout } from "../messaging.service";
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
    attachments: z.array(SendAttachmentSchema).max(20).optional(),
    draftMessageId: z.uuid().optional(),
  })
  .superRefine((d, ctx) => {
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
      account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
      inReplyTo = (await this.repo.findLatestEmailReplyReferenceForThread(thread.id)) ?? undefined;
    } else {
      assertInvariant(
        data.connectedAccountId,
        "send-email reached with neither threadId nor connectedAccountId; schema validation should prevent this",
      );
      account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    }

    if (data.draftMessageId && !(await this.repo.findDraftById({ messageId: data.draftMessageId }))) {
      const t = await getTranslations();
      return { ok: false, error: createZodError<MessagingMessageDto | null>(t("Common.errors.draftMessageNotFound")) };
    }

    if (
      thread &&
      data.body.trim() &&
      (await this.repo.findRecentOutboundDuplicate({
        messagingThreadId: thread.id,
        bodyText: data.body,
        windowMs: DUPLICATE_OUTBOUND_WINDOW_MS,
      }))
    ) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<MessagingMessageDto | null>(t("Common.errors.duplicateOutboundSuppressed")),
      };
    }

    const res = await this.messagingService.sendEmail({
      accountId: account.unipileAccountId,
      from: account.emailAddress
        ? { email: account.emailAddress, display_name: account.displayName ?? undefined }
        : undefined,
      to: data.to.map((attendee) => ({ email: attendee.identifier, display_name: attendee.display_name })),
      cc: data.cc?.map((email) => ({ email })),
      bcc: data.bcc?.map((email) => ({ email })),
      subject: data.subject,
      body: data.body,
      inReplyTo,
      attachments: data.attachments,
    });

    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<MessagingMessageDto | null>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    if (!thread) return this.adoptSentEmail(account, res.data.id);

    let attachmentsMeta: AttachmentMeta[] = [];
    if (data.attachments?.length) {
      const sent = await this.messagingService.getEmailAttachments({
        accountId: account.unipileAccountId,
        emailId: res.data.id,
      });
      if (sent.ok) attachmentsMeta = toAttachmentsMeta(sent.data);
    }

    const sentAt = new Date();
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

    if (data.draftMessageId) {
      const converted = await this.repo.convertDraftToSent({
        messageId: data.draftMessageId,
        unipileMessageId: res.data.id,
        providerMessageId: res.data.messageId,
        sender,
        recipients,
        subject: data.subject,
        bodyText: data.body,
        bodyHtml: data.body,
        attachmentsMeta,
        sentAt,
      });

      if (converted) return { ok: true as const, data: toMessagingMessageDto(converted) };
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
        bodyText: data.body,
        bodyHtml: data.body,
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
}
