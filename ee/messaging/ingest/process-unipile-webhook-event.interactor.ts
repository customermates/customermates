import type { WebhookEventRepo } from "../webhooks/webhook-event.repo";
import type { ProcessAccountStatusWebhookInteractor } from "../webhooks/process-account-status-webhook.interactor";
import type { ProcessAccountCallbackInteractor } from "../webhooks/process-account-callback.interactor";
import type { ProcessMessagingWebhookInteractor } from "../webhooks/process-messaging-webhook.interactor";
import type { ProcessEmailWebhookInteractor } from "../webhooks/process-email-webhook.interactor";
import type { ProcessCalendarWebhookInteractor } from "../webhooks/process-calendar-webhook.interactor";
import type { ProcessUsersWebhookInteractor } from "../webhooks/process-users-webhook.interactor";

import { z } from "zod";

import { UnipileWebhookSource } from "@/generated/prisma";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

const ProcessUnipileWebhookEventPayloadSchema = z.object({
  id: z.uuid(),
});
export type ProcessUnipileWebhookEventPayload = z.infer<typeof ProcessUnipileWebhookEventPayloadSchema>;

@SystemInteractor
export class ProcessUnipileWebhookEventInteractor {
  constructor(
    private repo: WebhookEventRepo,
    private processAccountStatus: ProcessAccountStatusWebhookInteractor,
    private processAccountCallback: ProcessAccountCallbackInteractor,
    private processMessaging: ProcessMessagingWebhookInteractor,
    private processEmail: ProcessEmailWebhookInteractor,
    private processCalendar: ProcessCalendarWebhookInteractor,
    private processUsers: ProcessUsersWebhookInteractor,
  ) {}

  @Enforce(ProcessUnipileWebhookEventPayloadSchema)
  async invoke({ id }: ProcessUnipileWebhookEventPayload): Promise<void> {
    const row = await this.repo.findWebhookEventByIdOrThrow(id);
    if (row.processed) return;

    const payload = row.payload as never;

    try {
      switch (row.source as UnipileWebhookSource) {
        case UnipileWebhookSource.account_status:
          await this.processAccountStatus.invoke(payload);
          break;
        case UnipileWebhookSource.account_callback:
          await this.processAccountCallback.invoke(payload);
          break;
        case UnipileWebhookSource.messaging:
          await this.processMessaging.invoke(payload);
          break;
        case UnipileWebhookSource.mail:
          await this.processEmail.invoke(payload);
          break;
        case UnipileWebhookSource.calendar:
          await this.processCalendar.invoke(payload);
          break;
        case UnipileWebhookSource.users:
          await this.processUsers.invoke(payload);
          break;
        default:
          throw new Error(`No webhook handler registered for Unipile source ${row.source}`);
      }

      await this.repo.markWebhookEvent({ id, processed: true });
    } catch (err) {
      await this.repo.markWebhookEvent({ id, processed: false });

      throw err;
    }
  }
}
