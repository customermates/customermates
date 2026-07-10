import type { MessagingThreadType } from "@/generated/prisma";

import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";
import { UnipileChatSchema } from "../../unipile.schema";

const Schema = z.object({
  type: z.literal("chat.update"),
  account_id: z.string(),
  payload: UnipileChatSchema,
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessChatUpdateWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const chat = envelope.payload;
    const type: MessagingThreadType | undefined = chat.is_group ? "group" : chat.is_channel ? "channel" : undefined;

    const thread = await this.ingest.updateChatThreadMetadataUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileThreadId: chat.id,
      name: chat.name ?? null,
      subject: chat.description ?? null,
      type,
    });
    if (!thread) return;

    await this.eventService.publish(
      DomainEvent.MESSAGING_CHAT_UPDATED,
      {
        entityId: thread.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerThreadId: envelope.payload.id,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
