import type { EventLog, Webhook } from "@/generated/prisma";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventAdmission } from "@/features/event/event-admission";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { WebhookAdmissionRepo } from "./webhook-admission.repo";
import type { WebhookDeliveryAdmissionRepo } from "./webhook-delivery-admission.repo";

export class WebhookAdmission implements EventAdmission {
  constructor(
    private readonly reader: RecordRecipientReader,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
    private readonly webhooks: WebhookAdmissionRepo,
    private readonly deliveries: WebhookDeliveryAdmissionRepo,
  ) {}

  async admit(event: EventLog): Promise<void> {
    if (event.subjectKind !== "record") {
      for (const webhook of await this.webhooks.findEventWebhooksUnscoped(event))
        await this.deliver(event, webhook, null);
      return;
    }
    const matches = await this.reader.findEventMatches(event, "webhook");
    if (!matches.length) return;
    const hooks = await this.webhooks.findEventWebhooksUnscoped(
      event,
      matches.map((match) => match.subscriptionId),
    );
    const byId = new Map(hooks.map((hook) => [hook.id, hook]));
    for (const match of matches) {
      const webhook = byId.get(match.subscriptionId);
      if (!webhook || match.subscriptionRevision !== match.subscription.revision) continue;
      const envelope = await this.reader.readEvent({
        companyId: event.companyId,
        userId: match.subscription.ownerUserId,
        eventId: event.id,
        subscriptionId: webhook.id,
      });
      if (envelope) await this.deliver(event, webhook, match.subscriptionRevision);
    }
  }

  private async deliver(event: EventLog, webhook: Webhook, subscriptionRevision: number | null): Promise<void> {
    const delivery = await this.deliveries.admitDeliveryOrThrowUnscoped({ event, webhook, subscriptionRevision });
    if (delivery.nextAttemptAt)
      await this.background.dispatch("deliver-webhook", { deliveryId: delivery.id, companyId: event.companyId });
  }
}
