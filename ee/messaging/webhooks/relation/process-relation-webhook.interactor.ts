import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import type { FindAccountByUnipileIdUnscopedRepo } from "../../persistence/find-account-by-unipile-id-unscoped.repo";
import type { WebhookActivityRepo } from "./relation-webhook.repo";
import type { EventService } from "@/features/event/event.service";

import { DomainEvent } from "@/features/event/domain-events";
import { UnipileUserSchema } from "../../unipile.schema";

const Schema = z.object({
  type: z.enum(["relation.new", "relation.request.accept"]),
  account_id: z.string(),
  payload: z.looseObject({ user: UnipileUserSchema, created_at: z.string().nullish() }),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessRelationWebhookInteractor {
  constructor(
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private activityRepo: WebhookActivityRepo,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const account = await this.accountRepo.findAccountByUnipileIdOrThrowUnscoped(envelope.account_id);
    if (account.status === ConnectedAccountStatus.deleted) return;

    const user = envelope.payload.user;
    const fullName = user.display_name ?? ([user.first_name, user.last_name].filter(Boolean).join(" ").trim() || null);

    await this.activityRepo.recordLinkedinConnectionAcceptedUnscoped({
      companyId: account.companyId,
      connectedAccountId: account.id,
      providerUserId: user.id,
      fullName,
      headline: user.description ?? null,
      profileUrl: user.profile_url ?? null,
      pictureUrl: user.public_picture_url ?? null,
      occurredAt: envelope.payload.created_at ? new Date(envelope.payload.created_at) : new Date(),
    });

    await this.eventService.publish(
      DomainEvent.MESSAGING_RELATION_CREATED,
      {
        entityId: user.id,
        payload: {
          connectedAccountId: account.id,
          provider: account.provider,
          providerUserId: user.id,
        },
      },
      { systemCompanyId: account.companyId },
    );
  }
}
