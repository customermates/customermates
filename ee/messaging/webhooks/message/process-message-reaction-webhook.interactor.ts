import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { MessagingIngestRepo } from "../../ingest/messaging-ingest.repo";
import type { MessageReactionEntry } from "../../messaging.schema";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({
  type: z.literal("message.reaction.new"),
  account_id: z.string(),
  payload: z.looseObject({
    message_id: z.string(),
    reaction: z.looseObject({
      value: z.string(),
      sender: z.looseObject({ id: z.string().nullish(), display_name: z.string().nullish() }).nullish(),
      is_sender: z.boolean().nullish(),
    }),
  }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessMessageReactionWebhookInteractor {
  constructor(
    private ingest: MessagingIngestRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const { message_id, reaction } = envelope.payload;
    const reactions: MessageReactionEntry[] = [
      {
        value: reaction.value,
        attendeeId: reaction.sender?.id ?? "",
        attendeeDisplayName: reaction.sender?.display_name ?? null,
        isSelf: reaction.is_sender === true,
      },
    ];

    const updated = await this.ingest.updateMessageReactionsUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      unipileMessageId: message_id,
      reactions,
    });
    if (!updated) return;

    await this.eventService.publish(
      DomainEvent.MESSAGING_MESSAGE_REACTION,
      {
        entityId: updated.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerMessageId: message_id,
          threadId: updated.messagingThreadId,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
