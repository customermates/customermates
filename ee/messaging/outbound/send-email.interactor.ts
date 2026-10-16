import { fail, failConflict } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { AttachmentMeta, MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { DraftSendClaim, DraftSendRecord } from "../draft-send";
import type { DraftThreadTarget } from "../draft-thread";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { Resource, MessagingMessageDirection, MessagingMessageOrigin } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { retryAfterPhrase } from "../retry-after.server";
import { isUnipileResourceNotFound, isUnipileTimeout } from "../messaging.service";
import { isDraftThreadId } from "../provider";
import { accountNeedsReconnect } from "../account-health";
import {
  DraftRevisionSchema,
  draftBindingConflict,
  draftUpdatedAtFromRevision,
  hasCompleteDraftBinding,
} from "../draft-thread";
import { DRAFT_CONFLICT_CODES, providerSendOutcome } from "../draft-send";
import { emailSendCopyHashes } from "../draft-send-copy";
import { composeEmailBodies } from "./email-signature";
import { resolveStoredEmailSettings } from "../email-settings";
import { EMPTY_ATTENDEE, buildEmailMessage, toAttachmentsMeta } from "../unipile.mappers";
import { UnipileEmailSchema } from "../unipile.schema";
import { SentMessageResultSchema, sentMessageResult, type SentMessageResult } from "./sent-message-result";
import {
  completeDraftSendQuietly,
  emailSendContentHash,
  gateMissingDraft,
  openDraftSend,
  recordDraftSendQuietly,
  releaseDraftSendOnFailure,
  releaseDraftSendQuietly,
  settleDraftSendQuietly,
} from "./draft-send-gate";
import type { SendEmailRepo } from "./send-email.repo";

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
    to: z.array(AttendeeSchema).max(100).describe("Primary recipients. Use [] for Cc-only or Bcc-only email"),
    cc: z.array(z.email()).max(100).optional(),
    bcc: z.array(z.email()).max(100).optional(),
    subject: z.string().max(998),
    body: z.string().max(100_000),
    bodyFormat: z
      .enum(["plain_text", "markdown", "html"])
      .optional()
      .describe(
        "How to interpret body. Account appearance is applied to plain text and Markdown; explicit HTML remains caller-controlled. Omit for backwards-compatible automatic detection",
      ),
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
  })
  .superRefine((d, ctx) => {
    if (d.to.length + (d.cc?.length ?? 0) + (d.bcc?.length ?? 0) === 0) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.emailRecipientsRequired },
        path: ["to"],
      });
    }
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

type AcceptedEmail = { unipileMessageId: string | null; providerMessageId: string | null };

function emailRecipient(email: string, displayName?: string | null): MessagingAttendee {
  return {
    ...EMPTY_ATTENDEE,
    attendeeId: email,
    identifier: email.toLowerCase(),
    displayName: displayName ?? null,
  };
}

@TenantInteractor({ resource: Resource.inboxMessages, manage: "create" })
export class SendEmailInteractor extends AuthenticatedInteractor<SendEmailData, SentMessageResult> {
  constructor(
    private repo: SendEmailRepo,
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(SendEmailSchema)
  @ValidateOutput(SentMessageResultSchema)
  async invoke(data: SendEmailData): Validated<SentMessageResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    let account: ConnectedAccount;
    let thread: MessagingThread | null = null;
    let draftThreadId: string | null = null;
    let inReplyTo: string | undefined;
    const contentHash = data.draftMessageId
      ? emailSendContentHash({
          to: data.to.map((recipient) => recipient.identifier),
          cc: data.cc,
          bcc: data.bcc,
          subject: data.subject,
          body: data.body,
          attachments: data.attachments,
        })
      : "";

    if (data.threadId) {
      const found = data.draftMessageId
        ? await this.repo.findThreadById(data.threadId)
        : await this.repo.findThreadByIdOrThrow(data.threadId);
      if (!found && data.draftMessageId && data.draftRevision) {
        const settled = await this.settledDraftConversation(data.draftMessageId, data.draftRevision, contentHash);
        if (settled) return settled;
      }
      const target = found ?? (await this.repo.findThreadByIdOrThrow(data.threadId));
      if (isDraftThreadId(target.unipileThreadId)) {
        if (!data.draftMessageId) return fail(CustomErrorCode.draftThreadNotSent, ["threadId"]);
        draftThreadId = target.id;
        account = await this.accountRepo.findUsableAccountByIdOrThrow(target.connectedAccountId);
      } else {
        thread = target;
        account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
        inReplyTo = (await this.repo.findLatestEmailReplyReferenceForThread(thread.id)) ?? undefined;
      }
    } else {
      if (!data.connectedAccountId) {
        throw new Error(
          "send-email reached with neither threadId nor connectedAccountId; schema validation should prevent this",
        );
      }
      account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);
    }
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
          contentHash,
        });
        return "replay" in missing ? this.replay(missing.replay, account, thread?.id ?? null) : missing.failure;
      }
      if (draftThreadId && draft.messagingThreadId !== draftThreadId)
        return failConflict(CustomErrorCode.draftTargetMismatch);
      const conflict = draftBindingConflict({
        provider: account.provider,
        draft,
        connectedAccountId: account.id,
        draftRevision: data.draftRevision,
        replyThreadId: thread?.id ?? null,
        to: data.to.map((recipient) => recipient.identifier),
        cc: data.cc,
      });
      if (conflict) return failConflict(DRAFT_CONFLICT_CODES[conflict]);
    }

    const email = resolveStoredEmailSettings(account.signature, account.signatureFields);
    const { plainText: outgoingBody, html: outgoingHtml } = composeEmailBodies(
      data.body,
      email.markdown,
      email.settings,
      data.bodyFormat ?? "auto",
    );

    let claim: DraftSendClaim | null = null;
    if (draft && data.draftRevision) {
      const gate = await openDraftSend(this.repo, {
        draftMessageId: draft.id,
        draftRevision: draftUpdatedAtFromRevision(data.draftRevision),
        connectedAccountId: account.id,
        contentHash,
        matchHashes: emailSendCopyHashes({
          to: data.to.map((recipient) => recipient.identifier),
          cc: data.cc,
          subject: data.subject,
          html: outgoingHtml,
          plainText: outgoingBody,
          attachments: data.attachments,
        }),
      });
      if ("replay" in gate) return this.replay(gate.replay, account, thread?.id ?? null);
      if ("failure" in gate) return gate.failure;
      claim = gate.claim;
    }

    const duplicateThreadId = thread && outgoingBody.trim() ? thread.id : null;
    if (
      duplicateThreadId &&
      (await releaseDraftSendOnFailure(this.repo, claim, () =>
        this.repo.findRecentOutboundDuplicate({
          messagingThreadId: duplicateThreadId,
          bodyText: outgoingBody,
          windowMs: DUPLICATE_OUTBOUND_WINDOW_MS,
        }),
      ))
    ) {
      if (claim) await releaseDraftSendQuietly(this.repo, claim);
      return failConflict(CustomErrorCode.duplicateOutboundSuppressed);
    }

    const sentAt = new Date();
    let res: Awaited<ReturnType<MessagingService["sendEmail"]>>;
    try {
      res = await this.messagingService.sendEmail({
        accountId: account.unipileAccountId,
        from: account.emailAddress
          ? {
              email: account.emailAddress,
              display_name: account.displayName ?? undefined,
            }
          : undefined,
        to: data.to.map((attendee) => ({
          email: attendee.identifier,
          display_name: attendee.display_name,
        })),
        cc: data.cc?.map((email) => ({ email })),
        bcc: data.bcc?.map((email) => ({ email })),
        subject: data.subject,
        body: outgoingHtml,
        plainText: outgoingBody,
        inReplyTo,
        attachments: data.attachments,
      });
    } catch (err) {
      if (claim) await settleDraftSendQuietly(this.repo, { claim, state: "unknown" });
      throw err;
    }

    let accepted: AcceptedEmail;
    if (res.ok) accepted = { unipileMessageId: res.data.id, providerMessageId: res.data.messageId };
    else if (providerSendOutcome(res.error) === "accepted")
      accepted = { unipileMessageId: null, providerMessageId: null };
    else {
      if (claim && draft) {
        if (providerSendOutcome(res.error) === "unknown") {
          await settleDraftSendQuietly(this.repo, { claim, state: "unknown" });
          const confirmed = await this.confirmedBySyncedCopy(claim, draft.id, account, thread?.id ?? null);
          if (confirmed) return confirmed;
        } else await releaseDraftSendQuietly(this.repo, claim);
      }
      return fail(res.error, [], {
        retryAfter: await retryAfterPhrase(res.retryAfterSeconds),
      });
    }

    if (!thread || !accepted.unipileMessageId) {
      if (claim && draft) await completeDraftSendQuietly(this.repo, { claim, draftMessageId: draft.id, ...accepted });
      const adopted =
        !thread && accepted.unipileMessageId
          ? await this.adoptSentEmail(account, accepted.unipileMessageId, data.bcc ?? [])
          : null;
      if (adopted && claim) await recordDraftSendQuietly(this.repo, claim, adopted);
      return {
        ok: true as const,
        data: sentMessageResult({
          message: adopted,
          threadId: thread?.id ?? null,
          providerMessageId: accepted.providerMessageId,
        }),
      };
    }

    const sentEmailId = accepted.unipileMessageId;
    let attachmentsMeta: AttachmentMeta[] = [];
    if (data.attachments?.length) {
      try {
        const sent = await this.messagingService.getEmailAttachments({
          accountId: account.unipileAccountId,
          emailId: sentEmailId,
        });
        if (sent.ok) attachmentsMeta = toAttachmentsMeta(sent.data);
      } catch (err) {
        Sentry.captureException(err, { tags: { kind: "sent-attachments-unreadable" } });
      }
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

    let recorded: MessagingMessage | null = null;
    if (claim && draft) {
      try {
        recorded = await this.repo.completeReplyDraftSend({
          claim,
          messageId: draft.id,
          unipileMessageId: sentEmailId,
          providerMessageId: accepted.providerMessageId,
          sender,
          recipients,
          subject: data.subject,
          bodyText: outgoingBody,
          bodyHtml: outgoingHtml,
          attachmentsMeta,
          sentAt,
        });
      } catch (err) {
        Sentry.captureException(err, { tags: { kind: "draft-send-completion-failure" } });
        await settleDraftSendQuietly(this.repo, { claim, state: "sent", ...accepted });
      }
    }

    if (!recorded) {
      try {
        recorded = await this.repo.persistOutboundMessageOrThrow({
          connectedAccountId: account.id,
          message: {
            unipileMessageId: sentEmailId,
            providerMessageId: accepted.providerMessageId,
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
        if (claim) await recordDraftSendQuietly(this.repo, claim, recorded);
      } catch (err) {
        Sentry.captureException(err, { tags: { kind: "sent-message-not-recorded" } });
      }
    }
    if (draft) await this.restoreDraftSummary(draft.id);

    return {
      ok: true as const,
      data: sentMessageResult({
        message: recorded,
        threadId: thread.id,
        providerMessageId: accepted.providerMessageId,
      }),
    };
  }

  private async settledDraftConversation(
    draftMessageId: string,
    draftRevision: string,
    contentHash: string,
  ): Promise<Awaited<Validated<SentMessageResult>> | null> {
    const record = await this.repo.findDraftSend({ draftMessageId });
    if (!record) return null;
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(record.connectedAccountId);
    const missing = await gateMissingDraft(this.repo, {
      draftMessageId,
      draftRevision: draftUpdatedAtFromRevision(draftRevision),
      connectedAccountId: account.id,
      contentHash,
    });
    return "replay" in missing ? this.replay(missing.replay, account, null) : missing.failure;
  }

  private async confirmedBySyncedCopy(
    claim: DraftSendClaim,
    draftMessageId: string,
    account: ConnectedAccount,
    replyThreadId: string | null,
  ): Promise<Awaited<Validated<SentMessageResult>> | null> {
    let record: DraftSendRecord | null = null;
    try {
      record = await this.repo.reconcileDraftSend({ draftMessageId });
    } catch (err) {
      Sentry.captureException(err, { tags: { kind: "draft-send-reconcile-failure" } });
    }
    if (record?.state !== "sent" || record.draftRevision.getTime() !== claim.draftRevision.getTime()) return null;
    return this.replay(record, account, replyThreadId, false);
  }

  private async replay(
    record: DraftSendRecord,
    account: ConnectedAccount,
    replyThreadId: string | null,
    repeated = true,
  ): Validated<SentMessageResult> {
    const message = await this.repo.findDraftSendMessage({ record, connectedAccountId: account.id });
    return {
      ok: true as const,
      data: sentMessageResult({
        message,
        messageId: record.sentMessageId,
        threadId: record.sentThreadId ?? replyThreadId,
        providerMessageId: record.providerMessageId,
        repeated,
      }),
    };
  }

  private async restoreDraftSummary(messageId: string) {
    try {
      await this.repo.restoreDraftSummaryIfPresent({ messageId });
    } catch (err) {
      Sentry.captureException(err, { tags: { kind: "draft-summary-refresh-failure" } });
    }
  }

  private async adoptSentEmail(
    account: ConnectedAccount,
    emailId: string,
    submittedBcc: string[],
  ): Promise<MessagingMessage | null> {
    try {
      const raw = await this.fetchSentEmail(account.unipileAccountId, emailId);
      const parsed = UnipileEmailSchema.safeParse(raw);
      if (!parsed.success) return null;

      const message = buildEmailMessage(parsed.data, {
        provider: account.provider,
        emailAddress: account.emailAddress,
        sentFolderIds: account.sentFolderIds,
      });
      if (!message) return null;
      if (message.recipients.bcc.length === 0 && submittedBcc.length > 0) {
        const self = (account.emailAddress ?? "").toLowerCase();
        message.recipients.bcc = submittedBcc.map((email) => {
          const recipient = emailRecipient(email);
          return { ...recipient, isSelf: recipient.identifier === self };
        });
      }

      return await this.repo.persistOutboundMessageOrThrow({
        connectedAccountId: account.id,
        message,
      });
    } catch (err) {
      if (!isUnipileResourceNotFound(err) && !isUnipileTimeout(err)) Sentry.captureException(err);
      return null;
    }
  }

  private async fetchSentEmail(accountId: string, emailId: string): Promise<unknown> {
    try {
      return await this.messagingService.getEmail({
        accountId,
        emailId,
        timeoutMs: ADOPT_EMAIL_TIMEOUT_MS,
      });
    } catch (err) {
      if (!isUnipileResourceNotFound(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.messagingService.getEmail({
        accountId,
        emailId,
        timeoutMs: ADOPT_EMAIL_TIMEOUT_MS,
      });
    }
  }
}
