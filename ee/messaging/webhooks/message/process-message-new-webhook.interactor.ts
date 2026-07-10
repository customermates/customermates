import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";
import { isExcludedChatId, normalizeChatMessage } from "../../chat-normalize";
import { UnipileMessageSchema } from "../../unipile.schema";
import { UnmappableWebhookPayloadError } from "@/core/errors/app-errors";

const Schema = z.object({
  type: z.enum(["message.new", "message.update"]),
  account_id: z.string(),
  payload: UnipileMessageSchema,
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessMessageNewWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const message = normalizeChatMessage(envelope.payload, account.provider);
    if (!message) {
      if (isExcludedChatId(envelope.payload.chat_id)) return;

      throw new UnmappableWebhookPayloadError(envelope.payload.id || null);
    }

    const result = await this.ingest.ingestMessageUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      message,
      backfill: false,
    });
    if (result.isEcho || result.isDuplicate) return;

    await this.eventService.publish(
      envelope.type === "message.update"
        ? DomainEvent.MESSAGING_MESSAGE_UPDATED
        : DomainEvent.MESSAGING_MESSAGE_RECEIVED,
      {
        entityId: result.message.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerMessageId: result.message.unipileMessageId,
          threadId: result.message.messagingThreadId,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
