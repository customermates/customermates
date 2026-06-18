import type { ConnectedAccount, MessagingMessage } from "../messaging.schema";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { MessagingIngestRepo } from "../ingest/messaging-ingest.repo";

import { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

import { mapChatAttachments, mapUnipileProvider } from "../unipile.mappers";
import { buildChatMessage, isOutboundChat, mapWebhookAttendee } from "../chat-normalize";
import {
  UnipileMessagingWebhookSchema,
  type UnipileMessageDeletedEvent,
  type UnipileMessageEditedEvent,
  type UnipileMessageReactionEvent,
  type UnipileMessageReceivedEvent,
  type UnipileMessagingWebhook,
  type UnipileWebhookAttendee,
} from "../unipile.schema";

function isOwnAttendee(attendee: UnipileWebhookAttendee | null | undefined, account: ConnectedAccount): boolean {
  if (!attendee?.attendee_id) return false;

  return attendee.attendee_id === account.ownUnipileAttendeeId;
}

export abstract class ProcessMessagingWebhookRepo {
  abstract findMessageByUnipileIdOrThrowUnscoped(args: {
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<MessagingMessage>;
  abstract applyMessageReaction(args: {
    companyId: string;
    messagingMessageId: string;
    attendeeId: string;
    attendeeDisplayName: string | null;
    value: string | null;
    isSelf: boolean;
  }): Promise<void>;
  abstract updateMessageEdited(args: {
    messagingMessageId: string;
    bodyText: string | null;
    editedAt: Date;
  }): Promise<void>;
  abstract updateMessageDeleted(args: { messagingMessageId: string; deletedAt: Date }): Promise<void>;
}

export abstract class MessagingWebhookAccountRepo extends FindAccountByUnipileIdUnscopedRepo {
  abstract setAccountOwnAttendeeIdIfNull(args: {
    unipileAccountId: string;
    ownUnipileAttendeeId: string;
  }): Promise<void>;
}

@SystemInteractor
export class ProcessMessagingWebhookInteractor {
  constructor(
    private repo: ProcessMessagingWebhookRepo,
    private accountRepo: MessagingWebhookAccountRepo,
    private ingest: MessagingIngestRepo,
  ) {}

  @Enforce(UnipileMessagingWebhookSchema)
  async invoke(payload: UnipileMessagingWebhook): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(payload.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    switch (payload.event) {
      case "message_received":
        return this.handleMessage(payload, account);
      case "message_reaction":
        return this.handleReaction(payload, account);
      case "message_edited":
        return this.handleEdited(payload, account);
      case "message_deleted":
        return this.handleDeleted(payload, account);
    }
  }

  private async captureOwnAttendeeId(payload: UnipileMessageReceivedEvent, account: ConnectedAccount): Promise<void> {
    if (account.ownUnipileAttendeeId || payload.is_sender !== true || !payload.sender?.attendee_id) return;

    await this.accountRepo.setAccountOwnAttendeeIdIfNull({
      unipileAccountId: account.unipileAccountId,
      ownUnipileAttendeeId: payload.sender.attendee_id,
    });
  }

  private async handleMessage(payload: UnipileMessageReceivedEvent, account: ConnectedAccount): Promise<void> {
    if (payload.hidden) return;

    await this.captureOwnAttendeeId(payload, account);

    if (!payload.message_id || !payload.chat_id)
      throw new Error(`message webhook for account ${payload.account_id} has no message_id/chat_id`);

    const isOutbound = isOutboundChat({
      isSender: payload.is_sender,
      senderIsSelf: isOwnAttendee(payload.sender, account),
      senderAttendeeId: payload.sender?.attendee_provider_id,
      selfAttendeeId: payload.account_info?.user_id,
    });

    await this.ingest.ingestMessage({
      companyId: account.companyId,
      connectedAccountId: account.id,
      message: buildChatMessage({
        unipileMessageId: payload.message_id,
        unipileThreadId: payload.chat_id,
        provider: mapUnipileProvider(payload.account_type),
        isOutbound,
        bodyText: payload.message ?? null,
        sender: mapWebhookAttendee(payload.sender),
        attachmentsMeta: mapChatAttachments(payload.attachments),
        reactions: [],
        isEvent: payload.is_event ?? false,
        deletedAt: null,
        threadType: payload.is_group === true ? "group" : undefined,
        sentAt: payload.timestamp,
      }),
    });
  }

  private async handleReaction(payload: UnipileMessageReactionEvent, account: ConnectedAccount): Promise<void> {
    const message = await this.repo.findMessageByUnipileIdOrThrowUnscoped({
      connectedAccountId: account.id,
      unipileMessageId: payload.message_id,
    });

    const reactor = payload.reaction_sender ?? payload.sender;

    if (!reactor?.attendee_id)
      throw new Error(`reaction webhook for account ${payload.account_id} has no reactor attendee id`);

    await this.repo.applyMessageReaction({
      companyId: account.companyId,
      messagingMessageId: message.id,
      attendeeId: reactor.attendee_id,
      attendeeDisplayName: reactor.attendee_name ?? null,
      value: payload.reaction?.trim() || null,
      isSelf: isOwnAttendee(reactor, account),
    });
  }

  private async handleEdited(payload: UnipileMessageEditedEvent, account: ConnectedAccount): Promise<void> {
    const message = await this.repo.findMessageByUnipileIdOrThrowUnscoped({
      connectedAccountId: account.id,
      unipileMessageId: payload.message_id,
    });

    await this.repo.updateMessageEdited({
      messagingMessageId: message.id,
      bodyText: payload.message ?? message.bodyText,
      editedAt: payload.timestamp,
    });
  }

  private async handleDeleted(payload: UnipileMessageDeletedEvent, account: ConnectedAccount): Promise<void> {
    const message = await this.repo.findMessageByUnipileIdOrThrowUnscoped({
      connectedAccountId: account.id,
      unipileMessageId: payload.message_id,
    });

    await this.repo.updateMessageDeleted({
      messagingMessageId: message.id,
      deletedAt: payload.timestamp,
    });
  }
}
