import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({
  type: z.literal("email.delete"),
  account_id: z.string(),
  payload: z.looseObject({ email: z.looseObject({ id: z.string() }) }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessEmailDeleteWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    await this.ingest.deleteMessageUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileMessageId: envelope.payload.email.id,
    });

    await this.eventService.publish(
      DomainEvent.MESSAGING_EMAIL_DELETED,
      {
        entityId: envelope.payload.email.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerMessageId: envelope.payload.email.id,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
