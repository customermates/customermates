import type { MessagingMessage } from "../messaging.schema";
import type { ConnectedAccount } from "@/generated/prisma";

import { ConnectedAccountStatus, type MessagingThreadState } from "@/generated/prisma";
import type { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { MessagingIngestRepo } from "../ingest/messaging-ingest.repo";

import { buildEmailMessage, emailMoveToThreadState } from "../unipile.mappers";
import {
  UnipileEmailWebhookSchema,
  type UnipileEmailMovedEvent,
  type UnipileEmailReceivedEvent,
  type UnipileEmailSentEvent,
  type UnipileEmailWebhook,
} from "../unipile.schema";

export abstract class ProcessEmailWebhookRepo {
  abstract findMessageByUnipileIdOrThrowUnscoped(args: {
    connectedAccountId: string;
    unipileMessageId: string;
  }): Promise<MessagingMessage>;
  abstract applyThreadStateUnscoped(args: { messagingThreadId: string; state: MessagingThreadState }): Promise<void>;
}

@SystemInteractor
export class ProcessEmailWebhookInteractor {
  constructor(
    private repo: ProcessEmailWebhookRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private ingest: MessagingIngestRepo,
  ) {}

  @Enforce(UnipileEmailWebhookSchema)
  async invoke(payload: UnipileEmailWebhook): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(payload.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    switch (payload.event) {
      case "mail_received":
      case "mail_sent":
        return this.handleMail(payload, account);
      case "mail_moved":
        return this.handleMoved(payload, account);
    }
  }

  private async handleMail(
    payload: UnipileEmailReceivedEvent | UnipileEmailSentEvent,
    account: ConnectedAccount,
  ): Promise<void> {
    const normalized = buildEmailMessage(payload, payload.role === "sent" || payload.event === "mail_sent");
    if (!normalized) throw new Error(`${payload.event} webhook for account ${payload.account_id} has no email id`);

    await this.ingest.ingestMessage({
      companyId: account.companyId,
      connectedAccountId: account.id,
      message: normalized,
    });
  }

  private async handleMoved(payload: UnipileEmailMovedEvent, account: ConnectedAccount): Promise<void> {
    const message = await this.repo.findMessageByUnipileIdOrThrowUnscoped({
      connectedAccountId: account.id,
      unipileMessageId: payload.email_id,
    });

    const state = emailMoveToThreadState({ role: payload.role, folders: payload.folders });
    if (!state) return;

    await this.repo.applyThreadStateUnscoped({ messagingThreadId: message.messagingThreadId, state });
  }
}
