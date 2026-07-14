import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingAttendee, MessagingMessage, MessagingThread } from "../messaging.schema";
import type { MessagingMessageDto } from "../inbox/inbox.schema";
import type { MessagingProvider } from "@/generated/prisma";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { isEmailProvider } from "../provider";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox/inbox.schema";
import { EMPTY_ATTENDEE } from "../unipile.mappers";

export const SaveDraftSchema = z.object({
  threadId: z.uuid(),
  subject: z.string().max(998).optional(),
  body: z.string().min(1).max(100_000),
  cc: z.array(z.email()).max(100).optional(),
  bcc: z.array(z.email()).max(100).optional(),
});
export type SaveDraftData = Data<typeof SaveDraftSchema>;

export abstract class SaveDraftRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract findSelfAttendeeForThread(threadId: string): Promise<MessagingAttendee | null>;
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

    const thread = await this.repo.findThreadByIdOrThrow(data.threadId);
    const isEmail = isEmailProvider(thread.provider);

    let sender: MessagingAttendee;
    if (isEmail) {
      const account = await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);
      sender = {
        ...EMPTY_ATTENDEE,
        attendeeId: account.emailAddress ?? "",
        identifier: (account.emailAddress ?? "").toLowerCase(),
        displayName: account.displayName,
        isSelf: true,
      };
    } else sender = (await this.repo.findSelfAttendeeForThread(thread.id)) ?? { ...EMPTY_ATTENDEE, isSelf: true };

    const recipients = {
      to: [] as MessagingAttendee[],
      cc: isEmail ? (data.cc ?? []).map(draftRecipient) : [],
      bcc: isEmail ? (data.bcc ?? []).map(draftRecipient) : [],
    };

    const draft = await this.repo.upsertThreadDraft({
      threadId: thread.id,
      connectedAccountId: thread.connectedAccountId,
      provider: thread.provider,
      sender,
      subject: isEmail ? (data.subject ?? null) : null,
      bodyText: data.body,
      recipients,
    });

    return { ok: true as const, data: toMessagingMessageDto(draft) };
  }
}
