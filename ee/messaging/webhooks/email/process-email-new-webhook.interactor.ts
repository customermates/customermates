import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";
import { buildEmailMessage } from "../../unipile.mappers";
import { UnipileEmailSchema } from "../../unipile.schema";
import { UnmappableWebhookPayloadError } from "@/core/errors/app-errors";

const Schema = z.object({
  type: z.enum(["email.new", "email.new.bounce"]),
  account_id: z.string(),
  payload: z.looseObject({ email: UnipileEmailSchema }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessEmailNewWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const message = buildEmailMessage(envelope.payload.email, {
      provider: account.provider,
      emailAddress: account.emailAddress,
      sentFolderIds: account.sentFolderIds,
    });
    if (!message) throw new UnmappableWebhookPayloadError(envelope.payload.email.id || null);

    const result = await this.ingest.ingestMessageUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      message,
      backfill: false,
    });
    if (result.isEcho || result.isDuplicate) return;

    await this.eventService.publish(
      DomainEvent.MESSAGING_EMAIL_RECEIVED,
      {
        entityId: result.message.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerMessageId: envelope.payload.email.id,
          threadId: result.message.messagingThreadId,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
