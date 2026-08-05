import { z } from "zod";

import { ConnectedAccountStatus } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventService } from "@/features/event/event.service";

import type { MessagingService } from "../../messaging.service";

import { DomainEvent } from "@/features/event/domain-events";
import { isEmailProvider } from "../../provider";
import { verifyHostedAuthState } from "../../webhook-signature";
import { deriveAccountFeatures, mapUnipileProvider, mapUnipileStatus } from "../../unipile.mappers";
import type { AccountWebhookRepo, WebhookUserRepo } from "./account-webhook.repo";

const Schema = z.object({
  type: z.literal("account.add"),
  account_id: z.string(),
  state: z.string().nullish(),
  payload: z.looseObject({ state: z.string().nullish() }).nullish(),
});
type Payload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessAccountAddWebhookInteractor {
  constructor(
    private messagingService: MessagingService,
    private accountRepo: AccountWebhookRepo,
    private userRepo: WebhookUserRepo,
    private backgroundTaskService: BackgroundTaskService,
    private eventService: EventService,
  ) {}

  @Enforce(Schema)
  async invoke(envelope: Payload): Promise<void> {
    const userId = verifyHostedAuthState(envelope.state ?? envelope.payload?.state ?? null);
    if (!userId) throw new Error("account.add webhook: missing or invalid hosted-auth state");

    const user = await this.userRepo.findUserByIdOrThrowUnscoped(userId);

    const existing = await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id);

    if (existing && existing.companyId !== user.companyId) {
      throw new Error(
        `cross-company connect blocked for unipile account ${envelope.account_id}: owned by company ${existing.companyId}, attempted by user ${user.id} of company ${user.companyId}`,
      );
    }

    if (existing && existing.status === ConnectedAccountStatus.deleted) return;

    const snapshot = await this.messagingService.getAccount(envelope.account_id);

    const provider = mapUnipileProvider(snapshot.provider);
    const status = mapUnipileStatus(snapshot.status);
    const displayName = snapshot.name ?? null;
    const emailAddress = isEmailProvider(provider) ? (snapshot.name ?? null) : null;
    const { hasMessaging, hasCalendar } = deriveAccountFeatures(snapshot);

    const connectedAccountId = existing
      ? existing.id
      : (
          await this.accountRepo.createAccountUnscoped({
            companyId: user.companyId,
            userId: user.id,
            unipileAccountId: envelope.account_id,
            provider,
            status,
            displayName,
            emailAddress,
            hasMessaging,
            hasCalendar,
          })
        ).id;

    await this.accountRepo.updateAccountUnscoped({
      unipileAccountId: envelope.account_id,
      status,
      displayName,
      emailAddress,
      provider,
      hasMessaging,
      hasCalendar,
    });

    if (!existing) {
      await this.eventService.publish(
        DomainEvent.CONNECTED_ACCOUNT_CREATED,
        {
          entityId: connectedAccountId,
          payload: { provider, displayName, emailAddress },
        },
        { systemCompanyId: user.companyId, systemUserId: user.id },
      );
    }

    await this.backgroundTaskService.dispatch("backfill-connected-account", { connectedAccountId });
  }
}
