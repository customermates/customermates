import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingMessageDto } from "../inbox/inbox.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { normalizeChannelValue } from "@/features/contacts/channel-value";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { isEmailProvider } from "../provider";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox/inbox.schema";
import { EMPTY_ATTENDEE } from "../unipile.mappers";
import { applyEmailSignature } from "./email-signature";

export const BaseSaveDraftSchema = z.object({
  threadId: z
    .uuid()
    .optional()
    .describe("Reply draft: the existing thread to draft on. Omit to draft a brand-new outbound conversation"),
  connectedAccountId: z
    .uuid()
    .optional()
    .describe("New outbound draft: the connected account to send from later. Required when threadId is omitted"),
  recipients: z
    .array(z.string().min(1))
    .max(100)
    .optional()
    .describe(
      "New outbound draft: email addresses, or one LinkedIn/Telegram/Instagram handle. Required when threadId is omitted",
    ),
  subject: z.string().max(998).optional(),
  body: z.string().min(1).max(100_000),
  cc: z.array(z.email()).max(100).optional(),
  bcc: z.array(z.email()).max(100).optional(),
});

export const SaveDraftSchema = BaseSaveDraftSchema.superRefine((d, ctx) => {
  if (!d.threadId && !d.connectedAccountId) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.sendEmailTargetRequired },
      path: ["threadId"],
    });
  }
  if (!d.threadId && !d.recipients?.length) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.invalidChannelValue },
      path: ["recipients"],
    });
  }
});
export type SaveDraftData = Data<typeof SaveDraftSchema>;

export abstract class SaveDraftRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findOrCreateDraftThread(args: {
    connectedAccountId: string;
    provider: MessagingProvider;
    recipients: string[];
  }): Promise<MessagingThread>;
  abstract findSelfAttendeeForThread(threadId: string): Promise<MessagingAttendee | null>;
  abstract findThreadDraftId(threadId: string): Promise<string | null>;
  abstract upsertThreadDraft(args: {
    threadId: string;
    connectedAccountId: string;
    provider: MessagingProvider;
    sender: MessagingAttendee;
    subject: string | null;
    bodyText: string;
    recipients: { to: MessagingAttendee[]; cc: MessagingAttendee[]; bcc: MessagingAttendee[] };
  }): Promise<MessagingMessage>;
}

type ResolvedDraftThread =
  | { ok: true; thread: MessagingThread; recipients: string[] }
  | { ok: false; failure: Validated<MessagingMessageDto> };

function draftRecipient(email: string): MessagingAttendee {
  return { ...EMPTY_ATTENDEE, attendeeId: email, identifier: email.toLowerCase() };
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SaveDraftInteractor extends AuthenticatedInteractor<SaveDraftData, MessagingMessageDto> {
  constructor(
    private repo: SaveDraftRepo,
    private accountRepo: FindUsableAccountRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(SaveDraftSchema)
  @ValidateOutput(MessagingMessageDtoSchema)
  async invoke(data: SaveDraftData): Validated<MessagingMessageDto> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const resolved = await this.resolveThread(data);
    if (!resolved.ok) return resolved.failure;

    const thread = resolved.thread;
    const isEmail = isEmailProvider(thread.provider);

    const existingDraft = await this.repo.findThreadDraftId(thread.id);

    let signature: string | null = null;
    let sender: MessagingAttendee;
    if (isEmail) {
      const account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
      signature = account.signature;
      sender = {
        ...EMPTY_ATTENDEE,
        attendeeId: account.emailAddress ?? "",
        identifier: (account.emailAddress ?? "").toLowerCase(),
        displayName: account.displayName,
        isSelf: true,
      };
    } else sender = (await this.repo.findSelfAttendeeForThread(thread.id)) ?? { ...EMPTY_ATTENDEE, isSelf: true };

    const recipients = {
      to: resolved.recipients.map(draftRecipient),
      cc: isEmail ? (data.cc ?? []).map(draftRecipient) : [],
      bcc: isEmail ? (data.bcc ?? []).map(draftRecipient) : [],
    };

    const draft = await this.repo.upsertThreadDraft({
      threadId: thread.id,
      connectedAccountId: thread.connectedAccountId,
      provider: thread.provider,
      sender,
      subject: isEmail ? (data.subject ?? null) : null,
      bodyText: existingDraft ? data.body : applyEmailSignature(data.body, signature),
      recipients,
    });

    return { ok: true as const, data: toMessagingMessageDto(draft) };
  }

  private async resolveThread(data: SaveDraftData): Promise<ResolvedDraftThread> {
    if (data.threadId)
      return { ok: true, thread: await this.repo.findThreadByIdOrThrow(data.threadId), recipients: [] };

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId ?? "");
    const recipients: string[] = [];
    for (const raw of data.recipients ?? []) {
      const normalized = normalizeChannelValue(account.provider, raw);
      if (!normalized) return { ok: false, failure: fail(CustomErrorCode.invalidChannelValue, ["recipients"]) };
      recipients.push(normalized);
    }

    const thread = await this.repo.findOrCreateDraftThread({
      connectedAccountId: account.id,
      provider: account.provider,
      recipients,
    });

    return { ok: true, thread, recipients };
  }
}
