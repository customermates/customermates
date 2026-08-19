import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({
  type: z.literal("chat.delete"),
  account_id: z.string(),
  payload: z.looseObject({ id: z.string() }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessChatDeleteWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);
    if (!account || account.status === ConnectedAccountStatus.deleted) return;

    const thread = await this.ingest.deleteChatThreadUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileThreadId: envelope.payload.id,
    });
    if (!thread) return;

    await this.eventService.publish(
      DomainEvent.MESSAGING_CHAT_DELETED,
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
